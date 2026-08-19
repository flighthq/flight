# DOM Screenshot / Fingerprint Artifact Divergence

**Status: DESIGN RECORD — no implementation proposed.** Written by builder during H3 (DOM white-background scoping). This documents a structural gap in the capture pipeline; it is not a task to act on without a ruling.

## The gap

For canvas, WebGL, and WebGPU captures, the screenshot a human reviews and the fingerprint the regression gate checks are derived from the **same artifact** — the verifier's render image (`window.__ftRenderImage`), a data URL read from the GPU/canvas surface. One frame, two uses.

DOM is explicitly excluded from this path:

```
captureEntry.ts:500
} else if (dataUrl && backend !== 'dom') {
```

For DOM captures, two different artifacts exist:

1. **Fingerprint source**: the DOM readback — `captureDomReadback.ts:21` takes a Playwright element screenshot of the container div (`element.screenshot({ animations: 'disabled' })`), clipped to the container. Same browser compositor as the page screenshot. This is what the regression gate compares.

2. **Screenshot source**: `page.screenshot()` — a Playwright full-viewport capture of the browser page. This is what a human sees in the gallery and reviews for commissioning.

Both are browser compositor output — the same camera, not two. They differ in exactly two things: what is included in the frame (element-clipped vs full viewport) and the instant each is taken. That is still enough to diverge, and when they do, the gate is structurally blind to defects visible only in the screenshot.

## How it bit us

Five DOM scenes requested dimensions smaller than the hardcoded 800×600 capture viewport. The `page.screenshot()` captured the full viewport, producing screenshots with white gaps around the scene's container div. The element screenshot behind the fingerprint was clipped to the container and clean — it sees only what the scene drew, not the viewport around it.

Two of these (`rive-import/dom`, `shape-stroke-ring-fallback/dom`) had no hold in `reference-image-held.json`. Their contaminated screenshots could have been commissioned as reference images while the fingerprint gate reported green, because the gate was checking a different picture.

The viewport fix (`page.setViewportSize()` to match the container) removes today's instance of this symptom. It does not close the gap: any DOM defect that manifests in the viewport screenshot but not in the DOM readback is invisible to the regression gate, corpus-wide.

## The scope

Every DOM cell in the corpus — not just these five — has this two-artifact structure. The current count is 51 DOM entries across functional scenes. For all 51, the regression gate and the human reviewer are looking at different pictures.

## What diverges

The two artifacts can disagree on:

- **Viewport-level artifacts**: page background color, page margin/padding, scroll position, viewport size mismatch (the instance that surfaced this).
- **Framing, not rasterization**: both artifacts are browser compositor output, so CSS, sub-pixel and font rendering cannot differ between them. What differs is what each frame includes — the readback is clipped to the container, the screenshot is the full viewport.
- **Timing**: the screenshot is taken at the moment `page.screenshot()` fires; the DOM readback may rasterize at a different frame, especially if layout observers or transitions are active.

## Options (not recommendations)

1. **Unify the artifacts**: use the DOM readback as the screenshot source (same as the fingerprint), so both consumers see the same picture. Loses the browser-compositor fidelity of the Playwright screenshot.

2. **Use the screenshot as the fingerprint source**: hash the `page.screenshot()` bytes instead of the DOM readback for DOM entries. Loses the layout-observer-immune readback; screenshots on platform-text pages may be unstable.

3. **Dual-track**: keep both, but record the divergence explicitly in the capture status so a consuming gate can flag when they disagree. Adds complexity; the gate still has to decide which picture to trust.

4. **Accept the gap**: document it (this record) and rely on human review to catch DOM-only screenshot defects. The viewport fix closes the known instance; remaining divergence is theoretical until a second instance surfaces.

None of these is recommended here. The choice depends on which framing the regression gate should be authoritative over — the container-clipped frame or the full viewport around it — and that is a design decision for the capture-verification tiers doctrine.

## Related

- [Capture verification tiers](capture-verification-tiers.md) — the organizing rule this gap touches.
- `captureEntry.ts:500` — the exclusion that creates the two-artifact split.
- `captureDomReadback.ts` — the DOM-specific readback path.
- `scripts/reference-image-held.json` — the two held entries that surfaced this gap.
