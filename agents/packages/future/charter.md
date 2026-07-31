---
package: '@flighthq/future'
crate: flighthq-future
draft: true
lastDirection: null
status: unblessed — design draft pending user ratification
---

# @flighthq/future — charter (DRAFT)

> **This is an unblessed design draft.** It records the direction agreed in conversation
> and flags the decisions still open. Nothing here is authoritative until the user blesses it.

## What it is

`@flighthq/future` is the SDK's **portable async contract**. It disambiguates *what Flight's
async API promises* (the contract) from *how a runtime fulfills it* (the JS `Promise`
implementation). Every asynchronous boundary in the SDK — resource loading, network, image
decode, platform host calls — returns a Flight `Future<T>`, never a raw `Promise<T>`.

Promise is the single most JS-specific type in the public surface. A mechanical TS→Haxe/native
port has no canonical target for it, and `async`/`await` is sugar whose continuation machinery
does not translate cleanly. Naming the contract as a Flight type behind a seam gives every port
one thing to map, and keeps the JS-ism where it belongs — behind the seam, in a leaf the port
replaces wholesale.

## North star

- Every async boundary returns `Future<T>`; the JS `Promise` lives only in the web `FutureBackend`.
- Portable code (everything above the backend seam) **never uses `async`/`await`** — async
  composition is explicit via combinators, mechanically portable as ordinary function calls.
- The contract unifies the three things that co-occur at the I/O boundary: **eventual value**,
  **progress**, and **failure-with-reason** — into one type.

## The types

- **`Future<T>`** — the *read* side. Thenable (so TS consumers keep `await` ergonomics), carries
  a completion channel and a **progress** observation channel. Resolves to **`T | null`** — `null`
  is the expected-failure sentinel, matching Flight's synchronous return rule. **No reject
  channel**; the *reason* a load failed rides an `ImportDiagnostic` crumb (see the diagnostics
  charter), keeping the never-throw discipline end to end.
- **`Deferred<T>`** *(name open — see Decisions)* — the *write*/producer side, mirroring the
  Lime `Future`+`Promise` split. Drives the future: `reportProgress(fraction, detail?)` then
  `complete(value | null)`. Named `Deferred` rather than `Promise` to avoid shadowing the global
  `Promise` in TS.
- **Progress** — normalized `0..1` plus an optional typed detail. The loader's currently-separate
  progress signals (`loadAssetGroup`, `loadScene3DResources`) **fold into** the Future's progress
  channel — one object instead of "Promise + separate progress signal."

## Surface

- **Combinators:** `allFutures`, `raceFutures`, `mapFuture`, `chainFuture`, plus async-iteration
  helpers `sequenceFutures` / `reduceFutures` so authors never hand-roll recursion for the loop
  cases the await-ban would otherwise make painful.
- **Cancellation:** a portable `CancelToken` / `CancelSource` pair — wraps `AbortSignal` on web,
  checked by loaders and passed to capable host APIs on native. Shared by Future, loader, and net
  (this is the same cancellation the port-readiness roadmap lists under #2).
- **Seam:** `FutureBackend` — the web backend is `Promise`-backed and thenable; native/Haxe hosts
  supply their own primitive (tink `Future`, Lime, etc.). Same pattern as `net`/`LoopBackend`.

## The await-ban policy — CONTINGENT, not default

The `await`-ban is the **highest-friction** part of this charter (linear `async`/`await` becomes
`chainFuture`/`mapFuture` combinator style in orchestration code) and it is **separable** from the
type. So it is **not** adopted by default. See the friction budget in `agents/port-readiness.md`.

Gate: **commission the ban only if the downstream converter cannot map `await`→`flatMap`** (a
standard CPS transform). Confirm with the converter team first.

**Status (2026-07): the flight-hx converter is now unwrapping `await` on its own** — developing,
looking like it works. If confirmed, the ban is **not adopted**: the TS keeps idiomatic linear
`async`/`await` and this charter reduces to the `Future` type + seam, with no orchestration
rewrite anywhere in the SDK. This is a live confirmation of the port-readiness "bend the converter,
not the SDK" principle — the highest-friction item resolved converter-side, not by degrading the TS.

- **If the converter handles `await`:** skip the ban entirely. The `Future` *type* alone gives the
  port a named async contract to map; the TS keeps idiomatic linear `async`/`await`. This removes
  nearly all the charter's friction and is the preferred outcome.
- **If it cannot:** apply the ban only in the **narrowest orchestration hotspots**, not SDK-wide,
  and allow `await` in the web-backend leaves (`host-*` / web backend — JS-only, port-replaced, so
  their `await` never reaches the converter). Enforce with a scoped lint rule, and ship the
  `sequenceFutures`/`reduceFutures` iteration helpers so authors never hand-roll recursion.

Either way, cost never lands on consumers — `Future<T>` is thenable, so downstream users keep
`await` in their own code.

## Migration

`Promise<T>` → `Future<T>` across the ~37 boundary packages, in two zones: the **I/O boundary**
(scene-resources, loader, assets, image, image-codec, net, font, video, audio, textureatlas,
tileset) and the **platform-integration suite** (dialog, filesystem, storage, permissions, screen,
sensors, host-*, …). The pure-compute core is already synchronous and untouched.

## Open decisions (need the user)

1. **Producer name:** `Deferred<T>` (jQuery precedent, which included progress via `notify` —
   fits the progress requirement) vs `Operation<T>` (reads well for loading). Lean: `Deferred`.
2. **Progress detail shape:** a generic payload vs a fixed byte/item-count shape.
3. **Scheduler dependency:** Future needs a reliable continuation queue — this ties to the
   scheduler/clock consolidation in the port-readiness roadmap (#3). Sequence them together.

## Ties

- **Diagnostics charter** (`import-diagnostics`, in progress): the `null` sentinel's *reason* is an
  `ImportDiagnostic`. Future + diagnostics are two halves of one "explicit, port-safe I/O boundary."
- **Port-readiness roadmap** (`agents/port-readiness.md`): Future is the entry item; cancellation
  and the scheduler are shared dependencies.
