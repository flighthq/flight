import { cloneBitmap, createBitmap } from '../packages/bitmap/src/bitmap.ts';
import type { Bitmap } from '../packages/bitmap/src/types.ts';
import { compareReferenceRendererCaptures } from './reference-renderer-capture-parity.ts';
import type { ReferenceRendererCapture, ReferenceRendererCaptureSet } from './reference-renderer-capture-parity.ts';
import {
  assertReferenceRenderer,
  assertReferenceRendererEnvironment,
  assertReferenceRendererScene,
  REFERENCE_RASTER_PARITY_POLICY,
  REFERENCE_RENDERER_SCENE,
} from './reference-renderer-scene.ts';
import type { ReferenceRenderer } from './reference-renderer-scene.ts';

describe('reference renderer scene oracle', () => {
  it('accepts the complete explicit scene contract', () => {
    expect(() => assertReferenceRendererScene(createCompleteFixture(), expectedTransitions)).not.toThrow();
  });

  it.each([
    ['filled shape', clearFilledRectangle, /filled rectangle/u],
    ['filled triangle', clearFilledTriangle, /filled triangle/u],
    ['stroked shape', clearStrokedRectangle, /stroked rectangle/u],
    ['sprite', clearSprite, /sprite quadrant/u],
    ['text', clearText, /text:/u],
    ['visible pointer result', restoreInitialControl, /pointer activated control/u],
  ] as const)('rejects a missing %s', (_label, mutate, message) => {
    const fixture = createCompleteFixture();
    mutate(fixture);
    expect(() => assertReferenceRendererScene(fixture, expectedTransitions)).toThrow(message);
  });

  it('rejects omission of the pointer event even when final-looking pixels are supplied', () => {
    expect(() => assertReferenceRendererScene(createCompleteFixture(), ['initial'])).toThrow(/pointer transition/u);
  });

  it('rejects a silent all-background render', () => {
    const scene = REFERENCE_RENDERER_SCENE;
    expect(() =>
      assertReferenceRendererScene(createBitmap(scene.width, scene.height, scene.background), expectedTransitions),
    ).toThrow(/filled rectangle/u);
  });

  it('rejects wrong backend selection instead of accepting another renderer as the requested path', () => {
    expect(() => assertReferenceRenderer('webgl', 'canvas')).toThrow(/requested canvas/u);
    expect(() => assertReferenceRenderer('canvas', 'canvas')).not.toThrow();
  });

  it('pins DPR instead of permitting a resized capture to weaken region assertions', () => {
    expect(() => assertReferenceRendererEnvironment(2)).toThrow(/devicePixelRatio/u);
    expect(() => assertReferenceRendererEnvironment(1)).not.toThrow();
  });
});

describe('reference renderer full-resolution capture parity', () => {
  it('locks the calibrated pixel-space policy so tolerance weakening is a reviewed change', () => {
    expect(REFERENCE_RASTER_PARITY_POLICY).toEqual({
      channelTolerance: 8,
      maxMismatchFraction: 0.002,
    });
  });

  it('uses Canvas as canonical, keeps DOM on its element representation and accepts matching rasters', () => {
    const captures = createCaptureSet(createCompleteFixture());
    const result = compareReferenceRendererCaptures(captures, captures);

    expect(result).toMatchObject({
      canonical: 'canvas',
      domRepresentation: 'registered-element-screenshot',
      failures: [],
      passed: true,
    });
    expect(result.parity.map(({ renderer }) => renderer)).toEqual(['webgl', 'webgpu']);
    expect(result.determinism).toEqual({ canvas: 0, dom: 0, webgl: 0, webgpu: 0 });
  });

  it('fails a raster change just beyond both fixed tolerance axes', () => {
    const captures = createCaptureSet(createCompleteFixture());
    const webgl = captures.webgl.image.data;
    const changedPixels = Math.floor((webgl.length / 4) * REFERENCE_RASTER_PARITY_POLICY.maxMismatchFraction) + 1;
    for (let pixel = 0; pixel < changedPixels; pixel++) webgl[pixel * 4] += 9;

    const result = compareReferenceRendererCaptures(captures);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([expect.stringContaining('webgl: decoded-pixel mismatch fraction')]);
  });

  it('fails repeat determinism on one changed decoded pixel', () => {
    const first = createCaptureSet(createCompleteFixture());
    const repeat = createCaptureSet(createCompleteFixture());
    repeat.canvas.image.data[0] += 1;

    const result = compareReferenceRendererCaptures(first, repeat);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('canvas: repeat capture changed 1/153600 decoded pixels');
  });

  it('fails a DOM result that did not come from the registered DOM target', () => {
    const captures = createCaptureSet(createCompleteFixture());
    captures.dom = { ...captures.dom, status: readyStatus('canvas') };

    const result = compareReferenceRendererCaptures(captures);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('dom: capture target kind does not match its route');
  });

  it('fails a renderer registry miss even when pixels happen to satisfy the region oracle', () => {
    const captures = createCaptureSet(createCompleteFixture());
    captures.webgpu = {
      ...captures.webgpu,
      logs: 'createRenderProxy: node kind has no registered renderer',
    };

    const result = compareReferenceRendererCaptures(captures);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('webgpu: capture logged an undrawn renderer registry miss');
  });
});

