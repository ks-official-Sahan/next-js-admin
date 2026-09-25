import { Site, SiteMetadata } from "@/config/site";
import { jsonLdHtml } from "@/lib/seo/json-ld";

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: SiteMetadata.legalName,
  url: SiteMetadata.siteUrl,
  jobTitle: Site.myRole,
  description: SiteMetadata.description,
  worksFor: {
    "@type": "Organization",
    name: Site.org,
    url: Site.orgUrl,
  },
  address: {
    "@type": "PostalAddress",
    addressCountry: "LK",
  },
  sameAs: [
    `https://github.com/${SiteMetadata.githubUsername}`,
    `https://x.com/${SiteMetadata.twitterUsername.replace(/^@/, "")}`,
  ],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SiteMetadata.ogSiteName,
  url: SiteMetadata.siteUrl,
  author: {
    "@type": "Person",
    name: SiteMetadata.legalName,
  },
};

const JsonLd = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(personJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(websiteJsonLd) }}
      />
    </>
  );
};

export default JsonLd;
