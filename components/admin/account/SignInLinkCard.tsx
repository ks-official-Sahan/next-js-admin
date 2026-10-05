import CopyField from "@/components/admin/ui/CopyField";
import { cardClass } from "@/components/admin/ui/styles";
import { formatDateTime } from "@/lib/admin/format";
import { signInLink } from "@/lib/auth/links";

/**
 * A copyable sign-in link: opens the hidden login page on another device
 * without the unlock secret. Renders nothing while the hidden-login gate is
 * off, since the login page is public then.
 */
export default async function SignInLinkCard({ audience }: { audience: "self" | "team" }) {
  const link = await signInLink();
  if (!link.expiresAt) return null;

  return (
    <section className={cardClass} aria-labelledby="sign-in-link-heading">
      <h2 id="sign-in-link-heading" className="text-base font-medium">
        Sign-in link
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        {audience === "self"
          ? "Opens the sign-in page on a new device or browser. Bookmark it, or copy a fresh one here."
          : "Send this to a team member who needs the sign-in page on a new device."}{" "}
        It does not sign anyone in: a password (and MFA, when on) is still needed.
      </p>
      <CopyField
        value={link.url}
        label="Sign-in link"
        hint={`Works until ${formatDateTime(link.expiresAt)}. Every link stops working when the unlock secret is rotated.`}
      />
    </section>
  );
}
