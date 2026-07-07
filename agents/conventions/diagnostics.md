# Diagnostics — Greppable Failures

Read this before adding a warning, a guard, an `explain*` query, or any diagnostic string to a package — and before writing a comment that warns the caller about misuse. It encodes one design rule and its consequences: **diagnostic weight sits behind an import boundary, never behind a branch — and caller-facing warnings are runtime guards, never comments.**

The motivation is the SDK's primary user. An agent cannot glance at the screen; its only sensors are return values, logs, and pixels-via-capture. "Simple composable greppable functions" makes the *write* loop legible; this convention makes the *debug* loop legible — greppable functions get their twin, greppable failures.

## The cost model (why this is free)

The unit of tree-shaking is the **import graph**, not the branch:

1. **Comments, JSDoc, and types cost zero** — erased before a bundler sees them. Their only failure mode is rot, not weight.
2. **Unimported modules shed completely** — `"sideEffects": false` plus function-granular modules already guarantee this.
3. **A branch inside an imported function never sheds** — and neither does anything reachable from it: log calls, warn strings, error prose. If a diagnostic string is reachable from an imported function, it ships.

So diagnostics must be *separately importable*, and then they cost production nothing — enforced by the module system, not by a `__DEV__` define in someone else's build config. Flight deliberately does not use the `process.env.NODE_ENV` pattern: import-shedding is strictly more durable than define-shedding.

## The inversion rule: core exposes seams, never messages

Core modules never contain diagnostic strings. Diagnostics live in **sibling modules within the same package** that import core and attach through the nullable hook/runtime slots that already exist. Core's cost when guards are unused is a null check that is already there. A shipped app that never imports a guard sheds every byte of its prose by construction.

`enableEntityRuntimeGuards` (`@flighthq/entity`) is the proven shape; `enableRenderGuards(state)` / `explainRenderState(state, root)` generalize it.

## Comments vs. guards

Classify every comment by *who it addresses*:

- **Comments that describe what the code IS** — ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability. These are the durable semantic comments the Source Style rules bless. They stay.
- **Comments that warn the CALLER about misuse** — "must call `prepare*Render` first", "do not release twice", "no-op unless `enable*` was called". **A caller-facing warning comment is a missing guard.** Move the content into the guard layer as a runtime check and delete the prose. The caller never reads the comment at the moment of the mistake; it does see the warning.

This is the constructive twin of the `no-warning-comments` lint rule: lint closes the prose escape hatch; the guard layer is where that content goes instead.

## Guard API convention

- **`enable<Domain>Guards(...)`** — one per owning package, in a sibling module, idempotent, never called at module top level, no effect on `"sideEffects": false`. State-scoped where a state object exists (`enableRenderGuards(state)`); module-scoped otherwise (`enableGeometryPoolGuards()`).
- **`are<Domain>GuardsEnabled(...)`** mirror, same scoping.
- Guards attach via existing nullable hook/runtime slots — never a new branch in a core hot path.
- **Warn only — no strict/throw mode.** Throwing on misuse changes control flow between dev and prod and violates the sentinel rule. Tests that want hard failure assert on a memory log sink.

## Emission: through `@flighthq/log`

Guards emit via `@flighthq/log`, not bare `console.warn`:

- **`logOnce(key, LogLevel.Warn, data, channel)`** — one warning per key, ever; per-frame spam is impossible by construction. No hand-rolled dedup sets.
- **Channel = the owning package's short name** (`'render'`, `'entity'`, `'geometry'`). Users silence or focus per channel via `setLogChannelLevel`.
- **Structured data, not interpolated prose** — identifying values go in the data record; the message stays stable and greppable.
- **Tests assert via `createMemoryLogSink`** — every guard's test proves both that it fires on misuse and stays silent on correct use.
- **Capture integration for free** — guard warnings land in the capture tooling's `logs.jsonl`, so the artifact an agent reads after a capture explains the blank frame. This is what makes warnings an agent *sensor*, not console noise.

Only guard/explain sibling modules import `@flighthq/log`; core never does, so the dependency sheds with the guards.

## Message convention

Every guard message has the shape:

```
<exported function>: <invariant broken> — <the exact exported call that fixes it>
```

For example: `updateRenderProxy: kind 'Bitmap' has no registered renderer — call registerRenderer(state, BitmapKind, renderer)`.

The fix clause **names a real exported function**, because that is the caller's next action: warning → grep the name → arrive at the right module. Same property as "globally self-identifying names," pointed at failures. Keep messages short and stable; identifying values (the kind, the frame id) belong in the structured data, not the prose.

## The `explain*` family

Guards warn at the *moment* of misuse; `explain*` answers "why is my frame blank?" *after the fact*. Both shakeable, both importable independently:

- An `explain<Type>*` function is a **pure query over existing seams returning plain data** (so agents and tests can assert on it), with an optional `format*` companion for humans. Example: `explainRenderState(state, root)` reports kinds with no registered renderer, nodes without proxies, the prepare/draw frame-id relation, and feature data present while its hook slot is null.
- **Every silent sentinel gets a loud, shakeable explainer.** Sentinel returns stay the zero-cost baseline; the diagnostic twin turns silent state into words. Production sheds the explainer; agents always import it.

## Thrown errors

Throws stay reserved for programmer error, so they are rare and cheap — keep messages short, stable, and greppable (the invariant's name: `addNodeChild: child already has a parent`), never interpolated paragraphs in hot paths. The *explanation* of an error belongs in the guard layer and docs, both shakeable.

## Harness defaults and CI proofs

- **The authoring loop is always guarded.** The functional harness, examples, and scaffolds call the `enable*Guards` set and attach a memory sink; golden-path docs include the calls with the note *"remove for production, or leave it: it sheds when unimported."* Agents iterate with guards on; a shipped bundle that omits the import pays zero.
- **Two gates keep the promises true:** one `size` example importing only core render paths whose baseline must not move as guard modules grow; and each guard's fire/silent test pair via memory sink, enforced by `exports:check` like any other export.

## Documentation durability (the rot side)

Weight problems are solved by the import boundaries above; rot problems are solved by making CI *execute* the docs. Prefer forms in this order: **types** (checked every compile) → **tests-as-docs** (executed every CI) → **`@example` blocks with a CI extraction+typecheck gate** (a plain `@example` rots like any comment) → **thin READMEs generated from `api:json`** → **invariant comments** (the existing Source Style rule — invariants only, no narration). Warn strings in guard modules are documentation too, and they are fine precisely because they are shakeable.
