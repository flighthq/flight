---
package: '@flighthq/statusbar'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/statusbar

The `builder-67dc46d64` pass closed the entire Bronze tier, both Silver halves (animation + event capability), and most of Gold (style stacking, animated color) from the prior maturation roadmap. The remaining work is small and falls into two buckets: a handful of sweep-safe within-package completions, and a set of design/cross-package questions that belong to the charter's Open directions rather than to Recommended. `flighthq-statusbar` (the Rust crate) is declared but unbuilt — the single largest distance to authoritative — and is parked as cross-cell work pending a milestone decision.

No structural-fork tension applies here: the domain has no `kind` switch (no registry fork), no plurality of formats or backends beyond the established web/native `*Backend` seam (no triad layer — the roadmap itself notes `-formats` does not apply), and proposes no new package (no bedrock test). The style stack is the one within-loop assembly, and the recommendations below add separately-callable helpers over it rather than new branches, respecting the bundle invariant.

## Recommended

Sweep-safe: all within `@flighthq/statusbar` (plus its `@flighthq/types` header), no cross-package coupling, no breaking change, no open design decision. Each is grounded in the review's Gaps or the roadmap's Gold tier.

1. **`hasStatusBarStyleEntry(handle): boolean`** — the missing `has*` query that completes the push/pop/has trio, letting a consumer check whether a pushed entry is still live. Pure additive read over the existing module stack; matches the `has*`-prefix convention. (review.md Gaps; roadmap Gold style-stacking slot.)

2. **`clearStatusBarStyleStack(): void`** — drop the whole style stack and re-apply the (now empty) merged top. Additive, no design decision (the stack already exists and is module-owned). Retires the `afterEach` `0..99`-pop teardown hack the tests currently rely on, and serves as a debug affordance. (review.md Gaps; roadmap Gold edge-case/test hardening.)

3. **Document the `createStatusBarInfo` `visible: true` default as a deliberate choice.** A zeroed snapshot currently claims the bar is visible before any backend read; on a host that starts hidden this is a stale default until `getInfo` runs. Add a one-line doc-comment in `StatusBar.ts` / the constructor recording that "most platforms start visible" is the intended assumption. Pure docs, no behavior change. (review.md Gaps.)

4. **Edge-case test + package-doc hardening** (roadmap Gold item 6): extend tests to cover `getInfo` reading back a host-set color, the stack merge order, no-document/SSR guards on every web path, and `-1` height-sentinel propagation; add the package-level doc-comment block describing the seam, the stacking contract, and (deferring the cross-package wording to Open direction 2) the height-ownership note. All within-package; no seam change.

## Backlog

Parked — each waits on a cross-package decision, a charter Open direction, or spans another cell.

- **Rust crate `flighthq-statusbar`** — declared in the charter front matter, not built. The status doc spells out the intended seam (the `StatusBarBackend` trait, the free functions, the `native`-gated no-op default, the `host-web` theme-color fill). Parked: it is a separate cell (`crates/…`) and a milestone-scope decision (Open direction 1 — does the no-op `native` default count as conformant, or is a mobile-native backend required?). Do last regardless, so the TS seam is stable first.

- **Package Map line revision in `tools/agents/docs/index.md`** — the map still describes statusbar as "mobile status-bar style, visibility, color", predating the read side, animation, change notification, and style stacking. Parked: it edits a shared cross-package doc, not the `@flighthq/statusbar` source, so it is outside the sweep boundary. Candidate revision: widen the line to mention the query/info snapshot and the event entity.

- **`enableStatusBarSignals` no-op marker — keep or drop.** It is decorative today (statusbar's signals carry no `enable*`-style cost) and the sibling `@flighthq/network` has no equivalent. Parked: resolving it is a platform-suite-wide ruling (every event capability — network/power/lifecycle/keyboard/sensors — at once), not a statusbar-local change. → Open direction 3.

## Approved

_None. Approval is the user's verbal gate._

## Notes for the charter's Open directions

These came up in the review/roadmap as questions the assessment must not decide autonomously. Surface them into `charter.md › Open directions` (do not edit the charter here):

1. **Rust crate priority & conformance bar.** Is `flighthq-statusbar` in this milestone, and does the no-op `native` default backend (desktop has no status bar) count as conformant, or does it need a Capacitor-style mobile-native backend to be "done"?
2. **Height vs. `@flighthq/device` safe-area top inset.** On notched/island devices `device.getSafeAreaInsets().top` differs from the bar's intrinsic height. Is documentation-only the blessed boundary, or should `getStatusBarHeight()` forward through `device` on native? A real cross-package fork — gates the final wording of Recommended item 4's doc block.
3. **`enable*Signals` policy across event capabilities.** Suite-wide symmetry (every event capability carries the marker) vs. dropping statusbar's no-op to match `network`.
4. **Style-stack ownership model.** Is the process-global module-level stack the intended design (one OS bar → one stack)? The `clear`/`has` helpers (Recommended 1–2) are sweep-safe regardless, but blessing the module-global model is the deliberate ruling the review asks for.
5. **Style vocabulary.** `'light' | 'dark' | 'default'` maps to iOS `lightContent`/`darkContent` by intent. Bless that mapping, or add explicit `'lightContent'`/`'darkContent'` aliases?

> The prior `reviews/maturation/depth/statusbar.md` roadmap is fully absorbed into this assessment (Bronze/Silver/most-of-Gold landed in `builder-67dc46d64`; the residue is the Recommended and Backlog above) and can be removed as one-time seed.
