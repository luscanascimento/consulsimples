// O tsconfig usa exactOptionalPropertyTypes e um dto parcial do zod traz a chave PRESENTE
// com valor undefined — os tipos gerados pelo Prisma recusam isso. Remover a chave é
// exatamente o que "não mandei esse campo" significa num update parcial.
// O mapped type é homomórfico: chave obrigatória continua obrigatória, opcional continua
// opcional, só o `| undefined` some.
export const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
