import { z } from "zod";

// Utility to strip CR/LF (used in route handler and tests)
export function stripNewlines(text: string): string {
  return text.replace(/[\r\n]/g, "");
}

// Strip CR/LF from header-sensitive fields
const headerSafeString = z
  .string()
  .refine((v) => !v.includes("\r") && !v.includes("\n"), "Cannot contain line breaks");

// Form submission schema with honeypot and timing token.
export const inquiryFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Name too long.").pipe(headerSafeString),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Valid email required.")
    .max(254, "Email too long.")
    .pipe(headerSafeString),
  phone: z.string().trim().max(30, "Phone too long.").optional().default(""),
  topic: z
    .string()
    .trim()
    .max(200, "Topic too long.")
    .pipe(headerSafeString)
    .optional()
    .default(""),
  message: z.string().trim().min(10, "Message must be at least 10 characters.").max(5000, "Message too long."),
  // Honeypot: should be empty
  website: z.string().trim().optional().default(""),
  // Timing token (signed)
  token: z.string().min(1, "Invalid request."),
});

export type InquiryFormData = z.infer<typeof inquiryFormSchema>;

// Email event tracking
export const inquiryEmailEventKind = z.enum(["notify", "auto-reply"]);
export type InquiryEmailEventKind = z.infer<typeof inquiryEmailEventKind>;
