import type { Page } from '@playwright/test';

export interface DomReadbackResult {
  provided: boolean;
  screenshot: Buffer | null;
}

/** Supplies a pending page-side DOM verifier with pixels from its registered element. */
export async function provideCaptureDomRenderPixels(page: Page): Promise<DomReadbackResult> {
  const handle = await page
    .evaluateHandle(() => {
      const target = (
        window as unknown as {
          __ftTarget?: { kind?: string; state?: { element?: HTMLElement } };
        }
      ).__ftTarget;
      return target?.kind === 'dom' ? (target.state?.element ?? null) : null;
    })
    .catch(() => null);
  const element = handle?.asElement();
  if (element === null || element === undefined) {
    await handle?.dispose();
    return { provided: false, screenshot: null };
  }
  try {
    const screenshot = await element.screenshot({ animations: 'disabled' }).catch(() => null);
    const source = screenshot === null ? null : `data:image/png;base64,${screenshot.toString('base64')}`;
    const provided = await page.evaluate(async (dataUrl) => {
      const provide = (
        window as unknown as {
          __ftProvideDomRenderPixels?: (
            readback: { data: Uint8ClampedArray; height: number; width: number } | null,
          ) => void;
        }
      ).__ftProvideDomRenderPixels;
      if (provide === undefined) return false;
      if (dataUrl === null) {
        provide(null);
        return true;
      }
      try {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (context === null || canvas.width === 0 || canvas.height === 0) {
          provide(null);
          return true;
        }
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        provide({ data: pixels.data, height: pixels.height, width: pixels.width });
      } catch {
        provide(null);
      }
      return true;
    }, source);
    return { provided, screenshot };
  } finally {
    await handle?.dispose();
  }
}
