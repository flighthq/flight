---
package: '@flighthq/types'
crate: flighthq-types
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# types — Charter

## What it is

`@flighthq/types` is the SDK's **implementation-free header layer** — the single package from which the full API shape of the entire SDK is navigable without importing any implementation. It contains cross-package interfaces, type aliases, entity/runtime quartets, open base contracts, capability backend seams, string `*Kind` identity constants, and closed-vocabulary enums. ~478 source files, zero runtime dependencies, `sideEffects: false`. It is the "C header file" of the codebase.

Unlike a typical leaf package whose domain is one subject (easing, geometry, particles), the types package's domain is _the complete declared API surface_ of every other package. Every entity, every extensible family, every platform capability backend, every scene graph primitive is declared here first; implementation packages depend on types, never the reverse.

Where it ends: types declares contracts; it does not contain constructors, validators, guards, algorithms, or any runtime logic. The `create*` / `set*` / `get*` functions that operate on these types live in their respective implementation packages. The only runtime values exported are `*Kind` string constants and the `EntityRuntimeKey` symbol.

## North star

1. **The full API shape, navigable from one package.** A developer can understand what the SDK offers — every entity, every backend seam, every extensible family — by reading `@flighthq/types` alone, without importing any implementation package. This is the defining promise: the header is the design surface.
2. **One concept per file, entity quartets, open contracts.** The `types-layout.md` convention is the mechanical backbone: filename = primary type name (PascalCase), entity types follow the `Data`+`Runtime`+entity+`Kind`+`*Like` quartet pattern, extensible families use an open `kind: Kind` base contract with string registries, and closed unions are reserved for hot finite non-extensible families.
3. **Entity as universal base for user-facing value types.** All user-facing SDK types (geometry values, scene graph nodes, descriptors) extend `Entity`, giving them the `[EntityRuntimeKey]` slot for OOP binding. The `EntityWithoutRuntime<T>` utility produces the `*Like` plain-data input variant. This is a foundational contract — not incidental inheritance.
4. **Rectangle is Rectangle.** Domain-specific types with `{x, y, width, height}` shape either _are_ `Rectangle` (type alias) or _extend_ `Rectangle` (when they add domain fields). The domain name belongs in the function name (`setSurfaceRegion`, `getRenderViewport`), not in a parallel type that duplicates `Rectangle`'s shape. Types that are structurally identical to `Rectangle` but domain-named are consolidation debt, not intentional design (Decision #3).
5. **String-kind identity model.** One model across the entire SDK: `export const FooKind = 'Foo'` — simultaneously the registry key, the serialized form, and the user-facing intent vocabulary. Vendor-prefixed for custom kinds (`'acme.Foo'`). Last-write-wins registration. Internal `Symbol()` uses (runtime-slot keys, property-key brands) stay symbols.

## Boundaries

**In scope:**

- Cross-package interfaces, type aliases, and `*Like` plain-data input types.
- Entity quartets: `*Data` / `*Runtime` / entity / `*Kind` + `*Like`.
- Open base contracts with string `kind` discriminant (`Material`, `RenderEffect`, `Adjustment`, `SpritesheetFormat`).
- Capability backend seam interfaces (`*Backend`, `*BackendOptions`).
- Closed-vocabulary enums and const objects (`BlendMode`, `PixelFormat`, `KeyCode`, etc.).
- String `*Kind` identity constants.
- The `Entity` / `EntityRuntime` / `EntityRuntimeKey` / `EntityWithoutRuntime` foundation.
- Signal seam types (`Signal`, `SignalData`, `SignalConnectOptions`, per-subsystem signal-group interfaces).
- Math/geometry value type interfaces (`Matrix`, `Vector2`, `Rectangle`, `Aabb`, `Quaternion`, etc.).

**Non-goals:**

