# Types Layout & Kind Identity

Governs how `@flighthq/types` (the header layer) is organized, and the kind-identity model used across the whole SDK. Read this before adding a type, an entity, a capability, or an extensible family, and before touching kind registration.

## One concept per file

The unit of a `types` file is a _concept_, not a single type. A file is named (PascalCase) after one primary concept and holds that concept plus the satellites that exist only to serve it. Five shapes:

- **Entity home** — an entity bundles a fixed quartet in one file: `Bitmap.ts` → `BitmapData`, `BitmapRuntime`, `Bitmap`, `BitmapKind` (plus `*Factory`, `*TraitsKey`). **Never split the quartet** — it is one concept. `Node.ts` / `Entity.ts` are the foundational version.
- **Capability home** — one file per platform capability: its enums + options + the `*Backend` seam (`Dialog.ts`, `Platform.ts`, `Network.ts`).
- **Base-contract home** — an open family's base interface lives in its own file (`Material.ts`, `RenderEffect.ts`, `BitmapFilter.ts`).
- **Variant** — each concrete member of an open family is its own file, **1:1 with its impl files** (`BloomEffect.ts` ↔ `effects/bloomEffect.ts` ↔ `effects-gl/glBloomEffect.ts`).
- **Standalone type** — an independent type referenced by others but standing alone (`HitTestFunction.ts`, `Texture.ts`, `Sampler.ts`).

**Genuinely-finite vocabularies** (closed enums that will never be extended — `CapsStyle`, `PathWinding`, `GradientType`) may share a small domain file; splitting them into 3-line files buys nothing.

**Filename = the primary exported type's name, exact casing** — `Aabb.ts` (not `AABB`), `HtmlView.ts` (not `HTMLView`), `DomRenderState.ts`, `StandardPbrMaterial.ts`. Acronyms follow the type's PascalCase, never ALL-CAPS.

**Files are flat within a package — no category subfolders.** A self-identifying filename (`godRaysEffect.ts`) encodes what a folder (`atmospheric/`) would, without the extra lookup, and avoids re-introducing folder-based disambiguation. The same applies to impl packages: variants are flat per-concept files (`glGodRaysEffect.ts`), not grouped by category folder or category file. Category groupings, when useful for discovery, live in docs or a barrel comment — never in the directory tree.

## Open contracts for extensible families

Families meant to be extended — materials, effects, filters, lights — are an **open base contract carrying a `kind`**, with concrete variants registered against it. Do **not** enumerate members in a closed `type X = A | B | C` union that must be edited in `@flighthq/types` to extend. A new variant must be addable from outside the package: define its type + a `kind` + register a runner, touching no central list. (`Material` already follows this; `RenderEffect`/`BitmapFilter` were converted from their `type:` unions.)

**Closed families are correct when there is no extensibility goal.** A family with fixed, well-known membership — especially one dispatched in a hot inner loop — may stay a closed discriminated union with `switch` dispatch, which is faster and simpler than a registry. `ParticleForce` / `ParticleCollider` (per-particle, per-frame) and quad-batch internals are deliberate closed families: they still use the per-concept-file layout and the string `kind` field, but membership is closed and dispatch is a `switch`. Go open only when users or other packages genuinely need to add variants — extensibility is a decision, not a default.

## Kind identity is a string

A kind is a plain **string** identifier, not a `Symbol()`:

```ts
export const BitmapKind = 'Bitmap'; // type: 'Bitmap'
```

- **One model everywhere** — entity kinds, descriptor kinds, and render registration are all strings, keyed in string registries (`Map<Kind, …>`, `Kind = string`).
- The string is **simultaneously the registry key, the serialized form, and the user-facing intent vocabulary** — a scene round-trips with no symbol↔string seam and nothing to map on import.
- **Value convention**: the canonical PascalCase type name (`'StandardPbrMaterial'`), matching the type. Third-party kinds namespace with a vendor prefix (`'acme.Bloom'`).
- **Registration is last-write-wins; overriding is a feature, not an error.** Binding a renderer/runner to a kind that already has one _replaces_ it — that is how a user swaps a built-in for their own. Do **not** throw on re-registration. (A kind name itself is just an exported constant declared once in the owning package — there is no central "register the kind" step to guard.) Accidental name collisions are prevented by the namespacing convention below — bare names are reserved for built-ins, custom kinds carry a vendor prefix — not by a registration guard.
- Strings are more grep-able than symbols (a kind appears verbatim in data and code) and smaller in output (a serializable system must contain the string regardless; a symbol is the string plus overhead).

