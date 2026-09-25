import { ImageResponse } from "next/og";
import { Site, SiteMetadata } from "@/config/site";

export const alt = SiteMetadata.description;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 25% 15%, rgba(145,255,0,0.18), transparent 45%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 32,
            color: "#91FF00",
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          {SiteMetadata.legalName}
        </div>
        <div
          style={{
            fontSize: 68,
            color: "#ffffff",
            fontWeight: 800,
            marginTop: 24,
            lineHeight: 1.15,
            display: "flex",
          }}
        >
          {Site.myRole}
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#a0a0a0",
            marginTop: 28,
            display: "flex",
          }}
        >
          {SiteMetadata.description}
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#91FF00",
            marginTop: 60,
            display: "flex",
          }}
        >
          {SiteMetadata.siteUrl.replace("https://", "")}
        </div>
      </div>
    ),
    { ...size }
  );
}
