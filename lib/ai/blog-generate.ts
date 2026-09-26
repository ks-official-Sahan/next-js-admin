import "server-only";

import { z } from "zod";

import { looksLikeLeak } from "./guard";
import { buildBlogGenerationPrompt, buildRepairPrompt, buildSeoSuggestPrompt, contentImageToken, type BlogGenerationInput } from "./blog-prompts";
import { createAiService, realProviders, sharedAiHealth, type AiAttemptStatus, type AiProvider } from "./providers";
import { getEnv } from "@/lib/env";

// Full blog-post generation (AGENTS.md "AI blog" feature). Providers are
// injected so this module is unit tested without a network call; the route
// handler passes defaultAiDeps(). Budgets follow the task's guidance:
// generous per-attempt and whole-chain timeouts with a hedge, since a full
// post is a much bigger generation than the existing draft/cover helpers.

/** Shortens `text` to at most `max` characters, at the last word break when there is one. */
export function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "");
}

/**
 * A required string that is shortened to `max` instead of rejected: a model
 * that writes 230 characters of alt text should not throw away a whole
 * finished post (it did, with "Too big: expected string to have <=200").
 */
const clamped = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((value) => clampText(value, max));

const contentImageSchema = z.object({
  token: z.string().min(1).max(64),
  prompt: clamped(500),
  alt: clamped(200),
  caption: z
    .string()
    .trim()
    .transform((value) => clampText(value, 200))
    .optional(),
});

export const blogGenerationSchema = z.object({
  title: clamped(200),
  excerpt: clamped(500),
  bodyMarkdown: z.string().trim().min(1).max(50_000),
  seoTitle: clamped(70),
  seoDescription: clamped(200),
  topic: clamped(50),
  tags: z
    .array(z.string().trim().min(1).transform((value) => clampText(value, 30)))
    .default([])
    .transform((tags) => tags.slice(0, 10)),
  featuredImage: z.object({
    prompt: clamped(500),
    alt: clamped(200),
  }),
  contentImages: z.array(contentImageSchema).max(3).default([]),
});

export type BlogGeneration = z.infer<typeof blogGenerationSchema>;

/**
 * The same shape as a Gemini response schema (OpenAPI subset). Gemini and
 * Vertex enforce it while decoding, so their reply is always valid, correctly
 * escaped JSON: with only responseMimeType, Gemini now and then left quotes
 * unescaped inside bodyMarkdown (a chart's JSON, code samples), and no repair
 * can undo that, because an unescaped "type": looks like a real key. Length
 * limits stay in the prompt and the zod schema above; bodyMarkdown stays last
 * so a cut-off reply keeps its metadata.
 */
const STRING = { type: "STRING" } as const;
export const BLOG_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    title: STRING,
    excerpt: STRING,
    seoTitle: STRING,
    seoDescription: STRING,
    topic: STRING,
    tags: { type: "ARRAY", items: STRING },
    featuredImage: { type: "OBJECT", properties: { prompt: STRING, alt: STRING }, required: ["prompt", "alt"], propertyOrdering: ["prompt", "alt"] },
    contentImages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { token: STRING, prompt: STRING, alt: STRING, caption: STRING },
        required: ["token", "prompt", "alt"],
        propertyOrdering: ["token", "prompt", "alt", "caption"],
      },
    },
    bodyMarkdown: STRING,
  },
  required: ["title", "excerpt", "seoTitle", "seoDescription", "topic", "tags", "featuredImage", "contentImages", "bodyMarkdown"],
  propertyOrdering: ["title", "excerpt", "seoTitle", "seoDescription", "topic", "tags", "featuredImage", "contentImages", "bodyMarkdown"],
};

export const seoSuggestionSchema = z.object({
  seoTitle: z.string().trim().min(1).max(70),
  seoDescription: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(500),
});

export type SeoSuggestion = z.infer<typeof seoSuggestionSchema>;

export type AiHelperFailure = { ok: false; error: string };

export interface AiDeps {
  providers: readonly AiProvider[];
}

/** The chain built from configured environment keys, for the routes to pass in. */
export function defaultAiDeps(): AiDeps {
  return { providers: realProviders(getEnv(), "blog") };
}

/**
 * Budgets for a full post (title + body + SEO + image prompts). A Long post
 * with thinking takes Gemini 40-70 s, so a 45 s attempt cap timed out good
 * replies and handed the post to weaker fallbacks. Two calls (first + one
 * repair) stay inside the route's 300 s maxDuration.
 */
