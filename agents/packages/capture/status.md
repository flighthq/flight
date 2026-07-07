---
package: '@flighthq/capture'
updated: 2026-07-03
---

# capture — Status Log

## 2026-07-03 — chartered from the render-verification direction session

Package blessed as the SDK-side home for deterministic render capture and verification (fingerprints, baseline formats, comparison policy), with the Rust `flighthq-capture` crate as its parity twin and the capture tools as future importers. No source yet — the capability currently lives in `scripts/capture-core.ts` / `scripts/compare-render.ts` / `scripts/baseline-store.ts` and `@flighthq/surface`'s fingerprint functions. Four items approved for the current tooling home (see assessment.md › Approved): per-test tolerance overrides, raw-RGBA hashing, fingerprint-capture acceleration, and clock pinning in the harness.
