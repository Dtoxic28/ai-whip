# Contributing

Keep evidence literal. Never insert invented runs, token usage, test counts, benchmarks, or pass claims. Missing evidence is Unverified. Humor targets fictional agent work, not people.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Add detector regressions for each deterministic rule; distinguish failures from advisory signals. Use the existing restricted workspace helpers, Zod schemas, approval digest, abort signal, usage accounting. Do not introduce an agent-controlled shell or credential exposure. See SECURITY.md before touching execution.

UI changes need keyboard/Escape/focus checks and desktop/mobile screenshots; cosmetic animations never assert actual execution. Equivalent benchmarks require the same task/source/criteria/scope; a few runs are not model superiority.

Do not commit `.env.local`, `.data`, downloaded credential logs, or private source. Describe actual checks and limitations in the PR template. Use small changes, no extra infrastructure without a demonstrated need.
