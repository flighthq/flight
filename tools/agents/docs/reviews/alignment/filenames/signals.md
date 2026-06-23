# Filename Alignment: @flighthq/signals

**Verdict:** Single-implementation domain package (no backend variants, so no backend prefix applies); filenames are mostly clean, but `emitter.ts` names a phantom entity and `throttle.ts`/`internal.ts` are weak — none block, two are nits worth a rename.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `emitter.ts` | Names an `Emitter` entity that does not exist in the package — there is no `Emitter` type or object. The file holds `cancelSignal` / `emitSignal`, which are emission operations on a `Signal`. The noun-as-entity is misleading; the real domain is signal emission/dispatch. | `emit.ts` (or fold `emitSignal`/`cancelSignal` into `signal.ts`, since both operate directly on `Signal`) |
| `throttle.ts` | Effectively a single-function file (`connectSignalAtRate`). "throttle" names the rate-limiting concept, not the object the package operates over (`Signal`/`Slot`). Borderline single-function naming. | `connectSignalAtRate.ts` is still single-function; better to fold into `slot.ts` (it is a connect/disconnect helper built on `connectSignal`/`disconnectSignal`), or rename to a domain noun like `rate.ts` if kept separate. |
| `internal.ts` | Generic catch-all name carrying no domain. Currently holds only `nullSignalEmit` (a package-internal sentinel, not barrel-exported). Acceptable as the documented `internal.ts` pattern, but the name says nothing about its contents. | Acceptable to keep; if renamed for specificity, `nullSignalEmit.ts` — though that trades generic for single-function. Leave as-is unless it grows unrelated contents. |

## Clean

- `signal.ts` — names the `Signal` domain object; exports `createSignal`. Self-describing.
- `slot.ts` — names the `Slot` object (the listener half of the signal/slot pattern); holds the connection-management domain (`connectSignal`, `disconnectSignal`, `disconnectAllSignals`, `isSlotConnected`). Self-describing domain name.
- `index.ts` — thin barrel re-export; standard.
- Tests colocate and mirror sources 1:1: `signal.test.ts`, `slot.test.ts`, `emitter.test.ts`, `throttle.test.ts`, `internal.test.ts`.
