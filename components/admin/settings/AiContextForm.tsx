"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { updateAiContextAction } from "@/lib/actions/settings";
import { MAX_AI_CONTEXT_LENGTH, type AiContext } from "@/lib/settings/schema";

// Standing guidance for the models, one box per scope. Global is added to
// every AI request, then the feature's own box after it. It steers voice and
// facts; the fixed rules (JSON shape, links, secrecy) always win.

const SCOPES = [
  {
    name: "global",
    label: "Everywhere",
    hint: "Voice, audience and facts every AI feature should know, for example: write in British English; I am a full-stack engineer in Colombo.",
  },
  { name: "blog", label: "Blog assistant", hint: "How posts should read: structure preferences, topics to stress or avoid, how to sign off." },
  { name: "seo", label: "SEO suggestions", hint: "Keywords to favour, brand terms, how titles and descriptions should sound." },
  { name: "chatbot", label: "Chatbot", hint: "What the chatbot should say about availability, rates or projects, and what it must not discuss." },
] as const;

export default function AiContextForm({ value }: { value: AiContext }) {
  return (
    <ActionForm action={updateAiContextAction} className="space-y-4">
      {SCOPES.map((scope) => (
        <Field
          key={scope.name}
          label={scope.label}
          name={scope.name}
          multiline
          maxLength={MAX_AI_CONTEXT_LENGTH}
          defaultValue={value[scope.name] ?? ""}
          hint={scope.hint}
        />
      ))}
      <p className="text-xs text-muted-foreground">
        Added after each prompt&apos;s own rules, which always win. Never paste secrets or keys here: the models see this text.
      </p>
      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
