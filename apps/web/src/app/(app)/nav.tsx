"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/button";
import { logoutAction } from "./logout-action";

const LINKS = [
  { href: "/cardapio", label: "Cardápio", roles: ["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"] },
  { href: "/usuarios", label: "Usuários", roles: ["OWNER", "MANAGER"] },
  { href: "/configuracoes", label: "Restaurante", roles: ["OWNER", "MANAGER"] },
] as const;

export function Nav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowedLinks = LINKS.filter((l) => l.roles.includes(role as never));

  return (
    <>
      {/* Barra superior Mobile */}
      <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <Link href="/cardapio" className="text-lg font-bold tracking-tight text-sky-800">
          consusimples
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </header>

      {/* Menu suspenso no mobile quando aberto */}
      {mobileOpen && (
        <div className="border-b border-slate-200 bg-slate-50 p-4 md:hidden">
          <ul className="flex flex-col gap-2">
            {allowedLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={pathname.startsWith(l.href) ? "page" : undefined}
                  className="block rounded-md px-3 py-2 text-base font-medium text-slate-700 aria-[current]:bg-sky-100 aria-[current]:text-sky-900"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="mb-2 px-3 text-xs text-slate-500">Logado como: {userName}</p>
            <form action={logoutAction}>
              <Button variant="ghost" type="submit">
                Sair
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Barra lateral Desktop */}
      <nav
        aria-label="Principal"
        className="hidden md:flex md:w-60 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4"
      >
        <div className="flex flex-col gap-6">
          <div className="px-3 pt-2">
            <Link href="/cardapio" className="text-lg font-bold tracking-tight text-sky-800">
              consusimples
            </Link>
          </div>

          <ul className="flex flex-col gap-1">
            {allowedLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={pathname.startsWith(l.href) ? "page" : undefined}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 aria-[current]:bg-sky-50 aria-[current]:text-sky-800"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <form action={logoutAction} className="flex flex-col gap-2">
            <p className="truncate px-3 text-xs text-slate-500" title={userName}>
              {userName}
            </p>
            <Button variant="ghost" type="submit">
              Sair
            </Button>
          </form>
        </div>
      </nav>
    </>
  );
}

