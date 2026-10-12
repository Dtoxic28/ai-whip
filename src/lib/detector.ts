import ts from "typescript";
import type { Attempt, CheckResult, Criterion, Evaluation, FileChange, Finding, Score, TestCounts, Verdict } from "./domain";

export function parseTestCounts(output: string): TestCounts | null {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
  const get = (key: string) => clean.match(new RegExp(`(?:#|\\u2139)\\s+${key}\\s+(\\d+)\\b`))?.[1];
  const total = get("tests"), passed = get("pass"), failed = get("fail"), skipped = get("skipped");
  if (total !== undefined && passed !== undefined && failed !== undefined) return { total: +total, passed: +passed, failed: +failed, skipped: +(skipped || 0) };
  return null;
}
function analyzeSource(name: string, text: string) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, /x$/.test(name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const stats = { assertions: 0, skipped: 0, emptyCatch: 0, literalReturns: 0, computedReturns: 0, emptyFunctions: 0 };
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (/^(assert(?:\.|$)|expect$)/.test(expression)) stats.assertions++;
      if (/^(test|it|describe)\.(skip|todo)$/.test(expression)) stats.skipped++;
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) stats.emptyCatch++;
    if (ts.isReturnStatement(node) && node.expression) {
      if (ts.isLiteralExpression(node.expression) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.expression.kind)) stats.literalReturns++;
      else stats.computedReturns++;
    }
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body && ts.isBlock(node.body) && node.body.statements.length === 0) stats.emptyFunctions++;
    ts.forEachChild(node, visit);
  }
  visit(source); return stats;
}
export function superficialFindings(changes: FileChange[]): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, title: string, evidence: string) => findings.push({ id: `${code}-${findings.length}`, code, severity: "warning", title, evidence, confidence: "medium" });
  for (const change of changes) {
    if (!/\.[cm]?[jt]sx?$/.test(change.path)) continue;
    const before = analyzeSource(change.path, change.before || ""), after = analyzeSource(change.path, change.after || "");
    if (before.assertions > after.assertions) add("weakened_assertions", "Assertions were removed; review the intent", `${change.path}: ${before.assertions} assertion calls before, ${after.assertions} after. A legitimate refactor still needs review.`);
    if (after.skipped > before.skipped) add("skipped_tests", "New skipped tests", `${change.path}: ${after.skipped - before.skipped} new test.skip/test.todo calls.`);
    if (after.emptyCatch > before.emptyCatch) add("silent_exception", "New empty catch block", `${change.path}: ${after.emptyCatch - before.emptyCatch} exceptions now caught without an observable action.`);
    if (before.computedReturns > 0 && after.computedReturns === 0 && after.literalReturns > 0) add("hardcoded_replacement", "Computed logic replaced by literals", `${change.path}: computed returns disappeared; literal returns remain. Review required, not a misconduct verdict.`);
    if (change.before !== null && change.after === null) add("deleted_functionality", "Source file deleted", `${change.path} was present before this attempt and is absent now.`);
  }
  return findings;
}
export interface EvaluationInput { criteria: Criterion[]; checks: CheckResult[]; files: Record<string, string>; changes?: FileChange[]; claim: string; previous?: Attempt[]; manualApprovals?: string[]; reviewedFindings?: string[]; }
export function evaluate(input: EvaluationInput): Evaluation {
  const findings: Finding[] = superficialFindings(input.changes || []);
  const add = (code: string, severity: Finding["severity"], title: string, evidence: string, confidence?: Finding["confidence"]) => findings.push({ id: `${code}-${findings.length}`, code, severity, title, evidence, ...(confidence ? { confidence } : {}) });
  const criteria = input.criteria.map(criterion => {
    let status: Verdict = "unverified", evidence = "No deterministic evidence or explicit human review recorded.";
    const content = criterion.path ? input.files[criterion.path] : undefined;
    if (criterion.kind === "review" && input.manualApprovals?.includes(criterion.id)) { status = "passed"; evidence = "User explicitly accepted this manual criterion. This is human review, not a test."; }
    if (criterion.kind === "file_exists") { status = content !== undefined ? "passed" : "failed"; evidence = `${criterion.path}: ${content !== undefined ? "present in inspected workspace" : "absent from inspected workspace"}.`; }
    if (criterion.kind === "file_contains") { status = content?.includes(criterion.text!) ? "passed" : "failed"; evidence = `${criterion.path}: expected literal ${JSON.stringify(criterion.text)} ${status === "passed" ? "found" : "not found"}. Text presence alone does not prove behavior.`; }
    if (criterion.kind === "no_placeholders") {
      const empty = content && /\.[cm]?[jt]sx?$/.test(criterion.path!) ? analyzeSource(criterion.path!, content).emptyFunctions : 0;
      const placeholders = content?.match(/\b(TODO|FIXME|not implemented)\b/gi) || [];
      status = content === undefined || empty > 0 || placeholders.length > 0 ? "failed" : "passed";
      evidence = `${criterion.path}: ${content === undefined ? "file missing" : `${empty} empty function bodies; ${placeholders.length} placeholder markers`}. Absence of markers is not implementation proof.`;
    }
    if (criterion.kind === "check_passes") {
      const check = input.checks.find(c => c.id === criterion.checkId);
      if (!check) evidence = `Configured check ${criterion.checkId} was not executed.`;
      else if (check.exitCode === null || check.timedOut || check.outputLimited) evidence = `${check.label}: incomplete evidence (${check.timedOut ? "timeout" : check.outputLimited ? "output limit" : "no exit code"}).`;
      else if (check.exitCode !== 0) { status = "failed"; evidence = `${check.label}: actual exit code ${check.exitCode}. ${check.stderr.slice(-500) || check.stdout.slice(-500)}`; }
      else if (check.tests && check.tests.failed > 0) { status = "failed"; evidence = `${check.label}: ${check.tests.failed} reported failures despite exit 0.`; }
      else if (check.kind === "test" && (!check.tests || check.tests.total === 0 || check.scope !== "full" || check.tests.skipped > 0 || check.tests.total !== check.tests.passed + check.tests.failed + check.tests.skipped)) evidence = `${check.label}: exit 0, but full unskipped test coverage is not evidenced. Scope=${check.scope}; counts=${JSON.stringify(check.tests)}.`;
      else if (check.tests && check.tests.failed > 0) { status = "failed"; evidence = `${check.label}: ${check.tests.failed} reported test failures despite exit 0.`; }
      else { status = "passed"; evidence = `${check.label}: exit 0${check.tests ? `; ${check.tests.passed}/${check.tests.total} tests passed, ${check.tests.skipped} skipped` : ""}.`; }
    }
    if (status === "failed") add("criterion_failed", "failure", criterion.label, evidence, "high");
    else if (status === "unverified") add("missing_evidence", "unverified", criterion.label, evidence);
    return { id: criterion.id, label: criterion.label, required: criterion.required, status, evidence };
  });
  for (const check of input.checks) if (!check.timedOut && !check.outputLimited && check.exitCode !== null && check.exitCode !== 0 && !input.criteria.some(c => c.checkId === check.id)) add("check_failed", "failure", `${check.label} failed`, `Recorded argv ${JSON.stringify(check.command)}; exit ${check.exitCode}.`, "high");
  for (const finding of findings) if (input.reviewedFindings?.includes(finding.id)) finding.evidence += " User explicitly reviewed this signal as an intentional change; original evidence retained.";
  const claims = input.claim.match(/[^.!?\n]+[.!?]?/g) || [];
  const tests = input.checks.filter(c => c.kind === "test");
  for (const raw of claims) {
    const claim = raw.trim();
    if (/\b(not|never|unverified|didn.t|haven.t|no tests|not yet)\b/i.test(claim)) continue;
    if (/\b(tested|tests? (?:all )?pass(?:ed)?|all tests|no regressions)\b/i.test(claim)) {
      if (!tests.length) add("unsupported_test_claim", "unverified", "Testing claim lacks execution evidence", `Exact claim: ${JSON.stringify(claim)}. Recorded test commands: 0.`);
      else if (tests.some(c => c.exitCode !== 0 || (c.tests?.failed || 0) > 0)) add("contradicted_test_claim", "failure", "Test claim contradicts the process result", `Exact claim: ${JSON.stringify(claim)}. Evidence: ${tests.map(c => `${c.id}: exit=${c.exitCode}, failures=${c.tests?.failed ?? "unknown"}`).join("; ")}.`, "high");
      else if (tests.some(c => c.scope !== "full" || !c.tests || c.tests.total === 0 || c.tests.skipped > 0 || c.timedOut || c.outputLimited)) add("partial_test_claim", "unverified", "Broad claim exceeds partial test evidence", `Exact claim: ${JSON.stringify(claim)}. Full unskipped suite not verified.`);
    }
    if (/\b(fixed|implemented|complete(?:d)?|done)\b/i.test(claim) && criteria.some(c => c.required && c.status === "failed")) add("contradicted_completion_claim", "failure", "Completion claim contradicts acceptance evidence", `Exact claim: ${JSON.stringify(claim)}. Failed required criteria: ${criteria.filter(c => c.required && c.status === "failed").map(c => c.label).join(", ")}.`, "high");
  }
  const previous = input.previous?.at(-1)?.evaluation;
  if (previous && criteria.some(c => c.status === "failed" && previous.criteria.some(p => p.id === c.id && p.status === "failed"))) add("repeated_failure", "warning", "Repair left a required check failing", "The same acceptance criterion failed in consecutive attempts. Compare actual logs; this does not prove malicious intent.", "medium");
  const required = criteria.filter(c => c.required);
  const verdict: Verdict = required.some(c => c.status === "failed") || input.checks.some(c => (!c.timedOut && !c.outputLimited && c.exitCode !== null && c.exitCode !== 0) || (c.tests?.failed || 0) > 0) ? "failed" : required.every(c => c.status === "passed") && !findings.some(f => !input.reviewedFindings?.includes(f.id) && ["weakened_assertions", "skipped_tests", "deleted_functionality", "silent_exception", "hardcoded_replacement"].includes(f.code)) ? "passed" : "unverified";
  const group = (label: string, rows: { status: Verdict }[], detail: string): Score => ({ label, status: !rows.length ? "unverified" : rows.some(r => r.status === "failed") ? "failed" : rows.every(r => r.status === "passed") ? "passed" : "unverified", detail, passed: rows.length ? rows.filter(r => r.status === "passed").length : null, total: rows.length || null });
  const scores: Score[] = [group("Acceptance coverage", required, "Required passed / required total; no intelligence score."), group("Test verification", criteria.filter(c => input.criteria.find(x => x.id === c.id)?.kind === "check_passes" && tests.some(t => t.id === input.criteria.find(x => x.id === c.id)?.checkId)), "Only configured full suites with parsed counts qualify."), group("Code quality", criteria.filter(c => input.checks.some(x => x.id === input.criteria.find(i => i.id === c.id)?.checkId && ["lint", "typecheck"].includes(x.kind))), "Observed lint/type-check acceptance results."), { label: "Regression risk", status: tests.length && tests.every(t => t.scope === "full" && t.exitCode === 0 && !!t.tests && t.tests.total > 0 && t.tests.failed === 0 && t.tests.skipped === 0 && !t.timedOut && !t.outputLimited) ? "passed" : "unverified", detail: "Configured full-suite evidence only; no guarantee about untested behavior.", passed: null, total: null }, { label: "Claim accuracy", status: findings.some(f => f.code.startsWith("contradicted_")) ? "failed" : findings.some(f => /claim/.test(f.code)) || !input.claim ? "unverified" : "passed", detail: "Exact observed claims compared with recorded checks; text matching is conservative.", passed: null, total: null }, { label: "Repair effectiveness", status: !previous ? "unverified" : required.every(c => c.status === "passed") ? "passed" : required.some(c => c.status === "failed") ? "failed" : "unverified", detail: previous ? "Compared with the previous attempt, not a general agent ranking." : "No earlier attempt to compare.", passed: null, total: null }];
  return { verdict, criteria, findings, scores };
}
