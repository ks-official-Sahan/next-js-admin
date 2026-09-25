import { BookCopy, Hash } from "lucide-react";

// Fallback/seed posts, used only while the `Post` table is empty (see
// lib/blog/queries.ts and lib/blog/seed.ts). Replace with your own posts from
// /admin/blog once the app is running — these exist so a fresh install has
// something to show on /updates.
export const UpdatesContent = {
  title: {
    w1: "Recent",
    w2: "Updates",
  },
  subtitle: "Release notes and news, posted as progress happens.",
  fs: {
    topics: {
      title: "Topics",
      icon: BookCopy,
    },
    tags: {
      title: "Tags",
      icon: Hash,
    },
  },
  topics: [
    { id: 1, name: "Releases", updates: 1 },
    { id: 2, name: "New Features", updates: 0 },
    { id: 3, name: "Bug Fix", updates: 0 },
    { id: 4, name: "Other", updates: 0 },
  ],
  tags: ["Next.js", "React", "Admin"],
  posts: [
    {
      id: "1",
      title: "Welcome to your new admin platform",
      date: "2026",
      content:
        "This is a starter post created by the admin template. Edit or delete it from /admin/blog, or write your first real update.",
      topic: "Releases",
      tags: ["Next.js", "React", "Admin"],
    },
  ],
};
