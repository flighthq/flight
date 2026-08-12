---
package: '@flighthq/storage'
updated: 2026-08-08
by: principal
---

# storage — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/storage/src/storage.ts` and `packages/types/src/Storage.ts`
on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **Namespaced single-key writes silently skip `onChange`.** `_emitStorageChange` has exactly five
  callers — `clearStorage`, `removeStorageItem` (`:383`), `setStorageItem` (`:430`),
  and the two cross-tab re-wire paths (`:132`, `:414`). `setNamespacedStorageItem` (`:399`) and
  `removeNamespacedStorageItem` (`:374`) call the backend directly. These are **not** bulk ops, so the
  documented "bulk writes are deliberately not signal-aware" tradeoff does not cover them: a caller who
  uses namespaces gets no change events at all, and nothing says so.
- **Bulk ops are also silent, by decision** — `setStorageItems` (`:436`), `removeStorageItems` (`:389`),
  and `clearStorageNamespace` (`:21`) loop the backend to avoid a per-key `oldValue` read. That is the
  intended tradeoff, but no `explain*` query or guard tells a caller why their listener never fires.
- **`migrateStorage` is not atomic and not resumable.** On a throwing migration it returns `-1`
  (`storage.ts:359`) with every earlier migration in the batch already applied and the version key
  never written (`:363-369`), so the next run replays them from the stored version. Either the version
  key advances per successful step or the failure is documented as leaving a torn store.
- **`__flight_storage_version` is a soft reservation with no enforcement.** The key is a local literal
  (`storage.ts:349`) and appears in `getStorageKeys` (`:288`), `getStorageEntries` (`:227`),
  `getStorageItemCount` (`:244`), and `getStorageByteSize` (`:210`) like any user key. A caller
  enumerating their own keyspace sees Flight's bookkeeping.
- **`getStorageQuotaEstimate` is the package's only async export** (`storage.ts:309`) — every other
  function is synchronous. `navigator.storage.estimate()` is inherently async, so this is a real
  seam split rather than an oversight, but it means the storage API has two calling conventions.
- **No `@flighthq/storage-formats` neighbor exists.** `packages/storage-formats/` is absent and
  `exportStorageSnapshot` / `importStorageSnapshot` have zero hits across `packages/**/*.ts`. Snapshot
  export/import is the one named Gold surface still unbuilt.
- **`onStorageChange(listener): () => void` is deliberately absent** pending a ruling on auto-enable.
  Today subscribing means `connectSignal(enableStorageSignals().onChange, listener)`; the question is
  whether a convenience wrapper may turn signals on as a side effect of subscribing.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 claim that
  `StorageChange`, `StorageMigration`, `StorageNamespace`, `StorageQuota`, and `StorageSignals` each
  got their own file and "follow the one-concept-per-file convention" is **false**:
  `packages/types/src/` carries a single `Storage.ts`, and all five are declared inside it at
  `Storage.ts:22`, `:31`, `:37`, `:42`, and `:48`. The signal-emission gap was also understated — it
  covers the namespaced single-key mutators, not just bulk ops.
- **2026-06-25** — `_emitStorageChange` routes through the `emitSignal` free function;
  `clearStorageNamespace` became a single pass with a hoisted backend binding.
- **2026-06-24** — Landed presence/count/entries, JSON and typed scalar accessors, namespacing, bulk
  ops, byte-size accounting, the `enableStorageSignals` change-notification group with cross-tab
  synthesis, versioned migrations, and quota estimation.
