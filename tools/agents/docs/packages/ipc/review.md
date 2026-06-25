---
package: '@flighthq/ipc'
status: partial
score: 35
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/ipc.md
  - reviews/maturation/depth/ipc.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# ipc — Review

## Verdict

**`revise` as a merge candidate — 35/100 for THIS integration slice.** The design that landed is the same well-rounded command capability the prior 84/solid review documented (listener management, typed channel descriptors, responder seam, timeout wrapper, event-shaped subscribe with reply, targeted send, capability descriptor, opt-in signal group). The problem is not the design — it is that the integration branch `b2824e3d8` carries a **partial slice of it**: the `packages/ipc/` source change landed, but the companion `@flighthq/types` change it depends on did not. **The candidate does not compile.** That is a hard merge-gate fail independent of any quality axis: a non-building package cannot be merged into the approved floor. The score reflects the merge candidate as-is, not the underlying feature work, which is sound and should land once its types are restored.

This is an **integration assembly defect**, not a code-quality defect. The builder worktree (`status.md` › `builder-67dc46d64`) and the prior review both verified a state where nine `@flighthq/types` Ipc files existed; this integration branch dropped them while keeping the `ipc.ts` side that imports them.

## What the delta is (head vs base)

The base (`origin/main`, `eb73c3d74`) `packages/ipc/` is the bare three-verb seam: `getIpcBackend`, `setIpcBackend`, `createWebIpcBackend`, `sendIpcMessage`, `invokeIpc`, `onIpcMessage` over a 3-method `IpcBackend` (`send`/`invoke`/`subscribe`). It compiles.

The head adds twelve exports and a package dependency on `@flighthq/signals`:

- `createIpcChannel`, `enableIpcSignals`, `getIpcSignals`, `getIpcListenerCount`, `hasIpcBackend`, `invokeIpcWithTimeout`, `onceIpcMessage`, `onIpcInvoke`, `onIpcMessageEvent`, `removeAllIpcListeners`, `sendIpcMessageTo`, and widens every channel-accepting signature to `string | Readonly<IpcChannel>` via a `resolveChannel` helper.
- `b2824e3d8:packages/ipc/package.json` adds `"@flighthq/signals": "*"`; `b2824e3d8:packages/ipc/tsconfig.json` adds `{ "path": "../signals" }`. Both correct.

## Merge blocker: the candidate does not compile

The single, decisive finding. The head `ipc.ts` imports six type symbols and an error class from `@flighthq/types`:

> `b2824e3d8:packages/ipc/src/ipc.ts`
>
> ```ts
> import { createSignal, emitSignal } from '@flighthq/signals';
> import type {
>   IpcBackend,
>   IpcBackendCapabilities,
>   IpcChannel,
>   IpcMessageEvent,
>   IpcSignals,
>   IpcTarget,
> } from '@flighthq/types';
> import { IpcTimeoutError } from '@flighthq/types';
> ```

None of `IpcBackendCapabilities`, `IpcChannel`, `IpcMessageEvent`, `IpcSignals`, `IpcTarget`, or `IpcTimeoutError` exists in the integration head's `@flighthq/types`. The head `Ipc.ts` is byte-identical to base and declares **only** the three-method `IpcBackend`:

> `b2824e3d8:packages/types/src/Ipc.ts` (entire file)
>
> ```ts
> export interface IpcBackend {
>   send(channel: string, args: readonly unknown[]): void;
>   invoke(channel: string, args: readonly unknown[]): Promise<unknown>;
>   subscribe(channel: string, listener: (args: readonly unknown[]) => void): () => void;
> }
> ```

A repository-wide search of `b2824e3d8:packages/types/` for any of those symbols returns nothing, and `changes.patch` never touches `packages/types/src/Ipc.ts`. So every one of those imports is a TS2305 "has no exported member" error, and the three methods the new code calls on the backend — none of which the interface declares — are TS errors too:

> `b2824e3d8:packages/ipc/src/ipc.ts`
>
> ```ts
> if (typeof backend.handle !== 'function') return () => {};   // onIpcInvoke
> ...
> getIpcBackend().sendTo?.(target, resolveChannel(channel), args);   // sendIpcMessageTo
> ...
> getCapabilities(): Readonly<IpcBackendCapabilities> { ... }   // createWebIpcBackend
> ```

`backend.handle`, `backend.sendTo`, and `backend.getCapabilities` are not on the head `IpcBackend`. The colocated test imports the same missing symbols and will not typecheck either:

> `b2824e3d8:packages/ipc/src/ipc.test.ts`
>
> ```ts
> import type { IpcBackend, IpcBackendCapabilities, IpcChannel, IpcSignals } from '@flighthq/types';
> import { IpcTimeoutError } from '@flighthq/types';
> ```