const GENERATION_BUDGETS = { timeoutMs: 80_000, deadlineMs: 130_000, hedgeAfterMs: 25_000 } as const;
const GENERATION_MAX_TOKENS = 8192;

/**
 * Isolates the outermost {...} object, which also drops a ```json fence or
 * any prose around it. No fence matching on purpose: bodyMarkdown itself
 * holds ```chart and code fences, and matching the first fence in the reply
 * cut the object out of the middle of that string (the "Expected property
 * name or '}' at position 2" failures).
 */
export function extractJsonObject(text: string): string | null {
  const candidate = text.trim();
  const start = candidate.indexOf("{");
  if (start === -1) return null;
  const end = candidate.lastIndexOf("}");
  if (end === -1 || end < start) return candidate.slice(start);
  return candidate.slice(start, end + 1);
}

/** Known property names for blog generation to guide unescaped quote identification. */
const KNOWN_JSON_KEYS = new Set([
  "title", "excerpt", "bodyMarkdown", "seoTitle", "seoDescription",
  "topic", "tags", "featuredImage", "contentImages", "token", "prompt", "alt", "caption"
]);

/**
 * Resiliently repairs unescaped double quotes and unescaped control characters in JSON string values,
 * and completes unclosed strings/braces if the LLM output was truncated.
 */
export function repairJsonString(jsonStr: string): string {
  let inString = false;
  let isEscaped = false;
  let result = "";

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (char === "\\" && inString) {
      isEscaped = !isEscaped;
      result += char;
      continue;
    }

    if (char === '"' && !isEscaped) {
      if (!inString) {
        inString = true;
        result += char;
      } else {
        const rest = jsonStr.slice(i + 1);
        const isKeyClose = /^\s*:/.test(rest);
        const isObjectOrArrayClose = /^\s*[}\]]/.test(rest);
        const commaMatch = rest.match(/^\s*,\s*(?:"([^"]+)"|([}\]]))/);
        const isNextKeyOrItem = commaMatch ? (commaMatch[2] ? true : KNOWN_JSON_KEYS.has(commaMatch[1])) : false;

        if (isKeyClose || isObjectOrArrayClose || isNextKeyOrItem) {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
      }
      isEscaped = false;
      continue;
    }

    if (inString && !isEscaped) {
      if (char === "\n") { result += "\\n"; continue; }
      if (char === "\r") { result += "\\r"; continue; }
      if (char === "\t") { result += "\\t"; continue; }
    }

    isEscaped = false;
    result += char;
  }

  if (inString) result += '"';

  let openBraces = 0;
  let openBrackets = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < result.length; i++) {
    const c = result[i];
    if (c === "\\" && inStr) { esc = !esc; continue; }
    if (c === '"' && !esc) { inStr = !inStr; }
    if (!inStr) {
      if (c === "{") openBraces++;
      else if (c === "}") openBraces--;
      else if (c === "[") openBrackets++;
      else if (c === "]") openBrackets--;
    }
    esc = false;
  }

  while (openBrackets > 0) { result += "]"; openBrackets--; }
  while (openBraces > 0) { result += "}"; openBraces--; }

  return result;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parseJsonWith<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return { ok: false, error: "No JSON object found in the response." };

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (originalError) {
    try {
      const repaired = repairJsonString(jsonText);
      const candidateRaw = JSON.parse(repaired);
      const parsedCandidate = schema.safeParse(candidateRaw);
      if (parsedCandidate.success) {
        return { ok: true, data: parsedCandidate.data };
      }
    } catch {
      // ignore repair failure, return original error below
    }
    return { ok: false, error: `Invalid JSON: ${originalError instanceof Error ? originalError.message : "parse failed"}` };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { ok: false, error: `Response did not match the expected shape: ${issues.join("; ")}` };
  }
  return { ok: true, data: parsed.data };
}

/** Exported for unit tests; also used internally by generateBlogPost(). */
export function parseBlogGeneration(text: string): ParseResult<BlogGeneration> {
  const result = parseJsonWith(text, blogGenerationSchema);
  if (!result.ok) return result;

  // Every token referenced by contentImages must be one of the offered
  // placeholders and unique, so the caller can safely string-replace them
  // in bodyMarkdown once each image is generated.
  const offered = new Set(Array.from({ length: 3 }, (_, i) => contentImageToken(i)));
  const seen = new Set<string>();
  for (const image of result.data.contentImages) {
    if (!offered.has(image.token)) return { ok: false, error: `Unknown content image token: ${image.token}` };
    if (seen.has(image.token)) return { ok: false, error: `Duplicate content image token: ${image.token}` };
    seen.add(image.token);
  }
  return result;
}