This applies to the kind-identity system (`*Kind`, renderer/hierarchy registration). It does **not** apply to internal `Symbol()` uses that are never serialized and exist only for runtime privacy/uniqueness — runtime-slot keys, property-key brands (`EntityRuntimeKey`, `NodeTraitsKey`), and sentinels (`NullScene`) stay symbols.

### Casing: kind-like vocabularies are PascalCase

Every serialized kind/value string — a closed enum of alternatives (`align`, `CapsStyle`) *and* an open descriptor family (effects, materials, blend modes) — uses a **canonical PascalCase** value: `'Center'`, `'Round'`, `'StandardPbrMaterial'`, `'HardLight'`. The string is the registry key, the serialized form, and — decisive for the C/C++ port this codebase targets — a valid identifier that maps to the target's `enum` member with **no string↔identifier seam and no re-casing**. Not lowercase or kebab: kebab is not a C++ identifier (it would force exactly the mapping seam this model forbids), and C++ enum members are PascalCase whether a member names a "value" or a "type" — so the value/type casing split is a web/CSS-ism the C/C++ target does not want, and does not exist here.

**Expose a user-facing family as a `const` namespace, not a TS `enum`:**

```ts
export const TextAlign = { Center: 'Center', Left: 'Left', Right: 'Right' } as const;
export type TextAlign = (typeof TextAlign)[keyof typeof TextAlign];
```

The user writes `TextAlign.Center` — typed, autocompleted, typo = compile error, value **is** the canonical string. A `const` namespace beats `enum`: no reverse-map runtime object, the value is a plain string (no serialization seam), and it ports to a C++ `enum class` cleanly. (A `const` object does not tree-shake unused *values*, but the values are trivially small; the weight that tree-shakes is unused runner *code*, gated by opt-in `register*`.)

**Open vs closed is orthogonal to casing** (see "Open contracts" above) — both use PascalCase values, and the choice is dispatch, decided by extensibility:

- **Open** (users/other packages add variants — effects, materials, blend modes): `type X = string`, dispatched through a **registry**, runners tree-shaking via opt-in registration. No central `switch`.
- **Closed** (finite, never extended — `TextFormatAlign`, `CapsStyle`): a `type X = 'Center' | 'Left' | …` **union** with `switch` dispatch — exhaustive, faster, simpler.

**Serialization is the canonical string verbatim** — no seam on the default path. Accepting a foreign or looser casing (e.g. OpenFL's lowercase `'hardlight'`) is a lenient normalization at an explicit **import** boundary, built when an importer needs it, not baked into the round-trip.

**The test is enum type vs string value.** A Flight-modeled enumerable concept — one that would be a first-class `enum` in the C/C++ port and that each backend *interprets* (`BlendMode`, `TextAlign`) — is an **enum type → PascalCase**. A string shuttled verbatim to one external API (`VertexFormat` → WebGPU, `NotificationPermission` → the web platform, a MIME type), typed as a `'a' | 'b'` union only for convenience, is a **string value → keep the API's source form** (`'float32x2'`, `'granted'`), because Flight is passing that API's data through, not defining a concept. So a `'a' | 'b'` union alone does not make something a value-to-lowercase; ask whether Flight *owns the concept as an enum* (→ PascalCase) or is *relaying a foreign string* (→ source form). Third-party kinds namespace with a vendor prefix (`'acme.HardLight'`).

### Performance note (optional)

Dispatch is `Map.get(kind)` behind a registry-version cache (`rendererMapId`) — nanosecond-scale and not re-run per frame. If profiling ever shows string churn or hot-path `===` cost, canonicalize each kind string to the registry's single instance on load, so comparisons are pointer-equal and there is one instance per kind. That is a plain-data interning step, not the serialization seam we deliberately avoid.

## Scenes are versioned intent; migrate at load

A scene stores kinds as strings (identity). When the model changes (one kind becomes three), do **not** permanently register legacy names — that bloats the runtime registry forever. Instead, version the scene format and rewrite old intent into current vocabulary in an opt-in, tree-shakable migration step at load. **Translate what it means now**; keep the runtime registry current-only.

## Placing a new type — checklist

1. Satellite of an existing concept (shares its stem; `*Data`/`*Runtime`/`*Options`/`*Like`; never imported alone)? → add it to that concept's file.
2. An **entity** (`Data`+`Runtime`+`Kind`, a scene-graph node)? → new file named after the entity, quartet together.
3. A **capability** (`*Backend` seam)? → new file per capability.
4. One variant of an **open family**? → its own file (1:1 with impl), referencing the base contract and registering its string kind. If the family is genuinely finite/non-extensible, group the variants instead.
5. Otherwise it is standalone → its own file.

**Filename = the primary type's name, exact casing. One concept per file; never split an entity quartet; never gate extension behind a closed union.**