- **Runtime logic** — no constructors, validators, guards, algorithms. Those belong in implementation packages.
- **Package-internal types** — types that do not cross a package boundary stay in their owning package. Only cross-package types belong here.
- **Test coverage mandates** — type-level assertion tests (`expectTypeOf`) are welcome for structural invariants but not required per-file. The placeholder skip pattern is acceptable for a pure header (Decision #2).

## Decisions

- **[2026-07-02] Identity confirmed: types is the SDK's header layer.** The full API shape should be navigable from `@flighthq/types` alone, without importing any implementation packages. This is not aspirational — it is the defining promise. Every cross-package type, backend seam, entity quartet, and kind constant lives here. Implementation packages depend on types; types depends on nothing.

  **Why:** A header layer gives the SDK a single browsable entry point for its entire API surface, decouples the contract from the implementation, and means defining types first is defining the design surface. The analogy is C/C++ headers: you read the `.h` to understand the API; you read the `.c` to understand the implementation.

- **[2026-07-02] Type-level assertion tests are welcome but not mandated.** The `missing.test.ts` placeholder skip pattern is acceptable for `@flighthq/types` specifically. Type-level assertion tests (`expectTypeOf`) earn their place when they encode a structural invariant that matters: `*Like` strips the runtime key, quartets stay assignable, open-contract `kind` narrows, `EntityWithoutRuntime` behaves. These are "contract tests," not coverage-for-coverage's-sake. The implementation packages that consume these types are where the real behavioral testing happens.

  **Why:** ~478 source files of pure type declarations. Mandating one test file per source file would produce hundreds of trivially empty tests. The value is in the structural invariant tests — those should be added opportunistically where the invariant is load-bearing, not as a blanket requirement.

- **[2026-07-02] Rectangle-shaped types default to `Rectangle` or `extends Rectangle`.** If a type has `{x, y, width, height}` and adds no fields, it should be `Rectangle` (or a type alias). If it adds domain fields, it should `extends Rectangle`. Domain-specific names like `RenderViewport2D`, `SurfaceRegion` belong in the function names that operate on them (`setSurfaceRegion(state, region: RectangleLike)`), not in parallel type definitions that duplicate Rectangle's shape. Existing domain-named rectangle duplicates are consolidation debt. **Resolves assessment backlog "unify region types."**

  **Why:** The function naming convention already carries domain context — `setSurfaceRegion` is greppable and self-identifying. A parallel `SurfaceRegion` type that is structurally identical to `Rectangle` fragments the type system without adding information. Agents building new APIs invented these types to satisfy the "function name includes the full type name" rule, but the rule is about function names, not type proliferation. `TextureAtlasRegion` is correct because it adds atlas-specific fields; `RenderViewport2D` is debt because it adds nothing.

- **[2026-07-02] ParticleForce and ParticleCollider are intentionally closed unions.** These are hot per-particle per-frame dispatch families where an extensible registry would kill performance. The inline "should become open" note is outdated and should be removed. Closed unions are correct for tight, finite, non-extensible families — the types-layout convention explicitly blesses this.

  **Why:** Particle force/collider evaluation runs per-particle per-frame. A registry lookup (`Map.get(kind)`) in that inner loop is a measurable cost. The force/collider vocabulary is finite and engine-defined — users do not need to register custom force types at the kind level. If the vocabulary grows meaningfully, revisit; until then, closed is correct.

- **[2026-07-02] Signal<T> generic shape divergence with Rust is intentional.** TS `Signal` is parameterized by the slot function type (`T extends (...args: any[]) => void`) — no allocation, the callback _is_ the type parameter. Rust `Signal<T>` is parameterized by payload — idiomatic Rust, uses a tuple or named struct with no object overhead. Each side does what's natural for its language. This is a documented conformance divergence, not a problem to solve.

  **Why:** The TS design avoids allocating a payload object for every emit — the slot function's arguments _are_ the payload. The Rust design avoids `dyn Fn` trait complexity with heterogeneous argument lists — a single `&T` payload is idiomatic. Both achieve the same zero-cost goal through different language idioms. Forcing one shape onto the other would degrade the natural side for no user benefit.

- **[2026-07-02] Notification identity model is `id`, not `tag`.** The notification seam should key consistently on `id` — a host-assigned identifier returned by `notify`. `updateNotification(id, ...)`, `cancelNotification(id)`, and subscriber callbacks deliver `id`. The current `tag`-based vocabulary in `NotificationRequest` and subscribers is a seam inconsistency: the implementation already mints an `id`, but the types layer hasn't been lifted to match. **Resolves assessment "Notification id/tag seam gap."**

  **Why:** `id` is the natural identity word — "I want to update notification X" thinks in `id`, not `tag`. `tag` reads as HTML or categorization, not identity. The implementation already has the `id` model; the types should match.

## Open directions

1. **Rectangle consolidation sweep.** Decision #3 blesses the direction but the consolidation is cross-package — it touches `@flighthq/render` (`RenderViewport2D`), `@flighthq/surface` (`SurfaceRegion`), `@flighthq/text` (`TextSelectionRectangle`), `@flighthq/textureatlas` (`TextureAtlasRegion` — this one _extends_ Rectangle since it adds fields). Needs a builder sweep after the types-side declarations are settled.

2. **TextDirection shared type.** `'LeftToRight' | 'RightToLeft'` is repeated inline in `ShapedRun` and `ShapeRunOptions`. A shared `TextDirection` alias is the header-layer move, and it may grow to serve bidi-level modeling in a future text stack session. Small, within-types, but worth settling during a text-stack direction session rather than in isolation.

3. **Rust `flighthq-types` conformance.** The Rust `flighthq-types` crate mirrors this header. The `Signal<T>` divergence is now documented (Decision #5). Other seams (entity quartets as Rust structs, `KindId` as `u64` newtype vs string, `EntityRuntimeKey` as symbol vs Rust-native slot) are recorded in the conformance map. Ongoing, not a types-package task.

4. **Self-containment assertion.** The header promises "navigable from types alone" but nothing in this package enforces that an implementation type didn't leak in. `packages:check` covers workspace dependency direction, but a stronger within-package assertion (that every import resolves to either a local file or no import at all) would make the promise self-verifying.
