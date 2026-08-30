---
package: '@flighthq/protocol'
role: package
crate: flighthq-protocol
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# protocol — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

OS deep-link / custom-URI-scheme capability -- the layer an app uses to claim `myapp://...` with the operating system, learn whether it is the default handler, receive incoming deep-link opens (cold-start launch and warm subsequent opens), and parse/build deep-link URLs. `Host.protocol` is a required top-level group with independent optional `registration`, `registrationQuery`, `unregistration`, `default`, `launch`, and `open` slots. Every host operation takes the exact `HasProtocol*` witness it needs. `ProtocolHandler` is an Entity whose attach/detach/dispose lifecycle retains the originating open subscription. Parse/build helpers stay hostless domain payload helpers.

## Decisions

- **[2026-07-02] Fix type error.** `unknown` not assignable to `string | number | boolean` in the query-parameter handling. Fix the type to accept the correct union or narrow `unknown` before use.
- **[2026-08-30] Protocol is a top-level Host domain.** It is not nested under APP: registration/default-handler state and incoming opens are their own OS capability. Unsupported operations are absent slots; the ambient resolver, diagnostics, Web enabler, pending-drain sentinel, and capability probes are deleted.
- **[2026-08-30] Commands and live-open events stay split.** Host coverage cannot merge incompatible shapes. Web supplies launch and registration, Electron supplies default/open/registration/query/unregistration, Capacitor supplies open, and Tauri supplies no protocol slot.

## Open directions

- Whether Universal / App Links (`https://` verified-domain opens) belong here or in a sibling `@flighthq/applink`.
- `createProtocolUrl` query-key ordering: TS emits in insertion order, Rust sorts alphabetically. Pick one rule for round-trip determinism.
- Parameter shape parity: TS takes `Readonly<Partial<ParsedProtocolUrl>>`, Rust takes a full `&ParsedProtocolUrl`. Reconcile or record the divergence.
- `protocol-formats` neighbor for build-time association-file generation (apple-app-site-association, Android intent-filter, Electron protocols manifest).
