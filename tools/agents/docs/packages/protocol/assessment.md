---
package: '@flighthq/protocol'
updated: 2026-06-24
basedOn: ./review.md
---

# protocol — Assessment

> Recommendations over `review.md` (solid, 90/100). The incoming pass (builder-67dc46d64) **already landed** the entire prior maturation roadmap that was autonomously in-scope: all of Bronze (cold-start launch URL, the default-handler triplet, casing reconciliation, Electron wiring, Rust mirror), all of Silver (`parseProtocolUrl`/`createProtocolUrl`, multi-scheme batch, enumerate, launch-URL semantics), and the autonomously-fixable Gold items (`isValidProtocolScheme`, the pre-attach pending-URL drain). The custom-scheme domain is essentially complete. What remains is a one-line within-package comment fix plus a set of cross-package / design-fork items that need a blessed direction before acting. The prior roadmap (`reviews/maturation/depth/protocol.md`) is fully absorbed here and can be removed as one-time seed.

## Recommended

Sweep-safe: within `@flighthq/protocol`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

1. **Drop the misleading aliasing comment on `parseProtocolUrl`.** The comment claims the function "reads all fields before writing to avoid aliasing issues if the caller reuses a buffer" — but `parseProtocolUrl` allocates a fresh object and has no `out` param or caller buffer, so the aliasing note does not apply. It is boilerplate that misrepresents the function's contract. Remove it (leave any genuine note about the hand-rolled, non-WHATWG parse if useful). Pure within-package doc cleanup; run `npm run fix` after. — review.md#contract-&-docs-fit (a)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Not sweep-eligible.

- **`createProtocolUrl` query-key ordering — bless one rule, then reconcile both impls.** TS emits query entries in `Object.entries` insertion order (no sort); Rust `create_protocol_url` sorts keys alphabetically. The two builders produce different strings for the same multi-key input — a real round-trip-determinism and TS↔Rust conformance divergence. The fix is one line _once the ordering is decided_, but **which** rule (stable sort in both, recommended) is an unblessed Decision, and the reconciliation spans the TS package and the Rust crate. **Parked: design decision + cross-package** — routed to the charter's Open directions. (Also note: the worker status' "Concerns #4" claims the TS code sorts for determinism; it does not — that as-claimed status is wrong and must not be promoted.) — review.md#contract-&-docs-fit (b)

- **Rust `create_protocol_url` partial-input parity.** Rust takes a full `&ParsedProtocolUrl` value where TS takes `Readonly<Partial<…>>` (TS allows omitting parts, Rust does not). A conformance edge to reconcile or record in the divergence map. **Parked: other worktree** — the Rust crate lives in the port worktree; noted for the port. — review.md#contract-&-docs-fit (b)

- **Package Map casing fix (`onOpenURL` → `onOpenUrl`).** The codebase-map Package Map prose still reads "an `onOpenURL` handler entity"; the code/type use `onOpenUrl`. The worker correctly judged code canonical and left the map prose unchanged. **Parked: cross-file** — the edit is to the codebase map (`tools/agents/docs/index.md`), outside this package's files. — review.md#contract-&-docs-fit (c)

- **Parsed warm-open delivery affordance.** `onOpenUrl` carries the raw string only; no `getProtocolHandlerLastUrl` / parsed-payload option exists for warm opens. Minor — the raw string is lossless and `parseProtocolUrl(url)` at the listener is a documented one-liner. **Parked: low value / awaiting need** — the Silver convention is "parse at the listener," so a second affordance is only warranted if a real consumer need appears. — review.md#gaps

- **Functional / manual end-to-end verification.** Protocol can't be exercised by jsdom (needs a real native host for OS URL dispatch); the Rust tests were unrunnable in the worker env (no cargo). The seam is unit-tested via fakes, but no end-to-end "deep-link cold-start launch + warm open both routed" scene exists. **Parked: cross-package / host-dependent** — needs a `host-electron` verification scene (and a conformance-mapped Rust scene once the host crates route real opens), not a within-`protocol` unit test. — review.md#gaps

- **Universal / App Links (the genuine frontier).** iOS Universal Links, Android App Links, `https://` verified-domain opens — the other half of production deep linking. Needs server-side association files, OS entitlements, and a different API surface. **Parked: design decision + cross-package** — whether this extends `ProtocolBackend` or becomes a sibling `@flighthq/applink` (worker recommends a sibling) gates whether the package is authoritative for its whole domain or just custom schemes. Routed to the charter's Open directions. — review.md#gaps

- **`@flighthq/protocol-formats` neighbor (association-file generation).** Build-time emission of `apple-app-site-association`, Android `intent-filter`, and the Electron `protocols` manifest from one descriptor. A `-formats` cell (subject-triad fork B/D); it passes the plurality guard (≥2 real target formats) but is a new package-shape decision. **Parked: design decision** — routed to the charter's Open directions. — review.md#gaps

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter's Open directions (not edited here)

The charter is a stub (North star / Boundaries / Decisions / Open directions all `TODO`). These are the silences this assessment had to assume past — surfaced for an explicit direction conversation, not actioned:

- **North star.** The package strongly implies one — "the OS deep-link/URI-scheme seam: a thin, honest-degrading backend boundary with the domain's payload helpers colocated, never a host dependency." Worth blessing explicitly. — review.md#candidate-open-directions

- **Scope boundary — custom schemes vs. full deep linking.** Is Universal/App-Link support in scope for `@flighthq/protocol`, or a sibling `@flighthq/applink`? The single largest direction question; gates "authoritative for the domain" vs. "authoritative for custom schemes." — review.md#candidate-open-directions

- **`protocol-formats` neighbor.** Is build-time association-file generation in scope for this package family, or does it belong with host/build tooling? (Subject-triad fork B/D; passes the plurality guard.) — review.md#candidate-open-directions

- **Parse/build home — record the Decision.** The worker decided `parseProtocolUrl`/`createProtocolUrl` live here rather than a URL-utility package. Sound, but it should be a recorded Decision so a future URL package doesn't silently re-home them. — review.md#candidate-open-directions

- **`createProtocolUrl` query ordering — bless one rule.** Insertion-order vs. sorted is unspecified and the two impls disagree. A one-line Decision (recommend: stable sort, both impls) closes the conformance gap and the round-trip determinism question at once. — review.md#candidate-open-directions

- **Signals group.** Whether `enableProtocolSignals` (multi-listener/prioritized/cancellable delivery) is ever warranted, or the single `onOpenUrl` is the permanent shape. Defer until a real need. — review.md#candidate-open-directions
