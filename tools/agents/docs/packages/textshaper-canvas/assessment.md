---
package: '@flighthq/textshaper-canvas'
updated: 2026-06-24
basedOn: ./review.md
---

# textshaper-canvas — Assessment

Sorted from `review.md` (`solid — 82`). The prior `reviews/maturation/depth/textshaper-canvas.md` roadmap is the absorbed seed: its Bronze tier (letterSpacing/direction plumbing, no-DOM sentinel, ownership doc comment) and most of Silver (`getFontMetrics`, the advance cache + `clearCache`, `OffscreenCanvas` path) have **already landed** in this session — the review verifies them in source. What remains is two correctness defects the new code introduced, a couple of small within-package hardening items, and a set of cross-package / seam-convention forks the charter must settle. The charter is still a stub (North star / Boundaries / Decisions / Open directions all `TODO`), so "what complete means for the Canvas tier" is itself undecided — which keeps `Recommended` to the genuinely sweep-safe correctness work and routes every seam question to the charter's Open directions.

## Recommended

Strictly sweep-safe: within `@flighthq/textshaper-canvas`, no cross-package coupling, no breaking change, no open design decision.

- **Fix the advance-cache key to include `letterSpacing` (and every advance-affecting field the context sets).** The cache key is `${fontString}\x00${text}`, but `computeTextFormatFontString` encodes only italic/bold/size/family — _not_ `letterSpacing`. So the second measurement of any `(font, text)` pair with a different `letterSpacing` returns the first call's width on a cache hit, silently defeating the letterSpacing plumbing the session just added. Incorporate `letterSpacing` (minimally) into the key. Purely internal — no signature change, no seam change. — review.md (Gaps #1).

- **Add a colocated test that pins the cache-key fix.** jsdom's `measureText` returns 0 for everything, so no existing test catches a wrong width — but the _key_ can be tested directly: assert that two `measureText` calls differing only in `letterSpacing` do not collapse to one cache entry (e.g. spy/observe that the second call still sets `ctx.letterSpacing`, or assert distinct keying). This is the within-package regression guard for Gap #1; the _value_-correctness test is the cross-package functional scene parked below. — review.md (Gaps #1, #6).

