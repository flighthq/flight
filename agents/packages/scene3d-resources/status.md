# scene-resources — Status

Continuity log for `@flighthq/scene3d-resources`. See [charter](charter.md).

## 2026-07-30 -- the full-suite setup flake: diagnosed, reproduced deterministically, fixed (builder)

Chief-raised: three independent agents had seen a varying subset of the loader tests fail at setup under a full-repo run, always with zero test failures, always passing in isolation.

**Mechanism.** A `beforeAll` hook exceeding the 10s default budget. Confirmed by forcing it -- `--hookTimeout=1` produces the exact reported signature: `FAIL <file> [ <file> ]`, zero test failures, tests skipped, error pointing at `beforeAll`. Then bisected the real cost on an *idle* machine: the hook passes at 4000ms and fails at 2000ms, so it needs 2-4s per file. Against a 10s budget that is ~3x headroom, and sixteen workers competing for CPU spends it -- which is exactly why the failing subset differed every run and why isolation always passed.

**Why the hook is expensive.** Each file calls `vi.resetModules()` and then dynamically imports the subject, rebuilding its whole transitive graph. For these loaders that graph is wide (`@flighthq/net`, `@flighthq/scene3d-formats`, the scene-document layer).

**A wrong turn worth recording.** I first converted the six files to hoisted `vi.mock` + static import, which removes the hook entirely -- the package then passed at `--hookTimeout=1` and it looked like a clean win. It was not. Repeated full-suite runs then failed *differently*: real test failures, `TypeError: Cannot read properties of undefined (reading 'ok')`, because `sendNetRequest` was bound to another file's mock. The root `vitest.config.ts` says so outright: the suite runs `isolate: false` for a ~15x speedup, and under a shared module registry the per-file `doMock` + dynamic import is what keeps each file hermetic -- "never top-level hoisted vi.mock, which leaks across files". The expensive hook is load-bearing. All eight conversions reverted.

**Fix.** `hookTimeout: 60_000` in the root config. The lever is the budget, not the hook: the reset-and-re-import buys the shared-registry speedup, so trimming it would trade a 15x suite win for a few seconds of setup.

**Repro loop** -- the deliverable chief asked for. `--hookTimeout` converts a load-dependent flake into a deterministic one:

    npx vitest run --config vitest.config.ts --hookTimeout=2000 packages/scene3d-resources/src/

That reproduces the exact reported signature every time (5 loader files, file-level FAIL, zero test failures). Raise the number to measure current headroom; the suite default is now 60s.

**Verification.** Before: 2 failures across 3 full-suite runs. After: 5 consecutive clean runs, 1235 files / 13442 tests, `npm run check` clean.

**Two latent files found while here**, not previously observed failing but the same class: `imageResourceFetch.test.ts` and `resolveScene3DResources.test.ts` carry the same reset-and-re-import hook and also fail under a forced low budget. The suite-wide budget covers them.

**The wrong-specifier defect, fixed separately in `d47635999` -- and my first description of it was overstated.** Every one of these files paired `vi.doMock('@flighthq/net/contract', ...)` with `vi.doUnmock('@flighthq/net')`. Different specifiers, so the unmock named a module that was never mocked and did nothing. Now corrected in all eight.

I claimed this was a latent trap that `vi.resetModules()` was masking, and that deleting the reset would expose cross-file leakage. **That claim does not hold, and I tested it rather than leaving it asserted.** Stripping the `afterAll` reset and running with the *wrong* specifier still passes the whole 1235-file suite; so does stripping it with the corrected specifier. The `afterAll` pair is belt-and-braces either way.

What actually provides hermeticity is the *`beforeAll`* half: `vi.resetModules()` followed by a per-file `vi.doMock` and a dynamic import, so the subject is re-instantiated against this file's mocks. That is the part the root config's "never top-level hoisted vi.mock" rule protects, and it is exactly what broke when I tried hoisting -- the failure was immediate and repo-wide, not subtle. The `afterAll` cleanup is defensive tidiness on top.

So the fix is worth having -- a `doUnmock` naming a module nothing ever mocked is dead code that reads as protection -- but it is not load-bearing, and the honest verdict is that nothing was at risk.

## 2026-07-29 — explicit synchronous resolve and progressive update

Split the previously overloaded `resolveScene3DResources` policy atom. Resolve now synchronously returns
the selected reference groups, subscriber textures, and their resolved/unresolved partition without
starting work. `updateScene3DResourceStreaming` preserves the full chartered visibility/priority engine,
resolver-scoped in-flight retention, cancel-on-drop, subscriber fan-out, retry/re-entry, priority, and
stale-settle behavior under an explicit update-pass name. `loadScene3DResources` remains the eager
Promise/progress operation. `retryFailedScene3DResources` advances streaming explicitly.

