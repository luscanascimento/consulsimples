"use client";
import { useActionState, useRef } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { formatCents } from "@/lib/money";
import { createProductAction, updateProductAction, type FormState } from "./actions";

const INITIAL: FormState = {};

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  available: boolean;
};

export function ProductFormModal({
  open,
  product,
  categoryId,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  categoryId: string;
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
        <input type="hidden" name="categoryId" value={categoryId} />

        <Field
          name="name"
          label="Nome"
          required
          defaultValue={product?.name}
          error={state.fieldErrors?.name}
        />
        <Field
          name="description"
          label="Descrição"
          defaultValue={product?.description ?? undefined}
          error={state.fieldErrors?.description}
        />
        <Field
          name="price"
          label="Preço"
          required
          defaultValue={product ? formatCents(product.priceCents).replace("R$ ", "") : undefined}
          hint="Use vírgula: 23,50."
          error={state.fieldErrors?.price ?? state.fieldErrors?.priceCents}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="available" defaultChecked={product?.available ?? true} />
          Disponível para venda
        </label>
        <Button type="submit" pendingLabel="Salvando…">
          Salvar
        </Button>
      </form>
    </Modal>
  );
}
