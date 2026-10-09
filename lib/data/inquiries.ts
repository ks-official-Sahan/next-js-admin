export type InquiryStatus = "NEW" | "CONTACTED" | "CLOSED" | "SPAM";

export interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string | null;
  message: string;
  status: InquiryStatus;
  notes: string | null;
  assigneeId: string | null;
  /** "contact-form" or "chatbot". */
  source: string;
  /** HMAC of the visitor IP, never the address itself. */
  ipHash: string | null;
  userAgent: string | null;
  pagePath: string | null;
  spamScore: number;
  /** PENDING, SENT or FAILED. */
  emailStatus: string;
  autoReplyStatus: string;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InquiryEmailEventRow {
  id: string;
  inquiryId: string;
  /** "notify" or "auto-reply". */
  kind: string;
  provider: string;
  ok: boolean;
  messageId: string | null;
  error: string | null;
  createdAt: Date;
}

export interface InquiryAssignee {
  id: string;
  name: string | null;
  email: string;
}

export interface InquiryListRow extends InquiryRow {
  assignee: InquiryAssignee | null;
}

export interface InquiryDetail extends InquiryListRow {
  /** Newest first. */
  events: InquiryEmailEventRow[];
}

export type NewInquiry = Pick<
  InquiryRow,
  "name" | "email" | "phone" | "topic" | "message" | "status" | "source" | "ipHash" | "userAgent" | "pagePath" | "spamScore" | "emailStatus" | "autoReplyStatus"
>;

export type InquiryPatch = Partial<Pick<InquiryRow, "status" | "notes" | "assigneeId" | "emailStatus" | "autoReplyStatus">>;

export interface InquiryListFilters {
  status?: InquiryStatus;
  /** Case-insensitive match on name, email or message. */
  search?: string;
  limit: number;
  offset: number;
}

export interface InquiryRepo {
  create(input: NewInquiry): Promise<InquiryRow>;
  /** Same email, message and IP hash since `since`. */
  findRecentDuplicate(input: { email: string; message: string; ipHash: string; since: Date }): Promise<InquiryRow | null>;
  findById(id: string): Promise<InquiryRow | null>;
  findDetail(id: string): Promise<InquiryDetail | null>;
  /** Newest first. */
  list(filters: InquiryListFilters): Promise<{ rows: InquiryListRow[]; total: number }>;
  /** The newest `limit` inquiries with their assignee, for the export (no count query). */
  listRecent(limit: number): Promise<InquiryListRow[]>;
  update(id: string, patch: InquiryPatch): Promise<InquiryRow>;
  delete(id: string): Promise<void>;
  addEmailEvent(input: Omit<InquiryEmailEventRow, "id" | "createdAt">): Promise<void>;
}