## 2026-07-22 — explicit document and resource load boundaries

Replaced ambiguous format-only URL names with `loadScene3DDocumentFrom*Url` returning
`Scene3DDocument | null`; removed in-hand parse+implicit-built-in-resolver `loadSceneFrom*` wrappers and
renamed eager resource realization to `loadScene3DResources`. URL acquisition supports abort and
source-identified byte progress. glTF closes required external `.bin` geometry and every format carries
the model base path onto relative image refs. `loadScene3DResources` reports operation-scoped unique-ref
progress. No loader imports or populates backend renderer/GPU state. Package tests cover URL source type,
null failures, malformed JSON, external-buffer closure/base path, cancellation/progress, and eager resource
completion/progress.

## 2026-07-17 — DELIVERED v1 Phases 1–3 (builder, parcel builder-2afc1234) — reviewed & approved

Built on the integrated color+shading HEAD; `npm run check` green (130 pkgs), 43 tests. Types
(`SceneResourceRef` closed union + `ResourceResolutionState` closed const-union + additive
`Texture.resource?`), AWD emits refs (drops decode + `@flighthq/image` dep), and the package
(resolver + `resolveScene3DResources` policy engine w/ cancel-on-drop + stale-settle guard +
`enableSceneResourceSignals` + eager `loadSceneFromAwd` + open `SceneMaterialTextureRegistry`).
Reviewer verified the cancellation semantics (identity guard, abort-vs-fail, revert-on-drop) correct.

Delivered decisions (see charter › Decisions 2026-07-17): **assets deferred** to the streaming phase
(id-centric vs embedded byte-refs); **glTF texture import deferred** (net-new modeling, STOP-AND-ASK);
**reveal hook = the missing "3D node opacity" primitive**, split out and built separately (coordinate
its shader changes with skinning). Not verified: browser visual capture (needs host run).

## State (superseded — original plan below is historical)

Original (2026-07-17):

Chartered in a direction session with the user, out of the AWD-texture design call (#1): the
deferred-fill builder shipped for AWD is the right tactic but the wrong thing to repeat per parser —
**all six scene-formats** (glTF, AWD, OBJ/MTL, 3DS, MD2, MD5) reference embedded or external
textures/materials that need async load. The user chose the **mature architecture**: parse stays
synchronous and emits plain-data resource references; a separate, policy-driven, cancelable async pass
resolves them; and an **opt-in availability signal lets the caller transition an object in** (fade from
placeholder instead of popping) rather than the resolver animating.

### Blessed decisions (see charter › Decisions)

- **Option B:** a scene-domain neighbor package **composing** `@flighthq/assets` (+ `loader`,
  `image-codec`, `image`, `signals`, `tween`, `easing`) — NOT resolution folded into `assets`.
- Sync parse / separate async resolve; parsers emit `SceneResourceRef` (embedded byte-handle | external
  uri) in `@flighthq/types`; AWD's deferred-fill retro-fits onto the shared path.
- Resolver reports availability via an opt-in signal; transitions composed from `tween`/`easing` +
  an optional `reveal: 'pop' | { fadeMs, easing }` policy. Resolver never animates.
- Mature v1 (full seam + visibility/priority policy + availability/transition); mip/low-res→full
  progressive cross-fade is phase 2.

### v1 deliverables (from the charter)

1. `SceneResourceRef` descriptor + per-ref state in `@flighthq/types`; scene-formats parsers emit it
   (AWD first, then glTF texture route).
2. Resolver: `SceneResourceRef` → `ImageResource`/`Texture` via `image-codec` + a swappable fetch,
   over `loader` + `assets`.
3. `resolveScene3DResources(scene, resolver, policy)` — visibility/priority policy engine + cancellation.
4. `enableSceneResourceSignals` availability seam + reveal-policy convenience.
5. Eager `loadSceneFrom*` wrapper (parse + resolve-all) — the convenience + deterministic capture mode.
6. Companion (cross-package): a reveal/opacity input on `materials` + `scene-gl`/`scene-wgpu`.

### Sequencing / dependencies

- Highest-value proving consumer: **glTF** external `.bin` + images; **AWD** is the embedded-path proof.
- The one hard cross-package dependency is the renderer reveal-factor hook (open direction #2) — build
  with v1.
- Touches `@flighthq/types` and `scene-formats` — coordinate with the in-flight shading (types) and
  color (materials/scene-gl) tracks at merge time.

## No code exists yet. Types (`SceneResourceRef`) + the parser emit-side land first; resolver + policy + signals follow.
