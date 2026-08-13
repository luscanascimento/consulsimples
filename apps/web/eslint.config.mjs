// ESLint 9 usa flat config; eslint-config-next 15 ainda é eslintrc, então FlatCompat
// é a ponte oficial entre os dois.
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: [".next/**", "node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // O token vive só no servidor: quem quiser ler cookie ou falar com a API
      // importa de @/lib, que é server-only.
      "no-restricted-imports": ["error", { patterns: ["**/apps/*/src/**"] }],
    },
  },
];
