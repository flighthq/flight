# DOM Screenshot / Fingerprint Artifact Divergence

**Status: RESOLVED.** The reuse fix has landed; both consumers now share a single artifact.

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

Two of these (`rive-import/dom`, `shape-stroke-ring-fallback/dom`) had no hold in `reference-image-held.json`. Their contaminated screenshots could have been commissioned as reference images while the fingerprint gate reported green.

The viewport fix (`page.setViewportSize()` to match the container) removes today's instance of this symptom. It does not close the gap: any DOM defect that manifests in the viewport screenshot but not in the element screenshot is invisible to the regression gate, corpus-wide.

The DOM screenshot branch in `captureEntry.ts` now takes an element screenshot of `body > div` (the container div) instead of `page.screenshot()`. This is the same mechanism the readback already uses (`captureDomReadback.ts:21`), so the reviewed image and the fingerprinted image are the same artifact — one capture, two uses, matching every other backend.

The viewport fix (`page.setViewportSize()` to match the container) remains in place — a capture viewport matching the scene is correct on its own terms, independent of the screenshot method.

The original comment in the DOM branch cited "locator screenshots wait for DOM stability and can consume Playwright's full 30s action timeout on platform-text pages" as the reason for avoiding element screenshots. This concern was contradicted by the readback path (`captureDomReadback.ts:21`) already taking an element screenshot on those exact pages for the fingerprint — if it caused 30s timeouts there, the fingerprint path would already be hitting them.

## The fix

Option 1 was chosen: `captureDomReadback` now returns the element screenshot buffer, which
`waitForRenderVerification` threads through as the reviewed image. Both the fingerprint and the
human-reviewed screenshot are derived from the same `element.screenshot()` bytes. The two-artifact
gap no longer exists for DOM entries.

## Related

- [Capture verification tiers](capture-verification-tiers.md) — the organizing rule this gap touches.
- `captureEntry.ts` — the DOM screenshot branch (reuses the element screenshot from `captureDomReadback`).
- `captureDomReadback.ts:21` — the element screenshot, now shared by both consumers.
- `scripts/reference-image-held.json` — the two held entries that surfaced this gap.
