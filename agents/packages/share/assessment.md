# share — Assessment

See [charter](./charter.md) for blessed direction.

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
