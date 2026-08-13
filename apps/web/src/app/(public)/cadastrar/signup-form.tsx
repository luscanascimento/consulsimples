"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { signupAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function SignupForm() {
  const [state, action] = useActionState(signupAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field
        name="restaurantName"
        label="Nome do restaurante"
        required
        error={state.fieldErrors?.restaurantName}
        autoComplete="organization"
      />
      <Field
        name="ownerName"
        label="Seu nome"
        required
        error={state.fieldErrors?.ownerName}
        autoComplete="name"
      />
      <Field
        name="email"
        label="Email"
        type="email"
        required
        error={state.fieldErrors?.email}
        autoComplete="email"
      />
      <Field
        name="password"
        label="Senha"
        type="password"
        required
        hint="No mínimo 12 caracteres."
        error={state.fieldErrors?.password}
        autoComplete="new-password"
      />
      <Button type="submit" pendingLabel="Criando…">
        Criar conta
      </Button>
    </form>
  );
}
