import Link from "next/link";
import { apiPublic } from "@/lib/api";

// Server Component: consome o token no servidor e mostra o resultado. Nenhum
// estado de client, nenhum useEffect.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Result ok={false} message="Link incompleto. Abra o link direto do email." />;
  }

  try {
    await apiPublic("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
    return <Result ok message="Email confirmado. Agora é só entrar." />;
  } catch {
    return <Result ok={false} message="Link inválido ou expirado. Faça o cadastro de novo." />;
  }
}

function Result({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{ok ? "Tudo certo" : "Não deu"}</h1>
      <p role={ok ? undefined : "alert"} className="text-sm text-slate-600">
        {message}
      </p>
      <Link href={ok ? "/entrar" : "/cadastrar"} className="font-medium text-sky-700 underline">
        {ok ? "Ir para o login" : "Voltar ao cadastro"}
      </Link>
    </div>
  );
}
