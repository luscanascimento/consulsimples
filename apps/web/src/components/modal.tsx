"use client";
import { useEffect, useId, useRef } from "react";

// <dialog> nativo com showModal(): foco preso, Esc fecha e inerte no resto da página,
// tudo sem biblioteca. Reimplementar isso à mão é onde a acessibilidade morre.
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // useId em vez de id fixo: dois modais na mesma página duplicariam o id e o
  // aria-labelledby passaria a apontar para o título do outro.
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="w-full max-w-lg rounded-lg p-0 backdrop:bg-slate-900/40"
    >
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button onClick={onClose} aria-label="Fechar" className="min-h-11 px-2 text-slate-500">
          ✕
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
