"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/button";
import { logoutAction } from "./logout-action";

const LINKS = [
  { href: "/cardapio", label: "Cardápio", roles: ["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"] },
  { href: "/usuarios", label: "Usuários", roles: ["OWNER", "MANAGER"] },
] as const;

export function Nav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="flex w-56 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4">
      <ul className="flex flex-col gap-1">
        {/* Esconder o link não é autorização — a API barra de novo. Isto é só ergonomia. */}
        {LINKS.filter((l) => l.roles.includes(role as never)).map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={pathname.startsWith(l.href) ? "page" : undefined}
              className="block rounded-md px-3 py-2 text-sm aria-[current]:bg-sky-50 aria-[current]:font-medium aria-[current]:text-sky-800"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <form action={logoutAction} className="flex flex-col gap-2">
        <p className="px-3 text-xs text-slate-500">{userName}</p>
        <Button variant="ghost" type="submit">
          Sair
        </Button>
      </form>
    </nav>
  );
}