export interface GenerateBlogPostResult {
  ok: true;
  post: BlogGeneration;
  provider: string;
}

/** Word range per length choice, generous enough to allow real variation while still catching a body that is far too thin or has clearly run on. */
const LENGTH_WORD_RANGE: Record<BlogGenerationInput["length"], readonly [number, number]> = {
  Short: [280, 850],
  Medium: [550, 1500],
  Long: [1000, 2400],
};

const MAX_PARAGRAPH_WORDS = 120;
const MIN_H2_SECTIONS = 3;

/**
 * Server-side structural QA on the model's own Markdown body (work item 1),
 * independent of the JSON-shape check above: a body can be perfectly valid
 * JSON and still read as one wall of text. Runs on the raw Markdown, before
 * lib/blog/markdown.ts ever converts it, so a paragraph split or a missing
 * heading is caught before it becomes a rendering problem. Returns a short
 * list of plain-language violations — empty when the body is structurally
 * sound — for buildRepairPrompt's feedback; generateBlogPost checks this
 * once, alongside its existing single repair attempt, and never re-checks
 * after the repair (a model that still can't structure it after specific
 * feedback is not worth a second round trip).
 */
export function validateStructure(bodyMarkdown: string, length: BlogGenerationInput["length"]): string[] {
  const issues: string[] = [];
  const lines = bodyMarkdown.split("\n");

  const h2Count = lines.filter((line) => /^##\s+\S/.test(line.trim())).length;
  if (h2Count < MIN_H2_SECTIONS) {
    issues.push(`Only ${h2Count} "##" section(s) found; use at least ${MIN_H2_SECTIONS} (including "## TL;DR" and "## FAQ").`);
  }

  const hasList = lines.some((line) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(line));
  if (!hasList) {
    issues.push("No bullet or numbered list found; include at least one (the TL;DR key-takeaways list, at minimum).");
  }

  // A "paragraph" is a run of consecutive lines that are none of: blank,
  // a heading, a list item, a blockquote/callout line, a fenced-code
  // delimiter, or a table row — so headings and lists never get counted
  // against the per-paragraph word cap meant for prose.
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    if (current.length) paragraphs.push(current.join(" "));
    current = [];
  };
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      flush();
      continue;
    }
    if (inFence) continue;
    const structural = trimmed === "" || /^(#{1,6}\s|[-*]\s|\d+\.\s|>|\|)/.test(trimmed);
    if (structural) {
      flush();
      continue;
    }
    current.push(trimmed);
  }
  flush();
  const longParagraph = paragraphs.find((paragraph) => paragraph.split(/\s+/).filter(Boolean).length > MAX_PARAGRAPH_WORDS);
  if (longParagraph) {
    issues.push(`A paragraph exceeds ${MAX_PARAGRAPH_WORDS} words; split long paragraphs into shorter ones (at most 3 sentences each).`);
  }

  const wordCount = bodyMarkdown.split(/\s+/).filter(Boolean).length;
  const [min, max] = LENGTH_WORD_RANGE[length];
  if (wordCount < min || wordCount > max) {
    issues.push(`The body is ${wordCount} words; aim for ${min}-${max} words for a "${length}" post.`);
  }

  return issues;
}

export type BlogGenerationStatusCallback = (status: {
  provider: string;
  status: "start" | "failure" | "fallback" | "success";
  message: string;
}) => void;

/**
 * Generates a full post as validated, well-structured JSON. Retries once
 * with a repair prompt (asking the model to fix its own malformed reply, or
 * a structurally weak one) if the first response fails to parse, fails
 * validation, or fails validateStructure() above — never more than once, so
 * a model that cannot produce a valid, structured post fails fast (or is
 * returned best-effort after the one repair) rather than looping.
 */
