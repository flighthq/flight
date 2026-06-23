# Filename Alignment: @flighthq/tween

**Verdict:** Mostly clean — this is a single-implementation domain package (no backend variants, so no backend prefix applies); most files name a tween domain/object, but `internal.ts` is a generic catch-all and `updateTweens.ts` is named after a single function while housing the broader tween-update/tick lifecycle.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `internal.ts` | Generic, no-domain name (a "dumping ground" / private-helper bucket). It actually holds `initializeTween` — tween initialization (start/change computation, smart-rotation normalization). The bare filename names nothing about the domain. | `tweenInitialization.ts` (or fold `initializeTween` into `tween.ts` and drop the file). |
| `updateTweens.ts` | Named after a single exported function (`updateTweens`) rather than the domain. It also houses `completeTween` and the private `updateTween` — i.e. the tween advance/tick/complete lifecycle, not just one entry point. Filenames should name the domain, not one function. | `tweenUpdate.ts` (the tween-update/tick domain), grouping `updateTweens` / `updateTween` / `completeTween`. |

## Clean

These name a tween domain/object and need no backend prefix (single-implementation package; the package name disambiguates):

- `tween.ts` — the core `Tween` domain: `createTween`, `applyTween`, `pause*`/`resume*`/`stop*`/`reset*` lifecycle. Names the central object.
- `tweenManager.ts` — the `TweenManager` object: `createTweenManager` (+ default manager). Names the object.
- `colorTween.ts` — the color-tween object/domain: `createColorTween` (packed-RGB component interpolation). Names the specialized tween variant.
- `timer.ts` — the tween-timer concept: `createTweenTimer` (a target-less duration tween). A timer is a legitimate named object, not an arbitrary single-function split; acceptable, though `tweenTimer.ts` would tie it explicitly to the package vocabulary.
- `index.ts` — barrel re-export (legitimate index, not a dumping ground).

Tests are colocated as `<source>.test.ts` and mirror each source filename exactly (`tween.test.ts`, `tweenManager.test.ts`, `colorTween.test.ts`, `timer.test.ts`, `updateTweens.test.ts`). Note: `internal.ts` has no colocated test, and any rename of `internal.ts` / `updateTweens.ts` should carry its test file along.
