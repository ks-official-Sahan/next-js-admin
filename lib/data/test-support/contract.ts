import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { SYSTEM_ROLE_ROWS } from "@/lib/auth/kit-config";

import { UniqueViolation } from "../errors";
import type { Repos } from "../repos";

// One behavioural contract every lib/data implementation must pass. The
// Prisma and Drizzle runners each open their own in-process Postgres built
// from prisma/schema.prisma, so the two ORMs cannot drift apart.

export interface RepoHarness {
  repos: Repos;
  withTx<T>(fn: (tx: Repos) => Promise<T>): Promise<T>;
  /** Raw SQL for seeding rows no repository creates (sessions come from the auth adapter). */
  exec(sql: string, params?: unknown[]): Promise<void>;
  close(): Promise<void>;
}

const HOUR = 3600 * 1000;

export function runRepoContract(name: string, open: () => Promise<RepoHarness>) {
  describe(`${name} repositories`, () => {
    let h: RepoHarness;
    let seq = 0;
    const unique = (prefix: string) => `${prefix}-${++seq}`;

    before(async () => {
      h = await open();
      // users.role references roles.name: the built-in rows come first, as in the seed.
      assert.equal(await h.repos.roles.seedSystem(SYSTEM_ROLE_ROWS), SYSTEM_ROLE_ROWS.length);
    });
    after(async () => {
      await h?.close();
    });

    async function newUser(role: string = "EDITOR") {
      const email = `${unique("u")}@example.com`;
      const { id } = await h.repos.users.create({ email, name: "N", role, passwordHash: "hash", createdById: null });
      return { id, email };
    }

    function newPost(overrides: Record<string, unknown> = {}) {
      const slug = unique("post");
      return {
        slug,
        title: `Title ${slug}`,
        excerpt: null,
        content: "<p>x</p>",
        contentHtml: "<p>x</p>",
        contentText: "x",
        readMinutes: 1,
        topic: "General",
        tags: ["a"],
        status: "DRAFT" as const,
        publishAt: null,
        publishedAt: null,
        generatedByAI: false,
        ...overrides,
      };
    }

    test("users: create, look up, count sessions, lock developers", async () => {
      const dev = await newUser("DEVELOPER");
      assert.equal(await h.repos.users.existsByEmail(dev.email), true);
      assert.equal((await h.repos.users.findRefByEmail(dev.email))?.role, "DEVELOPER");
      assert.equal(await h.repos.users.findPasswordHash(dev.id), "hash");
      const listed = (await h.repos.users.list()).find((user) => user.id === dev.id);
      assert.equal(listed?.activeSessions, 0);
      const locked = await h.withTx((tx) => tx.users.lockActiveDevelopers());
      assert.equal(locked, await h.repos.users.countActiveDevelopers());
      await h.repos.users.update(dev.id, { disabledAt: new Date() });
      const list = await h.repos.users.list();
      assert.equal(list.at(-1)?.id, dev.id, "disabled users sort last");
    });

    test("users screen: search, filters, sort, paging and bulk writes", async () => {
      const tag = unique("find");
      const a = await newUser("MANAGER");
      const b = await newUser("EDITOR");
      await h.repos.users.updateMany([a.id, b.id], { disabledAt: null });
      await h.repos.users.update(a.id, { name: `Ann ${tag}` });
      await h.repos.users.update(b.id, { name: `Bob ${tag}` });

      const byName = await h.repos.users.search({ q: tag.toUpperCase(), sort: "name", dir: "desc", offset: 0, limit: 1 });
      assert.equal(byName.total, 2);
      assert.deepEqual(byName.items.map((user) => user.id), [b.id]);
      const next = await h.repos.users.search({ q: tag, sort: "name", dir: "desc", offset: 1, limit: 1 });
      assert.deepEqual(next.items.map((user) => user.id), [a.id]);
      assert.equal((await h.repos.users.search({ q: tag, role: "MANAGER", sort: "default", dir: "asc", offset: 0, limit: 10 })).total, 1);
      assert.equal((await h.repos.users.search({ q: "100%_", sort: "default", dir: "asc", offset: 0, limit: 10 })).total, 0, "LIKE wildcards are literal");

      await h.repos.users.updateMany([a.id], { disabledAt: new Date() });
      const disabled = await h.repos.users.search({ q: tag, status: "disabled", sort: "default", dir: "asc", offset: 0, limit: 10 });
      assert.deepEqual(disabled.items.map((user) => user.id), [a.id]);
      await h.repos.users.deleteMany([a.id, b.id]);
      assert.equal((await h.repos.users.search({ q: tag, sort: "default", dir: "asc", offset: 0, limit: 10 })).total, 0);
    });

    test("sessions screen: keyset paging, live filter, owners for bulk actions", async () => {
      const owner = await newUser("EDITOR");
      const now = new Date();
      const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
      const insert = (id: string, lastSeenAt: Date, expiresAt: Date, revokedAt: Date | null = null) =>
        h.exec(
          'INSERT INTO user_sessions (id, "userId", ip, "lastSeenAt", "expiresAt", "revokedAt") VALUES ($1, $2, $3, $4, $5, $6)',
          [id, owner.id, "10.9.8.7", lastSeenAt, expiresAt, revokedAt]
        );
      const ids = [unique("s"), unique("s"), unique("s")];
      await insert(ids[0], at(1), new Date(now.getTime() + HOUR));
      await insert(ids[1], at(2), new Date(now.getTime() + HOUR));
      await insert(ids[2], at(3), new Date(now.getTime() + HOUR), now);

      const first = await h.repos.sessions.search({ userId: owner.id, status: "all", limit: 2, now });
      assert.deepEqual(first.items.map((row) => row.id), [ids[0], ids[1]]);
      assert.equal(first.items[0].userEmail, owner.email);
      assert.ok(first.next);
      const second = await h.repos.sessions.search({ userId: owner.id, status: "all", limit: 2, now, after: first.next! });
      assert.deepEqual(second.items.map((row) => row.id), [ids[2]]);
      assert.equal(second.next, null);

      const active = await h.repos.sessions.search({ q: "10.9.8", userId: owner.id, status: "active", limit: 10, now });
      assert.deepEqual(active.items.map((row) => row.id), [ids[0], ids[1]]);
      const ended = await h.repos.sessions.search({ userId: owner.id, status: "ended", limit: 10, now });
      assert.deepEqual(ended.items.map((row) => row.id), [ids[2]]);

      const targets = await h.repos.sessions.findManyWithOwner([ids[0], ids[2]]);
      assert.deepEqual(targets.map((row) => row.user.email).sort(), [owner.email, owner.email]);
      assert.deepEqual((await h.repos.sessions.listLiveForUsers([owner.id], now)).map((row) => row.id).sort(), [ids[0], ids[1]].sort());
      assert.ok((await h.repos.users.listWithLiveSessions(now)).some((user) => user.id === owner.id));
    });

    test("invites: rotate an open one, revoke and delete in bulk", async () => {
      const sender = await newUser("MANAGER");
      const expiresAt = new Date(Date.now() + HOUR);
      const invite = await h.repos.authTokens.create({ purpose: "INVITE", email: "r@example.com", tokenHash: unique("hash"), expiresAt, role: "EDITOR", createdById: sender.id });
      const rotatedHash = unique("hash");
      assert.equal(await h.repos.authTokens.rotateOpenInvite(invite.id, rotatedHash, expiresAt), 1);
      assert.equal((await h.repos.authTokens.findByHash(rotatedHash))?.id, invite.id);
      await h.repos.authTokens.revokeOpenInvitesSentByAny([sender.id]);
      assert.equal(await h.repos.authTokens.rotateOpenInvite(invite.id, unique("hash"), expiresAt), 0, "a revoked invite never rotates");
      await h.repos.authTokens.deleteForUsers([sender.id]);
      assert.equal(await h.repos.authTokens.findByHash(rotatedHash), null);
    });

    test("withTx rolls every write back when the callback throws", async () => {
      const email = `${unique("tx")}@example.com`;
      await assert.rejects(
        h.withTx(async (tx) => {
          await tx.users.create({ email, name: null, role: "EDITOR", passwordHash: "h", createdById: null });
          await tx.audit.create({ action: "t.x", actorId: null, actorEmail: null, actorRole: null, entityType: "T", entityId: null, ip: null, userAgent: null });
          throw new Error("abort");
        }),
        /abort/
      );
      assert.equal(await h.repos.users.existsByEmail(email), false);
    });

    test("posts: unique slug, optimistic update, public list with joins", async () => {
      const author = await newUser();
      const cover = await h.repos.media.create({ provider: "CLOUDINARY", kind: "IMAGE", url: "https://x/c.png", publicId: unique("pid"), format: "png", sizeBytes: 1, folder: "f", width: 10, height: 5 });
      const draft = await h.repos.posts.create(newPost({ authorId: author.id }));
      assert.deepEqual(draft.tags, ["a"]);
      await assert.rejects(h.repos.posts.create(newPost({ slug: draft.slug })), UniqueViolation);

      const updated = await h.repos.posts.updateIfUnchanged(draft.id, draft.updatedAt, { title: "Changed" });
      assert.equal(updated?.title, "Changed");
      assert.equal(await h.repos.posts.updateIfUnchanged(draft.id, draft.updatedAt, { title: "Stale" }), null, "stale updatedAt");

      const live = await h.repos.posts.create(
        newPost({ status: "PUBLISHED", publishedAt: new Date(), coverMediaId: cover.id, authorId: author.id })
      );
      await h.repos.posts.create(newPost({ status: "SCHEDULED", publishAt: new Date(Date.now() - HOUR) }));
      const listed = await h.repos.posts.listPublished();
      const row = listed.find((post) => post.id === live.id);
      assert.ok(row);
      assert.ok(listed.every((post) => post.id !== draft.id));
      assert.deepEqual(row.coverMedia, { url: "https://x/c.png", width: 10, height: 5 });
      assert.equal(row.author?.name, "N");
      assert.equal((await h.repos.posts.findPublished(live.slug))?.contentHtml, "<p>x</p>");
      assert.equal((await h.repos.posts.findWithCoverUrl(live.id))?.coverMedia?.url, "https://x/c.png");
      assert.equal((await h.repos.posts.findWithCoverUrl(draft.id))?.coverMedia, null);
    });

    test("posts: exact slug prefixes, case-insensitive title search", async () => {
      const base = unique("wild");
      await h.repos.posts.create(newPost({ slug: `${base}_a`, title: "100% Pure" }));
      await h.repos.posts.create(newPost({ slug: `${base}xa`, title: "100 Pure" }));
      assert.deepEqual(await h.repos.posts.slugsStartingWith(`${base}_`), [`${base}_a`]);
      const { rows: ci } = await h.repos.posts.adminPage({ q: "pure", skip: 0, take: 50 });
      assert.ok(ci.length >= 2, "case-insensitive");
      assert.ok((await h.repos.posts.topics()).includes("General"));
    });

    test("revisions: history with author email, snapshots scoped to their post", async () => {
      const author = await newUser();
      const post = await h.repos.posts.create(newPost());
      const other = await h.repos.posts.create(newPost());
      await h.repos.postRevisions.create({ postId: post.id, title: "v1", data: { title: "v1" }, reason: "update", createdById: author.id });
      const [rev] = await h.repos.postRevisions.listForPost(post.id, 10);
      assert.equal(rev?.authorEmail, author.email);
      assert.deepEqual((await h.repos.postRevisions.findData(rev!.id, post.id))?.data, { title: "v1" });
      assert.equal(await h.repos.postRevisions.findData(rev!.id, other.id), null);
    });

    test("content blocks: unique versions and stale-draft protection", async () => {
      const page = unique("page");
      const created = await h.repos.contentBlocks.create({ pageSlug: page, sectionSlug: "hero", version: 1, data: { a: 1 }, status: "DRAFT" });
      await assert.rejects(
        h.repos.contentBlocks.create({ pageSlug: page, sectionSlug: "hero", version: 1, data: {}, status: "DRAFT" }),
        UniqueViolation
      );
      const [draft] = await h.repos.contentBlocks.listSection(page, "hero");
      assert.equal(await h.repos.contentBlocks.updateDraftData(draft!.id, new Date(0), { a: 2 }), false);
      assert.equal(await h.repos.contentBlocks.updateDraftData(draft!.id, created.updatedAt, { a: 2 }), true);
      const fresh = await h.repos.contentBlocks.updatedAt(draft!.id);
      assert.equal(
        await h.repos.contentBlocks.publishDraft(draft!.id, fresh, { publishedById: "x", note: null, publishedAt: new Date() }),
        true
      );
      assert.deepEqual((await h.repos.contentBlocks.listPageData(page, ["PUBLISHED"]))[0]?.data, { a: 2 });
      assert.ok(await h.repos.contentBlocks.lastPublishedUpdate(page));
    });

    test("media: idempotent seed and usage, usages listed", async () => {
      const publicId = unique("local");
      const input = { provider: "LOCAL" as const, kind: "IMAGE" as const, url: "/x.png", publicId, format: "png", sizeBytes: 2, folder: "seed" };
      await h.repos.media.createIfMissing(input);
      await h.repos.media.createIfMissing(input);
      const asset = (await h.repos.media.listRecent(100)).find((row) => row.publicId === publicId);
      assert.ok(asset);
      assert.deepEqual(asset.tags, []);
      const usage = { mediaId: asset.id, entityType: "Post", entityId: "p", field: "cover" };
      await h.repos.media.recordUsage(usage);
      await h.repos.media.recordUsage(usage);
      assert.equal((await h.repos.media.findWithUsages(asset.id))?.usages.length, 1);
      await h.repos.media.clearUsage("Post", "p");
      assert.equal((await h.repos.media.findWithUsages(asset.id))?.usages.length, 0);
    });

    test("settings, role permissions and auth tokens", async () => {
      const key = unique("setting");
      await h.repos.settings.upsert(key, { on: true }, null);
      await h.repos.settings.upsert(key, { on: false }, null);
      assert.deepEqual(await h.repos.settings.find(key), { key, value: { on: false } });

      const permission = unique("perm");
      assert.equal(await h.repos.rolePermissions.grantMany([{ role: "EDITOR", permission }]), 1);
      assert.equal(await h.repos.rolePermissions.grantMany([{ role: "EDITOR", permission }]), 0, "duplicates skipped");

      const token = await h.repos.authTokens.create({ purpose: "INVITE", email: "i@example.com", tokenHash: unique("hash"), expiresAt: new Date(Date.now() + HOUR), role: "EDITOR" });
      const now = new Date();
      const claims = await Promise.all([h.repos.authTokens.claim(token.id, now), h.repos.authTokens.claim(token.id, now)]);
      assert.equal(claims.reduce((a, b) => a + b, 0), 1, "a token is claimed once");
    });

    test("roles: list, create, update, user counts, delete, and the invites a role would grant", async () => {
      assert.deepEqual((await h.repos.roles.list()).slice(0, 4).map((role) => role.name), ["DEVELOPER", "SUPER_ADMIN", "MANAGER", "EDITOR"]);
      assert.equal(await h.repos.roles.seedSystem(SYSTEM_ROLE_ROWS), 0, "seeding again adds nothing");

      const name = `SUPPORT_${++seq}`;
      await h.repos.roles.create({ name, label: "Support", description: null, rank: 30 });
      await assert.rejects(h.repos.roles.create({ name, label: "Again", description: null, rank: 31 }), UniqueViolation);
      await h.repos.roles.update(name, { label: "Helpdesk", description: "First line", rank: 40 });
      assert.deepEqual(await h.repos.roles.find(name), { name, label: "Helpdesk", description: "First line", rank: 40, system: false });

      const holder = await newUser(name);
      assert.equal(await h.repos.roles.countUsers(name), 1);
      assert.equal((await h.repos.roles.userCounts())[name], 1);
      await assert.rejects(h.repos.roles.delete(name), "a held role cannot be deleted");
      await h.repos.users.update(holder.id, { role: "EDITOR" });

      await h.repos.authTokens.create({ purpose: "INVITE", email: "role@example.com", tokenHash: unique("hash"), expiresAt: new Date(Date.now() + HOUR), role: name });
      assert.equal(await h.repos.authTokens.revokeOpenInvitesForRole(name), 1);
      assert.equal(await h.repos.authTokens.revokeOpenInvitesForRole(name), 0);

      await h.repos.roles.delete(name);
      assert.equal(await h.repos.roles.find(name), null);
      // A built-in role is never deleted (Prisma reports the miss, Drizzle deletes nothing).
      await h.repos.roles.delete("EDITOR").catch(() => undefined);
      assert.ok(await h.repos.roles.find("EDITOR"));
    });

    test("audit: bulk insert, prefix filter, keyset paging, action names", async () => {
      const entityId = unique("ent");
      const row = (action: string) => ({ action, actorId: null, actorEmail: "Ops@Example.com", actorRole: null, entityType: "Doc", entityId, ip: null, userAgent: null, meta: { n: 1 } });
      await h.repos.audit.createMany([row("doc.a"), row("doc.b"), row("other.c")]);
      const page1 = await h.repos.audit.page({ entityId, action: "doc.*", actor: "ops@" }, null, 1);
      assert.equal(page1.length, 1);
      const page2 = await h.repos.audit.page({ entityId, action: "doc.*" }, { createdAt: page1[0]!.createdAt, id: page1[0]!.id }, 10);
      assert.equal(page2.length, 1);
      assert.notEqual(page2[0]!.id, page1[0]!.id);
      assert.deepEqual(page1[0]!.meta, { n: 1 });
      assert.ok((await h.repos.audit.actionNames(100)).includes("doc.a"));
    });

    test("masking: shown roles filter and sort, mask flags, hidden audit rows, roles holding a permission", async () => {
      const tag = unique("mask");
      const make = async (prefix: string, role: string) =>
        (await h.repos.users.create({ email: `${prefix}-${tag}@example.com`, name: null, role, passwordHash: "hash", createdById: null })).id;
      const masked = await make("a", "DEVELOPER");
      const open = await make("b", "DEVELOPER");
      const admin = await make("c", "SUPER_ADMIN");
      await make("d", "EDITOR");
      await h.repos.users.update(masked, { masked: true });
      const flags = new Map((await h.repos.users.maskFlags("DEVELOPER")).map((row) => [row.id, row.masked]));
      assert.equal(flags.get(masked), true);
      assert.equal(flags.get(open), false);
      assert.equal(flags.has(admin), false);

      const roles = ["DEVELOPER", "SUPER_ADMIN", "MANAGER", "EDITOR"];
      const one = { superRole: "DEVELOPER", maskAs: "SUPER_ADMIN", global: false, roles };
      const search = (over: Record<string, unknown>) =>
        h.repos.users.search({ q: tag, sort: "default", dir: "asc", offset: 0, limit: 10, ...over } as Parameters<typeof h.repos.users.search>[0]);
      const ids = async (over: Record<string, unknown>) => (await search(over)).items.map((user) => user.id).sort();
      assert.deepEqual(await ids({ role: "SUPER_ADMIN", present: one }), [masked, admin].sort());
      assert.deepEqual(await ids({ role: "DEVELOPER", present: one }), [open]);
      const sorted = await search({ sort: "role", present: one });
      assert.deepEqual(sorted.items.map((user) => user.email.slice(0, 1)), ["b", "d", "a", "c"], "by the role shown, then email");
      assert.equal(sorted.total, 4);
      assert.deepEqual((await search({ sort: "role", present: one, offset: 2, limit: 1 })).items.map((user) => user.id), [masked]);
      const all = { ...one, global: true };
      assert.equal((await search({ role: "DEVELOPER", present: all })).total, 0);
      assert.equal((await search({ role: "SUPER_ADMIN", present: all })).total, 3);
      assert.equal((await search({ sort: "role", present: all })).items[0]!.email.slice(0, 1), "d", "nobody sorts as a developer");

      const entityId = unique("ent");
      const action = unique("dev.only");
      const audited = (actorRole: string | null, name: string) => ({ action: name, actorId: null, actorEmail: null, actorRole, entityType: "Doc", entityId, ip: null, userAgent: null });
      await h.repos.audit.createMany([audited("DEVELOPER", action), audited("EDITOR", "doc.seen"), audited(null, "doc.system")]);
      const visible = await h.repos.audit.page({ entityId, hideActorRole: "DEVELOPER" }, null, 10);
      assert.deepEqual(visible.map((entry) => entry.action).sort(), ["doc.seen", "doc.system"]);
      assert.equal((await h.repos.audit.page({ entityId }, null, 10)).length, 3);
      assert.equal((await h.repos.audit.actionNames(1000, "DEVELOPER")).includes(action), false);
      assert.ok((await h.repos.audit.actionNames(1000)).includes(action));

      const permission = unique("perm");
      await h.repos.rolePermissions.grantMany([{ role: "EDITOR", permission }]);
      assert.deepEqual(await h.repos.rolePermissions.rolesWith(permission), ["EDITOR"]);
    });

    test("chat and inquiries", async () => {
      const sessionId = unique("chat");
      const first = await h.repos.chat.upsertSession({ sessionId, ipHash: null, userAgent: null, pagePath: "/" });
      const again = await h.repos.chat.upsertSession({ sessionId, ipHash: "other", userAgent: null, pagePath: null });
      assert.equal(again.id, first.id);
      await h.repos.chat.addMessage({ sessionId, role: "user", content: "hi", tokens: null, latencyMs: null });
      await h.repos.chat.addMessage({ sessionId, role: "assistant", content: "hello", tokens: 3, latencyMs: 5 });
      assert.deepEqual((await h.repos.chat.recentMessages(sessionId, 10)).map((m) => m.content), ["hi", "hello"]);

      const inquiry = await h.repos.inquiries.create({
        name: "Ada",
        email: `${unique("lead")}@example.com`,
        phone: null,
        topic: null,
        message: "Need a site",
        status: "NEW",
        source: "chatbot",
        ipHash: null,
        userAgent: null,
        pagePath: null,
        spamScore: 0,
        emailStatus: "PENDING",
        autoReplyStatus: "PENDING",
      });
      await h.repos.chat.linkInquiry(sessionId, inquiry.id);
      const sessions = await h.repos.chat.listSessions({ limit: 100, offset: 0 });
      const listed = sessions.find((s) => s.sessionId === sessionId);
      assert.equal(listed?.messagesCount, 2);
      assert.equal(listed?.inquiry?.id, inquiry.id);

      await h.repos.inquiries.addEmailEvent({ inquiryId: inquiry.id, kind: "notify", provider: "capture", ok: true, messageId: null, error: null });
      const detail = await h.repos.inquiries.findDetail(inquiry.id);
      assert.equal(detail?.events.length, 1);
      assert.equal(detail?.assignee, null);
      const { rows, total } = await h.repos.inquiries.list({ search: "need A SITE", limit: 10, offset: 0 });
      assert.ok(total >= 1 && rows.some((r) => r.id === inquiry.id));
    });

    test("maintenance: scheduled publish, revision pruning, ping", async () => {
      const due = await h.repos.posts.create(newPost({ status: "SCHEDULED", publishAt: new Date(Date.now() - HOUR) }));
      assert.ok((await h.repos.maintenance.publishDuePosts(new Date())) >= 1);
      assert.equal((await h.repos.posts.find(due.id))?.status, "PUBLISHED");

      for (const title of ["r1", "r2", "r3"]) {
        await h.repos.postRevisions.create({ postId: due.id, title, data: {}, reason: "update", createdById: null });
      }
      assert.ok((await h.repos.maintenance.pruneRevisions(1)) >= 2);
      assert.equal((await h.repos.postRevisions.listForPost(due.id, 10)).length, 1);
      await h.repos.maintenance.ping();
      assert.ok((await h.repos.dashboard.countUnpublishedPosts()) >= 0);
    });
  });
}
