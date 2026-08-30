---
package: '@flighthq/storage'
updated: 2026-08-29
by: builder4
---

# storage — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **No open implementation defect in the explicit-Host slice.** Storage commands consume
  `HasStorageLocal`; change observation consumes `HasStorageChange`. Web truthfully supplies both and
  Electron only local. The old ambient backend, quota surface, sentinel, Web enabler, and namespace
  constructor are gone.
- **Migration is intentionally resumable rather than transactional.** Each callback checkpoints its
  version immediately. Callback exceptions propagate and earlier successful steps are not rolled back,
  so migration callbacks must remain replay-safe and idempotent.
- **Durability is intentionally narrower than atomic visibility.** Mutation `reason: 'ok'` promises
  visibility plus provider-cache agreement, not fsync or sudden-power-loss survival. Electron meets the
  contract with a same-directory temporary candidate and rename.
- **No `@flighthq/storage-formats` neighbor exists.** Snapshot export/import remains a possible future
  package rather than part of this synchronous capability.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-29** — Replaced ambient backend selection with explicit `storage.local` / `storage.change`
  Host facets, method-tight reason envelopes, complete signal/migration lifetimes, a stable Web Entity,
  and candidate+rename Electron persistence. Public success semantics are recorded in
  `packages/types/src/Storage.ts` and the package charter.
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
