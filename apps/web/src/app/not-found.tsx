import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-8 shadow-xs">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-700">
          404
        </span>
        <h1 className="text-xl font-semibold text-slate-900">Página não encontrada</h1>
        <p className="text-sm text-slate-600">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Link
            href="/cardapio"
            className="flex min-h-11 items-center justify-center rounded-md bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800"
          >
            Ir para o Cardápio
          </Link>
          <Link
            href="/entrar"
            className="flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Fazer Login
          </Link>
        </div>
      </div>
    </main>
  );
}
