import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import svgToDataUri from "mini-svg-data-uri";
import defaultTheme from "tailwindcss/defaultTheme";

 
import colors from "tailwindcss/colors";
import { default as flattenColorPalette } from "tailwindcss/lib/util/flattenColorPalette";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    screens: {
      xs: { max: "479px" }, // Very small/old mobile phones (e.g., iPhone 5, older Android phones)
      sm: { max: "767px" }, // Small tablets, large phones in landscape
      md: { min: "768px", max: "1023px" }, // Tablets and small laptops (e.g., iPad Pro, smaller Chromebooks)
      // Plain min-width steps for mobile-first layouts. Tailwind's arbitrary
      // `min-[..]` variants are not generated when the screens above mix in
      // max-width entries, and the order here must stay ascending so a wider
      // rule always overrides a narrower one.
      s480: "480px",
      s640: "640px",
      s768: "768px",
      lg: "1024px", // Laptops and small desktops (e.g., MacBook Pro, 13" laptops)
      xl: "1536px", // Larger desktops, 4K monitors
      s1920: "1920px", // Wide and ultrawide monitors
    },
    // screens: {
    //   // 1. Old low-end mobile devices
    //   xs: { max: "359px" }, // Very small/old mobile phones (e.g., iPhone 5, older Android phones)
    //   // 2. Low-end modern mobile devices
    //   mobile: { min: "360px", max: "479px" }, // Modern budget mobile phones (e.g., older iPhones, budget Android phones)
    //   // 3. High-end mobile devices in portrait mode
    //   mobileH: { min: "480px", max: "639px" }, // High-end mobiles in portrait mode (e.g., iPhone 16 Pro Max, Galaxy S24 Ultra)
    //   // 4. Large phones in landscape and small tablets
    //   sm: { min: "640px", max: "767px" }, // Small tablets, large phones in landscape
    //   // 5. Tablets and smaller laptops
    //   md: { min: "768px", max: "1023px" }, // Tablets and small laptops (e.g., iPad Pro, smaller Chromebooks)
    //   // 6. Laptops and small desktops
    //   lg: { min: "1024px", max: "1279px" }, // Laptops and small desktops (e.g., MacBook Pro, 13" laptops)
    //   // 7. Large desktops and high-resolution displays
    //   xl: { min: "1280px", max: "1535px" }, // Large desktops and high-resolution monitors
    //   // 8. Extra-large desktops and 4K monitors
    //   xxl: { min: "1536px", max: "1919px" }, // Larger desktops, 4K monitors
    //   // 9. Ultra-wide screens for immersive displays
    //   wide: { min: "1920px", max: "2559px" }, // Ultra-wide monitors (21:9, 32:9), large desktop monitors
    //   // 10. Ultra-high-resolution screens (4K+)
    //   "4k": { min: "2560px" }, // Ultra-high-end and 4K resolution displays
    // },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        xl: "1400px",
      },
    },
    extend: {
      screens: {
        portrait: { raw: "(orientation: portrait)" },
        landscape: { raw: "(orientation: landscape)" },
      },
      backgroundImage: {
        gradientBorder: "var(--gradient-border)",
      },
      colors: {
        "color-1": "hsl(var(--color-1))",
        "color-2": "hsl(var(--color-2))",
        "color-3": "hsl(var(--color-3))",
        "color-4": "hsl(var(--color-4))",
        "color-5": "hsl(var(--color-5))",
        secondaryT: "var(--text-secondary)",
        bBG: "var(--b-bg)",
        bBORDERFADE: "var(--b-border-fade)",
        bBORDER_SHADE: "var(--b-border-shade)",
        bCARD: "var(--b-card)",
        bFCARD: "var(--b-fcard)",
        bBENTO_CARD: "var(--b-bento-card)",
        bBENTO_CHIP: "var(--b-bento-chip)",
        bCARD_SHADE: "var(--b-card-shade)",
        bCARD_SHADE_BOLD: "var(--b-card-shade-bold)",
        bCHIP: "var(--b-chip)",
        bFRAME: "var(--b-frame)",
        bPLACEHOLDER: "var(--b-placeholder)",
        bICON_HOLDER: "var(--b-icon-holder)",
        bLINKHOLDER: "var(--b-linkholder)",
        bCHIPSELECTED: "var(--b-chip-selected)",
        bICON: "var(--b-icon)",
        bICON_FADE: "var(--b-icon-fade)",
        border: "var(--border-subtle)",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        rainbow: {
          "0%": {
            "background-position": "0%",
          },
          "100%": {
            "background-position": "200%",
          },
        },
        spotlight: {
          "0%": {
            opacity: "0",
            transform: "translate(-72%, -62%) scale(0.5)",
          },
          "100%": {
            opacity: "1",
            transform: "translate(-50%,-40%) scale(1)",
          },
        },
        "border-beam": {
          "100%": {
            "offset-distance": "100%",
          },
        },
        grid: {
          "0%": {
            transform: "translateY(-50%)",
          },
          "100%": {
            transform: "translateY(0)",
          },
        },
        "shiny-text": {
          "0%, 90%, 100%": {
            "background-position": "calc(-100% - var(--shiny-width)) 0",
          },
          "30%, 60%": {
            "background-position": "calc(100% + var(--shiny-width)) 0",
          },
        },
        aurora: {
          from: {
            backgroundPosition: "50% 50%, 50% 50%",
          },
          to: {
            backgroundPosition: "350% 50%, 350% 50%",
          },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" },
        },
        "marquee-vertical": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(calc(-100% - var(--gap)))" },
        },
        meteor: {
          "0%": { transform: "rotate(215deg) translateX(0)", opacity: "1" },
          "70%": { opacity: "1" },
          "100%": {
            transform: "rotate(215deg) translateX(-500px)",
            opacity: "0",
          },
        },
        moveHorizontal: {
          "0%": {
            transform: "translateX(-50%) translateY(-10%)",
          },
          "50%": {
            transform: "translateX(50%) translateY(10%)",
          },
          "100%": {
            transform: "translateX(-50%) translateY(-10%)",
          },
        },
        moveInCircle: {
          "0%": {
            transform: "rotate(0deg)",
          },
          "50%": {
            transform: "rotate(180deg)",
          },
          "100%": {
            transform: "rotate(360deg)",
          },
        },
        moveVertical: {
          "0%": {
            transform: "translateY(-50%)",
          },
          "50%": {
            transform: "translateY(50%)",
          },
          "100%": {
            transform: "translateY(-50%)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        rainbow: "rainbow var(--speed, 2s) infinite linear",
        spotlight: "spotlight 2s ease .75s 1 forwards",
        "border-beam": "border-beam calc(var(--duration)*1s) infinite linear",
        grid: "grid 15s linear infinite",
        "shiny-text": "shiny-text 8s infinite",
        aurora: "aurora 60s linear infinite",
        marquee: "marquee var(--duration) linear infinite",
        "marquee-vertical": "marquee-vertical var(--duration) linear infinite",
        meteor: "meteor 5s linear infinite",
        "meteor-effect": "meteor 5s linear infinite",
        first: "moveVertical 30s ease infinite",
        second: "moveInCircle 20s reverse infinite",
        third: "moveInCircle 40s linear infinite",
        fourth: "moveHorizontal 40s ease infinite",
        fifth: "moveInCircle 20s ease infinite",
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    addVariablesForColors,
    function ({ matchUtilities, theme }: any) {
      matchUtilities(
        {
          "bg-grid": (value: any) => ({
            backgroundImage: `url("${svgToDataUri(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="${value}"><path d="M0 .5H31.5V32"/></svg>`
            )}")`,
          }),
          "bg-grid-small": (value: any) => ({
            backgroundImage: `url("${svgToDataUri(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="8" height="8" fill="none" stroke="${value}"><path d="M0 .5H31.5V32"/></svg>`
            )}")`,
          }),
          "bg-dot": (value: any) => ({
            backgroundImage: `url("${svgToDataUri(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><circle fill="${value}" id="pattern-circle" cx="10" cy="10" r="1.6257413380501518"></circle></svg>`
            )}")`,
          }),
        },
        { values: flattenColorPalette(theme("backgroundColor")), type: "color" }
      );
    },
  ],
} satisfies Config;

export default config;

 
function addVariablesForColors({ addBase, theme }: any) {
  const allColors = flattenColorPalette(theme("colors"));
  // NextUI defines some opacity-aware colors (e.g. foreground-50) as functions
  // rather than strings; only strings are valid CSS custom property values.
  const newVars = Object.fromEntries(
    Object.entries(allColors)
      .filter(([, val]) => typeof val === "string")
      .map(([key, val]) => [`--${key}`, val])
  );

  addBase({
    ":root": newVars,
  });
}
