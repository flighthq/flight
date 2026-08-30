---
package: "@flighthq/host-web"
role: host
crate: null
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# host-web — Charter

> Durable vision and core values for `@flighthq/host-web`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

See the [host-web architecture](../../host-web-architecture.md) and [platform integration shared principles](../platform-integration.md).

## What it is

The explicit browser Host aggregator. It publishes only capability slots backed by real browser APIs;
unsupported operations remain absent in the returned Host shape.

## North star

One inspectable Host value whose structure truthfully describes the browser capabilities it offers,
without ambient installation or sentinel providers masquerading as support.

## Boundaries

- Browser-backed providers and their composition into `webHost` are in scope.
- Native-only facilities are structurally absent. The package does not simulate them.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-30] Global shortcuts are structurally absent.** `webHost.shortcut` is exactly `{}`:
  browsers offer no OS-global trigger registration or native registration-state query. There is no
  web shortcut factory, sentinel, ambient enable function, or zero-provider toggle.
- **[2026-08-30] Storage persistence profiles follow execution context.** Window supplies query and
  request; Worker supplies query only. Both factories take injected functions and return Entity
  capabilities. `webHost` composes the Window profile, while native hosts make no claim through this
  package.

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
