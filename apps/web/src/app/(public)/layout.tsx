// Layout das telas públicas: usável a partir de 360px de largura, porque o garçom
// entra pelo celular. `min-h-dvh` respeita a barra do navegador móvel.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      {children}
    </main>
  );
}
