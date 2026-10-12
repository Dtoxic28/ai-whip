# Supported integrations

## OpenAI Responses coding employee (real implementation)

Server configuration:

```dotenv
OPENAI_API_KEY=YOUR_SERVER_SIDE_KEY
OPENAI_MODEL=YOUR_TOOL_CALLING_MODEL_ID
# Optional configured rates, USD per million observed input/output tokens:
OPENAI_INPUT_USD_PER_MILLION=
OPENAI_OUTPUT_USD_PER_MILLION=
AI_WHIP_PROJECTS_ROOT=./projects
```

Endpoint: `https://api.openai.com/v1/responses`, `store: false`. Explicit model; no stale default or fabricated pricing. Tools: `list_files`, `read_file`, `write_file`, `report_plan`. Strict schemas and an independent Zod validator; arguments never become shell commands. Function outputs return by `call_id`. Source-only writes are real, within a copied workspace. The application records plans, successful/rejected tools, reports, actual response tokens; user-approved manager checks execute independently.

A repair contains the exact failed/unverified criteria, findings, recorded argv, exits, stdout/stderr, changed paths. It is not simply "try harder." Cancellation combines the task AbortSignal with request deadlines. Network failures normalize into useful redacted diagnostics and Blocked state. No retry storm. The application never supplies OPENAI_API_KEY to execution children or browser code.

Official OpenAI documentation: https://developers.openai.com/api/docs/guides/function-calling

Live operation requires your account, key, compatible model, network access. Automated tests replace provider HTTP only: tool calls still exercise genuine file writes. Test records must not be mistaken for a live provider benchmark. Unsupported providers are not shown as working integrations.

## Training intern (explicit simulation)

The fixture adapter is deterministic, no model request. First report falsely says tests passed; real configured checks expose it. Repair changes addition source, preserves tests; real checks demonstrate the fix. UI labels this mode at creation, employee list, timeline, task summary. No sample results are inserted; actual child processes generate evidence.

## Adding an adapter

Implement the existing `AgentAdapter.run(context)` contract. Respect task context and repair feedback, emit plan/tool events, return exact report, honor `context.signal`, call `context.account` for observed usage, consult `context.remaining`, use restricted workspace helpers. Never label plain chat output as a coding workflow. Add protocol and real-tool tests before advertising integration support.
