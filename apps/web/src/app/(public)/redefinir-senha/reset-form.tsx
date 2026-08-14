"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { resetPasswordAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, INITIAL);
  const topError = state.error ?? state.fieldErrors?.token;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {topError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {topError}
        </p>
      )}
      {/* Token em campo oculto: o formulário reenvia sem depender de a query string
          sobreviver ao POST. */}
      <input type="hidden" name="token" value={token} />
      <Field
        name="password"
        label="Nova senha"
        type="password"
        required
        hint="No mínimo 12 caracteres."
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      <Button type="submit" pendingLabel="Salvando…">
        Salvar nova senha
      </Button>
    </form>
  );
}
