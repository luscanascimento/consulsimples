import { apiFetch } from "@/lib/api";
import { ErrorState } from "@/components/error-state";
import { requireSession } from "@/lib/auth";
import { UserTable } from "./user-table";

type User = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER";
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
};

export default async function UsersPage() {
  const me = await requireSession();

  // Estado "sem permissão" é um dos cinco obrigatórios: quem não pode ver
  // recebe explicação, não uma tela quebrada nem um redirect misterioso.
  if (me.role !== "OWNER" && me.role !== "MANAGER") {
    return (
      <div role="alert" className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-semibold">Sem permissão</h1>
        <p className="mt-1 text-sm text-slate-600">
          Só o dono e o gerente administram usuários. Fale com um deles se precisar de acesso.
        </p>
      </div>
    );
  }

  let users: User[];
  try {
    users = await apiFetch<User[]>("/users");
  } catch {
    return <ErrorState message="Não conseguimos carregar os usuários agora." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-slate-600">
          Quem trabalha no restaurante e o que cada um acessa.
        </p>
      </header>
      <UserTable users={users} currentUserId={me.id} />
    </div>
  );
}
