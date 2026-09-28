"use client";

import type { PageContent } from "@/lib/cms/registry";
import { Site } from "@/config/site";
import { cn } from "@/lib/utils";
import { Check, Copy, Send } from "lucide-react";
import React, { useId, useState, useEffect, useRef } from "react";

type ChannelId = "email" | "whatsapp";
type Field = "name" | "email" | "message";
type Errors = Partial<Record<Field, string>>;

const fieldClass =
  "min-h-12 w-full rounded-[12px] border border-bBORDERFADE bg-bFCARD px-4 text-[15px] placeholder:opacity-50";
const labelClass = "mb-2 block text-sm font-semibold";

interface ContactFormProps {
  content: PageContent<"contact">;
}

// The contact form now submits to the API, but keeps the WhatsApp and email
// quick links and copy fallback as alternate channels. If the API is unreachable
// or rate-limited, the form degrades gracefully to show the fallbacks.
const ContactForm = ({ content }: ContactFormProps) => {
  const id = useId();
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    email: "",
    message: "",
  });
  const [topic, setTopic] = useState(content.form.topicOptions[0]);
  const [channel, setChannel] = useState<ChannelId>("email");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error" | "opened" | "copied">("idle");
  const [token, setToken] = useState<string>("");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The "sent" state resets after a few seconds; stop that timer on unmount.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  // Fetch timing token on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/contact/token");
        const data = await res.json();
        if (data.token) setToken(data.token);
      } catch {
        console.error("Failed to get token");
      }
    })();
  }, []);

  const validate = (values: Record<Field, string>): Errors => {
    const errors: Errors = {};
    if (!values.name.trim()) errors.name = content.form.validation.name.required;
    if (!values.email.trim()) errors.email = content.form.validation.email.required;
    else if (!/^\S+@\S+\.\S+$/.test(values.email.trim()))
      errors.email = content.form.validation.email.format;
    if (values.message.trim().length < 10)
      errors.message = content.form.validation.message.minLength;
    return errors;
  };

  const setField = (field: Field) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    setStatus("idle");
  };

  const buildMessage = () =>
    [
      `Hi ${Site.author},`,
      "",
      values.message.trim(),
      "",
      `${values.name.trim()}`,
      `${values.email.trim()}`,
      `Topic: ${topic}`,
    ].join("\n");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);

    const firstInvalid = (["name", "email", "message"] as Field[]).find(
      (field) => found[field]
    );
    if (firstInvalid) {
      document.getElementById(`${id}-${firstInvalid}`)?.focus();
      return;
    }

    // Try to submit to API first
    if (token && channel === "email") {
      setStatus("submitting");
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name.trim(),
            email: values.email.trim(),
            phone: "",
            topic: topic,
            message: values.message.trim(),
            website: "", // honeypot
            token,
          }),
        });

        if (res.ok) {
          setStatus("success");
          setValues({ name: "", email: "", message: "" });
          clearTimeout(resetTimer.current);
          resetTimer.current = setTimeout(() => setStatus("idle"), 3000);
          return;
        }
      } catch (error) {
        console.error("API submission failed", error);
        setStatus("error");
        // Fall through to fallback
      }
    }

    // Fallback: use mailto or WhatsApp
    const body = buildMessage();

    if (channel === "email") {
      const subject = `[${topic}] Message from ${values.name.trim()}`;
      window.location.href = `mailto:${Site.email}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
    } else {
      const number = Site.phone.replace(/\D/g, "");
      window.open(
        `https://wa.me/${number}?text=${encodeURIComponent(body)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
    setStatus("opened");
  };

  const copyMessage = async () => {
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      await navigator.clipboard.writeText(buildMessage());
      setStatus("copied");
    } catch {
      // Clipboard blocked: the message is still in the form, nothing is lost.
    }
  };

  const error = (field: Field) =>
    errors[field] && (
      <p id={`${id}-${field}-error`} className="mt-2 text-sm text-red-500">
        {errors[field]}
      </p>
    );

  const described = (field: Field) =>
    errors[field] ? `${id}-${field}-error` : undefined;

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-[20px] border border-bBORDERFADE bg-bCARD p-6 s640:p-8"
    >
      <div>
        <h2 className="text-xl font-semibold">{content.form.title}</h2>
        <p className="mt-2 text-sm leading-relaxed opacity-70">
          {content.form.intro}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 s640:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            {content.form.fields.name.label}
          </label>
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            required
            value={values.name}
            onChange={setField("name")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={described("name")}
            placeholder={content.form.fields.name.placeholder || undefined}
            className={fieldClass}
          />
          {error("name")}
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={labelClass}>
            {content.form.fields.email.label}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={values.email}
            onChange={setField("email")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={described("email")}
            placeholder={content.form.fields.email.placeholder || "you@example.com"}
            className={fieldClass}
          />
          {error("email")}
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-topic`} className={labelClass}>
          {content.form.fields.topic.label}
        </label>
        <select
          id={`${id}-topic`}
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            setStatus("idle");
          }}
          className={cn(fieldClass, "appearance-none")}
        >
          {content.form.topicOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${id}-message`} className={labelClass}>
          {content.form.fields.message.label}
        </label>
        <textarea
          id={`${id}-message`}
          name="message"
          rows={6}
          required
          value={values.message}
          onChange={setField("message")}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={described("message")}
          placeholder={content.form.fields.message.placeholder || undefined}
          className={cn(fieldClass, "min-h-[160px] resize-y py-3")}
        />
        {error("message")}
      </div>

      <fieldset>
        <legend className={labelClass}>{content.form.legend}</legend>
        <div className="flex gap-2">
          {content.form.channels.map((item) => (
            <label
              key={item.id}
              className={cn(
                "press flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                channel === item.id
                  ? "border-transparent bg-bICON_FADE text-bICON"
                  : "border-bBORDERFADE bg-bFCARD opacity-80 hover:opacity-100"
              )}
            >
              <input
                type="radio"
                name="channel"
                value={item.id}
                checked={channel === item.id}
                onChange={() => setChannel(item.id as ChannelId)}
                className="sr-only"
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 s480:flex-row">
        <button
          type="submit"
          className="press inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-bCHIPSELECTED px-7 text-[15px] font-semibold text-white dark:text-black"
        >
          <Send size={18} aria-hidden="true" />
          {content.form.submitButtonText}
        </button>
        <button
          type="button"
          onClick={copyMessage}
          className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-bBORDERFADE bg-bFCARD px-6 text-[15px] font-semibold"
        >
          {status === "copied" ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Copy size={18} aria-hidden="true" />
          )}
          {status === "copied" ? content.form.copiedButtonText : content.form.copyButtonText}
        </button>
      </div>

      <p role="status" className="text-sm leading-relaxed opacity-80">
        {status === "success" && (
          <span className="text-green-600 dark:text-green-400">
            Thanks! Your message was received. We&apos;ll get back to you soon.
          </span>
        )}
        {status === "error" && (
          <span className="text-yellow-600 dark:text-yellow-400">
            Could not connect to the server. Using email as fallback—your message is open there.
          </span>
        )}
        {status === "submitting" && <span>Sending...</span>}
        {status === "opened" && content.form.statusOpened}
        {status === "copied" && content.form.statusCopied}
      </p>
    </form>
  );
};

export default ContactForm;
