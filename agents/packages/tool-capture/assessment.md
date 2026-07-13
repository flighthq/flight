---
package: '@flighthq/tool-capture'
updated: 2026-07-13
basedOn: ./review.md
---

# tool-capture — Assessment

Judged under `tool-*` conventions (Node/Playwright allowed, not in the sdk barrel, `crate: null`).

## Recommended

Sweep-safe, within `@flighthq/tool-capture`, no design fork:

1. **Real tests for the pure seams of the env-bound modules** — extract and test the testable logic already inside them without launching a browser: the init-script frame-halt/mulberry32 body (evaluable in a plain function), `resolveServer`'s startup-output URL scan, and `captureRenderTarget`'s status.json parse/absent handling. Leaves the existence-only tests for the genuinely browser-bound parts. — review.md gap 4.
2. **Deliver the clock pin in `launchBrowser`'s init script** — stub `performance.now`/`Date.now` to advance a fixed delta per animation frame alongside the seeded `Math.random`, exactly as specified by capture's Approved ledger item (2026-07-03 · picked, "Pin the clock in the capture harness"); its execution home is this package's source, and the item is already user-approved, so executing it here is not a new decision. — review.md gap 5.
3. **Hash raw decoded RGBA instead of PNG bytes in `captureEntry`** — the second already-approved capture-ledger item homed in this source (2026-07-03 · picked); decode the screenshot buffer before the sha256 so PNG-encoder drift stops being a failure mode, keeping the PNG artifact unchanged. Requires a re-baseline sweep, so sequence it deliberately. — review.md gap 5.
4. **Doc-comment the shipped `CaptureStatus` shape as the current contract** — align the in-source docs and the `visual-capture` skill's description with the real `{ state, capturedAt, error, hash, baselineHash, changed }` shape while the `{ rendered, blank }` question is open, so agents reading status.json today are not misled. (The shape *change* itself is the open direction.) — review.md gap 2.

## Backlog

- **Consume `@flighthq/capture` for compare/tier policy** — parked: cross-package redesign, already charter Open direction 0; capture's own assessment carries the twin item. — review.md gap 1.
- **`{ rendered, blank }` verdict fields in status.json** — parked: a contract fork (move blank detection Node-side vs re-charter to the shipped shape); review.md candidate open direction 1. — review.md gap 2.
- **Export naming pass** (`Entry`/`Tool`/`Server`/`launchBrowser` → fully-qualified) — parked: the Decision defers it and the `tool-*` naming policy question (candidate open direction 3) should be settled first; a rename sweep also touches four consuming scripts. — review.md gap 3.
- **In-package integration smoke behind an env flag** — parked: needs a call on where the integration gate lives (candidate open direction 2) and CI cost. — review.md gap 4.
- **flight-reference full-image baseline integration** — parked: charter Open direction 1; cross-repo.
- **Sibling `tool-*` cells** (`tool-baseline`, `tool-fixtures`, `tool-diff`) — parked: new-package proposals; run the bedrock test at the register, not here (charter Open direction 2).
- **CI verdict streaming / remote-inspector sink** — parked: charter Open direction 3; needs a consumer.
- **Create the cell's `status.md`** — parked: the ingest/host owns cell scaffolding; flagged as a docs-fit finding.

## Approved

_Empty — awaiting the user's verbal gate. (Items 2 and 3 under Recommended trace to capture's existing Approved ledger; re-homing that provenance formally is a user call — see capture's assessment Backlog.)_
