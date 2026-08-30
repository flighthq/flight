---
package: '@flighthq/midi'
updated: 2026-08-30
by: builder4
---

# midi — Status

## Open

- No implementation defect is open in the ratified basic MIDI slice. Hardware loopback, hotplug, timing, and
  permission-prompt proof remain explicitly interactive; CI covers injected native behavior only.

## Log

- **2026-08-30** — Landed split Host traits, retained access/port Entities, pull state, basic-only sends,
  transactional subscriptions, close-only-Flight-opened disposal, two injected Web profiles, and read-only
  Permissions projection. The MIDI native-holdings row drained completely.
