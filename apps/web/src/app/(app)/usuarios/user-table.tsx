"use client";
import { useActionState, useState, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { Button } from "@/components/button";
import { disableUserAction, type FormState } from "./actions";
import { UserFormModal } from "./user-form-modal";

const INITIAL: FormState = {};

const ROLE_CONFIG: Record<
  string,
  { label: string; badgeClass: string }
> = {
  OWNER: {
    label: "Dono",
    badgeClass: "border-purple-200 bg-purple-50 text-purple-800",
  },
  MANAGER: {
    label: "Gerente",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-800",
  },
  WAITER: {
    label: "Garçom",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  KITCHEN: {
    label: "Cozinha",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  CASHIER: {
    label: "Caixa",
    badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-800",
  },
};

type User = {
  id: string;
  name: string;
  email: string;
  role: keyof typeof ROLE_CONFIG;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
};

export function UserTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [disablingUser, setDisablingUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");

  const [state, disableAction] = useActionState(disableUserAction, INITIAL);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_CONFIG[u.role]?.label.toLowerCase().includes(q),
    );
  }, [users, search]);

  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(iso))
      : "Nunca acessou";

  return (
    <section className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>
            Total de usuários: <strong className="font-semibold text-slate-900">{users.length}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {users.length > 2 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuário..."
              aria-label="Buscar usuário por nome ou email"
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
            />
          )}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-11 items-center justify-center rounded-md bg-sky-700 px-4 text-sm font-medium text-white shadow-xs hover:bg-sky-800"
          >
            + Novo usuário
          </button>
        </div>
      </div>

      {users.length === 0 ? (
        <EmptyState title="Nenhum usuário além de você." />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Nenhum usuário encontrado para &ldquo;{search}&rdquo;.
          <button
            type="button"
            onClick={() => setSearch("")}
            className="ml-2 font-medium text-sky-700 underline"
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-sm">
            <caption className="sr-only">Usuários do restaurante</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Nome & Email
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Papel
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Situação
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Último acesso
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => {
                const isMe = u.id === currentUserId;
                const roleInfo = ROLE_CONFIG[u.role] ?? {
                  label: u.role,
                  badgeClass: "border-slate-200 bg-slate-50 text-slate-800",
                };

                return (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{u.name}</span>
                        {isMe && (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                            Você
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleInfo.badgeClass}`}
                      >
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          u.status === "ACTIVE"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {u.status === "ACTIVE" ? "Ativo" : "Desativado"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {formatDate(u.lastLoginAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(u)}
                          className="min-h-9 rounded px-2.5 py-1 text-sm font-medium text-sky-700 hover:bg-sky-50"
                        >
                          Editar
                        </button>
                        {u.status === "ACTIVE" && !isMe && (
                          <button
                            type="button"
                            onClick={() => setDisablingUser(u)}
                            className="min-h-9 rounded px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            Desativar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Criar / Editar Usuário */}
      <UserFormModal
        open={creating || editing !== null}
        user={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      {/* Modal Confirmar Desativação de Usuário */}
      <Modal
        open={disablingUser !== null}
        title="Desativar usuário"
        onClose={() => setDisablingUser(null)}
      >
        <form
          action={async (formData) => {
            await disableAction(formData);
            setDisablingUser(null);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={disablingUser?.id ?? ""} />
          <p className="text-sm text-slate-700">
            Tem certeza de que deseja desativar o acesso de{" "}
            <strong className="font-semibold text-slate-900">{disablingUser?.name}</strong> (
            {disablingUser?.email})?
          </p>
          <p className="text-xs text-slate-500">
            O usuário perderá o acesso ao sistema e todas as sessões ativas serão encerradas.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDisablingUser(null)}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <Button variant="danger" type="submit" pendingLabel="Desativando…">
              Sim, desativar
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

