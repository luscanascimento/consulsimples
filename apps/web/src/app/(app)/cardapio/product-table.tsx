"use client";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { formatCents } from "@/lib/money";
import { deleteProductAction } from "./actions";
import { ProductFormModal } from "./product-form-modal";

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  available: boolean;
};

export function ProductTable({
  products,
  categoryId,
  canEdit,
}: {
  products: Product[];
  categoryId?: string | undefined;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  if (!categoryId) {
    return <EmptyState title="Escolha ou crie uma categoria para começar." />;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Produtos</h2>
        {canEdit && (
          <button
            onClick={() => setCreating(true)}
            className="min-h-11 text-sm text-sky-700 underline"
          >
            Novo produto
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Nenhum produto nesta categoria."
          action={
            canEdit ? (
              <button
                onClick={() => setCreating(true)}
                className="min-h-11 text-sm text-sky-700 underline"
              >
                Criar o primeiro
              </button>
            ) : undefined
          }
        />
      ) : (
        // overflow-x-auto no contêiner da tabela, não na página: a tabela rola,
        // o resto da tela fica no lugar.
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Produtos da categoria selecionada</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Preço
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Disponível
                </th>
                {canEdit && (
                  <th scope="col" className="px-4 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{formatCents(p.priceCents)}</td>
                  <td className="px-4 py-2">{p.available ? "Sim" : "Não"}</td>
                  {canEdit && (
                    <td className="flex gap-2 px-4 py-2">
                      <button onClick={() => setEditing(p)} className="min-h-11 text-sky-700 underline">
                        Editar
                      </button>
                      <form action={deleteProductAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="min-h-11 text-red-700 underline">
                          Remover
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <ProductFormModal
          open={creating || editing !== null}
          product={editing}
          categoryId={categoryId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
