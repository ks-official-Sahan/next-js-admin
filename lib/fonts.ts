import localFont from "next/font/local";

// Self-hosted (Latin subset, from @fontsource, SIL OFL 1.1; licenses in
// app/fonts/). next/font/google fetches from fonts.googleapis.com at build and
// dev time and silently falls back to a system font when that fails, so a
// flaky network or a blocked build host changed the site's typography.
// next/font/local reads the files from the repo instead: same preload,
// font-display and size-adjusted fallback, no network.

export const poppins = localFont({
  src: [
    { path: "../app/fonts/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../app/fonts/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../app/fonts/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../app/fonts/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-poppins",
});

export const righteous = localFont({
  src: "../app/fonts/righteous-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
});
