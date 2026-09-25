// Cache tag scheme (design notes, section 5.3). Pure: no Next
// import, so the tags can be tested and reused by the invalidation plans.

export const PAGE_SLUGS = ["home", "about", "works", "updates", "contact", "site"] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export const COLLECTIONS = ["projects", "experience", "services", "skills"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export function isPageSlug(value: string): value is PageSlug {
  return (PAGE_SLUGS as readonly string[]).includes(value);
}

const POST_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Post slugs end up inside cache tags and paths, so they are strictly limited. */
export function isValidPostSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 96 && POST_SLUG.test(slug);
}

export const TAGS = {
  /** Coarse tag on every CMS read. */
  cms: "cms",
  page: (slug: PageSlug) => `cms:page:${slug}`,
  collection: (name: CollectionName) => `collection:${name}`,
  blogList: "blog:list",
  blogPost: (slug: string) => {
    if (!isValidPostSlug(slug)) throw new Error("Invalid post slug for a cache tag");
    return `blog:post:${slug}`;
  },
  blogTaxonomy: "blog:taxonomy",
  siteConfig: "site:config",
  settingsPublic: "settings:public",
  chatbotKnowledge: "chatbot:knowledge",
} as const;

/** Every tag that does not depend on a post slug. "Clear cache" expires these. */
export function staticTags(): string[] {
  return [
    TAGS.cms,
    ...PAGE_SLUGS.map((slug) => TAGS.page(slug)),
    ...COLLECTIONS.map((name) => TAGS.collection(name)),
    TAGS.blogList,
    TAGS.blogTaxonomy,
    TAGS.siteConfig,
    TAGS.settingsPublic,
    TAGS.chatbotKnowledge,
  ];
}
