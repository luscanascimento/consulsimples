import { requireSession } from "@/lib/auth";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row bg-slate-50/50">
      <Nav role={user.role} userName={user.name} />
      {/* min-w-0 impede que uma tabela larga estoure o flex e crie scroll horizontal na página. */}
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
