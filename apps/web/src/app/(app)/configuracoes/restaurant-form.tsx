"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { updateRestaurantAction, type FormState } from "./actions";

const INITIAL: FormState = {};

type Tenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  status: string;
};

export function RestaurantForm({ tenant }: { tenant: Tenant }) {
  const [state, action] = useActionState(updateRestaurantAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          Dados do restaurante salvos com sucesso.
        </p>
      )}

      <Field
        name="name"
        label="Nome do restaurante"
        required
        defaultValue={tenant.name}
        error={state.fieldErrors?.name}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="slug-display" className="text-sm font-medium text-slate-700">
          Identificador (Slug)
        </label>
        <input
          id="slug-display"
          type="text"
          value={tenant.slug}
          disabled
          aria-describedby="slug-hint"
          className="min-h-11 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
        />
        <p id="slug-hint" className="text-xs text-slate-500">
          O identificador único gerado no cadastro.
        </p>
      </div>

      <Field
        name="timezone"
        label="Fuso horário (Timezone)"
        defaultValue={tenant.timezone}
        hint="Padrão IANA, por exemplo: America/Sao_Paulo."
        required
        error={state.fieldErrors?.timezone}
      />

      <div className="pt-2">
        <Button type="submit" pendingLabel="Salvando alterações…">
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
