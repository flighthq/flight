# DOM Screenshot / Fingerprint Artifact Divergence

**Status: OPEN.** The divergence is identified and the fix is in review.

**Standing note on mechanism citations.** This record's first draft described the fingerprint source as "html2canvas or an equivalent" — a plausible mechanism that was wrong. The actual mechanism is a Playwright element screenshot (`captureDomReadback.ts:21`), same browser compositor as the page screenshot. The error survived because the record cited the module name but not the line, so nobody re-read the code before acting on the claim. When a record's argument turns on how something works, cite the file and line, and re-read that line before acting on the record.

## The gap (as it existed)

For canvas, WebGL, and WebGPU captures, the screenshot a human reviews and the fingerprint the regression gate checks are derived from the **same artifact** — the verifier's render image (`window.__ftRenderImage`), a data URL read from the GPU/canvas surface. One frame, two uses.

DOM was explicitly excluded from this path:

```
captureEntry.ts:500
} else if (dataUrl && backend !== 'dom') {
```

For DOM captures, two different artifacts existed:

1. **Fingerprint source**: the DOM readback — `captureDomReadback.ts:21` takes a Playwright element screenshot of the container div (`element.screenshot({ animations: 'disabled' })`), clipped to the container. Same browser compositor as the page screenshot.

2. **Screenshot source**: `page.screenshot()` — a Playwright full-viewport capture of the browser page, including everything outside the container div.

Both are browser compositor output. They differ in exactly two things: what is included in the frame (element-clipped vs full viewport) and the instant each is taken.

## How it bit us

Five DOM scenes requested dimensions smaller than the hardcoded 800×600 capture viewport. The `page.screenshot()` captured the full viewport, producing screenshots with white gaps around the scene's container div. The element screenshot for the fingerprint was clipped to the container and clean.

Two of these (`rive-import/dom`, `shape-stroke-ring-fallback/dom`) had no hold in `reference-image-held.json`. Their contaminated screenshots could have been commissioned as reference images while the fingerprint gate reported green, because the gate was checking a different picture.

The viewport fix (`page.setViewportSize()` to match the container) removes today's instance of this symptom. It does not close the gap: any DOM defect that manifests in the viewport screenshot but not in the element screenshot is invisible to the regression gate, corpus-wide.

## The scope

Every DOM cell in the corpus — not just these five — has this two-artifact structure. The current count is 51 DOM entries across functional scenes. For all 51, the regression gate and the human reviewer are looking at different pictures.

## What diverges

The two artifacts can disagree on:

- **Viewport-level artifacts**: page background color, page margin/padding, scroll position, viewport size mismatch (the instance that surfaced this).
- **Timing**: the screenshot is taken at the moment `page.screenshot()` fires; the element screenshot may capture at a different frame, especially if layout observers or transitions are active.

## Options (not recommendations)

1. **Unify the artifacts**: use the element screenshot as the screenshot source (same as the fingerprint), so both consumers see the same picture. Loses the full-viewport fidelity of the Playwright page screenshot.

2. **Use the screenshot as the fingerprint source**: hash the `page.screenshot()` bytes instead of the element screenshot for DOM entries. Loses the container-clipped readback; screenshots on platform-text pages may be unstable.

3. **Dual-track**: keep both, but record the divergence explicitly in the capture status so a consuming gate can flag when they disagree. Adds complexity; the gate still has to decide which picture to trust.

4. **Accept the gap**: document it (this record) and rely on human review to catch DOM-only screenshot defects. The viewport fix closes the known instance; remaining divergence is theoretical until a second instance surfaces.

None of these is recommended here. The choice depends on which artifact the regression gate should be authoritative over — the element-clipped frame or the full viewport — and that is a design decision for the capture-verification tiers doctrine.

## Related

- [Capture verification tiers](capture-verification-tiers.md) — the organizing rule this gap touches.
- `captureEntry.ts` — the DOM screenshot branch (currently `page.screenshot()`).
- `captureDomReadback.ts:21` — the element screenshot for the fingerprint.
- `scripts/reference-image-held.json` — the two held entries that surfaced this gap.
