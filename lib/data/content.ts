export type BlockStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED";

/** One version of one CMS section. */
export interface ContentBlockRow {
  id: string;
  version: number;
  status: BlockStatus;
  data: unknown;
  note: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  createdById: string | null;
  publishedById: string | null;
}

export interface NewContentBlock {
  pageSlug: string;
  sectionSlug: string;
  version: number;
  data: unknown;
  status: BlockStatus;
  note?: string | null;
  publishedAt?: Date | null;
  createdById?: string | null;
}

export interface ContentBlockRepo {
  /** Every version of a section, newest first. */
  listSection(page: string, section: string): Promise<ContentBlockRow[]>;
  countSection(page: string, section: string): Promise<number>;
  /** The draft and published rows of a page, without their data. */
  listPageStates(page: string): Promise<Array<{ sectionSlug: string; status: BlockStatus; version: number; publishedAt: Date | null; updatedAt: Date }>>;
  /** Data of a page's rows in the given statuses. */
  listPageData(page: string, statuses: BlockStatus[]): Promise<Array<{ sectionSlug: string; status: BlockStatus; data: unknown }>>;
  /** Newest updatedAt among a page's published rows. */
  lastPublishedUpdate(page: string): Promise<Date | null>;
  /** Throws UniqueViolation when the (page, section, version) already exists. */
  create(input: NewContentBlock): Promise<{ version: number; updatedAt: Date }>;
  /** Replaces a draft's data if it still has `expectedUpdatedAt`; false when someone else changed it. */
  updateDraftData(id: string, expectedUpdatedAt: Date, data: unknown): Promise<boolean>;
  /** PUBLISHED becomes SUPERSEDED. */
  supersede(id: string): Promise<void>;
  /** A draft becomes PUBLISHED if it still has `expectedUpdatedAt`; false otherwise. */
  publishDraft(id: string, expectedUpdatedAt: Date, input: { publishedById: string; note: string | null; publishedAt: Date }): Promise<boolean>;
  /** Deletes a draft if it still has `expectedUpdatedAt`; false otherwise. */
  deleteDraft(id: string, expectedUpdatedAt: Date): Promise<boolean>;
  updatedAt(id: string): Promise<Date>;
}
