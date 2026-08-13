import { formatCents, parseCurrencyInput } from "./money";

describe("formatCents", () => {
  it("formats cents as brazilian currency", () => {
    expect(formatCents(2350)).toBe("R$ 23,50");
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(formatCents(100_000)).toBe("R$ 1.000,00");
  });
});

describe("parseCurrencyInput", () => {
  it("accepts what a brazilian user actually types", () => {
    expect(parseCurrencyInput("23,50")).toBe(2350);
    expect(parseCurrencyInput("R$ 23,50")).toBe(2350);
    expect(parseCurrencyInput("1.000,00")).toBe(100_000);
    expect(parseCurrencyInput("23")).toBe(2300);
    expect(parseCurrencyInput("23,5")).toBe(2350);
  });

  it("rejects garbage instead of guessing", () => {
    expect(parseCurrencyInput("")).toBeNull();
    expect(parseCurrencyInput("abc")).toBeNull();
    expect(parseCurrencyInput("-5,00")).toBeNull();
    expect(parseCurrencyInput("23,555")).toBeNull(); // mais de dois decimais não é centavo
  });

  it("round-trips with formatCents", () => {
    expect(formatCents(parseCurrencyInput("R$ 1.234,56")!)).toBe("R$ 1.234,56");
  });
});
