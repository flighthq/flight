---
package: '@flighthq/protocol'
crate: flighthq-protocol
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# protocol — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/protocol` is the OS deep-link / custom-URI-scheme seam: the capability an app uses to claim `myapp://…` with the operating system, to learn whether it is the default handler, to receive incoming deep-link opens (both cold-start launch and warm subsequent opens), and to parse/build the deep-link URLs themselves. It is a **command + event capability** in the platform-integration suite — flat free functions over a swappable `ProtocolBackend` (web default lazily created, native hosts register their own), plus a `ProtocolHandler` event entity wired through `attach*`/`detach*`/`dispose*` exactly like `@flighthq/application`'s window wiring.

Where it ends and a neighbor begins:

- vs. **`@flighthq/app`** — `app` owns application identity/control, the single-instance lock, and the `onOpenFile` event; `protocol` owns URL-scheme registration and `onOpenUrl`. The argv/second-instance delivery path is shared host plumbing, surfaced through each capability's own event.
- vs. **`@flighthq/host-electron`** (and future `host-tauri`/`host-capacitor`) — the host crate is the concrete backend that fills the `ProtocolBackend` seam (`setAsDefaultProtocolClient`, `open-url`, argv cold-start). `protocol` defines the seam and the web fallback; it carries no host dependency.
- vs. a hypothetical URL utility package — `parseProtocolUrl`/`createProtocolUrl` live **here** as the domain payload helpers, deliberately not split into a separate URL package (and deliberately not built on the WHATWG `URL` parser, which mangles custom schemes).
- vs. **Universal / App Links** (`https://` verified-domain opens) — currently out; see Open directions.

## North star (proposed)

1. **A thin, honest-degrading backend boundary, never a host dependency.** The package defines the seam and ships a web default that guards every API and returns sentinels (`false`/`null`/`[]`/no-op) where the platform cannot serve it — never throwing, never importing a host runtime. "Electron support" is one backend, not a coupling.
2. **Plain data at every edge.** Schemes are strings; a parsed URL is a plain `ParsedProtocolUrl`; the parse/build pair round-trips. No wrapper objects, no hidden runtime state. The types live in `@flighthq/types` as the contract, mirrored 1:1 by the Rust `flighthq-protocol` crate.
3. **Sentinels for expected absence, validation that protects the OS.** Every expected failure (unsupported platform, denied registration, malformed input) is a `false`/`null`, not an exception; `isValidProtocolScheme` makes an invalid scheme a `false` and self-defends both `register*` paths so a bad scheme never reaches the OS.
4. **Cold start and warm open are distinct, and neither is dropped.** `getProtocolLaunchUrl` is the idempotent one-shot cold-start query; `onOpenUrl` is the warm event stream; `attachProtocolHandler` drains the backend's pre-attach buffer so the process-start↔first-attach race never loses an open.
5. **Conformance is a property, not an aspiration.** TS is authoritative; the Rust crate mirrors the full surface; any intentional TS↔Rust divergence is reconciled or recorded in the divergence map rather than left to drift.

## Boundaries (proposed)

In scope:

- Custom URI-scheme registration / unregistration / enumeration (single and batch).
- The default-handler triplet (`setProtocolSchemeAsDefault` / `isProtocolSchemeDefault` / `removeProtocolSchemeAsDefault`).
- Cold-start launch-URL query and the warm `onOpenUrl` handler entity, including pre-attach buffering.
- Deep-link URL parse/build (`parseProtocolUrl` / `createProtocolUrl`) and scheme validation.
- The web default backend and the `get*Backend` / `set*Backend` / `createWeb*Backend` seam.

Non-goals (proposed — confirm in Open directions):

- **Universal / App Links** (`https://` verified-domain opens, association files, OS entitlements) — genuinely the other half of production deep linking, but a different API surface; candidate sibling `@flighthq/applink`.
- **Build-time association-file generation** (`apple-app-site-association`, Android `intent-filter`, Electron `protocols` manifest) — a candidate `-formats` neighbor, not the runtime capability.
- **Concrete host implementations** — owned by `host-*` crates, not here.
- **A multi-listener/prioritized signal group** for delivery — the single `onOpenUrl` is the current shape unless a real need appears.

## Decisions

None blessed yet.

## Open directions

Every question below is unsettled and waits on your direction — an agent asks here rather than assuming.

- **Bless the North star.** Is "the OS deep-link/URI-scheme seam: a thin, honest-degrading backend boundary with the domain's payload helpers colocated, never a host dependency" the durable vision, as proposed above?
- **Scope boundary: custom schemes vs. full deep linking.** Is Universal/App-Link support (`https://` verified-domain opens) in scope for `@flighthq/protocol`, or does it become a sibling `@flighthq/applink`? The review recommends a sibling. This is the single largest direction question and gates whether the package is "authoritative" for its whole domain or just for custom schemes. _(Structural-forks: cross-package, design-level.)_
- **`protocol-formats` neighbor (subject-triad fork B/D).** Is build-time association-file generation (`apple-app-site-association` plist + Android `intent-filter` + Electron `protocols` manifest) in scope for this package family, or does it belong with host/build tooling? It now passes the triad plurality guard (≥2 real target formats), so the cell is admissible — but a new package-shape decision is needed.
- **Parse/build home — record as a Decision.** The worker placed `parseProtocolUrl`/`createProtocolUrl` here rather than in a separate URL utility package. Sound, but it should be blessed as a Decision so a future URL package does not silently re-home them.
- **`createProtocolUrl` query-key ordering — bless one rule.** Ordering is currently unspecified and the two implementations disagree: TS emits in `Object.entries` insertion order, Rust sorts keys alphabetically. (A status report's claim that the TS code sorts is wrong — it uses insertion order.) Pick one rule — recommend a stable sort in both impls — to close the round-trip-determinism and TS↔Rust conformance gap at once. _(Structural-forks: conformance / divergence map.)_
- **Parameter shape parity for `createProtocolUrl`.** TS takes `Readonly<Partial<ParsedProtocolUrl>>` (parts omittable); Rust takes a full `&ParsedProtocolUrl`. Reconcile or record the divergence.
- **Parsed warm-open delivery.** `onOpenUrl` carries the raw string only. Is a parsed-payload affordance (e.g. `getProtocolHandlerLastUrl`, or a parsed event) ever wanted, or is "parse at the listener as a one-liner" the permanent convention? Minor; the raw string is lossless.
- **Signals group.** Is `enableProtocolSignals` (multi-listener / prioritized / cancellable deep-link delivery) ever warranted, or is the single `onOpenUrl` the permanent shape? Defer until a real need.
- **Package Map casing drift (outside this package).** The codebase-map Package Map line still reads `onOpenURL`; the code/types use `onOpenUrl`. Candidate revision to the map prose so doc and code agree.
- **Misleading aliasing comment on `parseProtocolUrl`.** The "reads all fields before writing to avoid aliasing issues if the caller reuses a buffer" comment is boilerplate — the function allocates a fresh object and has no `out` param. Drop it. (Sweep-safe; noted here for visibility.)
- **End-to-end verification.** Protocol cannot be exercised by jsdom (needs a real native host for OS URL dispatch) and the Rust tests were unrunnable in the worker env. The seam is unit-tested via fakes, but no end-to-end "deep-link launch + warm open both routed" scene exists. How should this domain be verified beyond fakes?
