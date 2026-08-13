// `| undefined` explícito em cada opcional: com exactOptionalPropertyTypes, `error?: string`
// recusaria `state.fieldErrors?.password`, que é exatamente como o chamador passa o erro.
type Props = {
  name: string;
  label: string;
  type?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  defaultValue?: string | number | undefined;
  required?: boolean | undefined;
  autoComplete?: string | undefined;
};

export function Field({ name, label, type = "text", error, hint, defaultValue, required, autoComplete }: Props) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  // aria-describedby liga a mensagem ao campo: sem isso o leitor de tela anuncia
  // o input e nunca conta por que ele foi recusado.
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-md border border-slate-300 px-3 py-2 text-base aria-[invalid]:border-red-600"
      />
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
