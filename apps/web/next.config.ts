import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Sem isto o Next infere a raiz por lockfile e pode escolher um diretório ACIMA do
  // repositório, quebrando o rastreio de arquivos do build de produção.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // O bundle não deve conter nada do monorepo além do que o Next transpila.
  transpilePackages: ["@consusimples/validation"],
  poweredByHeader: false,
};

export default config;
