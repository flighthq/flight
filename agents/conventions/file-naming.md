# File Naming & Type Home

The TS→Haxe generator maps one source file to one Haxe module (`clock.ts` → module `Clock`), and a type's Haxe fully-qualified name is `package.Type` — never `package.Module.Type`. So **file names and type placement are public API** in the port, and a future C/C++ port has the same `namespace::Name` single-namespace shape. These three rules keep both unambiguous. `geometry` is the reference package for all of them: it exports zero types, and its files are verb-free concept nouns (`rectangle.ts`, `matrix.ts`).

## 1. All exported types live in `@flighthq/types`

No `export interface`, `export type`, or `export enum` outside `@flighthq/types` — renderers, `host-*`, and `*-formats` all included. **Two exemptions**, each because the types cannot enter the pure header without breaking its invariants: (1) the **`tool-*` tooling tier**, whose types structurally embed non-portable deps (`@playwright/test`, `node:*`) that must not become dependencies of the universal header — `tool-*` is already a separate tier, excluded from the SDK barrel; (2) **test-only mock types in `*TestHelper.ts`** files (test infrastructure, not shipped API). Everything shipped and portable moves.

- **Why.** It makes the collision class structurally impossible: every type is `flighthq.types.*` and every function is `flighthq.<pkg>.*`, so a type can never share a package with a same-named function file. And the header layer becomes the complete, navigable type surface — the stated purpose of `@flighthq/types`.
- Function packages become **pure-function** (like `geometry`, whose `Rectangle` type lives in `types/Rectangle.ts`). A file such as `clock.ts` holds only functions → `flighthq.clock.Clock.createClock(...)`.
- `@flighthq/types` files may group several related types (the entity-quartet pattern) — e.g. one `glSceneRuntime.ts` holding `GlSceneRuntime` + `GlMeshUpload` + `GlSceneShadow`/`Ibl`/`DrawEntry`. See [types-layout](types-layout.md) for the internal organization of the types package.
- A type used within a **single file** and never exported stays local — it never crosses files, so it never becomes a package-level Haxe typedef.
- `*Kind` string identifiers are **values**, not types — they are governed by the kind-identity model (defined in the owning package), not by this rule.

Enforced by `packages:check`: `export (interface|type|enum)` outside `packages/types` is an error.

## 2. File names are concept nouns — verb-free

A source file is named for the **concept** it holds, not for a verb.

- `clock.ts` holding `createClock` / `advanceClock` / `pauseClock`, **not** `createClock.ts` / `advanceClock.ts` / … . An entity's verbs colocate inside the entity's file.
- Cut at concept boundaries, not "one file per package": a sub-concern gets its own concept file (`geometry`: `rectangle.ts` **and** `rectanglePool.ts`; `clock`: `clock.ts` **and** `clockSignals.ts`).
- **Nuance — a prefix that is the concept's identity stays.** `easeBack` reads as a noun (the *back* easing curve), not a command; `*Renderer` names a value; `enable*Guards` is the guard-module convention. The test: is the file a **shared entity scattered by verb** (`createClock`/`pauseClock` on one `Clock`) → collapse into the concept file; or a **family of distinct concepts** whose names need their prefix to identify them (the easing curves, the `*GlMeshMaterialRenderer` set) → keep. When a leading word is doing noun/identity work, it is not a verb for this rule.

## 3. File names are globally unique across the SDK

Non-routine source basenames are unique SDK-wide, so both the Haxe module and a `grep` land on exactly one file.

- A concept that appears in a **base** and a **derived/backend** package is disambiguated by a package prefix: `displayObject.ts` (`displayobject`) vs `glDisplayObject.ts` (`displayobject-gl`). Backend prefixes are `gl` / `wgpu` / `dom` / `canvas`.
- **Routine files are exempt** — `index.ts`, test helpers, `vitest.config.ts`.
- **Generic names are disallowed** for exported source — `shared.ts`, `internal.ts`, `utils.ts`, `helpers.ts` name nothing. Name the concept. (Note: rule 1 dissolves most `internal.ts` files anyway — their types move to `@flighthq/types`.)
