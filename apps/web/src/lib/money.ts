// A API trafega centavos inteiros. Conversão acontece só aqui, na borda de apresentação.
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// O ICU separa "R$" do número com espaço não-quebrável (U+00A0). Normalizar para espaço
// comum mantém a comparação de texto previsível — em teste, em busca e no clipboard.
export const formatCents = (cents: number): string =>
  BRL.format(cents / 100).replace(/[\u00A0\u202F]/g, " ");

/** Converte o que o usuário digita em centavos inteiros. `null` quando não dá para confiar. */
export function parseCurrencyInput(value: string): number | null {
  const cleaned = value.replace(/\s|R\$/g, "").replace(/\./g, "");
  if (!/^\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const [reais, decimals = ""] = cleaned.split(",");
  return Number(reais) * 100 + Number(decimals.padEnd(2, "0"));
}
