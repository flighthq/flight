---
package: '@flighthq/tool-capture'
updated: 2026-08-11
by: foreman
---

# tool-capture — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/tool-capture/src/` on 2026-08-08. This is the dev/CI tooling tier: it
sits outside the `@flighthq/sdk` barrel and is not tree-shakable by design (`scripts/sdk-policy.ts`),
and its inline exported types are a stated exemption from the types-home rule — neither is a gap.

- **WebGPU is exempt from the presented-frame wait.** `functionalVerify.ts:207-209` skips
  `waitForPresentedFrame` for `webgpu` only; every other backend gets a budgeted wait that fails by
  name on stall (`:318-334`). The reasoning is sound (the wgpu path copies into a retained capture
  buffer in the same frame, so waiting buys nothing and adds a dependency on a canvas the browser
  never presents), but the consequence stands: a hung WebGPU capture has no equivalent
  named-await failure, so it surfaces as the outer runner's generic timeout.
- **Regression baseline freshness is classified but never gates.** `classifyCaptureBaselineFreshness`
  runs only inside the already-failing branch (`captureValidation.ts:661`), where it appends a
  `sourceHashStatus` to the message (`:673`). A baseline stale against a changed scene therefore
  still passes if the fingerprint happens to land inside tolerance.
- **Regression tolerance is run-wide.** `regressionTolerance` is one resolved option
  (`captureValidation.ts:63`, `:817`); only parity **groups** carry a per-group override
  (`captureManifest.ts:19`). The `regressionTolerance` in `captureManifest.ts:29` is the benchmark
  tier's performance budget, not a fingerprint tolerance. This is `capture`'s outstanding
  2026-07-03 Approved item, now homed here.
- **The capture clock is not pinned.** `launchBrowser`'s init script fixes the viewport and seeds
  `Math.random` (`captureBrowser.ts:57`, `:83`) but stubs neither `performance.now` nor `Date`, so a
  time-parameterized scene is deterministic only at frame 1 and stays out of the gated set.
- **No sibling `tool-*` cells.** `tool-capture` is still the whole tooling tier; `tool-baseline`,
  `tool-fixtures`, and `tool-diff` (charter Open direction 2) have no package. `baselineStore.ts`
  remains the store, in-package.
- **`captureEntry.ts:414`'s verifier-failure throw is a collapsed-verdict oracle.** One message,
  `"render verifier did not reach a terminal state"`, covers both *registered-and-stalled* and
  *never-registered* — opposite remedies. `captureValidation.ts:421` already distinguishes them
  ("verifier registered but stalled…"); `captureEntry` doesn't use that message. Cost real time on
  `examples/scene3d/webgl`'s verifier stall (register `agents/unbacked-register.md` L31): the throw
  sent the investigation hunting a stall that wasn't happening — the true cause was the verifier never
  registering at all (a missing `captureMode` guard in that one example, fixed at `271c1a211`).
- **`src/bin.test.ts` is load-sensitive, unowned, and not known to be a defect.** Under the whole-repo
  sweep it fails as `expected 143 to be 1` — 143 is 128+15, SIGTERM, so the spawned CLI is killed rather
  than exiting 1; run alone with `--project tool-capture` it passes in ~15s. Before reading a red sweep
  as a regression here, apply the discriminator in [commands](../../commands.md).
- **Observe mode cannot diagnose a never-registered verifier.** Its diagnostics block sits downstream
  (`captureEntry.ts:536`) of the throw it exists to explain (`:414`) — the same shape as the
  logging-order defect fixed 2026-08-10 below (hash computed before screenshot/logs were written),
  found independently in the same package. A diagnostic downstream of the failure it explains only
  exists when it isn't needed. Also surfaced by L31: 3 observe-mode runs against the stalled verifier
  yielded nothing, for exactly this reason.
- **A check runs, its verdict is persisted, its measurement is not — twice now, so it is a shape.**
  `runRenderVerification` measures `coverage` and throws below `DEFAULT_MIN_COVERAGE`
  (`functionalVerify.ts:224-231`), which is what makes `ready` carry a non-blank guarantee. But
  `status.json` keeps `state` and `hash`, never the number, so the non-blank claim is an
  *implication*, not an auditable record: the floor is 0.0008, so 0.1% coverage and 90% look alike.
  Prior instance: `formatCalibrationReport` named the DISAGREED cells and only counted the agreed
  ones — fixed by naming them, after a cross-host run's population could not be recovered to say
  whether one locked cell was in it. Both times the verdict is durable and its evidence discarded.
  Treat it as a pattern: persist the measurement wherever a capture-side check produces one.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look. Detail lives in
     git and agents/unbacked-register.md, not here — see the note at the top of this file. -->

- **2026-08-11** — Decode-before-hash and `examples/scene3d/webgl`'s verifier stall both closed;
  pruned from `Open`, superseded there by the two new items. Detail: register L13, L27, L31.
- **2026-08-10** — Baseline evidence guards the join transition (sha256-only → fingerprint), not
  record completeness, in `baselineStore.ts`. Detail: register L20.
- **2026-08-10** — `captureServer.ts` fails a structurally stale dist before launching Chromium
  instead of producing per-route 404s; the prior timestamp warning is now a real gate.
- **2026-08-10** — Capture resource failures retain their URL across HTTP/transport failures
  (`captureResourceFailure.ts`); the Chromium contract for this runs only under `test:unit`, not the
  root `npm run test` — a root green says nothing about `captureEyes.e2e.test.ts`.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Charter direction 0 (self-contained
  duplicate of `@flighthq/capture`'s tolerances/comparison) landed and removed from `Open`.
- **2026-08-05** — Blank-frame class of bug closed at every layer (write path, fingerprint refusal,
  gated-run pass-on-nothing, registry misses, WebGL no-image); `observe <url>` bin landed alongside it.
