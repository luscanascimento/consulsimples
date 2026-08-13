// Estado "carregando" das telas que buscam dado: nunca tela em branco. O texto vive num
// live region para quem usa leitor de tela — animação sozinha não anuncia nada.
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-6">
      <p role="status" aria-live="polite" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true" className="h-8 w-56 animate-pulse rounded bg-slate-200" />
      <div aria-hidden="true" className="h-64 animate-pulse rounded-lg bg-slate-100" />
    </div>
  );
}
