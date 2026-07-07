---
package: '@flighthq/protocol'
crate: flighthq-protocol
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# protocol — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

OS deep-link / custom-URI-scheme seam -- the capability an app uses to claim `myapp://...` with the operating system, to learn whether it is the default handler, to receive incoming deep-link opens (cold-start launch and warm subsequent opens), and to parse/build the deep-link URLs themselves. Command + event capability over a swappable `ProtocolBackend` with a web default returning sentinels. The `ProtocolHandler` event entity is wired through `attach*`/`detach*`/`dispose*`. Parse/build helpers (`parseProtocolUrl` / `createProtocolUrl`) live here as domain payload helpers, deliberately not split into a separate URL package.

## Decisions

- **[2026-07-02] Fix type error.** `unknown` not assignable to `string | number | boolean` in the query-parameter handling. Fix the type to accept the correct union or narrow `unknown` before use.

## Open directions

- Whether Universal / App Links (`https://` verified-domain opens) belong here or in a sibling `@flighthq/applink`.
- `createProtocolUrl` query-key ordering: TS emits in insertion order, Rust sorts alphabetically. Pick one rule for round-trip determinism.
- Parameter shape parity: TS takes `Readonly<Partial<ParsedProtocolUrl>>`, Rust takes a full `&ParsedProtocolUrl`. Reconcile or record the divergence.
- `protocol-formats` neighbor for build-time association-file generation (apple-app-site-association, Android intent-filter, Electron protocols manifest).
