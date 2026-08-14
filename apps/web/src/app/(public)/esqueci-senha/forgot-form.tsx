"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { forgotPasswordAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, INITIAL);

  if (state.sent) {
    // role="status", não "alert": é confirmação, anunciada sem interromper o leitor de tela.
    // O texto é condicional ("se existir uma conta") de propósito — confirmar a existência
    // do email aqui desfaria a proteção contra enumeração que a API garante.
    return (
      <p role="status" className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
        Se existir uma conta com esse email, enviamos um link para criar uma senha nova. O link vale
        por 1 hora.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        error={state.fieldErrors?.email}
      />
      <Button type="submit" pendingLabel="Enviando…">
        Enviar link
      </Button>
    </form>
  );
}
