import { cloneBitmap, createBitmap } from '../packages/bitmap/src/bitmap.ts';
import type { Bitmap } from '../packages/bitmap/src/types.ts';
import { compareReferenceRendererCaptures } from './reference-renderer-capture-parity.ts';
import type { NativeReferenceRendererCapture, ReferenceRendererCapture } from './reference-renderer-capture-parity.ts';
import { createReferenceRendererFontFixture } from './reference-renderer-font.ts';
import {
  assertReferenceRenderer,
  assertReferenceRendererEnvironment,
  assertReferenceRendererScene,
  REFERENCE_RASTER_PARITY_POLICY,
  REFERENCE_BROWSER_ENVIRONMENT_DESCRIPTOR,
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

  it('rejects every individually dropped glyph instead of accepting a partial line', () => {
    for (const [index, character] of [...REFERENCE_RENDERER_SCENE.text.value].entries()) {
      if (character === ' ') continue;
      const fixture = createCompleteFixture();
      fill(
        fixture,
        {
          x: REFERENCE_RENDERER_SCENE.text.x + index * 24,
          y: REFERENCE_RENDERER_SCENE.text.y,
          width: 22,
          height: 40,
        },
        REFERENCE_RENDERER_SCENE.background,
      );
      expect(() => assertReferenceRendererScene(fixture, expectedTransitions)).toThrow(/text(?: glyph)?:/u);
    }
  });

  it('rejects two-glyph text even when the aggregate ink floor is weakened to one', () => {
    const fixture = createCompleteFixture();
    for (const [index, character] of [...REFERENCE_RENDERER_SCENE.text.value].entries()) {
      if (character === ' ' || index < 2) continue;
      fill(
        fixture,
        {
          x: REFERENCE_RENDERER_SCENE.text.x + index * 24,
          y: REFERENCE_RENDERER_SCENE.text.y,
          width: 22,
          height: 40,
        },
        REFERENCE_RENDERER_SCENE.background,
      );
    }
    expect(() => assertReferenceRendererScene(fixture, expectedTransitions, 1)).toThrow(/text glyph 3/u);
  });

  it('rejects a one-pixel sprite shift through its authored extent anchors', () => {
    const fixture = createCompleteFixture();
    const sprite = REFERENCE_RENDERER_SCENE.sprite;
    const shifted = cloneBitmap(fixture);
    clearSprite(shifted);
    for (let y = 0; y < sprite.size; y++) {
      for (let x = 0; x < sprite.size; x++) {
        const source = ((sprite.y + y) * fixture.width + sprite.x + x) * 4;
        const target = ((sprite.y + y) * fixture.width + sprite.x + x + 1) * 4;
        shifted.data.set(fixture.data.subarray(source, source + 4), target);
      }
    }
    expect(() => assertReferenceRendererScene(shifted, expectedTransitions)).toThrow(/sprite .*extent/u);
  });

  it('rejects a one-pixel triangle shift through its authored edge anchor', () => {
    const shifted = createCompleteFixture();
    set(shifted, 170, 189, REFERENCE_RENDERER_SCENE.background);
    set(shifted, 171, 189, REFERENCE_RENDERER_SCENE.filledTriangle.color);
    expect(() => assertReferenceRendererScene(shifted, expectedTransitions)).toThrow(/triangle left edge/u);
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
      maxMismatchFraction: 0.008,
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
    expect(result.parity.map(({ renderer }) => renderer)).toEqual(['dom', 'webgl', 'webgpu']);
    expect(result.determinism).toEqual({ canvas: 0, dom: 0, webgl: 0, webgpu: 0 });
  });

  it('accepts native GL and wgpu only with the exact TypeScript-generated SFNT bytes', () => {
    const bitmap = createCompleteFixture();
    const captures = createCaptureSet(bitmap);
    const native = createNativeCaptureSet(bitmap);

    const result = compareReferenceRendererCaptures(captures, captures, native, native);
    expect(result.passed).toBe(true);
    expect(result.parity.map(({ renderer }) => renderer)).toEqual(['dom', 'webgl', 'webgpu', 'rust-gl', 'rust-wgpu']);
    expect(result.nativeDeterminism).toEqual({ 'rust-gl': 0, 'rust-wgpu': 0 });

    const changedFont = new Uint8Array(native['rust-gl'].fontBytes);
    changedFont[0] ^= 1;
    native['rust-gl'] = { ...native['rust-gl'], fontBytes: changedFont };
    expect(compareReferenceRendererCaptures(captures, null, native).failures).toContain(
      'rust-gl: capture SFNT bytes differ from the TypeScript fixture',
    );
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
  set(bitmap, 170, 189, scene.filledTriangle.color);

  const stroke = scene.strokedRectangle;
  fill(bitmap, { x: stroke.x - 2, y: stroke.y, width: stroke.thickness, height: stroke.height }, stroke.color);

  const sprite = scene.sprite;
  const half = sprite.size / 2;
  fill(bitmap, { x: sprite.x, y: sprite.y, width: half, height: half }, sprite.colors[0]);
  fill(bitmap, { x: sprite.x + half, y: sprite.y, width: half, height: half }, sprite.colors[1]);
  fill(bitmap, { x: sprite.x, y: sprite.y + half, width: half, height: half }, sprite.colors[2]);
  fill(bitmap, { x: sprite.x + half, y: sprite.y + half, width: half, height: half }, sprite.colors[3]);

  for (const [index, character] of [...scene.text.value].entries()) {
    if (character !== ' ') {
      fill(bitmap, { x: scene.text.x + index * 24, y: scene.text.y + 4, width: 11, height: 11 }, scene.text.color);
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

function createNativeCaptureSet(bitmap: Bitmap): Record<'rust-gl' | 'rust-wgpu', NativeReferenceRendererCapture> {
  const fontBytes = createReferenceRendererFontFixture().bytes;
  const capture = (): NativeReferenceRendererCapture => {
    const initialImage = cloneBitmap(bitmap);
    initialImage.data[0] ^= 1;
    return {
      fontBytes,
      image: cloneBitmap(bitmap),
      initialImage,
      logs: '',
      status: {
        colorSpace: 'srgb',
        devicePixelRatio: 1,
        fontBytes: 3096,
        fontFnv1a32: '29fd2e97',
        glProfile: 'core',
        glRenderer: 'llvmpipe (LLVM test)',
        glVersion: '4.5 (Core Profile) Mesa test',
        height: REFERENCE_RENDERER_SCENE.height,
        state: 'ready',
        wgpuAdapter: 'llvmpipe (LLVM test)',
        wgpuBackend: 'Vulkan',
        width: REFERENCE_RENDERER_SCENE.width,
      },
    };
  };
  return { 'rust-gl': capture(), 'rust-wgpu': capture() };
}

function readyStatus(renderer: ReferenceRenderer): unknown {
  return {
    error: null,
    oracle: 'invoked',
    provenance: { environmentDescriptor: REFERENCE_BROWSER_ENVIRONMENT_DESCRIPTOR, targetKind: renderer },
    state: 'ready',
  };
}
