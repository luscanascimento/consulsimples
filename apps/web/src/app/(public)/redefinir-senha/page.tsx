import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Link incompleto</h1>
        <p role="alert" className="text-sm text-slate-600">
          Este link não traz o código de verificação. Abra o link direto do email, sem copiar pela
          metade.
        </p>
        <Link href="/esqueci-senha" className="font-medium text-sky-700 underline">
          Pedir um novo link
        </Link>
      </div>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Criar nova senha</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ao salvar, todas as sessões abertas nesta conta são encerradas.
        </p>
      </div>
      <ResetForm token={token} />
    </>
  );
}
