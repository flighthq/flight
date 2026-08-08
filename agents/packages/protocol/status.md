---
package: '@flighthq/protocol'
updated: 2026-08-08
by: principal
---

# protocol — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/protocol/src/protocol.ts` and
`packages/types/src/Protocol.ts` on 2026-08-08. A file:line here is a claim about this tree.

- **Two source comments on `parseProtocolUrl` are false** (`protocol.ts:173-176`). It claims to return
  null for "non-custom-scheme URLs", but the guard is `_schemePattern` alone (`:182`) with no
  `_reservedSchemes` check, so `parseProtocolUrl('https://example.com')` parses fine even though
  `registerProtocolScheme` would reject `https`. It also claims to read "all fields before writing to
  avoid aliasing issues if the caller reuses a buffer" — there is no `out` parameter and the function
  allocates a fresh object at `:231`. Both are durable comments asserting behavior the code does not have.
- **Scheme validation guards only the register path.** `registerProtocolScheme` (`:238`) and
  `registerProtocolSchemes` (`:248`) call `isValidProtocolScheme`; `unregisterProtocolScheme` (`:272`),
  `unregisterProtocolSchemes` (`:277`), `setProtocolSchemeAsDefault` (`:266`),
  `removeProtocolSchemeAsDefault` (`:255`), `isProtocolSchemeDefault` (`:153`), and
  `isProtocolSchemeRegistered` (`:158`) pass the raw string to the backend. A reserved scheme cannot be
  registered but can be handed to the OS default-handler APIs.
- **`createProtocolUrl` builds URLs its own package would refuse.** It never validates (`:30-46`) and
  substitutes the literal `'unknown'` for an absent scheme (`:31`), so `createProtocolUrl({})` yields
  `'unknown:'` and a reserved scheme passes straight through. Round-trip symmetry with
  `parseProtocolUrl` is asserted in the comment but not enforced anywhere.
- **The batch register/unregister ops are not atomic.** `registerProtocolSchemes` (`:244-251`) and
  `unregisterProtocolSchemes` (`:277-284`) loop and return `false` if any element fails, leaving the
  successful ones applied. The doc says "returns false if any fails"; it does not say the store is
  left partially mutated, and there is no rollback.
- **`ParsedProtocolUrl.query` is a mutable `Record<string, string>`** (`types/src/Protocol.ts:9`), as
  are `scheme`, `host`, and `path`. The SDK default is `Readonly<T>` wherever mutation is not intended,
  and `parseProtocolUrl` hands the caller a freshly allocated object it does not retain.
- **Universal Links / App Links have no home and need a ruling.** No `registerUniversalLink`,
  `isUniversalLinkRegistered`, or `@flighthq/applink` exists anywhere in `packages/`. The open question
  is whether they extend `ProtocolBackend` or become a sibling package — they need server-side
  association files and OS entitlements, which custom URI schemes do not.
- **No `@flighthq/protocol-formats` neighbor exists.** Association-file generation (Android
  `intent-filter`, `apple-app-site-association`, the Electron `protocols` manifest) is build-time work
  with no package to live in; `packages/protocol-formats/` is absent.
- **The deep-link path has no automated coverage.** `createWebProtocolBackend`'s `subscribe` is inert
  and `drainPendingUrls` returns `[]`, so jsdom cannot exercise a real open; the only live delivery is
  `host-electron/src/electronProtocol.ts`. Cold-start launch and warm-open routing are verified by unit
  tests against a stub backend, never against an OS.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 concern
  "`createProtocolUrl` query key ordering: entries are sorted alphabetically for deterministic
  round-trip output" is **false** — `protocol.ts:39-42` maps `Object.entries(query)` straight to the
  query string with no `.sort()`, so output follows insertion order and round-trip determinism rests
  on the caller. Also corrected: `ParsedProtocolUrl.query` is not `Readonly<Record<string, string>>`
  (`types/src/Protocol.ts:9`). The entry's Rust-parity section describes `crates/`, which does not
  exist in this repo — that work lives downstream.
- **2026-06-24** — Landed the pre-attach `drainPendingUrls` burst drain, `getLaunchUrl` cold-start
  semantics, the `isDefault`/`setAsDefault`/`removeAsDefault` triplet, scheme enumeration,
  `parseProtocolUrl`/`createProtocolUrl`, batch register/unregister, and `isValidProtocolScheme`.
