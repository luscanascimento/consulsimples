// Todo método de repository recebe Scope. O tipo é o que obriga: não existe
// caminho para consultar sem tenant sem escrever `Unscoped` no nome do método.
export type Scope = { tenantId: string };
