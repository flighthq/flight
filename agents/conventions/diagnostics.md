# Diagnostics — Greppable Failures

Read this before adding a warning, a guard, an `explain*` query, or any diagnostic string to a package — and before writing a comment that warns the caller about misuse. It encodes one design rule and its consequences: **diagnostic weight sits behind an import boundary, never behind a branch — and caller-facing warnings are runtime guards, never comments.**

The motivation is the SDK's primary user. An agent cannot glance at the screen; its only sensors are return values, logs, and pixels-via-capture. "Simple composable greppable functions" makes the *write* loop legible; this convention makes the *debug* loop legible — greppable functions get their twin, greppable failures.

## The cost model (why this is free)

The unit of tree-shaking is the **import graph**, not the branch:

1. **Comments, JSDoc, and types cost zero** — erased before a bundler sees them. Their only failure mode is rot, not weight.
2. **Unimported modules shed completely** — `"sideEffects": false` plus function-granular modules already guarantee this.
3. **A branch inside an imported function never sheds** — and neither does anything reachable from it: log calls, warn strings, error prose. If a diagnostic string is reachable from an imported function, it ships.

So diagnostics must be *separately importable*, and then they cost production nothing — enforced by the module system, not by a `__DEV__` define in someone else's build config. Flight deliberately does not use the `process.env.NODE_ENV` pattern: import-shedding is strictly more durable than define-shedding.

## The inversion rule: core runtime exposes seams, never messages

Core runtime modules never contain diagnostic strings. Diagnostics live in **sibling modules within the same package** that import core and attach through the nullable hook/runtime slots that already exist. Core's cost when guards are unused is a null check that is already there. A shipped app that never imports a guard sheds every byte of its prose by construction.

`enableEntityRuntimeGuards` (`@flighthq/entity`) is the proven module-scoped shape;
`enableGlRenderStateGuards(state)` is an existing state-scoped counterpart.

Kind-keyed render registries share one concrete seam: `enableRenderRegistrySignals(state)` allocates
the nullable `onRegistryMiss` signal used by node renderers, texture resolvers, shape-command
handlers, and effect-padding resolvers. Chokepoints emit only the numeric `RenderRegistry` identity
and missing string kind. They never format a message or choose policy. `enableRenderRegistryGuards`
subscribes from the shakeable guard tier, warns once per state/registry/kind, and
`explainRenderRegistryMisses` returns the recorded pairs as plain data.

A registry miss is a **permanent configuration error**: no handler was registered for the declared
kind, so repeating the operation cannot make it work. It emits the shared miss signal. A registered
handler returning `null` is a **transient sentinel**: the handler exists, but its resource may be
unbound, not uploaded, not rendered yet, or otherwise temporarily unavailable. It does not emit a
registry miss. Tests for every registry chokepoint must prove both halves; otherwise an adjacent
fallback can make the warning test pass for the wrong reason.

## Comments vs. guards

Classify every comment by *who it addresses*:

- **Comments that describe what the code IS** — ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability. These are the durable semantic comments the Source Style rules bless. They stay.
- **Comments that warn the CALLER about misuse** — "must call `prepare*Render` first", "do not release twice", "no-op unless `enable*` was called". **A caller-facing warning comment is a missing guard.** Move the content into the guard layer as a runtime check and delete the prose. The caller never reads the comment at the moment of the mistake; it does see the warning.

This is the constructive twin of the `no-warning-comments` lint rule: lint closes the prose escape hatch; the guard layer is where that content goes instead.

## Guard API convention

The log-backed default follows these rules. A package may instead expose an explicitly caller-composed
sink or seam-plus-formatter when that is its chosen public shape; the current core examples are recorded
below so their missing log-backed enabler is not mistaken for unfinished work.

