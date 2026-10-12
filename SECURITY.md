# Security policy

## Execution is security-critical

This MVP implements **restricted local mode with explicit command approval**, not an OS sandbox. No Docker/VM manager is implemented. Approved code runs as the server's user: host files, network, native process creation, resource exhaustion, and side effects are possible. Do not run untrusted projects locally. Place the entire app and workspaces in external isolation with dedicated low-privilege accounts, no secrets, and enforced CPU/memory/process/network quotas before evaluating untrusted code. Do not expose the local-mode app publicly.

Default dev/start commands bind `127.0.0.1`. API host checks reject non-loopback requests unless explicitly configured with `AI_WHIP_ALLOW_REMOTE=true` and an at-least-32-character authentication token. That switch does not make execution sandboxed. Optional authentication uses server-only token matching, HttpOnly/SameSite=Strict cookies, constant-time digest comparison, same-origin mutation checks. Remote deployments additionally need TLS and a hardened boundary; they are not an MVP security guarantee.

## Implemented safeguards

Validated task/criteria/argv with Zod; workspace-relative paths only; secret directories excluded; source symlinks/junctions rejected; reserved Windows names and ambiguous paths rejected. No arbitrary-shell tool. Agent tools do not edit tests/manifests/locks or delete files. Original source is copied. Node check argv have a small flag allowlist; npm checks use fixed scripts, with pre/post lifecycle code included in reviewed source. Revision SHA-256 binds approval, or the user explicitly approves fixed check templates for every bounded source revision. Source mutation by an earlier check blocks later checks pending review.

Execution gets a stripped environment (no server API/auth key), workspace HOME/TEMP, 60-second check ceiling, combined output limit, process-tree kill on supported cancellation. Log redaction matches configured secrets plus common key/token patterns, after accumulation; no unredacted chunk stream reaches the UI. Server-side source history can still contain sensitive imported code. Redaction is best effort, not comprehensive secret detection; keep `.data` private. Do not put keys into task prose or source.

No automatic install, delete, publish, push, deployment. SHIP IT only records explicit reviewed acceptance. Cancellation preserves records, does not roll back existing edits/host side effects. A cancelled API request may still have provider-side usage; unknown cost is not invented.

## Report a vulnerability

Contact your deployment/repository maintainer privately. Include affected version, minimal reproducer, impact, logs without secrets. Do not open public issues containing credentials or exploits against a deployed instance. No maintainer inbox is invented for this new project.

## Known limits

Local approved scripts can escape the application-level path restrictions because Node/npm execute native code with host privileges. Filesystem checks are not race-proof kernel isolation. No hostile-process CPU/memory/network isolation. PID locks are single-process coordination, not a transactional multi-server lease. External secret scanners and production auth/session rotation are not implemented. Mocked provider tests do not prove paid API account access. Audit dependency versions and run tests before deployment.
