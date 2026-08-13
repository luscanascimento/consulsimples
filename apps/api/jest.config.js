module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["**/*.spec.ts", "**/*.e2e-spec.ts"],
  // src/config/env.ts faz process.exit(1) no import: o env precisa existir antes de qualquer import.
  globalSetup: "<rootDir>/test/load-env.ts",
  // Uma suite e2e por vez: todas compartilham o MESMO banco e cada uma faz resetDb().
  // Em paralelo, o TRUNCATE de uma apaga as linhas da outra no meio da requisição.
  maxWorkers: 1,
};
