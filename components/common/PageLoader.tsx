import React from "react";

const PageLoader = () => {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 bg-white dark:bg-black"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0000001f] border-t-[#19cf31] dark:border-[#ffffff1f] dark:border-t-[#91FF00]" />
      <span className="text-sm opacity-60">Loading…</span>
    </div>
  );
};

export default PageLoader;
