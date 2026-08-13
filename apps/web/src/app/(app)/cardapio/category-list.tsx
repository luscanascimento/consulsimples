"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { createCategoryAction, type FormState } from "./actions";

const INITIAL: FormState = {};

type Category = { id: string; name: string };

export function CategoryList({
  categories,
  selectedId,
  canEdit,
}: {
  categories: Category[];
  selectedId?: string | undefined;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createCategoryAction, INITIAL);

  // Fecha o modal quando a action confirma sucesso. O ref marca qual resultado já foi
  // tratado: sem ele, `state.ok` continua verdadeiro e o modal fecharia sozinho na
  // próxima vez que fosse aberto.
  const handled = useRef<FormState | null>(null);
  if (state.ok && open && handled.current !== state) {
    handled.current = state;
    setOpen(false);
  }

  return (
    <aside className="w-56 shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Categorias</h2>
        {canEdit && (
          <button onClick={() => setOpen(true)} className="min-h-11 text-sm text-sky-700 underline">
            Nova categoria
          </button>
        )}
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria ainda."
          action={
            canEdit ? (
              <button
                onClick={() => setOpen(true)}
                className="min-h-11 text-sm text-sky-700 underline"
              >
                Criar a primeira
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cardapio?categoria=${c.id}`}
                aria-current={c.id === selectedId ? "page" : undefined}
                className="block rounded-md px-3 py-2 text-sm aria-[current]:bg-sky-50 aria-[current]:font-medium"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} title="Nova categoria" onClose={() => setOpen(false)}>
        <form action={action} className="flex flex-col gap-4" noValidate>
          {state.error && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {state.error}
            </p>
          )}
          <Field name="name" label="Nome" required error={state.fieldErrors?.name} />
          <Field name="sortOrder" label="Ordem" type="number" defaultValue={0} />
          <Button type="submit" pendingLabel="Salvando…">
            Salvar
          </Button>
        </form>
      </Modal>
    </aside>
  );
}
