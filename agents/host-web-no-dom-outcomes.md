# Host-web document-absence outcomes

_Filed 2026-08-29 as a post-Accessibility R17 census. This is follow-up evidence, not authorization to widen the Accessibility migration._

## Trigger and population

The exact predicate is every production occurrence of `typeof document === 'undefined'` under `packages/host-web/src`, excluding tests. At the Accessibility migration floor it yields ten guards. `webBitmapReadback.ts` is the sole truthful precedent: absence returns `{ bitmap: null, reason: 'no-canvas' }`. The other nine return a sentinel/no-op whose signature does not name document absence:

1. `webInputTarget.ts` pointer-lock exit — resolved `Promise<void>`.
2. `webLoop.ts` visibility — `true`.
3. `webPower.ts` resume subscription — empty unsubscribe.
4. `webPower.ts` suspend subscription — empty unsubscribe.
5. `webMenu.ts` popup — `null`.
6. `webStatusbar.ts` background color — `void`; only ambient observation records false.
7. `webWindow.ts` visibility subscription — `noop`.
8. `webWindow.ts` fullscreen exit — `false`.
9. `webWindow.ts` fullscreen subscription — `void`.

## First resolved slice

Pointer-lock exit now returns the method-tight reason-only outcome `ok | api-unavailable |
operation-failed`. Document absence is therefore observable as `api-unavailable`; an already-unlocked
document is `ok`, and only an observed successful release clears core provider provenance. Pointer-lock
request independently reports `target-not-found | api-unavailable | denied | operation-failed | ok`, so
an unknown provider-bound target can no longer masquerade as acquisition and pin the Web provider.

## Follow-up

After Accessibility lands, continue the R17 host-web pass over the remaining eight operations and derive named result or event-construction contracts. Do not copy Accessibility or pointer-lock reasons mechanically: each operation must advertise only failures it can reach. Host-web also contains absent-`window`, absent-`navigator`, and individual-API guards; a wider follow-up must explicitly rule and restate its population instead of silently treating the ten-document-guard census as the whole availability universe.
