"use client";
import { useActionState, useRef } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { createUserAction, updateUserAction, type FormState } from "./actions";

const INITIAL: FormState = {};

const ROLES = [
  { value: "MANAGER", label: "Gerente" },
  { value: "WAITER", label: "Garçom" },
  { value: "KITCHEN", label: "Cozinha" },
  { value: "CASHIER", label: "Caixa" },
  { value: "OWNER", label: "Dono" },
] as const;

type User = { id: string; name: string; email: string; role: string };

export function UserFormModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const isEdit = user !== null;
  const [state, action] = useActionState(isEdit ? updateUserAction : createUserAction, INITIAL);

  // O ref marca o resultado já tratado: sem ele, `state.ok` continua verdadeiro e o
  // modal fecharia sozinho na próxima vez que fosse aberto.
  const handled = useRef<FormState | null>(null);
  if (state.ok && open && handled.current !== state) {
    handled.current = state;
    onClose();
  }

  return (
    <Modal open={open} title={isEdit ? "Editar usuário" : "Novo usuário"} onClose={onClose}>
      <form key={user?.id ?? "new"} action={action} className="flex flex-col gap-4" noValidate>
        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {state.error}
          </p>
        )}
        {isEdit && <input type="hidden" name="id" value={user.id} />}

        <Field
          name="name"
          label="Nome"
          required
          defaultValue={user?.name}
          error={state.fieldErrors?.name}
        />

        {!isEdit && (
          <>
            <Field name="email" label="Email" type="email" required error={state.fieldErrors?.email} />
            <Field
              name="password"
              label="Senha"
              type="password"
              required
              hint="No mínimo 12 caracteres."
              error={state.fieldErrors?.password}
              autoComplete="new-password"
            />
          </>
        )}

        <Field
          name="role"
          label="Papel / Cargo"
          options={ROLES}
          defaultValue={user?.role ?? "WAITER"}
          required
          error={state.fieldErrors?.role}
        />

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <Button type="submit" pendingLabel="Salvando…">
            Salvar usuário
          </Button>
        </div>
      </form>
    </Modal>
  );
}

