"use client";
import { useState, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { Button } from "@/components/button";
import { formatCents } from "@/lib/money";
import { deleteProductAction, toggleProductAvailabilityAction } from "./actions";
import { ProductFormModal } from "./product-form-modal";

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

export function ProductTable({
  products,
  categoryId,
  categories,
  canEdit,
}: {
  products: Product[];
  categoryId?: string | undefined;
  categories?: Category[] | undefined;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)),
    );
  }, [products, search]);

  if (!categoryId) {
    return <EmptyState title="Escolha ou crie uma categoria para começar." />;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Produtos {products.length > 0 && <span className="font-normal text-slate-500">({products.length})</span>}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {products.length > 3 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
              aria-label="Buscar produtos"
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
            />
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex min-h-11 items-center justify-center rounded-md bg-sky-700 px-4 text-sm font-medium text-white shadow-xs hover:bg-sky-800"
            >
              + Novo produto
            </button>
          )}
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Nenhum produto nesta categoria."
          action={
            canEdit ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="min-h-11 text-sm font-medium text-sky-700 underline"
              >
                Criar o primeiro produto
              </button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Nenhum produto encontrado para &ldquo;{search}&rdquo;.
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
            <caption className="sr-only">Produtos da categoria selecionada</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Produto
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Preço
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Situação
                </th>
                {canEdit && (
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    {p.description && (
                      <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                        {p.description}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                    {formatCents(p.priceCents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          p.available
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {p.available ? "Disponível" : "Pausado"}
                      </span>
                      {canEdit && (
                        <form action={toggleProductAvailabilityAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="available" value={String(p.available)} />
                          <button
                            type="submit"
                            title={p.available ? "Pausar vendas deste item" : "Ativar vendas deste item"}
                            className="text-xs text-slate-500 underline hover:text-slate-800"
                          >
                            {p.available ? "Pausar" : "Ativar"}
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          className="min-h-9 rounded px-2.5 py-1 text-sm font-medium text-sky-700 hover:bg-sky-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingProduct(p)}
                          className="min-h-9 rounded px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Criar / Editar Produto */}
      {canEdit && (
        <ProductFormModal
          open={creating || editing !== null}
          product={editing}
          categoryId={categoryId}
          categories={categories}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {/* Modal Confirmar Exclusão de Produto */}
      <Modal
        open={deletingProduct !== null}
        title="Remover produto"
        onClose={() => setDeletingProduct(null)}
      >
        <form
          action={async (formData) => {
            await deleteProductAction(formData);
            setDeletingProduct(null);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={deletingProduct?.id ?? ""} />
          <p className="text-sm text-slate-700">
            Tem certeza de que deseja remover o produto{" "}
            <strong className="font-semibold text-slate-900">{deletingProduct?.name}</strong>?
          </p>
          <p className="text-xs text-slate-500">
            O produto ficará indisponível e não aparecerá nas vendas.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeletingProduct(null)}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <Button variant="danger" type="submit" pendingLabel="Removendo…">
              Sim, remover
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

