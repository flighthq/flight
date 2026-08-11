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

**TOMBSTONED and ABSENT are indistinguishable from outside this package — RULED a deliberate boundary,
not a gap.** The charter names three meanings over two stored states; here is exactly what each public
door can tell apart:

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

**Ruled by builder4 (thread lead, 2026-08-11): build nothing — no `explainRegistryTableEntry`.** The
reason is the shape of the real 4(B) consumer, which only they could see: in the texture-resolver slice
hot resolution and coverage *deliberately* collapse absent/tombstoned to unbound; registration `null`
uses `withoutRegistryTableEntry` (absence, no opinion); and snapshot derivation shares immutable tables
and then replaces members. No render consumer ever asks *why* a key is unbound. `concatRegistryTable`
stays the only operation that must separate absence from tombstone, and it does so in-package from the
stored union. `registry-catalog` and the codegen side describe registrar *inventory* and do not inspect
runtime overlay opinions.

**The trigger that would reopen this: a concrete external consumer that must enumerate explicit
omissions.** None exists on the authorized path. If one appears,
[diagnostics](../../conventions/diagnostics.md) names the remedy — a shakeable `explain*` returning plain
data, with the sentinel staying the zero-cost baseline — and that doc is equally explicit that `explain*`
is **targeted, not automatic**, since each duplicates the silent path's conditions and must be kept in
step with them. Speculative upkeep is the thing to avoid; this table is the record instead.

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
