# API Alignment: @flighthq/haptics

**Verdict:** Strongly aligned — the backend seam trio is a textbook match to its sibling command capabilities; the only open question is the `vibrateDevice` verb sitting outside the `triggerHaptic*` family.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `vibrateDevice` vs `triggerHapticImpact` / `triggerHapticNotification` / `triggerHapticSelection` | Verb-prefix asymmetry within the package's action set: three actions use the `triggerHaptic*` prefix, the fourth uses `vibrate*`. A reader scanning the barrel does not see `vibrateDevice` as a member of the same haptic-trigger family, and "Device" introduces a second type word ("Device") into a package otherwise named around "Haptic". The split is arguably intentional — `vibrate` is a raw, low-level motor primitive (duration in ms) while the others are semantic cues — but the naming does not signal that distinction; it just reads as inconsistent. | Decide whether `vibrate` is the same family or a deliberately separate primitive, then make the names say so. If same family: rename to `triggerHapticVibration(durationMs)` for symmetry. If deliberately a lower primitive: keep it distinct but consider documenting the tiering in the package doc so the asymmetry is legible rather than accidental. No change to the `HapticsBackend.vibrate` method name is needed (method names are scoped to the interface). |
| Info | `HapticImpactStyle`, `HapticNotificationType` | Two parallel parameter enums use different noun suffixes (`*Style` vs `*Type`) for the same role (a string-literal cue selector). Minor and arguably idiomatic (iOS calls these "impact style" and "notification type"), so this matches platform vocabulary rather than diverging. | No action required; flagged only for awareness. The platform-matching names are a valid design signal. |

## Clean

- **Backend seam trio is exact.** `createWebHapticsBackend()`, `getHapticsBackend()`, `setHapticsBackend(backend: HapticsBackend | null)` match `clipboard` / `shell` / `share` / `notification` 1:1 in name shape, signature, and the `| null` reset convention. This is the canonical command-capability pattern from the platform-suite section of the map.
- **Full unabbreviated type words throughout.** Every export spells out its type word: `Haptics` in the backend trio, `HapticImpact` / `HapticNotification` / `HapticSelection` in the triggers, `Device` in `vibrateDevice`. No abbreviations.
- **Globally unique barrel names.** All seven exports are package-qualified (`*Haptics*` / `*Device`) and will not collide across the SDK root barrel.
- **Sentinels, never throws.** Every trigger and `vibrateDevice` returns `boolean` (`false` when haptics are absent or the call fails); the web backend guards `navigator.vibrate` and wraps the call in `try/catch` returning `false`. This is exactly the "return sentinel for expected failure, throw only on misuse" rule, and matches the web-backend guard convention.
- **`get*` used correctly.** `getHapticsBackend` is the only `get*` and it returns an object (the backend), not a boolean — no getter/predicate confusion. The boolean-returning functions are commands (`trigger*` / `vibrate*`), not predicates, so the `has*`/`is*` rule does not apply.
- **Lazy default, no top-level side effects.** `getHapticsBackend` lazily creates the web default on first access (`_backend === null`), with module state (`_backend`, `webVibrate`) kept at the bottom of the file after the exports. `"sideEffects": false` holds — nothing registers or mutates shared state at import time.
- **Types in `@flighthq/types`.** `HapticsBackend`, `HapticImpactStyle`, `HapticNotificationType` are all defined in `packages/types/src/Haptics.ts` and imported, not inlined.
- **`import type {}` on its own line.** The single import is `import type { HapticImpactStyle, HapticNotificationType, HapticsBackend } from '@flighthq/types';` — no value imports mixed in.
- **`Readonly<>` not needed.** All parameters are primitives (`number`, string-literal unions) or the deliberately-mutated `backend` slot; no object parameter is mutated where it should not be, so the rule is satisfied by exemption.
- **No allocation / out-param / teardown surface.** The package has no `create*` of entity values, no hot-path math helpers, no pools, and no `dispose*`/`destroy*` — so the allocation-discipline, alias-safety, and teardown-verb rules have nothing to violate here.
