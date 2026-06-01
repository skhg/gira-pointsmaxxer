import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const tsRecommended = tseslint.configs.recommended.map(config => ({
  ...config,
  files: config.files ?? ["**/*.ts"],
}));

export default [
  {
    ignores: ["dist/**", "node_modules/**", "vendor/**"],
  },
  js.configs.recommended,
  ...tsRecommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
      },
      sourceType: "module",
    },
  },
  {
    files: ["server.ts", "server/**/*.ts", "test/**/*.ts", "testing/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
        fetch: "readonly",
        URL: "readonly",
      },
      parserOptions: {
        projectService: true,
      },
      sourceType: "module",
    },
  },
  {
    files: ["vite.config.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
      sourceType: "module",
    },
  },
];
