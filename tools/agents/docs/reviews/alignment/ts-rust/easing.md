# TS↔Rust Alignment: @flighthq/easing

**Verdict:** Significant name drift — of 35 TS exports only 16 map cleanly; **7 functions are unported** (Circular ×3, Smoothstep + Smootherstep, CubicBezier, Steps), **12 abbreviate the type word** (Exponential→`expo`, Quadratic→`quad`, Quartic→`quart`, Quintic→`quint`), `easeLinear`→`linear` drops the `ease` prefix, and the `EasingFunction` type seam is renamed `EasingFn`; none of this is recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `EasingFunction` (type, `@flighthq/types`) | `EasingFn` / `lib.rs` | Type word abbreviated `Function`→`Fn`. Idiomatic Rust (the `Fn` trait / `fn` keyword), but it is a renamed type seam not in the divergence map. The authoritative type lives in `@flighthq/types`; Rust defines it locally as `pub type EasingFn = fn(f32) -> f32`. |
| `easeLinear` / `easeLinear.ts` | `linear` / `lib.rs` | `ease` prefix dropped. Every other family keeps `ease_*`; `linear` is the lone exception, breaking the 1:1 token map (`easeLinear` → expected `ease_linear`). |
| `easeInExponential`, `easeOutExponential`, `easeInOutExponential` / `easeExponential.ts` | `ease_in_expo`, `ease_out_expo`, `ease_in_out_expo` / `lib.rs` | Type word abbreviated `Exponential`→`expo`. Violates the full-unabbreviated-type-word rule; TS deliberately spells `Exponential`. |
| `easeInQuadratic`, `easeOutQuadratic`, `easeInOutQuadratic` / `easeQuadratic.ts` | `ease_in_quad`, `ease_out_quad`, `ease_in_out_quad` / `lib.rs` | Type word abbreviated `Quadratic`→`quad`. |
| `easeInQuartic`, `easeOutQuartic`, `easeInOutQuartic` / `easeQuartic.ts` | `ease_in_quart`, `ease_out_quart`, `ease_in_out_quart` / `lib.rs` | Type word abbreviated `Quartic`→`quart`. |
| `easeInQuintic`, `easeOutQuintic`, `easeInOutQuintic` / `easeQuintic.ts` | `ease_in_quint`, `ease_out_quint`, `ease_in_out_quint` / `lib.rs` | Type word abbreviated `Quintic`→`quint`. |
| `easeInCircular`, `easeOutCircular`, `easeInOutCircular` / `easeCircular.ts` | — (no Rust fn) | **Missing port.** Entire Circular family unimplemented. |
| `easeSmoothstep`, `easeSmootherstep` / `easeSmoothstep.ts` | — (no Rust fn) | **Missing port.** Both smoothstep variants unimplemented. |
| `easeCubicBezier(x1,y1,x2,y2)` / `easeCubicBezier.ts` | — (no Rust fn) | **Missing port.** The CSS cubic-bézier factory (WebKit `UnitBezier` solver) is absent. Returns `EasingFunction`; the Rust analogue would return `EasingFn` / a boxed closure. |
| `easeSteps(count, position)` / `easeSteps.ts` | — (no Rust fn) | **Missing port.** CSS `steps()` factory absent. Also drags the `StepPosition` type (`'jumpStart' \| 'jumpEnd' \| 'jumpNone' \| 'jumpBoth'`), which has no Rust equivalent. |
| per-file TS layout (`easeBack.ts` … `easeSteps.ts`, 14 files) | single `lib.rs` | File-name tracking (nice-to-have) not followed — one flat module vs 14 per-family TS files. Acceptable for a small math crate, but no Rust basename tracks any TS counterpart. |

Count: 35 TS exports → 28 Rust `pub fn`. 16 exact-token maps (Back ×3, Bounce ×3, Cubic ×3, Elastic ×3, Sine ×3, plus the `linear` near-map), 12 abbreviated, 7 unported. No extra/Rust-only functions.

## In sync

- **Crate name:** `@flighthq/easing` → `flighthq-easing` is identity. The divergence map's `tween-easing → easing` row (conformance.md:38) is the **applied audit trail** for the 2026-06-23 TS split of easing into its own top-level package, not stale — line 33 states all such renames are applied and now identity. Correct.
- **Cleanly mapped families (16):** Back, Bounce, Cubic, Elastic, and Sine all map 1:1 with full type words preserved (`easeInOutBack`→`ease_in_out_back`, `easeOutElastic`→`ease_out_elastic`, `easeInOutSine`→`ease_in_out_sine`). `easeLinear`→`linear` maps in spirit but drops the prefix (flagged above).
- **Conventions:** pure `t→value` math, no out-params, no sentinels, no `dispose*`/`destroy*`/`acquire*`/`release*` — nothing to carry. `f32` vs JS `number` is the standard mechanical numeric mapping. Endpoint guards (`t == 0 || t == 1`) for elastic/expo mirror the TS branches. Test coverage exists for every ported function (`test_ease_*`), satisfying the conformance coverage floor for the symbols that are present.

## Notes for the divergence map

`flighthq-easing` currently has **no per-function divergence entries**, yet it carries the most TS↔Rust drift of any leaf crate reviewed. None of the following is recorded, so each is silent drift the name-based structural gate cannot catch (it anchors on TS export _count/coverage_, and these abbreviated names will register as "covered" by name-token match for the families present, while the 7 missing families are a coverage gap the gate _should_ surface once per-export presence checking lands):

1. **Abbreviations (`expo`/`quad`/`quart`/`quint`, `EasingFn`):** either fix Rust to the full type words (`ease_in_exponential`, etc., and `EasingFunction`) to restore 1:1, or add explicit divergence rows with a rationale (e.g. "Rust uses the conventional short easing tokens"). Fixing is preferable — the full-word rule is a hard TS convention and there is no Rust idiom forcing `quad`/`quint`.
2. **`easeLinear` → `linear`:** restore `ease_linear` or record the prefix drop with a rationale.
3. **7 unported functions (Circular, Smoothstep, Smootherstep, CubicBezier, Steps) + `StepPosition`:** these are genuine coverage gaps, not divergences. Default expectation is to port them (CubicBezier/Steps return closures — `Box<dyn Fn(f32)->f32>` or similar — a real-but-small design decision). If intentionally deferred, they need an entry stating so; today they are simply absent with no record.
