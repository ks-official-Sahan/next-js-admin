import type { Repos } from "@/lib/data/repos";
import { UniqueViolation } from "@/lib/data/errors";

import { allSections } from "./registry";
import type { SectionDefinition } from "./types";

// Imports what the code shows today as version 1 of every section, so the
// editor starts from published content and the history has a first entry.
// It is optional: with an empty table every page already looks the same,
// because the loaders fall back to the same defaults. It never touches a section
// that has any row, so running it twice or after an edit changes nothing
// (design notes, sections 7 and 8).

/** The repository the import uses, so a test can pass a fake. */
export type ContentSeedDb = Pick<Repos, "contentBlocks">;

export interface ContentSeedSummary {
  created: number;
  skipped: number;
}

const NOTE = "Imported from the code defaults";

export async function seedContent(
  db: ContentSeedDb,
  definitions: SectionDefinition<unknown>[] = allSections()
): Promise<ContentSeedSummary> {
  const summary: ContentSeedSummary = { created: 0, skipped: 0 };

  for (const definition of definitions) {
    const existing = await db.contentBlocks.countSection(definition.page, definition.key);
    if (existing > 0) {
      summary.skipped += 1;
      continue;
    }

    // Parse so a default that drifted from its schema fails here, not on a page.
    const data = definition.schema.parse(definition.defaults());
    try {
      await db.contentBlocks.create({
        pageSlug: definition.page,
        sectionSlug: definition.key,
        version: 1,
        data,
        status: "PUBLISHED",
        note: NOTE,
        publishedAt: new Date(),
      });
      summary.created += 1;
    } catch (error) {
      // Someone saved the same section between the count and the insert.
      if (error instanceof UniqueViolation) summary.skipped += 1;
      else throw error;
    }
  }

  return summary;
}
