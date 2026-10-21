# flight-capture

Render-capture verification in portable form: tolerant comparison of coarse render fingerprints,
and the canonical committed baseline record the tooling writes to disk. No filesystem, browser,
screenshot or hash computation lives here.

- `compare_capture_fingerprints` parses two `<gridSize>:<hex>` fingerprints and returns the mean
  absolute per-channel distance, or `f64::INFINITY` when either fails to parse or the grid sizes
  differ — a corrupt or mismatched baseline reads as a failing check rather than a crash.
- `evaluate_capture_parity` and `evaluate_capture_regression` wrap that distance with the parity
  (`15`) and regression (`5`) tolerances; an omitted tolerance takes the source default.
- `CaptureBaseline` is the ordered `Record<CaptureColumnBaseline>`; each column carries optional
  `fingerprint`, deprecated `sourceHash` and `sha256` values, each of the independently written
  values owning its own `CaptureBaselineProvenance`.
- `format_capture_baseline` emits columns in sorted order, fields in canonical order, with a
  two-space indent and a trailing newline, so a re-baseline of one column produces a minimal diff.
  `parse_capture_baseline` reads that form back, returning `None` for malformed input.

Typed-schema note: the source parser is permissive about column values it does not understand
(it returns the parsed object as-is and drops unknown members only when formatting). The typed
record drops unknown members at parse time and rejects a known member whose JSON type disagrees
with the declared schema (`None` instead of a partially typed record); both are reported as
non-representable divergences rather than modelled with a raw JSON value.
