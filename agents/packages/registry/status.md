---
package: "@flighthq/registry"
updated: 2026-08-10
by: builder2
---

# registry — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

**The unit is verified; the integration is unexercised.** Nothing in the repo consumes this package. That
is the expected state for additive work on the day it lands, but it is worth stating plainly, because
"27 tests pass" reads as *exercised* and means *verified in isolation*. It stays that way until Stage
4(B) wires a real registrar through it, which is held. A negative control proves a test can fail; it does
not prove the path is reached in use.

**`concatRegistryTable` refuses `OrdinalTable` by SIGNATURE, not at runtime.** A signature that accepts a
table and then throws still says it composes. This makes it a compile error instead. If a future caller
genuinely needs to compose ordinal tables, that is the flip condition recorded in the charter — measure
the hot-path cost before weakening the type, do not relax the signature.

**The entry-returning shape dispatch is deliberately not exported.** `getRegistryTableEntryState` returns
entries *including tombstones*, which is composition currency. Handing one to a caller that only wanted a
value is how a tombstone reaches code that has never heard of one. Resolution returns `T | null`; only
composition sees entries, and composition lives in this package.

**Miss policy is comparable, never interpreted.** `concatRegistryTable` compares two policies for
equality and refuses on mismatch. It does not read them. If something later needs to *interpret* a
policy, that is a new capability and a new ruling — not an extension of this comparison.

## Log

- **2026-08-10** — `RegistryMissPolicy` ruled an open alias to `string`; `onMiss` restored to
  `RegistryTableBase`, carried by all three constructors, preserved through every `with*`/`without*`
  operation and both composition branches, and `concatRegistryTable` now refuses on policy mismatch
  alongside shape and registry id.
- **2026-08-10** — Package created. Three table shapes, the two opposite verbs (`withRegistryTableTombstone`
  = omit, `withoutRegistryTableEntry` = no opinion), bound-only key enumeration, and `has` false on a
  tombstone. Storage holds `RegistryTableEntry<T>` behind a `ReadonlyMap` so the union defends the field
  rather than only the function. Classified as a **core** dependency layer — it depends on
  `@flighthq/types` alone.
