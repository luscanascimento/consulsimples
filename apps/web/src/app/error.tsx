"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <div
        role="alert"
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50/50 p-8 shadow-xs"
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-lg font-bold text-red-700">
          !
        </span>
        <h1 className="text-xl font-semibold text-slate-900">Algo deu errado</h1>
        <p className="text-sm text-slate-600">
          Ocorreu um erro inesperado ao carregar esta página. Tente recarregar.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button type="button" onClick={() => reset()}>
            Tentar novamente
          </Button>
          <Link
            href="/cardapio"
            className="flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar ao Cardápio
          </Link>
        </div>
      </div>
    </main>
  );
}
