import type { Bitmap } from '@flighthq/bitmap/contract';

export type ReferenceRenderer = 'canvas' | 'dom' | 'webgl' | 'webgpu';

export interface ReferenceRegion {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

// This is the code-facing contract the native reference program will mirror. Coordinates, colours,
// generated pixels and input timing live here rather than being inferred from one renderer's output.
export const REFERENCE_RENDERER_SCENE = {
  width: 480,
  height: 320,
  devicePixelRatio: 1,
  colorSpace: 'srgb' as const,
  background: 0x101827ff,
  filledRectangle: { x: 24, y: 24, width: 124, height: 72, color: 0x2878e8ff },
  filledTriangle: {
    points: [
      [170, 190],
      [222, 112],
      [282, 190],
    ] as const,
    color: 0x18c9c3ff,
  },
  strokedRectangle: { x: 24, y: 118, width: 124, height: 72, thickness: 10, color: 0xe23aa8ff },
  sprite: {
    x: 202,
    y: 24,
    size: 64,
    colors: [0xf24848ff, 0xf6cf3aff, 0x45d36bff, 0x8c62eaff] as const,
  },
  text: {
    x: 24,
    y: 218,
    width: 252,
    height: 70,
    value: 'FLIGHT TS',
    font: 'FlightReferenceSynthetic',
    size: 28,
    color: 0xffc94aff,
  },
  interaction: {
    x: 310,
    y: 208,
    width: 142,
    height: 80,
    initialColor: 0xed7b2fff,
    activeColor: 0x25b86aff,
    strokeColor: 0xffffffff,
    markerColor: 0x42e8ffff,
    markerSize: 12,
    eventX: 416,
    eventY: 248,
    pointerId: 7,
    pointerDownTimeMs: 1_000,
    pointerUpTimeMs: 1_016,
    animationTimeMs: 0,
  },
} as const;

export const REFERENCE_RENDERERS: readonly ReferenceRenderer[] = ['canvas', 'dom', 'webgl', 'webgpu'];

export const REFERENCE_BROWSER_ENVIRONMENT_DESCRIPTOR =
  'browser=playwright-chromium;canvas=skia;dom=blink;webgl=angle-swiftshader;webgpu=dawn-swiftshader-vulkan';

// Calibrated in full-resolution decoded-pixel space, not inherited from the 16x16 fingerprint gate.
// The small channel allowance absorbs renderer edge/glyph coverage rounding; the fraction cap keeps
// omissions of any authored component far outside the accepted band.
export const REFERENCE_RASTER_PARITY_POLICY = {
  channelTolerance: 8,
  maxMismatchFraction: 0.008,
} as const;

// The full-frame cap catches missing whole components; these feature policies prevent a small but
// meaningful defect from spending the unused part of that global budget. Regions deliberately hug
// the authored feature, so their budgets scale with one glyph/edge rather than the 480x320 frame.
export const REFERENCE_RASTER_FEATURE_POLICIES = [
  {
    label: 'sprite extent',
    region: {
      x: REFERENCE_RENDERER_SCENE.sprite.x,
      y: REFERENCE_RENDERER_SCENE.sprite.y,
      width: REFERENCE_RENDERER_SCENE.sprite.size,
      height: REFERENCE_RENDERER_SCENE.sprite.size,
    },
    channelTolerance: 0,
    maxMismatchedPixels: 0,
  },
  {
    label: 'triangle geometry',
    region: { x: 166, y: 108, width: 121, height: 87 },
    channelTolerance: 8,
    maxMismatchedPixels: 200,
  },
  ...REFERENCE_RENDERER_SCENE.text.value.split('').flatMap((character, index) =>
    character === ' '
      ? []
      : [
          {
            label: `text glyph ${index + 1}`,
            region: {
              x: REFERENCE_RENDERER_SCENE.text.x + index * 24,
              y: REFERENCE_RENDERER_SCENE.text.y,
              width: 22,
              height: 40,
            },
            channelTolerance: 16,
            maxMismatchedPixels: 150,
          },
        ],
  ),
] as const;

export function assertReferenceRenderer(
  actual: string,
  expected: string | undefined,
): asserts actual is ReferenceRenderer {
  if (!REFERENCE_RENDERERS.includes(expected as ReferenceRenderer)) {
    throw new Error(`[reference-renderer] unsupported requested backend ${String(expected)}`);
  }
  if (actual !== expected) {
    throw new Error(`[reference-renderer] requested ${expected}, but the target created ${actual}`);
  }
}

export function assertReferenceRendererEnvironment(devicePixelRatio: number): void {
  if (devicePixelRatio !== REFERENCE_RENDERER_SCENE.devicePixelRatio) {
    throw new Error(
      `[reference-renderer] devicePixelRatio ${devicePixelRatio} != ${REFERENCE_RENDERER_SCENE.devicePixelRatio}`,
    );
  }
}

export function assertReferenceRendererScene(
  bitmap: Readonly<Bitmap>,
  interactionTransitions: readonly string[],
  minimumTextInk = 850,
): void {
  const scene = REFERENCE_RENDERER_SCENE;
  const scaleX = bitmap.width / scene.width;
  const scaleY = bitmap.height / scene.height;
  if (scaleX !== scaleY || scaleX !== scene.devicePixelRatio) {
    throw new Error(
      `[reference-renderer] capture dimensions ${bitmap.width}x${bitmap.height} do not match ` +
        `${scene.width}x${scene.height} at DPR ${scene.devicePixelRatio}`,
    );
  }

  const pixel = (x: number, y: number): readonly [number, number, number] => {
    const px = Math.max(0, Math.min(bitmap.width - 1, Math.round(x * scaleX)));
    const py = Math.max(0, Math.min(bitmap.height - 1, Math.round(y * scaleY)));
    const offset = (py * bitmap.width + px) * 4;
    return [bitmap.data[offset]!, bitmap.data[offset + 1]!, bitmap.data[offset + 2]!];
  };

  requireColor('background', pixel(470, 310), scene.background, 8);

  const fill = scene.filledRectangle;
  requireRegionColor('filled rectangle', pixel, inset(fill, 12), fill.color, 8, 0.9);

  requireColor('filled triangle', pixel(222, 160), scene.filledTriangle.color, 10);
  // The leftmost filled scanline moves off this exact anchor under a one-pixel horizontal mutation.
  // Its browser coverage is deliberately partial, hence the wider edge-only channel allowance.
  requireColor('filled triangle left edge', pixel(170, 189), scene.filledTriangle.color, 70);

  const stroke = scene.strokedRectangle;
  requireRegionColor(
    'stroked rectangle left edge',
    pixel,
    { x: stroke.x - 2, y: stroke.y + 14, width: stroke.thickness, height: stroke.height - 28 },
    stroke.color,
    12,
    0.65,
  );
  requireColor(
    'stroked rectangle hollow center',
    pixel(stroke.x + stroke.width / 2, stroke.y + stroke.height / 2),
    scene.background,
    8,
  );

  const sprite = scene.sprite;
  const quarter = sprite.size / 4;
  const spriteSamples = [
    [sprite.x + quarter, sprite.y + quarter],
    [sprite.x + sprite.size - quarter, sprite.y + quarter],
    [sprite.x + quarter, sprite.y + sprite.size - quarter],
    [sprite.x + sprite.size - quarter, sprite.y + sprite.size - quarter],
  ] as const;
  for (const [index, sample] of spriteSamples.entries()) {
    requireColor(`sprite quadrant ${index + 1}`, pixel(sample[0], sample[1]), sprite.colors[index]!, 4);
  }
  for (const [label, x, y, color] of [
    ['top-left', sprite.x, sprite.y, sprite.colors[0]],
    ['top-right', sprite.x + sprite.size - 1, sprite.y, sprite.colors[1]],
    ['bottom-left', sprite.x, sprite.y + sprite.size - 1, sprite.colors[2]],
    ['bottom-right', sprite.x + sprite.size - 1, sprite.y + sprite.size - 1, sprite.colors[3]],
  ] as const) {
    requireColor(`sprite ${label} extent`, pixel(x, y), color, 4);
  }
  requireColor('sprite left anchor', pixel(sprite.x - 1, sprite.y + sprite.size / 2), scene.background, 8);
  requireColor('sprite right anchor', pixel(sprite.x + sprite.size, sprite.y + sprite.size / 2), scene.background, 8);

  const text = scene.text;
  const textInk = countRegionColor(pixel, text, text.color, 80, 1);
  if (textInk < minimumTextInk || textInk > 1_600) {
    throw new Error(`[reference-renderer] text: ${textInk} matching pixels, expected ${minimumTextInk}..1600`);
  }
  for (const [index, character] of [...text.value].entries()) {
    if (character === ' ') continue;
    const glyphInk = countRegionColor(
      pixel,
      { x: text.x + index * 24, y: text.y, width: 22, height: 40 },
      text.color,
      80,
      1,
    );
    if (glyphInk < 60) {
      throw new Error(
        `[reference-renderer] text glyph ${index + 1} (${character}): ${glyphInk} matching pixels, expected at least 60`,
      );
    }
  }

  const interaction = scene.interaction;
  requireColor(
    'pointer activated control stroke',
    pixel(interaction.x, interaction.y + interaction.height / 2),
    interaction.strokeColor,
    12,
  );
  requireRegionColor('pointer activated control', pixel, inset(interaction, 14), interaction.activeColor, 12, 0.72);
  requireRegionColor(
    'pointer marker',
    pixel,
    {
      x: interaction.eventX - interaction.markerSize / 2,
      y: interaction.eventY - interaction.markerSize / 2,
      width: interaction.markerSize,
      height: interaction.markerSize,
    },
    interaction.markerColor,
    10,
    0.55,
  );

  const expectedTransitions = ['initial', 'pointer-down', 'activated'];
  if (
    interactionTransitions.length !== expectedTransitions.length ||
    interactionTransitions.some((value, index) => value !== expectedTransitions[index])
  ) {
    throw new Error(
      `[reference-renderer] pointer transition: got ${interactionTransitions.join(' -> ') || '(none)'}, expected ` +
        expectedTransitions.join(' -> '),
    );
  }
}

function inset(region: ReferenceRegion, amount: number): ReferenceRegion {
  return {
    x: region.x + amount,
    y: region.y + amount,
    width: region.width - amount * 2,
    height: region.height - amount * 2,
  };
}

function packedRgb(color: number): readonly [number, number, number] {
  return [(color >>> 24) & 0xff, (color >>> 16) & 0xff, (color >>> 8) & 0xff];
}

function requireColor(
  label: string,
  actual: readonly [number, number, number],
  expected: number,
  tolerance: number,
): void {
  const rgb = packedRgb(expected);
  if (Math.max(Math.abs(actual[0] - rgb[0]), Math.abs(actual[1] - rgb[1]), Math.abs(actual[2] - rgb[2])) > tolerance) {
    throw new Error(
      `[reference-renderer] ${label}: got rgb(${actual.join(',')}), expected rgb(${rgb.join(',')}) ±${tolerance}`,
    );
  }
}

function requireRegionColor(
  label: string,
  pixel: (x: number, y: number) => readonly [number, number, number],
  region: ReferenceRegion,
  expected: number,
  tolerance: number,
  minimumFraction: number,
): void {
  let total = 0;
  let matching = 0;
  const rgb = packedRgb(expected);
  for (let y = region.y; y < region.y + region.height; y += 3) {
    for (let x = region.x; x < region.x + region.width; x += 3) {
      total++;
      const actual = pixel(x, y);
      const delta = Math.max(Math.abs(actual[0] - rgb[0]), Math.abs(actual[1] - rgb[1]), Math.abs(actual[2] - rgb[2]));
      if (delta <= tolerance) matching++;
    }
  }
  if (matching / total < minimumFraction) {
    throw new Error(
      `[reference-renderer] ${label}: ${matching}/${total} matching samples, expected at least ` +
        `${Math.ceil(total * minimumFraction)}`,
    );
  }
}

function countRegionColor(
  pixel: (x: number, y: number) => readonly [number, number, number],
  region: ReferenceRegion,
  expected: number,
  tolerance: number,
  step: number,
): number {
  const rgb = packedRgb(expected);
  let matching = 0;
  for (let y = region.y; y < region.y + region.height; y += step) {
    for (let x = region.x; x < region.x + region.width; x += step) {
      const actual = pixel(x, y);
      if (
        Math.max(Math.abs(actual[0] - rgb[0]), Math.abs(actual[1] - rgb[1]), Math.abs(actual[2] - rgb[2])) <= tolerance
      ) {
        matching++;
      }
    }
  }
  return matching;
}
