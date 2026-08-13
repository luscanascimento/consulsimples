"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { completeOnboardingAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function OnboardingForm() {
  const [state, action] = useActionState(completeOnboardingAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field name="name" label="Nome do restaurante" required error={state.fieldErrors?.name} />
      <Field
        name="timezone"
        label="Fuso horário"
        defaultValue="America/Sao_Paulo"
        hint="Nome IANA, por exemplo America/Sao_Paulo."
        required
        error={state.fieldErrors?.timezone}
      />
      <Button type="submit" pendingLabel="Salvando…">
        Salvar
      </Button>
    </form>
  );
}
