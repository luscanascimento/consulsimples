import { apiFetch } from "@/lib/api";
import { ErrorState } from "@/components/error-state";
import { requireSession } from "@/lib/auth";
import { CategoryList } from "./category-list";
import { ProductTable } from "./product-table";

type Category = { id: string; name: string; sortOrder: number; active: boolean };
type Product = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  priceCents: number;
  available: boolean;
  sortOrder: number;
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const user = await requireSession();
  const { categoria } = await searchParams;
  const canEdit = user.role === "OWNER" || user.role === "MANAGER";

  let categories: Category[];
  let products: Product[];
  try {
    // Paralelo: em série seriam dois RTTs para renderizar uma tela só.
    [categories, products] = await Promise.all([
      apiFetch<Category[]>("/categories"),
      apiFetch<Product[]>(`/products${categoria ? `?categoryId=${encodeURIComponent(categoria)}` : ""}`),
    ]);
  } catch {
    return <ErrorState message="Não conseguimos carregar o cardápio agora." />;
  }

  const selected = categoria ?? categories[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Cardápio</h1>
        <p className="text-sm text-slate-600">
          {canEdit ? "Organize categorias e produtos." : "Você tem acesso de leitura."}
        </p>
      </header>

      <div className="flex gap-6">
        <CategoryList categories={categories} selectedId={selected} canEdit={canEdit} />
        <div className="min-w-0 flex-1">
          <ProductTable
            products={products.filter((p) => !selected || p.categoryId === selected)}
            categoryId={selected}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
