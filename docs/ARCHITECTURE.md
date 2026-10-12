# Architecture

## One working vertical slice

Browser task editor -> authenticated same-origin API -> isolated source copy -> persisted task -> Responses restricted tools (or labeled scripted fixture) -> revision-bound approval -> real Node process -> deterministic evaluation -> concrete feedback -> bounded source repair -> repeat validation -> explicit final acceptance.

## Responsibilities

- `domain.ts`: Zod trust-boundary schemas and typed evidence records.
- `workspace.ts`, `security.ts`: validated relative paths, symlink rejection, credential-path exclusion, source import, SHA-256 revision manifests, protected test/manifests, redaction.
- `store.ts`: serialized, atomic JSON writes, one-process lock, interrupted-state recovery.
- `agents.ts`: provider-neutral adapter contract: task/context/feedback, plan and tool events, real restricted writes, final reports, abort signal, actual usage. OpenAI Responses uses strict function schemas; no chat pretending to edit code.
- `executor.ts`: reviewed fixed argv, no shell for direct Node, sanitized environment, output/time limits, process-tree cancellation, literal stdout/stderr/exit evidence. Local mode is not OS isolation.
- `detector.ts`: independent deterministic engine. Required file/text checks; executed check outcomes; human-reviewed criteria; conservative claims, explicit human advisory review with preserved prior validations; TypeScript AST repair heuristics; six transparent scorecards. Advisory signals cannot prove intent.
- `orchestrator.ts`: explicit transition map, one executing job, budgets, revision invalidation, approved validation, iteration-preserving repair feedback, boss actions.
- API routes: local host policy, Origin checks, optional HttpOnly/SameSite token cookie or bearer token; secrets never returned.
- UI: event-driven run states, clearly cosmetic pixel art, honest empty state, actual records in all metrics. Native dialogs implement focus trapping and Escape.

## State machine

queued -> planning -> executing -> validating -> reviewing -> completed.

An unapproved revision pauses at awaiting_check_approval. Failed/unverified criteria lead through diagnosing to awaiting_repair_approval, or repairing only with explicit autonomous mode. A repair runs a new attempt, rechecks approval, validates, compares with the previous attempt. Terminal: completed, failed, cancelled, blocked, budget_exceeded. SHIP IT records an acceptedAt timestamp separately; no external repository mutation.

## Evidence and metrics

Each attempt retains report, before/after text, inspected revision, actual command/exit/output/duration, parsed test counts, criteria, findings, scorecards. Events have real timestamps, IDs, attempt numbers. Acceptance ratio = required passed / total required. Missing evidence never becomes a pass. AI-assisted semantic review and weighted composite scores are intentionally absent. Only records with equivalent source/input/criteria and same suite scope could be compared; the UI groups equivalent real-provider runs by an exact imported-source/task/criteria/check/budget/runtime digest, preserves configured model IDs, excludes scripted fixtures, never invents rankings.

## Deployment ceiling

Local, persistent Node server only. One process per data directory. Moving to multiple processes requires transactional storage, durable job ownership/leases, restart-safe cancellation, external sandbox workers. JSON files and an in-memory AbortController are not a distributed queue. Process/output/time limits are not CPU/memory/network limits. No OS-sandbox guarantees are claimed.
