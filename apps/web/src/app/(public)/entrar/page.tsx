import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <LoginForm />
      <p className="text-sm text-slate-600">
        Ainda não tem conta?{" "}
        <Link href="/cadastrar" className="font-medium text-sky-700 underline">
          Cadastrar restaurante
        </Link>
      </p>
    </>
  );
}
