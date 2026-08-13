// Estado vazio traz ação. "Nenhum registro encontrado" sozinho não ajuda ninguém.
export function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 p-10 text-center">
      <p className="text-sm text-slate-600">{title}</p>
      {action}
    </div>
  );
}
