---
package: "@flighthq/registry"
role: package
crate: flighthq-registry
lastDirection: 2026-08-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# registry — Charter

> Durable vision and core values for `@flighthq/registry`.
>
> **Provenance of this charter, because it changes how much authority it carries.** This is transcribed
> *program* direction for Stage 4(A), relayed through builder4 who leads that thread — not user-authored
> vision. It records the boundary the additive work was authorized within. Where it is silent, it is
> silent because nobody has ruled, and an agent should ask rather than read intent into the gap.

## What it is

Registry tables: the storage and composition primitives a registry is made of. A table is a **value with
a lifetime** — plain data, addressable by `Kind`, that can be constructed, read, enumerated, and composed
with another table without either one mutating.

Three shapes, each earning its place on an observable difference in the table's algebra rather than a
storage preference: `KeyedTable` (open key → entry, the default), `SlotTable` (a one-element vocabulary —
the capability is present or it is not), and `OrdinalTable` (a dense array indexed by a token a wire
format already carries as a small integer).

The exported types live in `@flighthq/types`; this package exports functions only.

## North star

**Persistent primitives over stateful registries.** Every operation that changes a table returns a
replacement and mutates nothing. The owner assigns the result. This is why the verbs are `with*` rather
than `set*` — `set*` is reserved for in-place mutation, and a `set*` that does not set contradicts a
stated rule at the call site, where the reader has only the name to go on.

**A failure that cannot be expressed beats a failure that is merely caught.** The tombstone is a
discriminated union rather than a flag or a reserved value because both of those *type-check* at every
site that has never heard of them, and a shape that cannot fail a build cannot carry a constraint whose
purpose is failing builds. The union is not assignable to `T`, so reaching a value requires narrowing,
and narrowing requires having handled both cases.

**The constraint defends the field, not just the function.** These are plain-data structs with public
fields, so an assembly can iterate `table.entries` without calling anything this package exports. Storage
therefore holds entries, not values — a constraint that lives only in signatures is bypassed by exactly
the property that makes the struct useful.

**Three meanings, two stored states.** *Bound* carries a value. *Tombstoned* means this table has an
opinion and the opinion is nothing — under composition it wins, and the base does not survive. *Absent
from the table* means no opinion, and the base is inherited. The third is the absence itself: there is
nothing to store for it, and typing it would be the tombstone.

## Boundaries

**In scope.** Construction, read, enumeration, composition, and tombstone semantics for the three table
shapes. Refusing a composition that is a programmer error (mismatched shape, registry id, or miss policy)
by throwing rather than guessing.

**Explicitly NOT in scope**, each because it is ruled elsewhere or held:

- **Registry population.** This package provides the tables; it binds nothing into them.
- **Migration or rewiring of existing registrars.** That is Stage 4(B) and is held.
- **Catalog contents.** `@flighthq/registry-catalog` owns those, and the caller-filled versus
  self-filling question is unruled.
- **Code emission.** `@flighthq/registry-codegen` and `@flighthq/tool-registry` own that.
- **`OrdinalTable` composition.** It carries no tombstone and no composition operations at all, because
  nothing composes it — a fact, not a preference. Adding a composition operation to that type is the
  trigger to revisit, and the hot-path cost of a discriminant read must be *measured* before the type is
  weakened.

## Decisions

- **[2026-08-10] Persistent tables, not in-place mutation.** Operations return a replacement; the owner
  assigns it. Named `withRegistryTableEntry`, never `set*`.
- **[2026-08-10] A distinct tombstone sentinel, typed so an unhandled one fails the build.** Removal is a
  separate verb (`withoutRegistryTableEntry`), not a third union variant.
- **[2026-08-10] `concatRegistryTable` throws** on mismatched shape, registry id, or miss policy.
- **[2026-08-10] `RegistryMissPolicy` is an open alias to `string`.** The registries this must serve do
  not share one vocabulary — a decompressor or importer registry may have no fallback state at all — so a
  closed union would impose a consumer's policy on every producer. Composition only ever compares
  policies for equality and never interprets one.
- **[2026-08-10] Enumeration and resolution may not disagree.** `getRegistryTableKeys` lists only bound
  keys and `hasRegistryTableEntry` is false on a tombstone, so a caller cannot enumerate a key and then
  resolve it to nothing.

## Open directions

- **[registry-table-model.md](../../registry-table-model.md) is working context, not blessed authority.**
  It is an unratified proposal whose blockers 2 (no anti-shotgun path) and 3 (census not safe to migrate
  on) remain open and gate ratification. The implemented surface is the explicitly ruled *subset* of that
  document and is narrower than it. Do not build against a paragraph of it that is not reflected here.
- **Ownership tier.** Which registries are caller-owned values versus render-state-owned is unsettled;
  `Scene2DDocumentImporterRegistry` is the one existing caller-owned instance and is deferred.
- **Whether `OrdinalTable` ever composes.** Deferred with the importer-registry question, which is its
  flip condition.
