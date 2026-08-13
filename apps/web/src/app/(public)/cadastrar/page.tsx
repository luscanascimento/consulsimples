import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cadastre seu restaurante e comece a montar o cardápio.
        </p>
      </div>
      <SignupForm />
      <p className="text-sm text-slate-600">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-sky-700 underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
