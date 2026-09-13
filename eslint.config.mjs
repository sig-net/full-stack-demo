import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import next from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier/flat";
import importX from "eslint-plugin-import-x";
import jsdoc from "eslint-plugin-jsdoc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

const hooksRecommended = reactHooks.configs.flat.recommended;
if (!hooksRecommended) throw new Error("React Hooks recommended policy is unavailable");

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      ".yarn/**",
      ".quality-tools/**",
      ".local-vault/**",
      ".playwright-mcp/**",
      "public/zk/**",
      "public/zk.stage-*/**",
      "public/zk.previous/**",
      "scratch-refactor-tasks/verification/private/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: { "import-x": importX, "simple-import-sort": simpleImportSort },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "import-x/no-relative-packages": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@sig-net/*/managed/**",
            "@sig-net/*/src/managed/**",
            "@midnight-protocol/*/src/managed/**",
          ],
        },
      ],
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx,mts,cts}"],
    extends: [jsdoc.configs["flat/recommended-typescript-error"]],
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            "TSEnumDeclaration",
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSMethodSignature",
            "ExportNamedDeclaration > VariableDeclaration",
          ],
        },
      ],
      "jsdoc/require-throws": "error",
      "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    extends: [hooksRecommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.{tsx,jsx}"],
    extends: [jsxA11y.flatConfigs.recommended],
    plugins: { "@next/next": next },
    rules: { ...next.configs.recommended.rules, ...next.configs["core-web-vitals"].rules },
  },
  {
    files: ["**/tests/**/*.{ts,tsx,mts,cts}", "**/*.test.{ts,tsx,mts,cts}"],
    extends: [vitest.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      "vitest/no-focused-tests": "error",
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf"] }],
    },
  },
  {
    files: ["scripts/design-system/browser.mjs"],
    languageOptions: { globals: globals.browser },
  },
  prettier,
);
