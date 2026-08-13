"use client";
import { useFormStatus } from "react-dom";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  pendingLabel?: string;
};

const STYLES = {
  primary: "bg-sky-700 text-white hover:bg-sky-800",
  ghost: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-red-700 text-white hover:bg-red-800",
} as const;

export function Button({ variant = "primary", pendingLabel, children, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      // Altura mínima de 44px: alvo de toque confortável no celular.
      className={`min-h-11 rounded-md px-4 text-sm font-medium disabled:opacity-60 ${STYLES[variant]}`}
      disabled={rest.disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
