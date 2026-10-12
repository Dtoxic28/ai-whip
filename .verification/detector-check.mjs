import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { evaluate } = await import(pathToFileURL(resolve(process.argv[2])).href);
const input = JSON.parse(readFileSync(new URL("./detector-input.json", import.meta.url), "utf8"));
const result = evaluate(input);
console.log(JSON.stringify({ verdict: result.verdict, criteria: result.criteria.map(c => ({ id: c.id, status: c.status })), findings: result.findings.map(f => f.code) }));
