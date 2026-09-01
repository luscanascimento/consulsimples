"use client";
import { useActionState, useRef } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { formatCents } from "@/lib/money";
import { createProductAction, updateProductAction, type FormState } from "./actions";

const INITIAL: FormState = {};

type Category = { id: string; name: string };

type Product = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  priceCents: number;
  available: boolean;
  sortOrder?: number | undefined;
};

export function ProductFormModal({
  open,
  product,
  categoryId,
  categories,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  categoryId: string;
  categories?: Category[] | undefined;
  onClose: () => void;
}) {
  const isEdit = product !== null;
  const [state, action] = useActionState(
    isEdit ? updateProductAction : createProductAction,
    INITIAL,
  );

  // O ref marca o resultado já tratado: sem ele, `state.ok` continua verdadeiro e o
  // modal fecharia sozinho na próxima vez que fosse aberto.
  const handled = useRef<FormState | null>(null);
  if (state.ok && open && handled.current !== state) {
    handled.current = state;
    onClose();
  }

  const categoryOptions = categories?.map((c) => ({ value: c.id, label: c.name }));

  return (
    <Modal open={open} title={isEdit ? "Editar produto" : "Novo produto"} onClose={onClose}>
      {/* key força o form a remontar ao trocar de produto: sem isso os defaultValue
          continuam mostrando o item anterior. */}
      <form key={product?.id ?? "new"} action={action} className="flex flex-col gap-4" noValidate>
        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {state.error}
          </p>
        )}
        {isEdit && <input type="hidden" name="id" value={product.id} />}

        {categoryOptions && categoryOptions.length > 0 ? (
          <Field
            name="categoryId"
            label="Categoria"
            options={categoryOptions}
            defaultValue={product?.categoryId ?? categoryId}
            required
            error={state.fieldErrors?.categoryId}
          />
        ) : (
          <input type="hidden" name="categoryId" value={product?.categoryId ?? categoryId} />
        )}

        <Field
          name="name"
          label="Nome do produto"
          required
          defaultValue={product?.name}
          placeholder="Ex: Hambúrguer Clássico, Suco de Laranja..."
          error={state.fieldErrors?.name}
        />
        <Field
          name="description"
          label="Descrição"
          type="textarea"
          rows={2}
          defaultValue={product?.description ?? undefined}
          placeholder="Ingredientes, modo de preparo ou detalhes do produto..."
          error={state.fieldErrors?.description}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="price"
            label="Preço (R$)"
            required
            defaultValue={product ? formatCents(product.priceCents).replace("R$ ", "") : undefined}
            placeholder="25,00"
            hint="Use vírgula: 23,50."
            error={state.fieldErrors?.price ?? state.fieldErrors?.priceCents}
          />
          <Field
            name="sortOrder"
            label="Ordem"
            type="number"
            defaultValue={product?.sortOrder ?? 0}
            hint="Ordem de exibição na categoria."
            error={state.fieldErrors?.sortOrder}
          />
        </div>

        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/50 p-3 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            name="available"
            defaultChecked={product?.available ?? true}
            className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
          />
          Disponível para venda no cardápio
        </label>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <Button type="submit" pendingLabel="Salvando…">
            Salvar produto
          </Button>
        </div>
      </form>
    </Modal>
  );
}

