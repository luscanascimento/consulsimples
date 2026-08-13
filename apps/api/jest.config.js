module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["**/*.spec.ts", "**/*.e2e-spec.ts"],
  // src/config/env.ts faz process.exit(1) no import: o env precisa existir antes de qualquer import.
  globalSetup: "<rootDir>/test/load-env.ts",
};