- **`enable<Domain>Guards(...)`** — one per owning package that chooses the enabler shape, in a sibling module, idempotent, never called at module top level, no effect on `"sideEffects": false`. State-scoped where a state object exists (`enableGlRenderStateGuards(state)`); module-scoped otherwise (`enableEasingGuards()`).
- **`are<Domain>GuardsEnabled(...)`** mirror, same scoping.
- Guards attach via existing nullable hook/runtime slots — never a new branch in a core hot path.
- **Warn only — no strict/throw mode.** Throwing on misuse changes control flow between dev and prod and violates the sentinel rule. Tests that want hard failure assert on a memory log sink.
- **The log-backed shape uses two modules, not one: the seam and the wording.** A `<domain>Guards.ts` holds the slots and the `report*` functions core calls, and depends on *nothing* — no logger, no messages. `enable<Domain>Guards.ts` is the only module that imports `@flighthq/log` and the only place a sentence lives. Until a caller opts in, every `report*` is a null check and a return, which is what lets the seam sit in code that must not carry a message.
- **Several emitters behind one `enable`, not a module per case.** A domain's silent behaviours share one enable, and two cases that differ only in *what* was coerced share one emitter parameterised by subject rather than one each — `skeleton2d` reports an attachment-swap and a draw-order coercion through a single emitter, and a deform length mismatch through a second. Slots are *set* rather than accumulated, so enabling twice installs one guard.
- **Key `logOnce` per subject, not per module.** `logOnce` keys are process-wide with no reset, so a module-scoped key lets whichever subject fails *first* silence every other one for the session. This also constrains tests: two cases sharing a subject means the second is silently suppressed by the first.

### What is NOT a missing guard

A comment mentioning the caller is a **lead, not a verdict** — grepping for "caller must" finds far more
sanctioned comments than defects. Every candidate below was verified by following the call chain and found
legitimate; they are listed so a later sweep does not re-flag them. The banned class is narrow: a comment
that warns about **misuse the runtime could detect and report**. These are not that:

- **Return-value contracts.** `applyCanvasMaterial` returns true when it called `ctx.save()` and the caller
  must `ctx.restore()`. That is the meaning of the return value, and both callers honour it. A guard cannot
  improve on a boolean whose entire job is to carry the obligation.
- **Sentinel explanations.** `shapeStrokeOutline` telling the caller to fall back to the raster path when a
  style is inexpressible is the sentinel's documented meaning — the thing an `explain*` query exists to say.
- **Ownership and aliasing.** A borrowed backdrop the registry never owns, or a physics buffer that is
  rewritten every step and must not be retained. AGENTS.md sanctions these explicitly, and neither is
  cheaply observable at runtime.
- **Coordinate-space and impurity semantics.** `resolveGlTexture` leaving its result bound to `TEXTURE_2D`,
  or a reflection flipping triangle winding. These describe what the function *is*, not a mistake to catch.
- **Internal preconditions.** A non-exported helper's "callers must resolve X first" is an internal
  invariant, which the sentinel rule says not to validate — correct usage cannot reach it.

The three real examples from that sweep — `easeSteps`' degenerate `jumpNone`, `clipRegion`'s double release, and
`audioMixer`'s writes that reach no mixer — share one property none of the above have: a wrong call is
silently accepted and the damage surfaces later somewhere else. That is the test.

### Which guards exist

Per-package enablers—or an explicitly documented caller-composed seam—are the primitive, and there is
deliberately no single global switch that turns everything on. But a caller who cannot *find* the entry
point for their subsystem will ask for that global—which is exactly what a downstream consumer did—so
the enabler set is listed here rather than left to a grep:

`enableAssetGuards` · `enableAudioMixerGuards` · `enableBitmapFontGuards` ·
`enableCanvasTextureResolverGuards` · `enableClipGuards` · `enableCollisionGuards` ·
`enableColorAdjustmentGuards` · `enableDomTextureResolverGuards` · `enableEasingGuards` ·
`enableEntityRuntimeGuards` · `enableGlColorAdjustmentGuards` · `enableGlPbrExtensionGuards` ·
`enableGlRenderEffectGuards` · `enableGlRenderStateGuards` · `enableGlRenderTextureGuards` ·
`enableGlScene3DColorSpaceGuards` · `enableGlScene3DCustomShaderGuards` ·
`enableGlScene3DDeformGuards` · `enableGlScene3DForwardLightSelectionGuards` ·
`enableGlTextureResolverGuards` · `enableGlyphAtlasGuards` · `enableInteractionGuards` ·
`enableLayoutGuards` · `enableMovieClipGuards` · `enablePermissionGuards` ·
`enableRenderRegistryGuards` · `enableScene3DResourceFailureGuards` · `enableSceneRenderGuards` ·
`enableShortcutGuards` · `enableSkeleton2DGuards` · `enableSnapshotGuards` · `enableSocketGuards` ·
`enableStatechartGuards` · `enableSwfGuards` · `enableTextShaperGuards` · `enableTextureAtlasGuards` ·
`enableTrayGuards` · `enableWgpuColorAdjustmentGuards` · `enableWgpuScene3DCustomShaderGuards` ·
`enableWgpuScene3DForwardLightSelectionGuards` · `enableWgpuTextureResolverGuards`