- **Probe a descender glyph in the `getFontMetrics` ascent/descent fallback.** When `fontBoundingBox*` is undefined the code falls through to `actualBoundingBox*` of `'H'`, whose descent is ~0 (no descender), collapsing descent to near-zero on engines lacking `fontBoundingBox*`. Probe a glyph with a descender (e.g. `'g'`/`'y'`) for the fallback descent. Engine-dependent but a clear within-package correctness improvement with no design decision. — review.md (Gaps #4).

- **Make `getFontMetrics` return a non-zero `unitsPerEm` (identity `size`) rather than `0`.** `FontMetrics.unitsPerEm`'s own doc says to divide by `size / unitsPerEm` to convert back to font units; returning `0` makes a contract-following consumer divide by zero. Returning `unitsPerEm: size` makes the documented inverse a safe no-op (the identity Canvas can honestly supply, since it cannot read OS/2 font units). This is the within-package half of Gap #2 and needs no header change. _(The deeper "should the type carve out 0 = unavailable" question is a `@flighthq/types` decision — routed to Open directions; this item just stops the latent divide-by-zero today.)_ — review.md (Gaps #2).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Explicit `shapeRun: () => null` advances-only marker.** The backend relies on _absence_ of `shapeRun` rather than an explicit `null`-returning method; `TextShaper.ts` documents the protocol as "callers check for `shapeRun` availability and fall back." **Parked:** whether absence or an explicit marker is the blessed signal is a seam-wide convention affecting every advances-only backend — not a within-package call. Routed to Open directions. — review.md (Gaps #3).

- **`FontMetrics.unitsPerEm` "0 = unavailable, do not invert" carve-out.** The root fix for Gap #2 lives in the `@flighthq/types` `FontMetrics` doc, not here. **Parked:** cross-package, owned by the types-layout owner. (The Recommended identity-`size` mitigation makes this non-urgent but does not resolve the contract question.) Routed to Open directions. — review.md (Contract & docs fit, candidate revisions).

- **`TextFormat.wordSpacing` / `TextFormat.direction` fields + plumbing.** The backend hardcodes `ctx.wordSpacing = '0px'` / `ctx.direction = 'ltr'` because the format fields do not exist. **Parked:** adding these to `TextFormat` in `@flighthq/types` touches every text consumer — a deliberate multi-package header decision, not an omission in this package. Routed to Open directions. — review.md (Gaps #5).

- **Measurement↔rasterization parity test (functional/visual scene).** The single most important correctness property — measured advances equal the Canvas renderer's drawn extents — cannot be asserted in jsdom (`measureText` returns 0), and Gap #1 slipped through precisely because of that. **Parked:** the only meaningful test is a `tools/functional` scene, and _where it lives_ (owned here, or in `textlayout`/`render-canvas`) is itself an open direction. Cross-package. Routed to Open directions. — review.md (Gaps #6).

- **Wire `getFontMetrics` into `@flighthq/textlayout`.** The new metric is computed but unconsumed — layout/autoSize still uses size estimates instead of real Canvas-derived ascent/descent. **Parked:** cross-package; the consumer change lives in `textlayout`, not here. Routed to Open directions. — review.md (Candidate open directions #2).

- **Per-cluster advance segmentation via `Intl.Segmenter`** (caret/selection across combining marks and emoji ZWJ in the Canvas tier). **Parked:** the maturation seed's Gold item; whether it belongs in this package or in `textlayout`, and the cluster-shape type in `@flighthq/types`, are undecided. Larger than a sweep and design-gated. Routed to Open directions. — maturation seed (Gold); review.md (Candidate open directions #1).

- **Package Map entries for `@flighthq/textshaper-canvas` and `@flighthq/textshaper`.** `tools/agents/docs/index.md` still describes a hypothetical `@flighthq/text-shaping` as "designed, not yet built," but the seam now ships as `textshaper` + this backend. **Parked:** an admin-doc (Package Map) revision, not a code change in this cell — belongs to whoever maintains the codebase map. — review.md (Contract & docs fit, candidate revisions).

- **Remove the `ctx.letterSpacing` `unknown as Record<string, unknown>` cast on a future TS-lib bump.** A TypeScript lib lag, not a smell. **Parked:** informational; only actionable once the lib types catch up. — review.md (Contract & docs fit, candidate revisions).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a stub, so these are the questions a reviewer/assessor had to assume answers to; they are also why most of the backlog stays parked.

1. **North star / "Canvas tier complete" bar** — is advances + `getFontMetrics` the intended ceiling (everything glyph-level delegated to HarfBuzz), or is a richer measure tier (`Intl.Segmenter`-driven per-cluster advances for caret/selection) in scope for _this_ package vs. `textlayout`?
2. **Advances-only marker convention** (Gap #3) — is explicit `shapeRun: () => null` the blessed protocol, or is absence the signal? A seam-wide convention for every advances-only backend.
3. **`FontMetrics.unitsPerEm` contract** (Gap #2) — carve out "0 = unavailable, do not invert" in `@flighthq/types`, or keep the identity-`size` convention this backend now uses? (header decision)
4. **`TextFormat.direction` / `wordSpacing` fields** (Gap #5) — add to `@flighthq/types`? Touches every text consumer.
5. **Where the measurement↔rasterization parity test lives** (Gap #6) — a functional scene owned here, or in `textlayout`/`render-canvas`? It is the only test that catches bugs like the letterSpacing cache-key defect, so its home is load-bearing.
6. **`getFontMetrics` consumer** — wire the new metric into `@flighthq/textlayout` so layout uses real Canvas ascent/descent? (cross-package)
7. **Boundary with a future `textshaper-harfbuzz`** — state explicitly that glyph-level methods are permanently out of scope (missing-by-design) so a later agent does not read them as gaps. The `-formats` triad layer does **not** apply (a measure backend parses no font files), and signals do not apply (measurement is a pure query) — worth recording as non-goals so neither is added speculatively.
