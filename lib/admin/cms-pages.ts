import type { CmsPage } from "@/lib/cms/registry";

// How the CMS pages are named and reached in the admin. Kept apart from the
// registry, which holds content rules and must not know about admin screens.

export const CMS_PAGE_INFO: Record<CmsPage, { label: string; path: string; blurb: string }> = {
  home: { label: "Home", path: "/", blurb: "Hero, contact channels, process and the closing call to action." },
  updates: { label: "Updates", path: "/updates", blurb: "Hero and filter titles for the updates list." },
  contact: { label: "Contact", path: "/contact", blurb: "Hero, form wording, tips and social links." },
};
