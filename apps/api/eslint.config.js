// ESLint 9 usa flat config; `.eslintrc.json` seria ignorado. Mesmas regras do plano.
const js = require("@eslint/js");
const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: { ...globals.node, ...globals.jest },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: "Use env de src/config/env.ts" },
      ],
      "no-restricted-imports": ["error", { patterns: ["**/apps/*/src/**"] }],
    },
  },
  {
    files: ["src/config/env.ts", "src/main.ts", "test/load-env.ts"],
    rules: { "no-restricted-properties": "off" },
  },
];
