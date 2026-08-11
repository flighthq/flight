import { createHash } from 'node:crypto';

import type { CaptureScreenshotHashPage } from './captureScreenshotHash';
import { hashCaptureScreenshotPixels, hashCaptureScreenshotPixelsOrNull } from './captureScreenshotHash';

// WHAT THESE TESTS COVER, AND WHAT THEY DO NOT.
//
// The decode itself runs in a real browser and is exercised by the functional capture suite, not here —
// there is no PNG decoder in Node, which is the whole reason the decode was put in the page. So these
// pin the CONTRACT around the decode: the screenshot reaches the page, the page's digest is what comes
// back, and a page that cannot decode fails loudly instead of degrading to something that looks like a
// hash. A test double supplies the digest, so none of this asserts that a PNG decodes correctly.

describe('hashCaptureScreenshotPixels', () => {
  it('sends the screenshot to the page as base64 and returns the digest the page computed', () => {
    const digest = 'a'.repeat(64);
    let received: string | null = null;
    const page: CaptureScreenshotHashPage = {
      evaluate: async (_fn, argument) => {
        received = argument as string;
        return digest as never;
      },
    };

    return hashCaptureScreenshotPixels(page, new Uint8Array([137, 80, 78, 71])).then((hash) => {
      expect(received).toBe(Buffer.from([137, 80, 78, 71]).toString('base64'));
      expect(hash).toBe(digest);
    });
  });

  it('does NOT hash the encoded bytes — the defect this replaces', () => {
    // The regression lock. If someone reverts this to sha256 over the PNG buffer, the returned hash
    // becomes the encoded-bytes digest and this fails. Stated as a value rather than a shape so the
    // comparison is against the exact thing that used to be written into baselines.
    const screenshot = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const encodedBytesDigest = createHash('sha256').update(screenshot).digest('hex');
    const pageDigest = 'b'.repeat(64);
    const page: CaptureScreenshotHashPage = { evaluate: async () => pageDigest as never };

    return hashCaptureScreenshotPixels(page, screenshot).then((hash) => {
      expect(hash).toBe(pageDigest);
      expect(hash).not.toBe(encodedBytesDigest);
    });
  });

  it('THROWS when the page cannot produce a digest, rather than degrading to a different quantity', () => {
    // A fallback to the encoded-bytes hash would write a value into the column that means something
    // different from every other value in it, and nothing downstream could tell them apart. A failed
    // capture is recoverable; a silently different quantity is not.
    const page: CaptureScreenshotHashPage = { evaluate: async () => null as never };

    return expect(hashCaptureScreenshotPixels(page, new Uint8Array([1]))).rejects.toThrow(
      /rather than a sha256 hex digest/,
    );
  });

  it('rejects a page result that is string-shaped but not a digest', () => {
    // `page.evaluate` returning an error string, or a truncated result, must not be written as a hash.
    const page: CaptureScreenshotHashPage = { evaluate: async () => 'not-a-digest' as never };

    return expect(hashCaptureScreenshotPixels(page, new Uint8Array([1]))).rejects.toThrow(/not-a-digest/);
  });
});

describe('hashCaptureScreenshotPixelsOrNull', () => {
  it('returns null instead of throwing, so a failed capture still records its error', () => {
    // The error path may be reached BECAUSE the page crashed. Throwing there would lose the error
    // report on its way out — an unrecorded failure in place of a recorded one.
    const page: CaptureScreenshotHashPage = {
      evaluate: async () => {
        throw new Error('Target page, context or browser has been closed');
      },
    };

    return expect(hashCaptureScreenshotPixelsOrNull(page, new Uint8Array([1]))).resolves.toBeNull();
  });

  it('returns the digest when the page CAN produce one, so the error path is not degraded by default', () => {
    const digest = 'c'.repeat(64);
    const page: CaptureScreenshotHashPage = { evaluate: async () => digest as never };

    return expect(hashCaptureScreenshotPixelsOrNull(page, new Uint8Array([1]))).resolves.toBe(digest);
  });
});