export async function generateBlogPost(
  input: BlogGenerationInput,
  deps: AiDeps,
  options?: { onStatus?: BlogGenerationStatusCallback }
): Promise<GenerateBlogPostResult | AiHelperFailure> {
  const service = createAiService({ providers: deps.providers, health: sharedAiHealth, ...GENERATION_BUDGETS });

  const handleAttempt = (status: AiAttemptStatus) => {
    let message = "";
    if (status.stage === "start") {
      message = `Writing post with ${status.provider}...`;
    } else if (status.stage === "fallback") {
      message = `${status.provider} was busy or rate-limited (${status.errorClass ?? "failed"}). Automatically falling back to ${status.fallbackTo}...`;
    } else if (status.stage === "failure") {
      message = `${status.provider} failed (${status.errorClass ?? "error"}).`;
    } else if (status.stage === "success") {
      message = `Draft completed with ${status.provider}.`;
    }
    options?.onStatus?.({ provider: status.provider, status: status.stage, message });
  };

  // Only a reply that parses into a valid post counts as a provider's
  // success, so with hedging a fast malformed or cut-off reply from one
  // provider no longer wins over a slower valid one; it falls through to the
  // next provider instead, and the last one turned down seeds the repair.
  const accept = (text: string) => {
    const parsed = parseBlogGeneration(text);
    return parsed.ok ? null : parsed.error;
  };
  const summarize = (attempts: { provider: string; ok: boolean; errorClass?: string }[] | undefined) =>
    attempts?.length ? ` (${attempts.map((a) => `${a.provider}: ${a.errorClass ?? (a.ok ? "ok" : "failed")}`).join(", ")})` : "";

  const first = await service.generate(buildBlogGenerationPrompt(input), {
    maxTokens: GENERATION_MAX_TOKENS,
    jsonMode: { schema: BLOG_RESPONSE_SCHEMA },
    onAttempt: handleAttempt,
    accept,
  });
  const firstText = first.ok ? first.text : first.rejected?.text;
  if (!firstText) {
    return { ok: false, error: `No AI provider returned a complete post${summarize(first.attempts)}.` };
  }
  if (looksLikeLeak(firstText)) {
    return { ok: false, error: "The AI response looked unsafe and was discarded. Try a different brief." };
  }

  const firstParsed = parseBlogGeneration(firstText);
  let issue: string;
  if (firstParsed.ok) {
    const structureIssues = validateStructure(firstParsed.data.bodyMarkdown, input.length);
    if (structureIssues.length === 0) {
      return { ok: true, post: firstParsed.data, provider: first.provider ?? "unknown" };
    }
    issue = `The post parsed but did not meet the structure requirements: ${structureIssues.join(" ")}`;
  } else {
    issue = firstParsed.error;
  }

  options?.onStatus?.({
    provider: first.provider ?? "ai",
    status: "start",
    message: "Refining and repairing post structure...",
  });

  const repair = await service.generate(buildRepairPrompt(input, firstText, issue), {
    maxTokens: GENERATION_MAX_TOKENS,
    jsonMode: { schema: BLOG_RESPONSE_SCHEMA },
    onAttempt: handleAttempt,
    accept,
  });
  if (!repair.ok || !repair.text) {
    // A structurally weak first post is still better than nothing.
    if (firstParsed.ok) return { ok: true, post: firstParsed.data, provider: first.provider ?? "unknown" };
    return { ok: false, error: `The AI could not produce a valid post after one repair attempt (${repair.rejected?.reason ?? issue})${summarize(repair.attempts)}.` };
  }
  if (looksLikeLeak(repair.text)) {
    return { ok: false, error: "The AI response looked unsafe and was discarded. Try a different brief." };
  }

  const repairedParsed = parseBlogGeneration(repair.text);
  if (!repairedParsed.ok) {
    return { ok: false, error: `The AI could not produce a valid post after one repair attempt (${repairedParsed.error}).` };
  }
  // Best-effort past this point: a structurally imperfect but valid post is
  // still useful, unlike a JSON parse failure — no second structure check.
  return { ok: true, post: repairedParsed.data, provider: repair.provider ?? "unknown" };
}

export interface GenerateSeoResult {
  ok: true;
  seo: SeoSuggestion;
  provider: string;
}

export async function generateSeoSuggestion(input: { title: string; contentText: string }, deps: AiDeps): Promise<GenerateSeoResult | AiHelperFailure> {
  const service = createAiService({ providers: deps.providers, health: sharedAiHealth, timeoutMs: 25_000, deadlineMs: 45_000 });
  const result = await service.generate(buildSeoSuggestPrompt(input), { maxTokens: 400 });
  if (!result.ok || !result.text) {
    return { ok: false, error: "No AI provider is configured or reachable right now." };
  }
  if (looksLikeLeak(result.text)) {
    return { ok: false, error: "The AI response looked unsafe and was discarded." };
  }
  const parsed = parseJsonWith(result.text, seoSuggestionSchema);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, seo: parsed.data, provider: result.provider ?? "unknown" };
}
