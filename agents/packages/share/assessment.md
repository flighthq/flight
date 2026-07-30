# share — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Make asynchronous capability discovery honest.** The Capacitor adapter projects an
   inherently-asynchronous plugin-availability check into a construction-time cached boolean, so a
   host that becomes available after startup (or the reverse) is never reflected. Needs an async
   capability query, explicit readiness/change observation, or a backend contract that permits the
   platform probe itself to be asynchronous.
2. **Carry portable files through native backends.** `ShareFile.dataUrl` has no path to a host file
   URI on Capacitor today, so the web backend is the only one that can share files. Needs a staging
   and cleanup path from the data URL to native file storage, or an evolved descriptor shape that both
   web and Capacitor can consume without browser types leaking into the contract.

## Recommended

1. **Reconcile the charter's `isShareContentValid` with the shipped `hasShareContentFields`** — the
   charter's "What it is" names a function that does not exist; the code's name is the more accurate
   of the two (it checks field presence, not validity), so the charter is what is stale. Fixed in the
   charter 2026-07-30; listed here because the *question underneath* is still open: should there be a
   real `isShareContentValid` that checks URL syntax and MIME plausibility, distinct from the
   presence check?
2. **`ShareFile` validation seam** — `shareFileToDomFile` now fails a malformed data URL cleanly
   instead of fabricating a File, but the failure still reaches the caller as a bare `false` from
   `shareContent`, indistinguishable from "the user cancelled". A `ShareFile`-level probe (or a
   crumb on the result) would separate "your descriptor is malformed" from "the share did not
   happen". Diagnostics-inversion work.

## Approved

1. **Remove dead `_signalSubscriptions` map** [2026-07-02 · blanket "platform integration suite
   sweep"] — done; the vestige (`Map<ShareSignals, true>` used as a set) was collapsed to a real
   `Set` 2026-07-30.

## Backlog

- **`shareTextWithResult` / `shareUrlWithResult` / `shareFilesWithResult`** — charter Open direction
  2 (result-variant symmetry) is a design fork about whether the boolean path is the golden one, not
  a gap to fill unilaterally.
- Electron and Tauri share adapters where their host APIs provide a truthful system share sheet.
- Rust parity, once the async-capability and portable-file Depth gaps above settle.
