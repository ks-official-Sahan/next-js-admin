import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PAGE_PATHS,
  forCacheClear,
  forCollection,
  forContentPublish,
  forPost,
  forPostList,
  forSettings,
  forTraining,
} from "./plan";
import { staticTags } from "./tags";

test("publishing a section invalidates its page tag and the chatbot knowledge", () => {
  const plan = forContentPublish("about");
  assert.deepEqual(plan.tags, ["cms:page:about", "chatbot:knowledge"]);
  assert.deepEqual(plan.paths, ["/about"]);
});

test("a shared section revalidates every page that shows it", () => {
  const plan = forContentPublish("home", {
    consumers: ["/", "/about", "/works", "/updates"],
    section: "finalCta",
  });
  assert.deepEqual(plan.tags, ["cms:page:home", "chatbot:knowledge"]);
  assert.deepEqual(plan.paths, ["/", "/about", "/works", "/updates"]);
});

test("publishing a site section also expires the site config, and seo adds the sitemap", () => {
  const identity = forContentPublish("site", { section: "identity" });
  assert.deepEqual(identity.tags, ["cms:page:site", "chatbot:knowledge", "site:config"]);
  assert.deepEqual(identity.paths, PAGE_PATHS.site);

  const seo = forContentPublish("site", { section: "seo" });
  assert.deepEqual(seo.paths, [...PAGE_PATHS.site, "/sitemap.xml"]);
});

test("a collection change refreshes home, about and works", () => {
  const plan = forCollection("skills");
  assert.deepEqual(plan.tags, ["collection:skills", "chatbot:knowledge"]);
  assert.deepEqual(plan.paths, ["/", "/about", "/works"]);
});

test("projects and experience also feed llms.txt (its Featured projects and Current role sections)", () => {
  assert.deepEqual(forCollection("projects").paths, ["/", "/about", "/works", "/llms.txt"]);
  assert.deepEqual(forCollection("experience").paths, ["/", "/about", "/works", "/llms.txt"]);
  assert.equal(forCollection("services").paths.includes("/llms.txt"), false);
});

test("a post change refreshes the list, the post, taxonomy, feeds, the sitemap and llms.txt", () => {
  const plan = forPost("hello-world");
  assert.deepEqual(plan.tags, ["blog:list", "blog:post:hello-world", "blog:taxonomy", "chatbot:knowledge"]);
  assert.deepEqual(plan.paths, ["/updates", "/updates/hello-world", "/sitemap.xml", "/rss.xml", "/llms.txt"]);
});

test("the post list plan also revalidates llms.txt", () => {
  assert.deepEqual(forPostList().paths, ["/updates", "/sitemap.xml", "/rss.xml", "/llms.txt"]);
});

test("publishing About's hero or bento section also revalidates llms.txt (its Author bio), other sections do not", () => {
  assert.deepEqual(forContentPublish("about", { section: "hero" }).paths, ["/about", "/llms.txt"]);
  assert.deepEqual(forContentPublish("about", { section: "bento" }).paths, ["/about", "/llms.txt"]);
  assert.deepEqual(forContentPublish("about", { section: "skills" }).paths, ["/about"]);
  assert.deepEqual(forContentPublish("works", { section: "hero" }).paths, ["/works"]);
});

test("a post plan refuses an unsafe slug", () => {
  assert.throws(() => forPost("../admin"), /Invalid post slug/);
  assert.throws(() => forPost("A B"), /Invalid post slug/);
});

test("the post list plan has no per-post tag", () => {
  const plan = forPostList();
  assert.equal(plan.tags.some((tag) => tag.startsWith("blog:post:")), false);
  assert.ok(plan.tags.includes("blog:list"));
});

test("settings refresh the public layout", () => {
  const plan = forSettings();
  assert.deepEqual(plan.tags, ["settings:public"]);
  assert.deepEqual(plan.paths, [{ path: "/", type: "layout" }]);
});

test("training entries only touch the chatbot knowledge", () => {
  assert.deepEqual(forTraining(), { tags: ["chatbot:knowledge"], paths: [] });
});

test("clear cache expires every slug-independent tag", () => {
  const plan = forCacheClear();
  assert.deepEqual(plan.tags, staticTags());
  assert.deepEqual(plan.paths, [{ path: "/", type: "layout" }]);
});

test("every plan lists each tag and path once", () => {
  const plans = [
    forContentPublish("site", { section: "seo" }),
    forCollection("skills"),
    forPost("a"),
    forPostList(),
    forSettings(),
    forCacheClear(),
  ];
  for (const plan of plans) {
    assert.equal(new Set(plan.tags).size, plan.tags.length);
    const paths = plan.paths.map((entry) => (typeof entry === "string" ? entry : `${entry.type}:${entry.path}`));
    assert.equal(new Set(paths).size, paths.length);
  }
});
