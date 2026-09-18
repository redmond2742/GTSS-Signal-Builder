import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
export default defineConfig([
  // Global ignore. An `ignores` key that sits alongside other properties only
  // applies to that one config object, so generated build output has to be
  // excluded from its own entry — otherwise every emitted .d.ts gets linted.
  { ignores: ["**/dist/**"] },
  tseslint.configs.recommended,
  js.configs.recommended,
  {
    settings: {
      react: {
        version: "19.2.3", // Match this with your project's React version in package.json
      },
    },
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
]);