const expectedTransitions = ['initial', 'pointer-down', 'activated'] as const;

function createCompleteFixture(): Bitmap {
  const scene = REFERENCE_RENDERER_SCENE;
  const bitmap = createBitmap(scene.width, scene.height, scene.background);
  fill(bitmap, scene.filledRectangle, scene.filledRectangle.color);

  set(bitmap, 222, 160, scene.filledTriangle.color);

  const stroke = scene.strokedRectangle;
  fill(bitmap, { x: stroke.x - 2, y: stroke.y, width: stroke.thickness, height: stroke.height }, stroke.color);

  const sprite = scene.sprite;
  const half = sprite.size / 2;
  fill(bitmap, { x: sprite.x, y: sprite.y, width: half, height: half }, sprite.colors[0]);
  fill(bitmap, { x: sprite.x + half, y: sprite.y, width: half, height: half }, sprite.colors[1]);
  fill(bitmap, { x: sprite.x, y: sprite.y + half, width: half, height: half }, sprite.colors[2]);
  fill(bitmap, { x: sprite.x + half, y: sprite.y + half, width: half, height: half }, sprite.colors[3]);

  let ink = 0;
  for (let y = scene.text.y; y < scene.text.y + scene.text.height && ink < 40; y += 2) {
    for (let x = scene.text.x; x < scene.text.x + scene.text.width && ink < 40; x += 2) {
      set(bitmap, x, y, scene.text.color);
      ink++;
    }
  }

  const interaction = scene.interaction;
  fill(bitmap, interaction, interaction.activeColor);
  fill(bitmap, { x: interaction.x, y: interaction.y, width: 2, height: interaction.height }, interaction.strokeColor);
  fill(
    bitmap,
    {
      x: interaction.eventX - interaction.markerSize / 2,
      y: interaction.eventY - interaction.markerSize / 2,
      width: interaction.markerSize,
      height: interaction.markerSize,
    },
    interaction.markerColor,
  );
  return bitmap;
}

function clearFilledRectangle(bitmap: Bitmap): void {
  fill(bitmap, REFERENCE_RENDERER_SCENE.filledRectangle, REFERENCE_RENDERER_SCENE.background);
}

function clearFilledTriangle(bitmap: Bitmap): void {
  fill(bitmap, { x: 160, y: 100, width: 132, height: 100 }, REFERENCE_RENDERER_SCENE.background);
}

function clearStrokedRectangle(bitmap: Bitmap): void {
  const stroke = REFERENCE_RENDERER_SCENE.strokedRectangle;
  fill(
    bitmap,
    {
      x: stroke.x - stroke.thickness,
      y: stroke.y - stroke.thickness,
      width: stroke.width + 20,
      height: stroke.height + 20,
    },
    REFERENCE_RENDERER_SCENE.background,
  );
}

function clearSprite(bitmap: Bitmap): void {
  const sprite = REFERENCE_RENDERER_SCENE.sprite;
  fill(
    bitmap,
    { x: sprite.x, y: sprite.y, width: sprite.size, height: sprite.size },
    REFERENCE_RENDERER_SCENE.background,
  );
}

function clearText(bitmap: Bitmap): void {
  fill(bitmap, REFERENCE_RENDERER_SCENE.text, REFERENCE_RENDERER_SCENE.background);
}

function restoreInitialControl(bitmap: Bitmap): void {
  fill(bitmap, REFERENCE_RENDERER_SCENE.interaction, REFERENCE_RENDERER_SCENE.interaction.initialColor);
}

function fill(
  bitmap: Bitmap,
  region: Readonly<{ x: number; y: number; width: number; height: number }>,
  color: number,
): void {
  for (let y = Math.max(0, region.y); y < Math.min(bitmap.height, region.y + region.height); y++) {
    for (let x = Math.max(0, region.x); x < Math.min(bitmap.width, region.x + region.width); x++) {
      set(bitmap, x, y, color);
    }
  }
}

function set(bitmap: Bitmap, x: number, y: number, color: number): void {
  const offset = (y * bitmap.width + x) * 4;
  bitmap.data[offset] = (color >>> 24) & 0xff;
  bitmap.data[offset + 1] = (color >>> 16) & 0xff;
  bitmap.data[offset + 2] = (color >>> 8) & 0xff;
  bitmap.data[offset + 3] = color & 0xff;
}

function createCaptureSet(bitmap: Bitmap): Record<ReferenceRenderer, ReferenceRendererCapture> {
  return Object.fromEntries(
    (['canvas', 'dom', 'webgl', 'webgpu'] as const).map((renderer) => [
      renderer,
      {
        image: {
          data: new Uint8Array(cloneBitmap(bitmap).data),
          height: bitmap.height,
          width: bitmap.width,
        },
        logs: '',
        status: readyStatus(renderer),
      },
    ]),
  ) as Record<ReferenceRenderer, ReferenceRendererCapture>;
}

function readyStatus(renderer: ReferenceRenderer): unknown {
  return {
    error: null,
    oracle: 'invoked',
    provenance: { targetKind: renderer },
    state: 'ready',
  };
}
