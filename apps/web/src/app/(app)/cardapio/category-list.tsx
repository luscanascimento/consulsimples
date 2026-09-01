"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  type FormState,
} from "./actions";

const INITIAL: FormState = {};

type Category = { id: string; name: string; sortOrder: number; active: boolean };

export function CategoryList({
  categories,
  selectedId,
  canEdit,
}: {
  categories: Category[];
  selectedId?: string | undefined;
  canEdit: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const [createState, createAction] = useActionState(createCategoryAction, INITIAL);
  const [updateState, updateAction] = useActionState(updateCategoryAction, INITIAL);

  const handledCreate = useRef<FormState | null>(null);
  if (createState.ok && createOpen && handledCreate.current !== createState) {
    handledCreate.current = createState;
    setCreateOpen(false);
  }

  const handledUpdate = useRef<FormState | null>(null);
  if (updateState.ok && editingCategory !== null && handledUpdate.current !== updateState) {
    handledUpdate.current = updateState;
    setEditingCategory(null);
  }

  return (
    <aside className="w-64 shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Categorias</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="min-h-11 text-sm font-medium text-sky-700 hover:underline"
          >
            + Nova
          </button>
        )}
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria ainda."
          action={
            canEdit ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="min-h-11 text-sm text-sky-700 underline"
              >
                Criar a primeira
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {categories.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <li
                key={c.id}
                className={`group flex items-center justify-between rounded-md text-sm transition-colors ${
                  isSelected ? "bg-sky-50 font-medium text-sky-900" : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <Link
                  href={`/cardapio?categoria=${c.id}`}
                  aria-current={isSelected ? "page" : undefined}
                  className="flex-1 px-3 py-2"
                >
                  {c.name}
                </Link>
                {canEdit && (
                  <div className="flex items-center gap-1 pr-2 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      title={`Editar ${c.name}`}
                      onClick={() => setEditingCategory(c)}
                      className="rounded p-1 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      title={`Excluir ${c.name}`}
                      onClick={() => setDeletingCategory(c)}
                      className="rounded p-1 text-xs text-red-600 hover:bg-red-100 hover:text-red-800"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Modal Criar Categoria */}
      <Modal open={createOpen} title="Nova categoria" onClose={() => setCreateOpen(false)}>
        <form action={createAction} className="flex flex-col gap-4" noValidate>
          {createState.error && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {createState.error}
            </p>
          )}
          <Field name="name" label="Nome" required error={createState.fieldErrors?.name} placeholder="Ex: Bebidas, Lanches..." />
          <Field name="sortOrder" label="Ordem de exibição" type="number" defaultValue={0} hint="Números menores aparecem primeiro." />
          <Button type="submit" pendingLabel="Salvando…">
            Salvar categoria
          </Button>
        </form>
      </Modal>

      {/* Modal Editar Categoria */}
      <Modal
        open={editingCategory !== null}
        title="Editar categoria"
        onClose={() => setEditingCategory(null)}
      >
        <form
          key={editingCategory?.id ?? "edit-cat"}
          action={updateAction}
          className="flex flex-col gap-4"
          noValidate
        >
          {updateState.error && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {updateState.error}
            </p>
          )}
          {editingCategory && <input type="hidden" name="id" value={editingCategory.id} />}
          <Field
            name="name"
            label="Nome"
            required
            defaultValue={editingCategory?.name}
            error={updateState.fieldErrors?.name}
          />
          <Field
            name="sortOrder"
            label="Ordem de exibição"
            type="number"
            defaultValue={editingCategory?.sortOrder ?? 0}
            hint="Números menores aparecem primeiro."
          />
          <Button type="submit" pendingLabel="Salvando…">
            Salvar alterações
          </Button>
        </form>
      </Modal>

      {/* Modal Confirmar Exclusão de Categoria */}
      <Modal
        open={deletingCategory !== null}
        title="Excluir categoria"
        onClose={() => setDeletingCategory(null)}
      >
        <form
          action={async (formData) => {
            await deleteCategoryAction(formData);
            setDeletingCategory(null);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={deletingCategory?.id ?? ""} />
          <p className="text-sm text-slate-700">
            Tem certeza de que deseja remover a categoria{" "}
            <strong className="font-semibold text-slate-900">{deletingCategory?.name}</strong>?
          </p>
          <p className="text-xs text-slate-500">
            A categoria ficará inativa e não será mais exibida no cardápio.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeletingCategory(null)}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <Button variant="danger" type="submit" pendingLabel="Excluindo…">
              Sim, excluir
            </Button>
          </div>
        </form>
      </Modal>
    </aside>
  );
}

