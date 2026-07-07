---
package: '@flighthq/network'
status: partial
score: 45
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/network/src/network.ts
  - head/packages/network/src/network.test.ts
  - head/packages/types/src/Network.ts
  - changes.patch (packages/network slice)
  - status.md (as-claimed)
---

# network — Review (merge gate: integration-b2824e3d8 → origin/main eb73c3d74)

## Verdict

**partial — 45/100. REVISE before merge.** The _design_ of the delta is good — full NetInfo field surface, two edge signals, a status diff, a one-shot reachability probe seam — and on its own the runtime code is canonical Flight. But the integration branch as bundled is **broken**: the runtime change in `network.ts` depends on type-level additions to `@flighthq/types/src/Network.ts` that the integration HEAD does **not** contain. `b2824e3d8:head/packages/types/src/Network.ts` is byte-identical to the approved base — it still declares the 6-member `NetworkConnectionType`, the 4-field `NetworkStatus`, the 3-signal `Network`, and a `NetworkBackend` with no `detectReachability`. The runtime references at least nine symbols/fields/methods that do not exist in that file. **This delta does not typecheck.** The score is not a judgement of the design (which would score in the high 80s if its types shipped) — it is a merge-gate judgement of the artifact actually presented, which fails to compile.

This is the dominant finding and the reason for the REVISE: the integration carries the `network.ts` + `network.test.ts` + docs hunks but **dropped the `packages/types/src/Network.ts` hunk** they were written against. The package's own approved `status.md`/`review.md`/`assessment.md` (all dated 2026-06-24) describe the type changes as shipped — they were written against a worktree where the types file _was_ edited (the prior review cites `dist/network.d.ts, 15 exports`). Those claims do not hold against this bundle's HEAD.

## The blocker — types-first violated; delta does not compile

`changes.patch` touches `packages/network/src/network.ts`, `packages/network/src/network.test.ts`, and the four `agents/packages/network/*.md` docs — and **no** `packages/types/src/Network.ts` hunk exists (verified: `grep '^diff --git.*packages/types/src/Network'` over the patch returns nothing). The runtime then imports and reads type-level surface that base `@flighthq/types` never defines:

- **Undefined type imports** — `b2824e3d8:head/packages/network/src/network.ts:6-7`:

  ```ts
  NetworkReachability,
  NetworkReachabilityOptions,
  ```

  Neither is exported from `@flighthq/types` (`grep -rln 'NetworkReachability' head/packages/types/` → empty). `detectNetworkReachability` (`:184-187`) annotates its params with both. → `TS2305` (no exported member).

- **Undefined `NetworkStatus` fields** — `:75/77/78/79`, `:156-160`, `:166`, `:176`, and `:20/32-34`:

  ```ts
  out.downlinkMax = typeof conn?.downlinkMax === 'number' ? conn.downlinkMax : -1;
  out.rtt = typeof conn?.rtt === 'number' ? conn.rtt : -1;
  out.saveData = conn?.saveData === true;
  out.metered = out.saveData || out.type === 'cellular';
  ```

  `NetworkStatus` in `b2824e3d8:head/packages/types/src/Network.ts:5-12` has only `online`, `type`, `downlink`, `effectiveType`. `downlinkMax`/`rtt`/`saveData`/`metered` do not exist on the type. → `TS2339` on every read/write.

- **Undefined `Network` signals** — `:30`, `:34`, `:44-45`:

  ```ts
  emitSignal(net.onConnectionTypeChange, status.type);
  emitSignal(net.onMeteredChange, status.metered);
  ```

  `Network` (`:24-28` of head types) declares only `onChange`/`onOnline`/`onOffline`. → `TS2339`.

- **Undefined `NetworkBackend.detectReachability`** — `:82`, `:189-195`:

  ```ts
  if (backend.detectReachability !== undefined) {
    return backend.detectReachability(options, out);
  ```

  `NetworkBackend` (`:17-21` of head types) declares only `getStatus`/`subscribe`. → `TS2339`.

- **Narrowed `NetworkConnectionType`** — `mapWebConnectionType` (`b2824e3d8:head/packages/network/src/network.ts:250-257`) returns `'other'`, `'vpn'`, `'wimax'`, but the head union (`:3` of head types) is `'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'none' | 'unknown'`. → `TS2322` (string literal not assignable to the narrower return type).

Even the new test file fails: `b2824e3d8:head/packages/network/src/network.test.ts:23-33` builds a `NetworkStatus` literal with `downlinkMax`/`rtt`/`saveData`/`metered`, and `:94`/`:118` connect `net.onConnectionTypeChange`/`net.onMeteredChange`. `tsc -b` typechecks `src/*.test.ts`, so this compounds the failure rather than masking it.

