---
package: '@flighthq/host-node'
role: host
crate: null
draft: false
lastDirection: 2026-08-21
reserved: true
---

# host-node — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

**RESERVED — do not build an empty package.** The user chose `host-node` as the Node-specific host shape alongside `host-web`. This cell holds that name and architecture until a genuine Node implementation exists.

`host-node` is unbuilt because it has zero members today. The 38-module host-boundary census classified existing `createWeb*Backend` modules, so every input was a web implementation by construction; that census could not discover Node implementations it never examined.

## When to build it

Create `@flighthq/host-node` when the first genuine Node-specific implementation is written—for example, filesystem access over `node:fs`, or a socket implementation for a target below the Node 22 floor or requiring semantics different from the runtime WebSocket API. A host package earns existence from a real member, not from a planned namespace.

Portable language facilities do not belong here. `fetch`, `Intl.Segmenter`, and `WebSocket` remain inline in their capability packages; a Node application must not enable a host merely to obtain standard JavaScript behavior. A future Node host may deliberately override one only when its environment lacks it or requires genuinely Node-specific semantics.

## Boundaries

- Implements host-author capability seams from `@flighthq/types`; it does not own capability semantics.
- Installs only genuine Node behavior and never fills unsupported methods with no-ops or fixed sentinels.
- Participates as a named host layer in the order-independent provider stack; a Node-specific provider does not win merely because its enable call ran last.
- Remains outside the `@flighthq/sdk` barrel, following the host-package boundary.

When the host-web architecture record lands, link it here so the host-web and host-node decisions remain readable as one architecture.
