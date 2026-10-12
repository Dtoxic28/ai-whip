import { expect, it } from "vitest";
import { comparableRuns } from "../src/lib/comparison";
import type { PublicTask } from "../src/lib/domain";
const task = (id: string, key: string, agent = "openai") => ({ id, comparisonKey: key, agent, model: "configured-model", attempts: [{ evaluation: { verdict: "passed" } }] }) as PublicTask;
it("compares only equivalent real-provider tasks", () => { const result = comparableRuns([task("a", "same"), task("b", "same"), task("c", "other"), task("d", "same", "fixture")]); expect(result).toHaveLength(1); expect(result[0].map(t => t.id)).toEqual(["a", "b"]); });
it("does not invent comparison eligibility without original-source evidence", () => expect(comparableRuns([{ ...task("a", "same"), comparisonKey: null }, { ...task("b", "same"), model: null }])).toHaveLength(0));
