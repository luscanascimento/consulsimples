export default function CheckEmailPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Confirme seu email</h1>
      <p className="text-sm text-slate-600">
        Enviamos um link para o email cadastrado. Ele vale por 24 horas — abra para liberar o acesso
        ao restaurante.
      </p>
      <p className="text-sm text-slate-600">
        Não chegou? Confira a caixa de spam antes de tentar de novo.
      </p>
    </div>
  );
}
