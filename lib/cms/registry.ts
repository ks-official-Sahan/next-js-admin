import { contactSections } from "./pages/contact";
import { homeSections } from "./pages/home";
import { updatesSections } from "./pages/updates";
import type { PageContentOf, SectionDefinition } from "./types";

// Every editable section of the public pages, in one place. Adding a section
// means adding it to a page module in ./pages; the loaders, the editor and the
// completeness test pick it up from here. Add a new page (e.g. "about") by
// creating ./pages/about.ts and registering it below.

export const REGISTRY = {
  home: homeSections,
  updates: updatesSections,
  contact: contactSections,
} as const;

export type Registry = typeof REGISTRY;
export type CmsPage = keyof Registry;

/** Merged data of every section of a page, as the page components receive it. */
export type PageContent<P extends CmsPage> = PageContentOf<Registry[P]>;

export const CMS_PAGES = Object.keys(REGISTRY) as CmsPage[];

export function isCmsPage(value: string): value is CmsPage {
  return Object.hasOwn(REGISTRY, value);
}

export function sectionsOf(page: CmsPage): Record<string, SectionDefinition<unknown>> {
  return REGISTRY[page] as Record<string, SectionDefinition<unknown>>;
}

export function getDefinition(page: string, key: string): SectionDefinition<unknown> | null {
  if (!isCmsPage(page)) return null;
  const sections = sectionsOf(page);
  return Object.hasOwn(sections, key) ? sections[key] : null;
}

export function allSections(): SectionDefinition<unknown>[] {
  return CMS_PAGES.flatMap((page) => Object.values(sectionsOf(page)));
}
