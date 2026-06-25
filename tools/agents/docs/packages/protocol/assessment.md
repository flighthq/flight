---
package: '@flighthq/protocol'
updated: 2026-06-25
basedOn: ./review.md
---

# protocol — Assessment

> Recommendations over `review.md` (partial, 58/100 — a merge-gate read of the `integration-b2824e3d8` delta vs the approved base `origin/main (eb73c3d74)`). The prior assessment scored this `solid` 90/100 on the assumption the worker's claimed `@flighthq/types/Protocol.ts` extension had landed; it did not. The whole custom-scheme feature set is well-designed and AAA-tested, but the change set is **not mergeable as shipped**: the source imports a `ParsedProtocolUrl` type and calls five new `ProtocolBackend` methods that the change set never adds to `@flighthq/types`, so the head does not typecheck. The first Recommended item below is that hard blocker; the rest of the backlog is unchanged in substance from the prior pass.

## Recommended

Sweep-safe: within `@flighthq/protocol` (plus the package's own contract file in `@flighthq/types`, which the source already assumes), no open design decision. Item 1 is a **merge blocker**, not optional polish.

1. **Land the `@flighthq/types/Protocol.ts` contract the source already depends on (BLOCKING).** Add the `ParsedProtocolUrl` interface (`{ scheme: string; host: string; path: string; query: Readonly<Record<string, string>> }`) and extend `ProtocolBackend` with the five methods the source calls: `getRegisteredSchemes(): readonly string[]`, `isDefault(scheme: string): boolean`, `removeAsDefault(scheme: string): boolean`, `getLaunchUrl(): string | null`, `drainPendingUrls(): readonly string[]`. Without this, `tsc -b` fails on the protocol crate. This is the types-first contract the source was written against; it is the only thing standing between this change and a clean merge. — review.md#the-blocking-finding

2. **Reconcile `parseProtocolUrl`'s `query` with the `Readonly` field type once it lands.** The builder fills a mutable `Record<string, string>` and returns it as `query`; the new `ParsedProtocolUrl.query` field should be `Readonly<Record<string,string>>`. Keep the mutable local inside the function and let the return widen to the readonly field. Pure within-package. — review.md#axis-6

3. **Drop the misleading aliasing comment on `parseProtocolUrl`.** The comment claims the function "reads all fields before writing to avoid aliasing issues if the caller reuses a buffer" — but `parseProtocolUrl` allocates a fresh object and has no `out` param, so the aliasing note does not apply. Remove it (keep any genuine note about the hand-rolled, non-WHATWG parse). Run `npm run fix` after. — review.md#axis-7

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Not sweep-eligible.

- **`createProtocolUrl` query-key ordering — bless one rule, then reconcile both impls.** TS emits query entries in `Object.entries` insertion order (no sort); the Rust `create_protocol_url` (per the worker report) sorts keys. Same multi-key input → different strings, a round-trip-determinism and TS↔Rust conformance divergence. The fix is one line _once the rule is decided_; which rule (stable sort in both, recommended) is an unblessed Decision spanning the TS package and the Rust crate. **Parked: design decision + cross-package.** — review.md#axis-6

- **Rust `create_protocol_url` partial-input parity.** Rust takes a full value where TS takes `Readonly<Partial<ParsedProtocolUrl>>`. A conformance edge to reconcile or record in the divergence map. **Parked: other worktree.** — review.md#axis-6

- **Package Map casing fix (`onOpenURL` → `onOpenUrl`).** The codebase-map Package Map prose still reads "an `onOpenURL` handler entity"; the code/type use `onOpenUrl`. **Parked: cross-file** — the edit is to `tools/agents/docs/index.md`, outside this package's files. — review.md#axis-2

- **Parsed warm-open delivery affordance.** `onOpenUrl` carries the raw string only; no parsed-payload convenience for warm opens. The raw string is lossless and `parseProtocolUrl(url)` at the listener is a one-liner. **Parked: low value / awaiting need.** — review.md#axis-7

- **Functional / manual end-to-end verification.** Protocol can't be exercised by jsdom (needs a real native host for OS URL dispatch). The seam is unit-tested via fakes, but no end-to-end "cold-start launch + warm open both routed" scene exists. **Parked: cross-package / host-dependent** — needs a `host-electron` verification scene. — review.md#axis-7

- **Universal / App Links (the genuine frontier).** iOS Universal Links, Android App Links, `https://` verified-domain opens. Server-side association files, OS entitlements, a different API surface. **Parked: design decision + cross-package** — extend `ProtocolBackend` vs. sibling `@flighthq/applink` (worker recommends a sibling). Routed to Open directions. — review.md#axis-5

- **`@flighthq/protocol-formats` neighbor (association-file generation).** Build-time emission of `apple-app-site-association`, Android `intent-filter`, Electron `protocols` manifest from one descriptor. Passes the plurality guard (≥2 formats) but is a new package-shape decision. **Parked: design decision** — routed to Open directions. — review.md#axis-5

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Notes for the charter's Open directions (not edited here)

The charter is a `draft`. These are the silences this assessment assumed past — for an explicit direction conversation, not actioned:

- **North star.** The proposed-but-unblessed star ("the OS deep-link/URI-scheme seam: a thin, honest-degrading backend boundary with the domain's payload helpers colocated, never a host dependency") is sound; bless it explicitly. — charter.md#open-directions

- **Scope boundary — custom schemes vs. full deep linking.** Is Universal/App-Link support in scope for `@flighthq/protocol`, or a sibling `@flighthq/applink`? The single largest direction question; gates "authoritative for the domain" vs. "authoritative for custom schemes." — charter.md#open-directions

- **`protocol-formats` neighbor.** Is build-time association-file generation in scope for this package family, or host/build tooling? (Subject-triad fork; passes the plurality guard.) — charter.md#open-directions

- **Parse/build home — record the Decision.** `parseProtocolUrl`/`createProtocolUrl` live here rather than a URL-utility package. Sound, but record it as a Decision so a future URL package doesn't silently re-home them. — charter.md#open-directions

- **`createProtocolUrl` query ordering — bless one rule.** Insertion-order vs. sorted is unspecified and the two impls disagree. A one-line Decision (recommend: stable sort, both impls) closes the conformance gap and the determinism question at once. — charter.md#open-directions

- **Signals group.** Whether `enableProtocolSignals` (multi-listener/prioritized/cancellable delivery) is ever warranted, or the single `onOpenUrl` is permanent. Defer until a real need. — charter.md#open-directions