`tsc -b` over `packages/ipc` (which references `../types` and `../signals`) cannot succeed. This fails axis 7 (compiles) outright, and because the contract surface the feature was designed against is absent, axis 6 (types-first in `@flighthq/types`) is also failed **for this slice** — not because the types were authored inline, but because they are missing entirely from the branch being merged.

The fix is mechanical and lives outside this package's source: the integration branch must also carry the `@flighthq/types` Ipc additions that the builder produced (the nine one-concept-per-file types the prior review verified: `IpcBackendCapabilities`, `IpcChannel`, `IpcError` + `IpcErrorCode`, `IpcMessageEvent`, `IpcPort`, `IpcSignals`, `IpcTarget`, `IpcTimeoutError`, plus the `handle`/`sendTo`/`getCapabilities` widening of `IpcBackend`). This is a re-integration directive, not a request to edit `@flighthq/ipc`.

## Axis-by-axis (judging the design that lands, once the types are restored)

These pass on the merits and explain why the underlying feature is worth re-landing — they are **not** a reason to merge the slice as-is.

1. **Composition / bedrock — pass.** No feature is a config-gated branch in a shared hot loop; there is no per-frame path. The unit is a flat set of free verbs over one swappable backend plus a small package-local listener registry. Simple-by-composition; not over-split.
2. **Naming — pass.** Every export carries the full unabbreviated `Ipc` word and is globally self-identifying (`sendIpcMessageTo`, `onIpcMessageEvent`, `getIpcListenerCount`, `invokeIpcWithTimeout`). `get*`/`has*`/`enable*`/`createWeb*Backend` all follow the platform-suite convention.
3. **Tree-shaking / bundle invariant — pass.** `index.ts` is `export * from './ipc'`; no top-level registration; backend and signals are both lazy singletons (`_backend`/`_ipcSignals` initialized to `null`). `package.json` keeps `sideEffects: false`. No importer pays for an unused arm.
4. **Registry vs closed union (fork B) — N/A.** No `kind` switch; the swappable backend is fork D's runtime-backend dimension, correctly applied (one active backend via `setIpcBackend`).
5. **Subject triad + plurality guard — N/A / pass.** A runtime-backend-seam package, not a `-formats`/`-backend` subject; no premature split.
6. **Contract hygiene — pass in design, FAILED in this slice.** In the intended state the types are all in `@flighthq/types`, one concept per file; `Readonly<>` is applied to channel/target/event/capability params; sentinels (`0` listeners, `null` signals, no-op web default) are used for expected failure; the one throw (`IpcTimeoutError`) is a deliberate caller-facing timeout signal; `destroyIpcPort` (specced) is the correct verb for a native handle. **But this slice ships none of those types**, so the axis fails as merged.
7. **Tests — design pass, slice FAIL.** The test file mirrors exports, is alphabetized, capability-parameterizes the fake backend, and exercises optional-method-absent paths and the timeout race. It is honest about `senderId === -1`/inert-`reply`. But it imports symbols the branch does not provide, so it does not compile here.

## Delta-introduced coherence gap (route to Open directions, not a blocker)

`sendIpcMessageTo` and `onIpcInvoke` branch on **method presence** (`sendTo?.`, `typeof handle === 'function'`) while `getCapabilities()` (`canHandle`/`canTarget`/…) is a parallel, unconsulted truth source introduced in the same delta:

> `b2824e3d8:packages/ipc/src/ipc.ts`
>
> ```ts
> export function sendIpcMessageTo(target, channel, ...args): void {
>   getIpcBackend().sendTo?.(target, resolveChannel(channel), args);
> }
> ```

Two sources that can disagree (a backend could report `canTarget: false` yet define `sendTo`, or vice versa). This is charter Open direction #5 — a contract-canonicity decision, not a sweep — and it is genuinely a property of this delta, so it is recorded, but it is **not** a merge blocker.

## Charter fit

The DRAFT charter (`charter.md`) already anticipates this entire delta — its `North star`, `Boundaries`, and `Open directions` describe the responder seam, targeted send, event/once/remove-all, timeout wrapper, capability descriptor, and signal group as the realized command-capability shape. Nothing in the delta contradicts a blessed line (there are none yet; `Decisions` is empty). The structural-fork posture is clean: fork D (runtime backend) correctly applied; no fork-B switch; no fork-C hot-loop inflation. The defect is purely that the integration branch shipped half the cells of a two-package change.

## Candidate doc revision (unchanged from prior review, still valid once landed)

The **Package Map** line for `@flighthq/ipc` in `tools/agents/docs/index.md` still reads "`sendIpcMessage`, `invokeIpc`, `onIpcMessage` over a host channel backend" — the original three-verb framing. Once the full slice lands it should reflect the command-capability shape. This is an edit to a shared doc, out of this package's sweep scope.
