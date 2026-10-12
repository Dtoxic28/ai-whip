export function evaluate(input: { criteria: { id: string }[] }) {
  return { verdict: "unverified", criteria: input.criteria.map(c => ({ id: c.id, status: "unverified" })), findings: [] };
}
