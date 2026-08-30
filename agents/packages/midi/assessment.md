---
package: '@flighthq/midi'
updated: 2026-08-30
basedOn: ./review.md
---

# midi — Assessment

## Recommended

- Run hardware loopback and prompt checks only in an explicitly interactive browser/device session.

## Landed

1. Required `Host.midi` group with split optional access and permission traits.
2. Origin-pinned access/input/output Entities and WeakMap-retained provider operations.
3. Pull state, basic message validation, named outcomes, and close-only-Flight-opened disposal.
4. Transactional access-state, port-state, and input-message Entity subscriptions.
5. Exact injected Web access and permission+access profiles; default hosts remain empty.
6. Read-only Permissions projection, no request route, and total removal of the MIDI native holding.

## Backlog

- System-exclusive access and software sequencing remain absent pending separate ratification.
- A Rust `flighthq-midi` crate remains cross-repository conformance work.