The core-tier census has seven packages with a concrete caller-facing guard need, in three deliberately
different states. `easing` and `entity` have complete log-backed enablers. `layout` has the complete
caller-sink form `enableLayoutGuards(state, warningSink)`. `spatial` deliberately has no
`enableSpatialGuards`: it exposes `setSpatialIndexingGuard` plus `formatSpatialIndexingNotice`, leaving
their one-line composition to the caller as a package-specific choice rather than a layer restriction.
The three remaining implementation candidates are `geometry`, `math`, and `path`; that is a work list,
not authorization to build them.

For a render session, `enableFlightDiagnostics(state)` in `@flighthq/debug` is the existing convenience
that composes several of these — an assembly built *from* the primitives, which is allowed, rather than a
replacement for them. It cannot currently carry every guard: `registerDebugSubsystem` hooks are
state-less (`enableGuards?: () => void`), so state-scoped guards must still be enabled by name.

## Emission: through `@flighthq/log`

Log-backed guards emit via `@flighthq/log`, not bare `console.warn`. Caller-composed guards hand the
record or warning sink to the application; they do not grow an ad hoc console path in the core package.

- **`logOnce(key, LogLevel.Warn, data, channel)`** — one warning per key, ever; per-frame spam is impossible by construction. No hand-rolled dedup sets.
- **Channel = the owning package's short name** (`'render'`, `'entity'`, `'geometry'`). Users silence or focus per channel via `setLogChannelLevel`.
- **Structured data, not interpolated prose** — identifying values go in the data record; the message stays stable and greppable.
- **Tests assert via `createMemoryLogSink`** — every guard's test proves both that it fires on misuse and stays silent on correct use.
- **Capture integration for free** — guard warnings land in the capture tooling's `logs.jsonl`, so the artifact an agent reads after a capture explains the blank frame. This is what makes warnings an agent *sensor*, not console noise.

Log-backed guard modules import `@flighthq/log` only behind the sibling-module boundary; core runtime
modules never do, so the dependency sheds with the guards. Core enablers use the narrow exception below.
The caller-composed `layout` and `spatial` forms carry no logger dependency themselves.

### A package's first log-backed guard adds a dependency — declare it in the same commit

`enable<Domain>Guards.ts` imports `@flighthq/log`, so **the package that grows its first log-backed
guard grows a dependency on `@flighthq/log`**, without exception. That is a property of the pattern,
not of the package, which is why the step belongs here rather than in anyone's memory. Three edits, in
the commit that adds the guard:

1. `"@flighthq/log": "*"` in the package's `package.json` `dependencies`.
2. `{ "path": "../log" }` in the package's `tsconfig.json` `references`.
3. `npm install --package-lock-only` to carry it into `package-lock.json`.

Then `npm run packages:check`, which is fast and is what catches the omission.

**Why this is written down rather than left to the check.** The consequence is invisible from the file
being edited: nothing in a new `enableFooGuards.ts` looks different from any other new source file, and
the cost lands in a JSON file one directory up that the edit never touches. It recurred inside a single
session — diagnosed and fixed for two packages, then reintroduced two commits later in two more, by the
same hand — because the code edit does not imply the manifest edit in any way the editor can see. A
step that does not follow from what you are looking at belongs in the procedure for the pattern that
generates it, so `packages:check` goes back to being the net rather than the teacher.

## Message convention

Every guard message has the shape:

```
<exported function>: <invariant broken> — <the exact exported call that fixes it>
```

For example: `updateRenderProxy: kind 'Bitmap' has no registered renderer — call registerRenderer(state, BitmapKind, renderer)`.

The fix clause **names a real exported function**, because that is the caller's next action: warning → grep the name → arrive at the right module. Same property as "globally self-identifying names," pointed at failures. Keep messages short and stable; identifying values (the kind, the frame id) belong in the structured data, not the prose.

## The `explain*` family

Guards warn at the *moment* of misuse; `explain*` answers "why is my frame blank?" *after the fact*. Both shakeable, both importable independently:

- An `explain<Type>*` function is a **pure query over existing seams returning plain data** (so agents and tests can assert on it), with an optional `format*` companion for humans. It recomputes the cause on demand by re-walking the failure conditions the silent path checks, retains nothing, mutates nothing, and never throws. Example: `explainDisplayObjectRender(state, source)` — the first `explain*` in the SDK, the worked exemplar every later one copies — recomputes why a display object would render blank: whether a renderer is registered for its kind, whether it was prepared, and its effective visibility/alpha, returning a `reason` classification. (`explainRenderState(state, root)` would generalize this to the whole tree — kinds with no renderer, nodes without proxies, the prepare/draw frame-id relation, feature data present while its hook slot is null.)
- **The high-value, confusing sentinels get a shakeable explainer** — it is a targeted tool, not a blanket obligation on every sentinel. A sentinel earns an `explain*` when its silent failure genuinely confuses (a blank frame with many possible causes is the archetype); a self-evident lookup miss does not. The reason it is targeted rather than universal is maintenance cost: each `explain*` duplicates the silent path's failure conditions and must be kept in step with them, so spend that upkeep only where the confusion warrants it. Where present, the sentinel return stays the zero-cost baseline and the diagnostic twin turns silent state into words; production sheds the explainer while agents always import it.

