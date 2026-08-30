---
package: '@flighthq/protocol'
updated: 2026-08-30
by: builder5
---

# protocol — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/protocol/src/protocol.ts` and
`packages/types/src/Protocol.ts` after the explicit Host migration on 2026-08-30.

- **`createProtocolUrl` can construct a scheme the command API would refuse.** It defaults a missing
  scheme to `unknown` and does not apply `isValidProtocolScheme`. Whether this pure formatter should
  reject, return a result, or remain deliberately syntax-only needs a public-shape ruling.
- **Batch provider failure is not transactional.** The full batch is now prevalidated before the first
  Host call, so one malformed/reserved scheme causes zero mutation. A later provider failure still
  leaves earlier successful registration/unregistration operations applied; rollback semantics are not
  promised.
- **`ParsedProtocolUrl` is mutable.** Its fields and `query: Record<string, string>` are returned as a
  fresh record but are not typed readonly, unlike other immutable payload surfaces.
- **Universal Links / App Links still need a home.** Verified-domain association and entitlement work
  differs from custom URI registration and may belong in a sibling `@flighthq/applink` package.
- **Build-time association formats have no owner.** Android intent filters, Apple's association file,
  and Electron protocol manifests remain outside runtime PROTOCOL and have no
  `@flighthq/protocol-formats` neighbor.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Promoted PROTOCOL to required top-level `Host.protocol`, split into six independent
  optional slots, and deleted the ambient resolver, diagnostics, sentinels, pending drain, and Web
  enabler. All scheme-taking commands/queries now validate consistently and batches prevalidate fully.
- **2026-08-30** — `ProtocolHandler` became an Entity with creator-pinned open subscription teardown.
  Web supplies launch/registration, Electron supplies native registration/default/open coverage,
  Capacitor supplies warm opens, and Tauri publishes exact `{}`.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract; corrected query ordering and mutability
  claims and removed downstream Rust narration.
- **2026-06-24** — Added cold-start launch, default-handler operations, scheme enumeration,
  parse/create helpers, batches, and validation.
