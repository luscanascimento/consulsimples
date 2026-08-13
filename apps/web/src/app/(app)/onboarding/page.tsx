import { requireSession } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await requireSession();
  if (user.role !== "OWNER" && user.role !== "MANAGER") {
    return <p role="alert">Peça ao dono do restaurante para concluir a configuração.</p>;
  }
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">Configurar restaurante</h1>
      <p className="mt-1 text-sm text-slate-600">Um passo só. Dá para mudar depois.</p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
    </div>
  );
}
