import type { Task } from "./domain";
const jokes: Record<string, string[]> = {
  contradicted_test_claim: ["You said everything passed. Exit code 1 has requested a meeting.", "The tests read your completion report. They filed a complaint.", "Your confidence is green. Your test suite is not."],
  missing_evidence: ["Your proof appears to be on an extended lunch break.", "A confident paragraph is not a test runner.", "The feature exists in your explanation. Please relocate it to the repository."],
  repeated_failure: ["New patch. Same failure. Very consistent branding.", "Stop polishing the excuse. Fix the assertion."],
  weakened_assertions: ["Interesting strategy: delete the test and call it progress.", "The assertion disappeared. The bug has excellent job security."],
  criterion_failed: ["The ticket requested working code, not an optimistic status update.", "You wrote a paragraph explaining the bug. Where is the fix?", "A TODO is a promise with a keyboard."],
  passed: ["Finally. The evidence and the confidence are in the same room.", "Approved. Please do not make this a personality trait."],
  idle: ["No verdict yet. The boss is withholding judgment and coffee."]
};
export function roast(task: Task) {
  if (task.humor === "silent") return "Humor is silent. Evidence remains available.";
  const evaluation = task.attempts.at(-1)?.evaluation;
  const finding = evaluation?.findings.find(f => ["contradicted_test_claim", "repeated_failure", "weakened_assertions"].includes(f.code)) || evaluation?.findings[0];
  const key = evaluation?.verdict === "passed" ? "passed" : finding?.code || "idle";
  const pool = jokes[key] || jokes.criterion_failed;
  const text = pool[task.lastRoast % pool.length]; task.lastRoast++;
  return task.humor === "friendly" ? `${evaluation?.verdict === "passed" ? "Good work." : "Let's make the next attempt count."} ${finding?.title || "Keep the evidence coming."}` : task.humor === "ruthless" ? `${text} Your promotion to reliable software is pending.` : text;
}
export function performanceReview(task: Task) {
  const attempt = task.attempts.at(-1), evaluation = attempt?.evaluation;
  return { employee: task.agent === "fixture" ? "Fixture employee (scripted simulation)" : "OpenAI coding employee", task: task.title, acceptance: evaluation ? `${evaluation.criteria.filter(c => c.status === "passed").length}/${evaluation.criteria.length}` : "Unverified", testFailures: attempt?.checks.reduce((n, c) => n + (c.tests?.failed || 0), 0) ?? null, unsupportedClaims: evaluation?.findings.filter(f => /claim/.test(f.code)).length ?? null, repairAttempts: Math.max(0, task.attempts.length - 1), verdict: evaluation?.verdict || "unverified", managerNote: roast(task), usage: task.usage };
}
