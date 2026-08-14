"use client";
import { useActionState, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { disableUserAction, type FormState } from "./actions";
import { UserFormModal } from "./user-form-modal";

const INITIAL: FormState = {};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dono",
  MANAGER: "Gerente",
  WAITER: "Garçom",
  KITCHEN: "Cozinha",
  CASHIER: "Caixa",
};

type User = {
  id: string;
  name: string;
  email: string;
  role: keyof typeof ROLE_LABEL;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
};

export function UserTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [state, disableAction] = useActionState(disableUserAction, INITIAL);

  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(iso))
      : "nunca";

  return (
    <section className="flex flex-col gap-3">
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="min-h-11 text-sm text-sky-700 underline"
        >
          Novo usuário
        </button>
      </div>

      {users.length === 0 ? (
        <EmptyState title="Nenhum usuário além de você." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Usuários do restaurante</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Email
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Papel
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Situação
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Último acesso
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-2">{u.status === "ACTIVE" ? "Ativo" : "Desativado"}</td>
                  <td className="px-4 py-2">{formatDate(u.lastLoginAt)}</td>
                  <td className="flex gap-2 px-4 py-2">
                    <button onClick={() => setEditing(u)} className="min-h-11 text-sky-700 underline">
                      Editar
                    </button>
                    {u.status === "ACTIVE" && u.id !== currentUserId && (
                      <form action={disableAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="min-h-11 text-red-700 underline">
                          Desativar
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormModal
        open={creating || editing !== null}
        user={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </section>
  );
}
