---
package: '@flighthq/midi'
role: package
crate: flighthq-midi
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# midi — Charter

## What it is

Explicit MIDI access, permission query, port commands, and event subscriptions over the required
`Host.midi` group. Its independently optional `access` and `permission` slots split prompting hardware
acquisition from read-only permission projection.

`MidiAccess`, `MidiInputPort`, and `MidiOutputPort` are origin-pinned Entities. Port ids and descriptive
fields are immutable diagnostics, never routing keys. Mutable connection and device state are pulled from
the retained origin. Access and port events use Entity subscriptions with explicit attach, detach, and
terminal disposal.

## Decisions

- **[2026-08-30] Access is the only request route.** `requestMidiAccess(host)` returns an accepted retained
  access Entity or a named denial, security restriction, unsupported route, or operational failure.
  `getMidiPermission(host)` is read-only. Generic Permissions delegates the query and exposes no MIDI request
  route.
- **[2026-08-30] Web construction is injected and basic-only.** `@flighthq/host-web` exposes separate access
  and permission+access factories over exact `Pick<Navigator, ...>` facades. The default `webHost.midi` is
  empty. Access calls `requestMIDIAccess()` with zero options, permission queries `sysex: false`, outbound
  system-exclusive data is rejected, and no software scheduler is introduced.
- **[2026-08-30] Resource identity owns lifecycle.** Providers retain native handles in WeakMaps keyed by
  Flight Entities. Disposal is attempt-all and retry-only. A port is closed during disposal only when Flight
  opened it; a native port already open at first use is borrowed and never implicitly closed.

## Open directions

1. Real-device loopback and permission prompts remain interactive hardware evidence, not CI claims.
2. System-exclusive access is absent. It requires a separate ratified capability and safety contract rather
   than an option silently forwarded through this basic profile.