## Import diagnostics: choosing a severity, and naming the kind to match

**Severity is a fact about the OUTPUT, not about the cause.** Decide it in this order:

1. Is a **substitute present** in the output — something standing in for the thing that failed?
   → `Recover`. Decided **first**, and regardless of what caused the failure. "Degraded but usable" is
   the *consequence*; a substitute actually written is the *criterion*.
2. Else, is a **feature absent** because we do not implement it? → `Skip`.
3. Else, is **data absent**? → `Drop`.
4. Else, is there **no output** at all? → `Reject`.

Cause — our capability versus their data — enters exactly once, at step 2/3, and only after substitution
is ruled out. Two earlier forms of this rule were refuted by the sites they were meant to classify, and
both counterexamples are worth keeping: "`Skip` when the condition tests our capability" dies on
`unity.shape-unsupported` and three siblings, which test our capability and correctly carry `Recover`
because a point is substituted for an unsupported shape; "substitution decides only *within* capability"
dies on `swf.mask-without-geometry` and `swf.shape-body-unreadable`, which test *their* data and also
correctly carry `Recover`.

**`Skip` additionally claims RECOGNITION** — you can only skip something you identified. An unparsed
remainder is by definition unidentified (we cannot tell an unimplemented section from unexpected trailing
bytes), so it can never honestly be `Skip` no matter what else is true. It is `Drop`: data unaccounted
for, cause unknown.

### The name must not contradict the severity

A kind name may describe the **cause** freely — `unresolved`, `missing`, `past-end`, `without-bounds`,
`unreadable`, `truncated`. Cause words never contradict anything, because severity is not a cause.

A kind name that describes the **outcome** must AGREE with its severity, because severity *is* the
outcome: `dropped`/`discarded` ⇒ `Drop`, `unsupported`/`ignored` ⇒ `Skip`,
`substituted`/`approximated`/`clamped`/`mapped-to` ⇒ `Recover`.

That gives a mechanical maintenance check, and it is the one to run after **any** severity change: grep
kind names for outcome words and compare each to its severity. Run against a name-word list that includes
cause words it mostly rediscovers that severity is not a cause; run against outcome words only, it finds
real contradictions and little else. Three kinds were renamed by exactly this check after a severity
audit — each had been *consistent* with its previous wrong severity and became inconsistent with its new
correct one, which is the failure mode this rule exists to catch: fixing a severity silently breaks a name.

## Import diagnostics: asset facts, not project facts

Everything above concerns **guards** — warnings about how a caller used the API. Import diagnostics
(`@flighthq/importdiagnostics` crumbs, emitted by the `*-formats` readers) are a different channel with a
different audience, and they have their own failure mode: they are not shakeable. A crumb is emitted by
the parser itself into a caller-supplied collector, so its prose ships whenever the parser does. What
saves it is that the collector is optional — an unopted parse allocates nothing — not that the string
sheds.

That makes *what* a crumb says the whole cost control, and the line is:

> **A crumb reports what happened to THIS FILE'S data. A gap in our coverage of the format is a project
> fact, and belongs in a document, not in every consumer's diagnostic stream.**

The test is mechanical: **would a correct, idiomatic file produced by that format's own authoring tool
trigger this crumb?** If yes, the crumb is not describing the asset — it is announcing that we have not
finished, once per import, forever. That is noise the consumer cannot act on, and it makes the crumbs
that *are* actionable harder to see.

The archetype is AWD material properties 5/6/8/11/13/21/22, which the parser walks past by length. Key 8
is on all 35 `sponza.awd` materials. A per-property "unhandled" tally would fire on essentially every AWD
file ever imported. It is recorded in [scene3d format coverage](../scene3d-format-coverage.md) instead.

A crumb still earns its place when the drop is **contingent on what the author actually did** and the
consumer has a next action:

- `3ds.light-inner-range-dropped` — the file stated an attenuation start; Flight carries one cutoff. Fires
  only for lights that state it, and tells the author which authored value did not survive.
