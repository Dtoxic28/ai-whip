# AI Whip

**Stop prompting. Start managing.** Your AI said it's done. We checked.

A local-first, open-source coding-agent manager. Retro-office humor sits on top of actual workspace inspection, approved child processes, conservative acceptance checks, and evidence-fed repair. No sample metrics are inserted into history.

## Quick start

Node.js 22.22+ and npm. Windows, macOS, Linux; Git Bash or another POSIX shell only for the optional detector rollback artifact.

```sh
npm ci
npm run dev
# Open http://127.0.0.1:3000
```

**New assignment** creates a ticket. The included **training intern** is explicitly scripted, not an AI: its first completion claim is deliberately wrong. **Start employee**, inspect the files, approve real Node checks, inspect failed criteria, click **FIX IT NOW**, approve the new revision, inspect the genuinely passing suite, **SHIP IT**, accept the final review. The three test results, process exits, source diff, findings, repair history are real. Original fixture files remain unchanged.

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

Use `PLAYWRIGHT_CHANNEL=chrome` with an installed Chrome when the matching Playwright Chromium binary is unavailable. E2E runs isolate history under a fresh `.data/e2e-*` directory. Set `AI_WHIP_TEST_PRODUCTION=true` to exercise `npm start` after a build instead of the dev server. Browser tests leave desktop/mobile screenshots in `.verification/`.

## Configure a real coding employee

Copy `.env.example` to `.env.local`; configure `OPENAI_API_KEY` and an explicitly chosen, tool-calling-compatible `OPENAI_MODEL`; restart. No credential is returned to the browser. The OpenAI Responses integration actually lists, reads, and modifies copied source files using validated function calls. It has no arbitrary-shell or test-editing tool. See [integration guide](docs/INTEGRATIONS.md).

Set `AI_WHIP_PROJECTS_ROOT` to a directory containing your source projects. Select a project by its relative subdirectory, define deterministic acceptance criteria, specify checks as argv (one argument per line), then assign the configured real employee. Projects are **copied**, never modified in place. Text-only import: at most 300 files, 100 KB per file, 2 MB total. Dependencies, build output, credential directories, `.env`, binaries, symlinks are excluded/rejected. Keep initial MVP workflows source-only, preferably Node built-in tests; imported npm scripts require dependencies already available in the copied workspace. The manager never installs them.

Optional cost caps require both explicitly configured `OPENAI_INPUT_USD_PER_MILLION` and `OPENAI_OUTPUT_USD_PER_MILLION`. Displayed cost = observed API tokens times those configured rates; **estimate, not an invoice**. Without rates, cost is unavailable. API usage is recorded per actual response. Requests that end without usable usage evidence set cost unavailable and token accounting incomplete; prior known totals remain, rather than inventing cancelled-request usage. Fixture mode invokes no model and incurs zero API usage.

## Execution boundaries

**Restricted local mode is not an OS sandbox.** Docker was not available in the implementation environment. Approved generated scripts run with the server user's privileges and may access local files/network. Never use this mode for untrusted code. Run the entire application in an externally isolated OS/container when evaluating untrusted repositories. See [SECURITY.md](SECURITY.md).

Commands never come from an agent-controlled shell. Approved `node` scripts/`--test`, `npm test`, `npm run SCRIPT` only; npm pre/post lifecycle scripts are part of approval. Users inspect source/diff and exact argv. Approval binds either an inspected SHA-256 source revision, or explicitly all future source revisions within the task's fixed, bounded command templates. Task-wide approval is an additional trust decision, not a sandbox.

Runs have iteration, wall-clock, token, optional configured-rate cost limits. One concurrent execution; at most 12 model turns per attempt, 30-second provider requests, 60-second checks, 100 KB combined process output. Cancellation aborts provider requests, kills supported process trees, retains records. CPU/memory/network isolation is not provided by local mode. Cancellation cannot undo existing file writes or external side effects from approved scripts.

## Verification model

- A missing required file or nonzero recorded exit is a **failure**.
- Never-executed checks, partial suites, unknown counts, skipped tests, truncated output, timeouts, unreviewed human criteria are **Unverified**.
- Test totals come from observed Node TAP summaries. Other runners' exit-zero checks do not prove a full test suite; choose a Node TAP-compatible reporter or an explicit human-review criterion.
- Advisory signals can be explicitly accepted with a human review note, followed by revalidation; earlier check/evaluation records remain preserved. Verified failures cannot be dismissed.
- AST signals cover removed assertion calls, new test skipping, empty catches, hardcoded return replacement. They request review, not a misconduct accusation. TODO/empty-body scans apply only to explicitly configured no-placeholder criteria; absence is not proof of behavior.
- Completion-claim matching shows exact report sentences and process/criterion evidence; it is conservative text matching, not semantic omniscience.
- Six separate statuses: acceptance coverage, test verification, quality checks, regression evidence, claim accuracy, repair effectiveness. Coverage is required-passed / required-total. No intelligence score.
- Full scope means **the user's configured suite**, not discovered universal coverage. No claim about untested behavior.

## Layout

`src/components/`: responsive office, task editor, accessible native dialogs, code-native pixel characters. `src/lib/`: orchestration, provider adapters, execution, detector, security, workspace import, atomic JSON history. API routes enforce origin and optional server-token authentication. See [architecture](docs/ARCHITECTURE.md).

Every boss control has a real action. NO MORE EXCUSES sends a read-only, budgeted next-action request to a configured real employee; fixture mode derives its next action from recorded criteria. Disabled actions name unavailable lifecycle states through the surrounding run evidence. SHIP IT records explicit human acceptance only; it never commits, pushes, publishes, deploys. Humor targets fictional agent work, never the human.

## Persistence and recovery

`.data/state.json` stores tasks, events, every attempt, reports, changed text, check logs, evaluations, usage, approvals. Atomic write/rename and single-process PID ownership avoid partial JSON writes. A crashed active run recovers as Blocked; existing evidence is retained. Files reside under `.data/workspaces/TASK_ID`. Archive `.data` only with the server stopped. `.data` may contain sensitive project source: keep it private, outside version control. JSON export supports inspection, not model rankings.

## Known MVP ceilings

One provider, one server process, local file persistence, one executing task. No autonomous dependency installation, container manager, remote workers, arbitrary-shell tools, automatic commit/deploy, AI semantic review, cross-model benchmark rankings. Equivalent real-provider runs can be grouped by exact source/task/criteria/check/budget fingerprints, with recorded model IDs; no superiority inference. Manual/supervised repairs require user actions; autonomous repairs still pause for new-revision command approval unless the user explicitly chooses task-wide approval. Long-lived jobs require a continuously running server, not serverless deployment. Human review and acceptance can inspect semantics beyond deterministic checks.

The Responses adapter is covered by mocked protocol/tool-execution tests. No live paid-provider run is claimed without configured credentials. Reproducible verification evidence, exact failure/fix outputs, detector hashes, portable copy-only rollback live in `.verification/VERIFICATION.txt`. Rollback restores the detector's initial new-project neutral implementation on **a supplied copy**, not the whole app.

MIT licensed. Font files carry their own SIL Open Font Licenses in `public/fonts/`.

Lint tooling ceiling: ESLint 9.39.5 is pinned for Next's installed React/import/accessibility plugin peer compatibility. It emits an upstream deprecation notice during install. Lint passes; upgrade the lint stack together when those plugins support ESLint 10. This is not a security guarantee.
