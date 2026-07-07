---
package: '@flighthq/textshaper-canvas'
updated: 2026-06-25
basedOn: ./review.md
---

# textshaper-canvas — Assessment (merge gate)

Sorted from `review.md` (`solid — 80`), judging the `integration-b2824e3d8` delta against the approved `origin/main` (`eb73c3d74`) floor. The delta is a clean enlargement of the Canvas measure tier; what remains for a clean merge is two within-package correctness defects the new code introduced. Everything cross-package or seam-shaped is parked, because the charter is still a stub (North star / Boundaries / Decisions / Open directions all `TODO`) and "what complete means for the Canvas tier" is itself undecided.

## Recommended

Strictly sweep-safe: within `@flighthq/textshaper-canvas`, no cross-package coupling, no breaking change, no open design decision.

- **Fix the advance-cache key to include `letterSpacing` (and every advance-affecting field the context sets).** The key is `${fontString}\x00${text}` (`canvasTextShaper.ts:83`), but `computeTextFormatFontString` encodes only style/weight/size/family — not `letterSpacing` — and the cache lookup short-circuits (lines 85-86) before `ctx.letterSpacing` is set (lines 93-95). The letterSpacing plumbing this delta adds is dead on the second measurement of any `(font, text)` pair. Incorporate `letterSpacing` into the key. Purely internal — no signature/seam change. — review.md §7.

- **Add a colocated regression test that pins the cache-key fix.** jsdom's `measureText` returns 0, so a width assertion is impossible — but the _key_ is testable: assert that two `measureText` calls differing only in `letterSpacing` do not collapse to one cache entry (observe the second call still sets `ctx.letterSpacing`, or assert distinct keying). The within-package guard for the §7 defect; the value-correctness test is the parked functional scene. — review.md §7.

- **Return a non-zero `unitsPerEm` (identity `size`) from `getFontMetrics` instead of `0`.** `FontMetrics`'s own doc says callers divide by `unitsPerEm`; returning `0` (line 76) makes a contract-following consumer divide by zero. `unitsPerEm: size` makes the documented inverse a safe no-op — the identity Canvas can honestly supply, since it cannot read OS/2 font units. Within-package half of the §6 defect; no header change. — review.md §6.

- **Probe a descender glyph in the `getFontMetrics` ascent/descent fallback.** When `fontBoundingBox*` is undefined the code falls through to `actualBoundingBox*` of `'H'` (lines 61-62), whose descent is ~0, collapsing descent to near-zero on engines lacking `fontBoundingBox*`. Probe `'g'`/`'y'` for the fallback descent. Engine-dependent, no design decision. — review.md "Minor".

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **`FontMetrics.unitsPerEm` "0 = unavailable, do not invert" carve-out.** The root fix for the divide-by-zero contract clash lives in the `@flighthq/types` `FontMetrics` doc, not here. **Parked:** cross-package, owned by the types-layout owner. The Recommended identity-`size` mitigation stops the trap today but does not resolve the contract question. Routed to Open directions. — review.md "Candidate revisions".

- **Explicit `shapeRun: () => null` advances-only marker.** The backend relies on _absence_ of `shapeRun` rather than an explicit `null`-returning method. **Parked:** whether absence or an explicit marker is the blessed signal is a seam-wide convention affecting every advances-only backend — not a within-package call. Routed to Open directions.

- **`TextFormat.wordSpacing` / `TextFormat.direction` fields + plumbing.** The backend hardcodes `ctx.wordSpacing = '0px'` / `ctx.direction = 'ltr'` (lines 97, 103) because the format fields do not exist. **Parked:** adding them to `TextFormat` touches every text consumer — a deliberate multi-package header decision. Routed to Open directions. — review.md §6.

- **Measurement↔rasterization parity test (functional/visual scene).** The single most important correctness property — measured advances equal the Canvas renderer's drawn extents — cannot be asserted in jsdom, and the cache-key defect slipped through precisely because of that. **Parked:** the only meaningful test is a `tools/functional` scene, and _where it lives_ (owned here, or in `textlayout`/`render-canvas`) is itself an open direction. Cross-package. Routed to Open directions. — review.md §7.

- **Wire `getFontMetrics` into `@flighthq/textlayout`.** The new metric is computed but unconsumed — layout/autoSize still uses size estimates. **Parked:** cross-package; the consumer change lives in `textlayout`. Routed to Open directions.

- **Per-cluster advance segmentation via `Intl.Segmenter`** (caret/selection across combining marks and emoji ZWJ in the Canvas tier). **Parked:** Gold-tier; whether it belongs here or in `textlayout`, and the cluster-shape type in `@flighthq/types`, are undecided. Larger than a sweep and design-gated. Routed to Open directions.

- **Package Map entries for `@flighthq/textshaper-canvas` and `@flighthq/textshaper`.** `agents/index.md` still describes a hypothetical `@flighthq/text-shaping` as "designed, not yet built," but the seam now ships as `textshaper` + this backend. **Parked:** an admin-doc revision, not a code change in this cell. — review.md "Candidate revisions".

- **Remove the `ctx.letterSpacing` `unknown as Record<string, unknown>` cast on a future TS-lib bump.** A TypeScript lib lag, not a smell. **Parked:** informational; actionable only once lib types catch up. — review.md "Minor".

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a stub, so these are the questions a reviewer/assessor had to assume answers to; they are also why most of the backlog stays parked.

1. **North star / "Canvas tier complete" bar** — is advances + `getFontMetrics` the intended ceiling (everything glyph-level delegated to HarfBuzz), or is a richer measure tier (`Intl.Segmenter`-driven per-cluster advances for caret/selection) in scope for _this_ package vs. `textlayout`?
2. **Advances-only marker convention** — is explicit `shapeRun: () => null` the blessed protocol, or is absence the signal? A seam-wide convention for every advances-only backend.
3. **`FontMetrics.unitsPerEm` contract** — carve out "0 = unavailable, do not invert" in `@flighthq/types`, or keep the identity-`size` convention this backend now uses? (header decision)
4. **`TextFormat.direction` / `wordSpacing` fields** — add to `@flighthq/types`? Touches every text consumer.
5. **Where the measurement↔rasterization parity test lives** — a functional scene owned here, or in `textlayout`/`render-canvas`? It is the only test that catches bugs like the letterSpacing cache-key defect, so its home is load-bearing.
6. **`getFontMetrics` consumer** — wire the new metric into `@flighthq/textlayout` so layout uses real Canvas ascent/descent? (cross-package)
7. **Boundary with a future `textshaper-harfbuzz`** — state explicitly that glyph-level methods are permanently out of scope (missing-by-design) so a later agent does not read them as gaps. The `-formats` triad layer does **not** apply (a measure backend parses no font files), and signals do not apply (measurement is a pure query) — worth recording as non-goals so neither is added speculatively.
