import { apiFetch } from "@/lib/api";
import { ErrorState } from "@/components/error-state";
import { requireSession } from "@/lib/auth";
import { RestaurantForm } from "./restaurant-form";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  status: string;
};

export default async function SettingsPage() {
  const user = await requireSession();

  if (user.role !== "OWNER" && user.role !== "MANAGER") {
    return (
      <div role="alert" className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-semibold">Sem permissão</h1>
        <p className="mt-1 text-sm text-slate-600">
          Apenas o dono e o gerente podem alterar os dados do restaurante.
        </p>
      </div>
    );
  }

  let tenant: Tenant;
  try {
    tenant = await apiFetch<Tenant>("/tenant");
  } catch {
    return <ErrorState message="Não conseguimos carregar os dados do restaurante agora." />;
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Configurações do Restaurante</h1>
        <p className="text-sm text-slate-600">
          Gerencie o nome do estabelecimento e preferências operacionais.
        </p>
      </header>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <RestaurantForm tenant={tenant} />
      </div>
    </div>
  );
}
