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

**TOMBSTONED and ABSENT are indistinguishable from outside this package, and that is currently a
boundary rather than a decision.** The charter names three meanings over two stored states; here is
exactly what each public door can tell apart:

| | bound | tombstoned (omit) | absent (no opinion) |
|---|---|---|---|
| `getRegistryTableEntry` | the value | `null` | `null` |
| `hasRegistryTableEntry` | `true` | `false` | `false` |
| `getRegistryTableKeys` | listed | not listed | not listed |
| `concatRegistryTable` (in-package) | overlay wins | **overlay wins, base dropped** | **base inherited** |

The bottom row is the point: the two states a caller cannot distinguish are the two that produce
**opposite final bindings**. Resolution collapsing them is correct and stays — the caller asked what is
bound, the answer is nothing, and no tombstone should escape into code that has never heard of one.
The open question is only whether anything *outside* this package ever needs the distinction.

If composition stays in-package, nobody outside can be confused and the right answer is to build
nothing and keep this table as the record. If a 4(B) registrar, `registry-catalog`, or the codegen side
ever needs to ask "what does this overlay explicitly omit?", the collapse is a blind spot and
[diagnostics](../../conventions/diagnostics.md) names the remedy: a shakeable `explain*` returning plain
data, with the sentinel staying the zero-cost baseline. That doc is equally explicit that `explain*` is
**targeted, not automatic** — each one duplicates the silent path's conditions and must be kept in step —
so it is upkeep to spend only against a real consumer. Asked builder4 (thread lead, and the only one who
can see 4(B) shape) rather than guessing; **holding until answered.**

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