This is a direct violation of the contract's types-first rule ("define its types in `@flighthq/types` first, then implement against them"). The fix is mechanical but mandatory: the `Network.ts` type additions the runtime was written against must be part of the same merge, or the runtime must be reverted to the base shape. The two halves cannot land separately.

## Design assessment (assuming the types ship)

Held to the harsh standard, the _runtime delta_ — if its types were present — is strong. Recorded so the must-fix brief separates "broken integration" from "bad design":

- **Composition / bedrock (pass).** Each addition is a separate free function — `hasNetworkStatusChanged`, `isNetworkMetered`, `isNetworkSaveDataEnabled`, `detectNetworkReachability`. The probe is its own function, not a config branch inside `getNetworkStatus`, so a status-only importer never pulls `fetch`/`AbortController`. No subject-fusion.
- **Naming (pass).** Every export carries the full `Network` word; booleans use `is*`/`has*`; `detectNetworkReachability` reads exactly. Backend-internal `getStatus`/`subscribe`/`detectReachability` are interface methods, correctly unprefixed.
- **Tree-shaking (pass).** `sideEffects: false`, single root export (`index.ts` → `export * from './network'`), module state (`_backend`/`_scratch`/`_subscriptions`) at file bottom, no top-level registration. The probe path is separately importable.
- **Registry vs union (pass).** `mapWebConnectionType` is a closed `switch` — correct: it is a web-backend-private string normalizer with a `default → 'unknown'`, not a user-extensible dispatch. Fork B does not apply.
- **Subject triad (n/a).** No format codecs or backends introduced; the web backend is the in-cell default, consistent with the event-capability shape.
- **Contract hygiene (pass on out-params / sentinels; FAIL on types-first).** `getNetworkStatus(out)`, `detectNetworkReachability(options, out)`, and `hasNetworkStatusChanged(a, b)` read inputs before writing (`hasNetworkStatusChanged` is alias-safe by construction — pure reads). Sentinels (`-1`/`''`/`false`) throughout; the probe returns a sentinel, never throws. `Readonly<>` on diff params and the probe options. The single contract failure is types-first (above).
- **Tests & honesty (mixed).** Tests are colocated, alphabetized, mirror exports, and cover edge signals, idempotency, alias-safe diff, and the probe SSR/backend-delegation paths — good discipline. But they **do not compile** against the bundled types (same root cause), and the `status.md` claim block (`:19-32`) asserts `packages/types/src/Network.ts` was changed when the bundle shows it was not — the honesty axis fails on the claim/code mismatch.

## Secondary observations (not blockers; surface for the charter)

- **`detectNetworkReachability` fallback allocates a backend per call** — `b2824e3d8:head/packages/network/src/network.ts:193`: when the active backend lacks `detectReachability`, the fallback calls `createWebNetworkBackend()` fresh on every probe. Minor (probes are rare), but it also _silently routes a native app's probe through the web `fetch` path_ — the charter's Open direction 3 (fork D seam). A deliberate ruling is owed: web-fetch fallback always, vs. sentinel-when-backend-lacks-probe.
- **`anyAbortSignal` composite fallback** — `:227-231`: when `AbortSignal.any` is absent, two `'abort'` listeners are added with `{ once: true }` but never removed from the non-firing signal. Benign for short-lived probes (already flagged in `status.md` concerns), but worth a comment noting the lifetime assumption.
- **`metered` web heuristic** — `:79`: `saveData || type === 'cellular'` mis-classifies cellular-tethered WiFi and unlimited cellular plans. By-design for the web backend; only a native OS-metered flag fixes it. Not a defect — charter Open direction 6.

## Charter contradictions

None on intent. The charter (DRAFT) North star #3 explicitly requires the full shape "navigable from the header layer alone" in `@flighthq/types` — which is exactly what this bundle fails to deliver, so the delta _contradicts the charter's own stated direction_ by shipping runtime ahead of (without) its header. The charter line 65 ("the TS type shape settles … which, with this delta, it largely has") was written believing the type delta was included; it is not.

## Contract & docs fit

- **Types-first: FAIL** (the blocker above). This is the one hard contract miss and it gates the merge.
- Everything else the prior approved review credited — unabbreviated names, out-params, sentinels, single root export, `Readonly<>` — holds for the runtime code and would pass once the types ship.
- The `status.md` "as-claimed" block is now demonstrably _not_ review-verified against this bundle: its `Types (packages/types/src/Network.ts)` section describes changes absent from HEAD. A review pass must mark that block unverified rather than promote it.
