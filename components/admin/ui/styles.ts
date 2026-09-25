// Shared class names for admin forms and tables, so every screen looks alike.

export const fieldClass =
  "block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export const textareaClass =
  "block min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const buttonVariants = {
  primary: `${buttonBase} h-10 bg-primary px-4 text-primary-foreground hover:bg-primary/90`,
  secondary: `${buttonBase} h-10 border border-input bg-background px-4 hover:bg-muted`,
  danger: `${buttonBase} h-10 bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90`,
  small: `${buttonBase} h-8 border border-input bg-background px-3 text-xs hover:bg-muted`,
  smallDanger: `${buttonBase} h-8 border border-destructive/40 bg-background px-3 text-xs text-destructive hover:bg-destructive/10`,
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export const cardClass = "rounded-lg border border-border bg-card p-5 text-card-foreground";
export const tableClass = "w-full min-w-[40rem] text-left text-sm";
export const thClass = "px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground";
export const tdClass = "px-3 py-3 align-top";
export const badgeClass =
  "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
