module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  // Só as unidades de src. e2e/*.spec.ts é do Playwright e travaria o jest.
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  transform: {
    // O tsconfig do Next é ESM + jsx preserve; o jest roda em CommonJS.
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "CommonJS", jsx: "react-jsx" } }],
  },
};
