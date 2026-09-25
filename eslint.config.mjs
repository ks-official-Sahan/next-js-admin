import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    // React Compiler alignment rules (new in eslint-plugin-react-hooks v7).
    // This project doesn't enable the React Compiler, and several components
    // intentionally manage imperative browser APIs (Audio, WebGL, canvas
    // randomised decorations) that these rules aren't a good fit for.
    // Downgraded to warnings so they stay visible without failing lint.
    rules: {
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default eslintConfig;
