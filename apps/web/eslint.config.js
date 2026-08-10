import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "public/mockServiceWorker.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "worker/**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["src/context/ModeContext.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
