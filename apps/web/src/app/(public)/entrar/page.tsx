import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ "senha-redefinida"?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      {params["senha-redefinida"] && (
        <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          Senha alterada. Entre com a nova senha.
        </p>
      )}
      <LoginForm />
      <div className="flex flex-col gap-2 text-sm text-slate-600">
        <Link href="/esqueci-senha" className="font-medium text-sky-700 underline">
          Esqueci minha senha
        </Link>
        <span>
          Ainda não tem conta?{" "}
          <Link href="/cadastrar" className="font-medium text-sky-700 underline">
            Cadastrar restaurante
          </Link>
        </span>
      </div>
    </>
  );
}
