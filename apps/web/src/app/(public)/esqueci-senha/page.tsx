import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-slate-600">
          Informe o email da conta e enviamos um link para criar uma senha nova.
        </p>
      </div>
      <ForgotForm />
      <Link href="/entrar" className="text-sm font-medium text-sky-700 underline">
        Voltar para o login
      </Link>
    </>
  );
}
