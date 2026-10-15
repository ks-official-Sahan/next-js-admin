import NotFoundContent from "@/components/site/NotFoundContent";
import NotCounted from "@/components/site/analytics/NotCounted";

// notFound() inside a public page already sits in SiteShell (app/(site)/layout),
// so only the body is rendered here and the audio and navigation state survive.
export default function SiteNotFound() {
  return (
    <>
      <NotCounted />
      <NotFoundContent />
    </>
  );
}
