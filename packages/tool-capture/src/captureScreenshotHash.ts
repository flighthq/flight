// Hashes what a capture RENDERED, not how it was encoded.
//
// The screenshot arrives as PNG bytes — Playwright's `page.screenshot()`, or a base64 canvas dataURL.
// Hashing those bytes answers "did the encoded artifact change", which is not the question a capture
// baseline is asked: a PNG encoder that changed its filter heuristics, its compression level, or its
// ancillary chunks moves the hash while every pixel is identical, and a real render change is
// indistinguishable from that. Decoding to RGBA first makes the hash answer "did the render change".
//
// THE DECODE HAPPENS IN THE PAGE, because nothing in this repo can decode a PNG in Node —
// `@flighthq/image-codec` is a registry whose real decoders are browser-supplied, and no PNG decoder is
// installed. The browser already does this natively and is already open at the hash site (the page is
// not closed until the `finally` well after), so this reuses a mechanism the capture path already
// depends on rather than adding a dependency.
//
// WHAT IS HASHED IS NOT LITERALLY THE FILE'S SAMPLES: drawImage into a 2d canvas may apply alpha
// premultiplication and colour-space conversion. The digest stays deterministic and still tracks the
// render, which is what it is for — but do not read it as byte-identity with the PNG's decoded pixels.
//
// The threshold is a PARAMETER rather than an import so this module stays free of captureEntry.
//
// ★ PASS null WHEN THE SCENE'S OWN VERIFIER HAS ALREADY APPROVED THE FRAME, AND MEAN IT. A scene declares
// its own `minCoverage`, and functionalVerify honours that declaration; a scene that renders a full-canvas
// solid colour on purpose sets it to 0 and validates itself with a pixel oracle instead. Applying a global
// coverage threshold here after such a frame has PASSED overrules the only party that knows what the scene
// is for, and refuses a correct render. Two blank checks in one capture must not answer to different
// thresholds — so when the verifier has ruled, this one does not run at all.
//
// The DIGEST is computed in the page too, so only a 64-character hex string crosses the bridge. Shipping
// the pixels back would be ~1.9M bytes per capture for an 800x600 frame, per column, per run.

/** The slice of Playwright's `Page` this needs — narrow so a test can supply a double. */
export interface CaptureScreenshotHashPage {
  evaluate<Result, Argument>(fn: (argument: Argument) => Promise<Result>, argument: Argument): Promise<Result>;
}

/**
 * SHA-256 over the screenshot's decoded pixels, prefixed by its dimensions.
 *
 * Dimensions are in the digest because RGBA bytes alone do not pin them: a 100x50 frame and a 50x100
 * frame with the same pixel sequence would otherwise collide, and a resize is exactly the kind of change
 * a capture baseline exists to notice.
 *
 * Throws if the page cannot decode the screenshot. That is deliberate and not a sentinel: falling back
 * to hashing the encoded bytes would silently produce a value that means something DIFFERENT from every
 * other value in the same column, which is worse than a failed capture because nothing downstream could
 * tell the two apart.
 */
export async function hashCaptureScreenshotPixels(
  page: CaptureScreenshotHashPage,
  screenshot: Uint8Array,
  blankCoverage: number | null,
): Promise<string> {
  const base64 = Buffer.from(screenshot).toString('base64');
  const hash = await page.evaluate(
    async (input: { base64: string; blankCoverage: number | null }) => {
      const response = await fetch(`data:image/png;base64,${input.base64}`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('hashCaptureScreenshotPixels: no 2d context to decode into');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;

      // BLANK CHECK, using the capture path's own coverage definition and threshold rather than a second
      // one: the fraction of pixels differing from the top-left (background) sample by more than 8 in any
      // channel. A decode can succeed with correct dimensions and byte count and still yield nothing —
      // a re-read of a WebGPU swapchain does exactly that — and a digest of a blank frame is a perfectly
      // well-formed hash of no information. Shape validation cannot catch it; only content can.
      const backgroundR = pixels[0]!;
      const backgroundG = pixels[1]!;
      const backgroundB = pixels[2]!;
      let differing = 0;
      const total = bitmap.width * bitmap.height;
      for (let index = 0; index < total; index++) {
        const offset = index * 4;
        if (
          Math.abs(pixels[offset]! - backgroundR) > 8 ||
          Math.abs(pixels[offset + 1]! - backgroundG) > 8 ||
          Math.abs(pixels[offset + 2]! - backgroundB) > 8
        ) {
          differing += 1;
        }
      }
      if (input.blankCoverage !== null && differing / total <= input.blankCoverage) return 'blank';

      // `<width>x<height>:` then the raw RGBA, hashed as one buffer.
      const header = new TextEncoder().encode(`${bitmap.width}x${bitmap.height}:`);
      const payload = new Uint8Array(header.length + pixels.length);
      payload.set(header, 0);
      payload.set(pixels, header.length);
      const digest = await crypto.subtle.digest('SHA-256', payload);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    },
    { base64, blankCoverage },
  );

  if (hash === 'blank') {
    throw new Error(
      'hashCaptureScreenshotPixels: the decoded screenshot is blank (coverage at or below the empty-frame ' +
        'threshold), so its digest would be a well-formed hash of no render',
    );
  }
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`hashCaptureScreenshotPixels: page returned '${String(hash)}' rather than a sha256 hex digest`);
  }
  return hash;
}

/**
 * The same hash, or `null` when the page cannot produce one.
 *
 * For the ERROR path only. There the page may already be crashed or navigated away — which is often the
 * very reason the capture failed — and throwing would destroy the error report on its way out, turning a
 * recorded failure into an unrecorded one. `hash` is already nullable on that path, so a missing hash is
 * a shape the consumer handles; an exception is not.
 *
 * Deliberately NOT used on the success path: there, an undecodable screenshot means the capture did not
 * produce what it claims, and silently writing `null` would let a broken capture look like a partial one.
 */
export async function hashCaptureScreenshotPixelsOrNull(
  page: CaptureScreenshotHashPage,
  screenshot: Uint8Array,
  blankCoverage: number | null,
): Promise<string | null> {
  return hashCaptureScreenshotPixels(page, screenshot, blankCoverage).catch(() => null);
}
