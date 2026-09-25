// Spam heuristics for contact form submissions.
// Returns a score 0-100; submissions above a threshold are marked SPAM.

const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com",
  "mailinator.com",
  "10minutemail.com",
  "throwaway.email",
  "guerrillamail.com",
  "maildrop.cc",
  "yopmail.com",
  "temp-mail.org",
  "sharklasers.com",
  "trashmail.com",
]);

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const REPEATED_CHARS = /(.)\1{4,}/g; // 5+ repeated chars
const ALL_CAPS = /^[A-Z\s\d!.,:;?-]+$/;

export interface SpamContext {
  email: string;
  message: string;
  topic?: string;
}

export function scoreSpam(context: SpamContext): number {
  let score = 0;

  // Disposable email domain: high confidence spam
  const domain = context.email.split("@")[1]?.toLowerCase();
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    score += 40;
  }

  // Excessive URLs in message (more than 3 is suspicious)
  const urlCount = (context.message.match(URL_REGEX) || []).length;
  if (urlCount > 3) {
    score += Math.min(30, urlCount * 5); // Capped at 30
  }

  // Repeated characters (spam-like patterns)
  const repeatedCount = (context.message.match(REPEATED_CHARS) || []).length;
  if (repeatedCount > 0) {
    score += Math.min(20, repeatedCount * 3);
  }

  // All caps (aggressive marketing)
  if (ALL_CAPS.test(context.message) && context.message.length > 50) {
    score += 15;
  }

  // Very short message after validation is unlikely (caught earlier)
  if (context.message.length < 20) {
    score += 10;
  }

  return Math.min(100, score);
}

export const SPAM_THRESHOLD = 50;
