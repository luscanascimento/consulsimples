"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { loginAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function LoginForm() {
  const [state, action] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field name="email" label="Email" type="email" required autoComplete="email" />
      <Field name="password" label="Senha" type="password" required autoComplete="current-password" />
      <Button type="submit" pendingLabel="Entrando…">
        Entrar
      </Button>
    </form>
  );
}
