---
package: '@flighthq/midi'
status: solid
score: 90
updated: 2026-08-30
ingested:
  - packages/midi/src
  - packages/types/src/Midi.ts
  - packages/types/src/Host.ts
  - packages/host-web/src/webMidi.ts
  - packages/permissions/src/permission.ts
---

# midi — Review

## Verdict

`solid — 90/100`. MIDI has one explicit native owner with separate access and permission traits. Access,
input, and output identities are retained Entities; native ids cannot reroute operations. Connection and
device state stay pull-based, and all expected results are named outcomes.

## Verified surface

- The public lane exposes consumer access/permission/port/subscription operations; provider resource
  constructors remain on `/contract`.
- Input and output ports remain distinct even when native ids collide. Repeated enumeration and repeated
  access acquisition inside one injected profile preserve Entity identity.
- Port open/close/disposal distinguishes borrowed from Flight-opened ownership. Close failures remain for
  retry, disposal is terminal after success, and access disposal attempts every known port.
- Three Signal subscription families copy input bytes, preserve event timestamps, pin exact origins, retain
  failed releases, clear slots at disposal, and cannot be revived.
- Web profiles require injected lib.dom APIs. The default Web, Electron, Tauri, and Capacitor Hosts make no
  MIDI claim. Basic access never requests system-exclusive permission and outbound validation accepts only
  one complete non-sysex MIDI message.
- Permissions captures `Host.midi.permission` once for ordered/repeated queries and returns
  `no-request-route` for MIDI request without touching access or native Web APIs.

## Remaining limits

- Unit tests use injected native facades. Real hardware hotplug, loopback, timing, and browser permission UI
  require an explicitly interactive device lane.
- System-exclusive access and software sequencing are intentionally absent.
