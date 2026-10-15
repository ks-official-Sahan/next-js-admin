/** Whether a post belongs in public reads at this instant. */
export function isPublicPost(
  status: string,
  publishAt: Date | null,
  now: Date = new Date()
): boolean {
  if (status === "PUBLISHED") return true;
  return status === "SCHEDULED" && publishAt !== null && publishAt.getTime() <= now.getTime();
}
