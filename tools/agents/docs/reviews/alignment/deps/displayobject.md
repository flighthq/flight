# Dependency Alignment: @flighthq/displayobject

**Verdict:** Mostly clean and well-layered, but the declared dependency set is out of sync with imports: `@flighthq/textlayout` is declared yet imported nowhere (unused), and `@flighthq/entity` is imported (in tests) yet undeclared (phantom).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/textlayout` | Declared in `dependencies` but imported in **zero** files (no `import`, no type ref, no string ref anywhere in `src/`). Stale edge — almost certainly a leftover from when text display objects lived in this package before the `@flighthq/text` split. Adds a phantom edge to the dependency graph that misleads readers about what this package actually needs. | Remove `@flighthq/textlayout` from `dependencies`. |
| Medium | `@flighthq/entity` | Imported (`getEntityRuntime`) in `bitmap.test.ts` and `displayObject.test.ts` but **not declared** in `dependencies`. This is a phantom (used-but-undeclared) edge by the repo's own convention: sibling packages declare every imported `@flighthq/*` — including test-only ones — as a runtime `dependency` (e.g. `@flighthq/node` declares `entity` and `geometry`; `@flighthq/sprite` declares `geometry`). It resolves today only via workspace hoisting. | Add `"@flighthq/entity": "*"` to `dependencies`. |
| Info | `@flighthq/geometry` | Declared, but used only in test files (`createRectangle` in 4 `*.test.ts`); no source file imports it. Consistent with the repo convention of declaring test-used `@flighthq/*` as runtime deps (matches `node`/`sprite`), so not a violation — but worth noting it carries no `src/` weight. Leave as declared for convention consistency. | None (keep for convention parity). |
| None | `@flighthq/sdk` | Not imported. Correct — packages must never import the barrel. | None. |
| None | inline cross-package types | None. `internal.ts` defines a package-private `DisplayObjectInternal` (an `Omit<DisplayObject, …>` derived from `@flighthq/types`); it is not exported from `index.ts` and is not a redefinition of a cross-package contract. It is the legacy `internal.ts`-cast pattern (CLAUDE.md discourages extending it in favor of runtime slots), but that is a style concern, not a dependency-hygiene one. | None for deps. |
| None | layering / `@flighthq/node`, `@flighthq/signals`, `@flighthq/types` | Edges read exactly as a reader would predict for a display-object tree: graph/trait init + invalidation from `node`, signal create/emit (stage signals) from `signals`, all entity contracts/`*Kind` strings from the `types` header. No reach across renderer boundaries, no upward edge, no backend coupling. `sideEffects: false` declared; `index.ts` is a thin re-export with a single `.` export. Runtime imports pull real symbols; all cross-package type imports use `import type`. | None. |

## Declared vs used

- **Declared (`dependencies`):** `@flighthq/geometry`, `@flighthq/node`, `@flighthq/signals`, `@flighthq/textlayout`, `@flighthq/types`. **devDeps:** `typescript`.
- **Used in `src/` (non-test):** `@flighthq/node` (runtime), `@flighthq/signals` (runtime, `stage.ts`), `@flighthq/types` (type + `*Kind` values). Plus relative `./displayObject` imports.
- **Used in tests only:** `@flighthq/entity` (`getEntityRuntime`), `@flighthq/geometry` (`createRectangle`).
- **Unused declared:** `@flighthq/textlayout` (declared, imported nowhere).
- **Phantom (used-but-undeclared):** `@flighthq/entity` (imported in tests, not declared) — phantom under the convention that every imported `@flighthq/*` is declared.
- **Pinning:** all workspace deps pinned `"*"`. OK.

Note: `npm run packages:check` passes (86 packages valid) and does **not** flag either the unused `textlayout` edge or the undeclared `entity` test import — this audit's cross-check (every declared dep imported, every import declared) is what surfaces both.