- `mtl.emissive-dropped` — actionable in the strong sense: stating any metallic-roughness directive moves
  the material to the PBR branch, where the emissive is kept.
- `mtl.metallic-roughness-map-unpacked` — a structural mismatch with a real fix (repack the two grayscale
  images into one glTF-style texture), not an unbuilt feature.

Two consequences worth stating, because they are easy to get backwards:

- **"Unhandled block/chunk/property" tallies are the suspicious shape.** One can be right — `awd2.block-unhandled`
  fires only for block types a given file actually carries, and "your file has content we did not import"
  is genuinely actionable at the whole-block level. But the same construction one level down, over a
  property list every file populates, is pure noise. Apply the test, not the precedent.
- **A parse that reads a field and deliberately does not bind it** is on the line. Prefer the coverage doc
  when the reason is "the path is not wired yet", and a crumb when the reason is a property of the input.

## Thrown errors

Throws stay reserved for programmer error, so they are rare and cheap — keep messages short, stable, and greppable (the invariant's name: `addNodeChild: child already has a parent`), never interpolated paragraphs in hot paths. The *explanation* of an error belongs in the guard layer and docs, both shakeable.

## Harness defaults and CI proofs

- **The authoring loop is always guarded.** The functional harness, examples, and scaffolds call
  `enableFlightDiagnostics(state)`, which installs the console sink and enables the shared render
  guards for that state while driving every registered debug subsystem. Production code omits that
  import and call. The release-size harness mechanically stubs the examples' authoring call so its
  ordinary baselines continue to measure the zero-diagnostics import graph.
- **Three gates keep the promises true:** a paired release-stub/flight-diagnostics size fixture
  reports the diagnostics gzip delta; a log fixture measures emit plus `createConsoleLogSink`; and
  each guard's fire/silent test pair uses a memory sink, enforced by `exports:check` like any other
  export.

## Core-tier packages and the guard exception

A guard module in a **core-tier** package may import `@flighthq/log`, even though the dependency-layer rule
otherwise forbids core → feature. This is a deliberate, narrow exception [chief ruling 2026-07-31;
ratified 2026-08-07 after the neighbor-package ruling was retracted], and the reasoning matters more
than the permission, because it is what stops the exception from being generalized.

**Why the two rules coexist rather than conflict.** The layer rule protects two things: core's runtime bundle
weight, and its dependency-free portability. A guard module threatens neither, because it is *shakeable* — it
is separately importable, the package is `sideEffects: false`, and it is never referenced from a runtime path.
A build that does not import the guard never pulls `@flighthq/log`; a build that does import it asked for
diagnostics and has already accepted the logger. So the exception costs exactly the thing the rule was
protecting: nothing.

**The exception is file-scoped and doubly machine-enforced, not a blanket allowance.** `packages:check`
permits the manifest dependency, then `getCoreGuardImportViolations` asserts that `@flighthq/log` is
imported *only* from `enable*Guards`-named files in that package. A second check,
`getCoreGuardRuntimeImportViolations`, forbids a core runtime file from importing its own guard module;
package barrels are the deliberate shakeable exception. The first gate keeps the logger out of runtime
files directly, and the second keeps the enabler—and therefore its logger import—out of the runtime graph.
Without both gates the manifest allowance could widen into "core may depend on log" or stop being
shakeable, which are the two failures the layer rule exists to prevent.

**What this replaces.** Before the ruling, a core package that wanted the standard log-backed shape could
not import the logger: it had to emit through a bespoke channel or expose caller wiring even when that was
not the package's chosen API. The exception removes that architectural constraint without outlawing
deliberate caller-composed designs such as `layout` and `spatial`. `@flighthq/entity` had taken the bespoke
route—a raw `console.warn` behind an `eslint-disable`—which bypassed the sink, levels, and once-per-cause
dedupe every other log-backed guard gets. It now uses the standard convention like any other package.

**Applies to core only.** Feature, backend, and application tiers already permit the dependency outright; they
need no exception and should not cite this one.

## Documentation durability (the rot side)

Weight problems are solved by the import boundaries above; rot problems are solved by making CI *execute* the docs. Prefer forms in this order: **types** (checked every compile) → **tests-as-docs** (executed every CI) → **`@example` blocks with a CI extraction+typecheck gate** (a plain `@example` rots like any comment) → **thin READMEs generated from `api:json`** → **invariant comments** (the existing Source Style rule — invariants only, no narration). Warn strings in guard modules are documentation too, and they are fine precisely because they are shakeable.
