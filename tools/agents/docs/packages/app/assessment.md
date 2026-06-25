---
package: '@flighthq/app'
updated: 2026-06-25
basedOn: ./review.md
---

# app — Assessment

Recommendation layer over [`review.md`](./review.md) (`reject — 38/100`), for the **integration delta** (`b2824e3d8`, head vs `origin/main` base `eb73c3d74`). This supersedes the prior `solid — 84` assessment, which was earned by the **builder** bundle where the `@flighthq/types` header carried the full surface. The integration tree under review **dropped that header**, so the delta does not typecheck and the verdict is `reject`.

The shape of the work here is unusual: the `app.ts`/`app.test.ts` implementation is high quality and would be approve-as-is — the failure is a **missing-header re-merge problem, not a redesign**. So the decisive must-fix is _cross-package_ (re-land the `@flighthq/types` header) and lives in the dispatch brief, not in `Recommended`. What remains for `Recommended` is the two genuinely sweep-safe, within-`app` minor cleanups the review verified. Everything else is parked or routed to the charter's Open directions.

## Recommended

Sweep-safe: within `@flighthq/app`, no cross-package coupling, no breaking change, no open design decision. Both are minor and verified by direct file inspection.

- **Fix the `subscribeReady` web fill — dead binding + no-op unsubscribe.** `head/packages/app/src/app.ts:237-242`: `subscribeReady(listener) { const id = Promise.resolve().then(() => listener()); void id; return () => {}; }`. The `id`/`void id` is a dead binding — the promise is fire-and-forget regardless — and the returned unsubscribe is a no-op, so a listener registered and immediately unsubscribed still fires on the next microtask, breaking the unsubscribe contract. Drop the binding to `Promise.resolve().then(() => listener());`, and optionally capture a `cancelled` flag so the returned unsubscribe actually prevents the deferred call. In-package, web-only, no signature change. — review.md (lower-severity notes, `subscribeReady` dead binding)
- **Reorder `getLoginItem` into the contiguous `get*` keys.** In `createWebAppBackend`, `getLoginItem` (`head/packages/app/src/app.ts:144`) sits after `getSystemLocale` (`:137`) and before `getName` (`:147`), out of object-key alpha order among the `get*` keys. Cosmetic — object-literal keys are not policed by `npm run order`, so this is not a CI failure — but it breaks the scan-ability the surrounding alpha ordering sets up. Move `getLoginItem` up with the other `get*` keys. — review.md (lower-severity notes, web-backend object keys)

## Backlog

Parked — each says why it is not sweep-safe.

- **Re-land the enriched `@flighthq/types` `App` header (the decisive blocker).** _Parked: cross-package, and it is the gate, not a sweep._ The delta's `app.ts` imports `AppActivationPolicy`, `AppLoginItem`/`AppLoginItemLike`, `AppPathKind` and references six signals + a ~40-method `AppBackend` that the in-tree `head/packages/types/src/App.ts` (byte-identical to the approved base, 3 signals / 17-method backend) does not declare; `app.test.ts:2` imports `AppLoginItem`/`AppLoginItemLike` for the same reason. `tsc -b` fails on both files. The header exists in the builder bundle (`builder-67dc46d64`) but was dropped on the way into the integration branch. This is the **merge gate** and belongs to the integration worker, not a within-`app` sweep — routed to the dispatch brief as the single MUST-FIX-BEFORE-MERGE. The `app.test.ts` compile failure is the same root cause and resolves automatically once the header lands; no test rework is needed. — review.md (BLOCKING; Tests & honesty)
- **Re-check `AppLaunchKind` / `AppMemoryPressure` orphan status when the header returns.** _Parked: depends on the re-landed header, and forks on `app`-vs-`lifecycle` ownership._ The prior baseline flagged these as types-without-implementers; in this integration tree the files do not exist either (the whole enriched header is missing), so the orphan concern is moot _here_. When the header is re-landed, re-check whether these come with it and remain unimplemented; if so, the wire-or-retract decision reapplies. The retract half could become a sweep once the header is back; the wire half is an Open direction (app vs `@flighthq/lifecycle`). — review.md (Orphaned-types carry-over)

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). This reject is fundamentally an integration drop, so it raises no _new_ design forks — but it touches two standing ones the charter already carries:

1. **The header-leads-the-code discipline.** This delta is the failure mode the charter's proposed North star already names ("the header may lead the code, but dead surface is a debt"): here the inverse — the _code_ led the header into the integration tree without it. Worth a Decision that the types header and its implementer must land together (the types-first rule), so a header drop is caught as a build failure rather than shipped. — review.md (BLOCKING, "types-first violation in reverse")
2. **`AppLaunchKind` / `AppMemoryPressure` ownership** (charter Open direction 1) — re-applies once the header is re-landed and these resurface as orphans. Settle app-vs-`@flighthq/lifecycle` ownership and then wire or retract.
