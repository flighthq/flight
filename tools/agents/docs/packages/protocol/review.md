---
package: '@flighthq/protocol'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - status.md
  - charter.md
  - source
  - changes.patch
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# protocol — Review

Merge-gate review of the `integration-b2824e3d8` delta for `@flighthq/protocol` against the approved baseline `origin/main (eb73c3d74)`. Judged on the seven harsh-standard axes. The package's _design_ in isolation is strong; the _delta as shipped_ does not compile, because the source was extended to depend on a `@flighthq/types` contract that the same change set never adds. That is a hard merge blocker, not a polish item.

## Verdict

**Revise before merge.** The new functions (`createProtocolUrl`, `parseProtocolUrl`, `isValidProtocolScheme`, `getProtocolLaunchUrl`, `getRegisteredProtocolSchemes`, `isProtocolSchemeDefault`, `removeProtocolSchemeAsDefault`, `registerProtocolSchemes`, `unregisterProtocolSchemes`, plus the pre-attach drain) are well-named, sentinel-clean, and well-tested — but they reference a `ParsedProtocolUrl` type and five `ProtocolBackend` methods that are **not in the head's `@flighthq/types/Protocol.ts`**. The candidate cannot typecheck as bundled.

## The blocking finding: types-first contract was not updated

`b2824e3d8:packages/protocol/src/protocol.ts` line 2 now imports a type the contract does not define:

```ts
import type { ParsedProtocolUrl, ProtocolBackend, ProtocolHandler } from '@flighthq/types';
```

and the new bodies call five `ProtocolBackend` methods that the interface does not declare — `b2824e3d8:packages/protocol/src/protocol.ts`:

```ts
const pending = backend.drainPendingUrls(); // attachProtocolHandler
return getProtocolBackend().getLaunchUrl(); // getProtocolLaunchUrl
return getProtocolBackend().getRegisteredSchemes(); // getRegisteredProtocolSchemes
return getProtocolBackend().isDefault(scheme); // isProtocolSchemeDefault
return getProtocolBackend().removeAsDefault(scheme); // removeProtocolSchemeAsDefault
```

But `b2824e3d8:packages/types/src/Protocol.ts` is **byte-identical to base** — its `ProtocolBackend` declares only `register` / `unregister` / `isRegistered` / `setAsDefault` / `subscribe`, and there is no `ParsedProtocolUrl`. The change set's diff (`changes.patch`) touches `packages/protocol/src/protocol.{ts,test.ts}` and the four protocol docs, and **contains no hunk for `packages/types/src/Protocol.ts`** (`grep '^diff --git .*types/src/Protocol' changes.patch` → empty). A repo-wide grep confirms `ParsedProtocolUrl`, `drainPendingUrls`, `getLaunchUrl`, `isDefault`, `removeAsDefault`, and `getRegisteredSchemes` exist _only_ inside the protocol package's own source and test — never in `@flighthq/types`.

Consequence: `tsc -b` over the head fails on the protocol crate. This violates the contract's types-first rule directly ("define its types in `@flighthq/types` first, then implement against them"). It is the delta — the new import and the new method calls are exactly the lines this change adds — so it is squarely in scope and not a critique of the approved base.

## Honesty failure compounding the blocker

`b2824e3d8:tools/agents/docs/packages/protocol/status.md` (the worker report carried in this change set) **claims** the type work was done:

> `packages/types/src/Protocol.ts` — `ProtocolBackend` interface extended: `getRegisteredSchemes` … `isDefault` … `removeAsDefault` … `getLaunchUrl` … `drainPendingUrls` … new type added: `ParsedProtocolUrl` interface …

No such edit exists in the change set. The status ledger asserts a contract change the code does not make — exactly the "claims match code" honesty axis failing. The fix is mechanical (land the type edits), but the merge cannot proceed on a report that misstates what shipped.

## The seven axes

1. **Composition / bedrock — PASS.** Flat free functions; no config-gated branches, no fused subjects. `parseProtocolUrl`/`createProtocolUrl` are correctly colocated payload helpers, not a premature `protocol-url` split.
2. **Naming clarity — PASS.** Every new export carries the full unabbreviated type word and is globally self-identifying: `getProtocolLaunchUrl`, `isProtocolSchemeDefault`, `removeProtocolSchemeAsDefault`, `getRegisteredProtocolSchemes`, `registerProtocolSchemes`, `unregisterProtocolSchemes`, `isValidProtocolScheme`. `get*`/`is*` prefixes are correct.
3. **Tree-shaking / bundle invariant — PASS.** `package.json` keeps `"sideEffects": false`, a single `.` export, and no top-level side effects; the new module-bottom statics (`_schemePattern`, `_reservedSchemes`, `_safeDecode`) are inert until called.
4. **Registry vs closed union (fork B) — N/A.** No `kind`/handler family here; the backend seam is a single swappable interface, which is the right shape.
5. **Subject triad + plurality guard — PASS.** No format codec or backend-per-technology split is warranted; the single web default + native-host seam is correct, and the charter already parks App-Link / association-file work as siblings.
6. **Contract hygiene — FAIL (blocking).** Types-first is broken (see above). Sub-points that _are_ right: sentinels (`null`/`false`/`[]`) not throws; `Readonly<Partial<ParsedProtocolUrl>>` on `createProtocolUrl`'s input; `dispose*` used correctly (detach-to-GC, no resource freed). The claimed `query: Readonly<Record<string, string>>` cannot be checked because the type is absent; note `parseProtocolUrl` builds a **mutable** `Record<string, string>` and returns it as the field, so when the type lands, `ParsedProtocolUrl.query` should be `Readonly<Record<string,string>>` with the builder reading into a local before the return object is shaped.
7. **Tests & honesty — MIXED.** The colocated `protocol.test.ts` is excellent in coverage: alphabetized `describe` blocks mirroring every export, the pre-attach drain, idempotent reattach, round-trip parse/build, reserved-scheme rejection, batch partial-failure. **But** the suite is built against a `fakeBackend` that hand-implements the five missing methods, so the tests only compile if the types exist — they encode the intended contract while the contract file does not. The suite being green in the worker's tree is consistent with the type edit having been staged locally; it was not captured in this change set.

## Where the contract/admin docs are fine

The charter (`draft: true`) already frames this package accurately — command+event capability, web default, host seam, parse/build colocated, App-Link parked. No charter revision is needed; the problem is entirely a missing code hunk plus an over-claiming status entry.

## Score

58/100. The design is `solid`-grade and the tests are AAA, but a merge candidate that does not typecheck cannot score as `solid`; `partial` with a single, mechanical, hard blocker is the honest read. Land the `@flighthq/types/Protocol.ts` edits the source already assumes and this returns to the low 90s.
