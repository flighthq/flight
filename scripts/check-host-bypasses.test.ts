import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  countHostBypasses,
  createEmptyHostBypassReport,
  createHostBypassReport,
  deriveInputIngressListenerOperations,
  formatHostBypassReport,
  bitmapEncodeProgressFailures,
  bitmapEncodeRepairFailures,
  bitmapReadbackProgressFailures,
  bitmapReadbackRepairFailures,
  bitmapDrawTransferProgressFailures,
  bitmapDrawTransferRepairFailures,
  wgpuRenderSurfaceConsumerFailures,
  wgpuRenderSurfaceConsumerSourceFailures,
  wgpuRenderSurfaceRepairFailures,
  wgpuSurfaceArgumentFailures,
  HOST_BYPASS_BUDGET,
  HOST_BYPASS_BUDGET_HISTORY,
  HOST_BYPASS_CLASSIFICATION_HISTORY,
  HOST_BYPASS_DETECTOR_PROVENANCE,
  HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY,
  HOST_BYPASS_SLICE_GUIDANCE,
  HOST_BYPASS_V3_PROGRESS_HISTORY,
  HOST_BYPASS_V4_PROGRESS_HISTORY,
  hostBypassBudgetFailures,
  hostBypassBudgetHistoryFailures,
  hostBypassClassificationHistoryFailures,
  hostBypassCurrentBudgetFailures,
  hostBypassDetectorProvenanceFailures,
  hostBypassDetectorProvenanceHistoryFailures,
  hostBypassSliceGuidanceFailures,
  inputIngressPairingFailures,
  hostBypassV3ProgressHistoryFailures,
  hostBypassV4ProgressHistoryFailures,
  shapeRasterSurfaceProgressFailures,
  shapeRasterSurfaceRepairFailures,
  scale9RasterSurfaceProgressFailures,
  scale9RasterSurfaceRepairFailures,
  textRasterSurfaceCurrentFailures,
  textRasterSurfaceProgressFailures,
  textRasterSurfaceRepairFailures,
  videoCapabilityRepairFailures,
  videoCapabilityProgressFailures,
  scanHostBypasses,
  scanHostBypassSource,
} from './check-host-bypasses';

const ROOT = resolve(import.meta.dirname, '..');

function scanRestoredBitmapDrawTransfer() {
  return scanHostBypassSource(
    'packages/bitmap/src/bitmapDraw.ts',
    `export function drawBitmap(width: number, height: number) {
       return new globalThis.ImageData(width, height);
     }`,
  );
}

function scanRestoredBitmapEncode(expression: 'canvas' | 'image-data') {
  return scanHostBypassSource(
    'packages/bitmap/src/bitmapEncode.ts',
    expression === 'canvas'
      ? `export function encodeBitmap() { return document.createElement('canvas'); }`
      : `export function encodeBitmap(width: number, height: number) {
           return new globalThis.ImageData(width, height);
         }`,
  );
}

function scanRestoredBitmapReadback(
  file: 'packages/bitmap/src/bitmapFrom.ts' | 'packages/bitmap/src/explainBitmapReadback.ts',
  functionName: 'createBitmapFromImageSource' | 'explainBitmapReadback',
) {
  return scanHostBypassSource(file, `export function ${functionName}() { return document.createElement('canvas'); }`);
}

function scanRestoredShapeRasterSurface(
  file: 'packages/scene2d-gl/src/glShapeData.ts' | 'packages/scene2d-wgpu/src/wgpuShapeData.ts',
  functionName: 'acquireGlShapeRasterSurface' | 'acquireWgpuShapeRasterSurface',
) {
  return scanHostBypassSource(file, `export function ${functionName}() { return document.createElement('canvas'); }`);
}

function scanRestoredScale9RasterSurface(
  file: 'packages/scene2d-gl/src/glScale9Shape.ts' | 'packages/scene2d-wgpu/src/wgpuScale9Shape.ts',
  functionName: 'createGlScale9ShapeData' | 'createWgpuScale9ShapeData',
) {
  return scanHostBypassSource(file, `export function ${functionName}() { return document.createElement('canvas'); }`);
}

function scanRestoredTextRasterSurface(
  file:
    | 'packages/scene2d-gl/src/glRichText.ts'
    | 'packages/scene2d-gl/src/glTextLabel.ts'
    | 'packages/scene2d-wgpu/src/wgpuRichText.ts'
    | 'packages/scene2d-wgpu/src/wgpuTextLabel.ts',
  functionName: 'getOffscreenCanvas' | 'createGlTextLabelData' | 'createWgpuTextLabelData',
) {
  return scanHostBypassSource(file, `export function ${functionName}() { return document.createElement('canvas'); }`);
}

function findV4ProgressIndex(reason: string): number {
  const index = HOST_BYPASS_V4_PROGRESS_HISTORY.findIndex((entry) => entry.reason === reason);
  expect(index, `no v4 checkpoint carries the reason ${reason}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('host-bypass derived gate', () => {
  beforeAll(() => {
    cleanHostBypassReport = scanHostBypasses(ROOT);
  }, 60_000);

  it('derives the live population without a source-file roster and enforces the ratchet', () => {
    const report = cleanHostBypassReport;
    const formatted = formatHostBypassReport(report);
    console.log(formatted);
    expect(hostBypassBudgetFailures(report, HOST_BYPASS_BUDGET)).toEqual([]);
    expect(formatted).toContain(
      'host-bypass outstanding=0 direct-dom=0 input-ingress=0 frame-scheduling=0 scratch-surface=0 render-surface=0 webgpu-acquisition=0',
    );
    expect(hostBypassCurrentBudgetFailures(report, HOST_BYPASS_BUDGET)).toEqual([]);
    expect(textRasterSurfaceCurrentFailures(report)).toEqual([]);
    expect(formatted).toContain(
      'v1 -> v2 total 30 -> 30 (0 census delta) recategorised=2 from-to=direct-dom->input-ingress=2 new=0 detected=none',
    );
    expect(formatted).toContain(
      'v2 -> v3 total 30 -> 33 (+3 classified) recategorised=0 from-to=none new=3 detected=frame-scheduling=3',
    );
    expect(formatted).toContain(
      'v3 -> v4 total 28 -> 28 (0 census delta) recategorised=2 from-to=scratch-surface->render-surface=2 new=0 detected=none',
    );
    expect(formatted).toContain('TAXONOMY v4');
    expect(formatted).toContain(
      '28 direct-dom=12 input-ingress=0 frame-scheduling=0 scratch-surface=14 render-surface=2 webgpu-acquisition=0 — host-bypass taxonomy v4 classification baseline',
    );
    expect(countHostBypasses(report)['render-surface']).toBe(0);
    expect(formatted).toContain('28 (-5 fixed)');
    expect(formatted).toContain(
      '10 (-2 fixed) direct-dom=2 input-ingress=0 frame-scheduling=0 scratch-surface=8 render-surface=0 webgpu-acquisition=0 — GL and WGPU shape raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    expect(formatted).toContain(
      '8 (-2 fixed) direct-dom=0 input-ingress=0 frame-scheduling=0 scratch-surface=8 render-surface=0 webgpu-acquisition=0 — Video element creation routed through VideoCapabilityBackend.createVideoElement',
    );
    expect(formatted).toContain(
      '6 (-2 fixed) direct-dom=0 input-ingress=0 frame-scheduling=0 scratch-surface=6 render-surface=0 webgpu-acquisition=0 — Bitmap construction and explanation routed through the selected BitmapReadbackBackend',
    );
    expect(formatted).toContain(
      '4 (-2 fixed) direct-dom=0 input-ingress=0 frame-scheduling=0 scratch-surface=4 render-surface=0 webgpu-acquisition=0 — GL and WGPU Scale9 raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    expect(formatted).toContain(
      '0 (-4 fixed) direct-dom=0 input-ingress=0 frame-scheduling=0 scratch-surface=0 render-surface=0 webgpu-acquisition=0 — GL and WGPU RichText and TextLabel scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    expect(formatted).toContain('DETECTS hand-written floor (not an exhaustive ceiling):');
    expect(formatted).toContain('ZERO category zero means none found by current detectors, not that no bypasses exist');
    expect(formatted).toContain('33 (-3 fixed)');
    expect(formatted).toContain('31 (-2 fixed)');
    expect(formatted).toContain('30 (-1 fixed)');
    expect(formatted).toContain(
      'SLICE a host-bypass seam repair is complete only when every existing production consumer migrates in the same slice; a lowered census alone is incomplete',
    );
  }, 30_000);

  it('pins same-slice production consumer migration as part of a host-bypass repair', () => {
    expect(hostBypassSliceGuidanceFailures(HOST_BYPASS_SLICE_GUIDANCE)).toEqual([]);
    expect(hostBypassSliceGuidanceFailures('a lowered census is sufficient')).toContain(
      'host-bypass seam-slice guidance no longer requires same-slice production consumer migration',
    );
  });

  it('derives WGPU surface ownership for every functional consumer and the shared harness', () => {
    expect(wgpuRenderSurfaceConsumerFailures(ROOT)).toEqual([]);
  });

  // The gate reads the surface out of a call by POSITION, so the position has to still name the surface.
  // Threading a new leading parameter through both entry points is exactly the change that invalidated it
  // once, and nothing about that change was visible in the gate's output — the surface was simply read
  // from the wrong argument. This pins the recorded position against the real declaration.
  it('pins the WGPU presentation-surface argument against the real declarations', () => {
    expect(wgpuSurfaceArgumentFailures(ROOT)).toEqual([]);
  });

  it('fails loudly rather than passing when a WGPU declaration cannot be read', () => {
    expect(wgpuSurfaceArgumentFailures(join(ROOT, 'scripts'))).toEqual([
      expect.stringContaining('cannot read createWgpuAcquisition'),
      expect.stringContaining('cannot read createWgpuScreenRenderTarget'),
    ]);
  });

  // ★ THE OWNERSHIP FACT IS NOW ENFORCED BY THE EXPLICIT CAPABILITY SEAM. The mutation that proves the
  // gate still bites is a page that reaches for document.createElement('canvas') instead of allocating
  // its drawable through createWgpuSurface(webHostWgpuContext, ...).
  it('mutation-proves a functional WGPU consumer cannot create its own canvas', () => {
    const file = 'functional/scenes/camera-orthographic.webgpu.ts';
    const source = readFileSync(join(ROOT, file), 'utf8').replace(
      /await createWgpuSurface\([^)]*\)/,
      "document.createElement('canvas')",
    );

    expect(wgpuRenderSurfaceConsumerSourceFailures(file, source)).toEqual([
      expect.stringContaining('does not come from createWgpuSurface or createWebSurfaceFromElement'),
    ]);
  });

  it('mutation-proves the shared functional WebGPU harness cannot create its own canvas', () => {
    const file = 'tools/harness/webgpu.ts';
    const source = readFileSync(join(ROOT, file), 'utf8').replace(
      /await createWgpuSurface\([^)]*\)/,
      "document.createElement('canvas')",
    );

    expect(wgpuRenderSurfaceConsumerSourceFailures(file, source)).toEqual([
      expect.stringContaining('does not come from createWgpuSurface or createWebSurfaceFromElement'),
    ]);
  });

  // A scene painting an 8x8 cubemap face into a canvas is not presenting through it. That is a different
  // bypass with its own kind and budget, and this gate flagging it would make the two indistinguishable.
  it('does not flag a scratch canvas a WGPU scene paints texture content into', () => {
    const source = [
      "import { webHostWgpuContext } from '@flighthq/host-web';",
      'const surface = await createWgpuSurface(webHostWgpuContext, appWindow, 800, 600);',
      'const acquisition = await createWgpuAcquisition(webWgpuHost, surface);',
      'const screen = createWgpuScreenRenderTarget(webWgpuHost, acquisition.device, surface);',
      "const face = document.createElement('canvas');",
    ].join('\n');

    expect(wgpuRenderSurfaceConsumerSourceFailures('functional/scenes/probe.webgpu.ts', source)).toEqual([]);
  });

  it('mutation-proves the host-web import is required, not just the call', () => {
    const source = [
      'const surface = await createWgpuSurface(webHostWgpuContext, appWindow, 800, 600);',
      'const acquisition = await createWgpuAcquisition(webWgpuHost, surface);',
    ].join('\n');

    expect(wgpuRenderSurfaceConsumerSourceFailures('functional/scenes/probe.webgpu.ts', source)).toEqual([
      expect.stringContaining('does not import webHostWgpuContext from @flighthq/host-web'),
    ]);
  });

  it('pins zero remaining render-surface sites after S08', () => {
    const report = cleanHostBypassReport;
    expect(wgpuRenderSurfaceRepairFailures(report)).toEqual([]);
    const restored = scanHostBypassSource(
      'packages/render-wgpu/src/wgpuElement.ts',
      `export function createWgpuCanvasElement() { return document.createElement('canvas'); }`,
    );
    const withWgpu = createHostBypassReport(report.scannedFiles, [...report.sites, ...report.excluded, ...restored]);
    expect(wgpuRenderSurfaceRepairFailures(withWgpu)).toContain(
      'S08 must leave no render surfaces; found [packages/render-wgpu/src/wgpuElement.ts:createWgpuCanvasElement]',
    );
  }, 30_000);

  it('mutation-proves restoring the portable GL DOM factory exceeds the v4 render ratchet', () => {
    const clean = cleanHostBypassReport;
    const restored = scanHostBypassSource(
      'packages/render-gl/src/glElement.ts',
      `export function createGlCanvasElement() { return document.createElement('canvas'); }`,
    );
    const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
    expect(countHostBypasses(mutated)['render-surface']).toBe(1);
    expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('render-surface: found 1, budget 0');
  }, 30_000);

  it('mutation-proves restoring the portable WGPU DOM factory exceeds the v4 render ratchet', () => {
    const clean = cleanHostBypassReport;
    const restored = scanHostBypassSource(
      'packages/render-wgpu/src/wgpuElement.ts',
      `export function createWgpuCanvasElement() { return document.createElement('canvas'); }`,
    );
    const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
    expect(countHostBypasses(mutated)['render-surface']).toBe(1);
    expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('render-surface: found 1, budget 0');
  }, 30_000);

  it('pins the S09 bitmapDraw target absent independently of the lowered scratch ratchet', () => {
    const clean = cleanHostBypassReport;
    expect(bitmapDrawTransferRepairFailures(clean)).toEqual([]);
    const restored = scanRestoredBitmapDrawTransfer();
    const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
    expect(bitmapDrawTransferRepairFailures(mutated)).toContain(
      'S09 must remove the bitmapDraw global ImageData transfer; found [packages/bitmap/src/bitmapDraw.ts:drawBitmap]',
    );
    expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 1, budget 0');
  }, 30_000);

  it('mutation-proves restoring the S09 target exceeds the exact zero floor', () => {
    const clean = cleanHostBypassReport;
    const mutated = createHostBypassReport(clean.scannedFiles, [
      ...clean.sites,
      ...clean.excluded,
      ...scanRestoredBitmapDrawTransfer(),
    ]);
    expect(countHostBypasses(mutated)['scratch-surface']).toBe(1);
    expect(hostBypassCurrentBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toEqual([
      'host-bypass current scratch-surface: found 1, expected 0',
      'host-bypass current outstanding: found 1, expected 0',
    ]);
    expect(bitmapDrawTransferRepairFailures(mutated)).toContain(
      'S09 must remove the bitmapDraw global ImageData transfer; found [packages/bitmap/src/bitmapDraw.ts:drawBitmap]',
    );
  }, 30_000);

  it('mutation-proves an unrelated restoration fails the exact live-current assertion at total 1', () => {
    const clean = cleanHostBypassReport;
    const mutated = createHostBypassReport(clean.scannedFiles, [
      ...clean.sites,
      ...clean.excluded,
      ...scanHostBypassSource(
        'packages/example/src/restoredScratch.ts',
        `export function restoredScratch() { return document.createElement('canvas'); }`,
      ),
    ]);
    expect(bitmapDrawTransferRepairFailures(mutated)).toEqual([]);
    expect(hostBypassCurrentBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toEqual([
      'host-bypass current scratch-surface: found 1, expected 0',
      'host-bypass current outstanding: found 1, expected 0',
    ]);
  }, 30_000);

  it('pins both H8 shape-raster targets absent independently of the lowered scratch ratchet', () => {
    const clean = cleanHostBypassReport;
    expect(shapeRasterSurfaceRepairFailures(clean)).toEqual([]);
    for (const [file, functionName] of [
      ['packages/scene2d-gl/src/glShapeData.ts', 'acquireGlShapeRasterSurface'],
      ['packages/scene2d-wgpu/src/wgpuShapeData.ts', 'acquireWgpuShapeRasterSurface'],
    ] as const) {
      const restored = scanRestoredShapeRasterSurface(file, functionName);
      const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
      expect(shapeRasterSurfaceRepairFailures(mutated)).toContain(
        `H8 must remove both shape-raster scratch surfaces; found [${file}:${functionName}]`,
      );
      expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 1, budget 0');
    }
  }, 30_000);

  it('mutation-proves restoring an H8 target exceeds the exact zero floor', () => {
    const clean = cleanHostBypassReport;
    const mutated = createHostBypassReport(clean.scannedFiles, [
      ...clean.sites,
      ...clean.excluded,
      ...scanRestoredShapeRasterSurface('packages/scene2d-gl/src/glShapeData.ts', 'acquireGlShapeRasterSurface'),
    ]);
    expect(textRasterSurfaceCurrentFailures(mutated)).not.toEqual([]);
    expect(shapeRasterSurfaceRepairFailures(mutated)).toContain(
      'H8 must remove both shape-raster scratch surfaces; found [packages/scene2d-gl/src/glShapeData.ts:acquireGlShapeRasterSurface]',
    );
  }, 30_000);

  it('pins both Scale9 raster targets absent independently of the lowered scratch ratchet', () => {
    const clean = cleanHostBypassReport;
    expect(scale9RasterSurfaceRepairFailures(clean)).toEqual([]);
    for (const [file, functionName] of [
      ['packages/scene2d-gl/src/glScale9Shape.ts', 'createGlScale9ShapeData'],
      ['packages/scene2d-wgpu/src/wgpuScale9Shape.ts', 'createWgpuScale9ShapeData'],
    ] as const) {
      const restored = scanRestoredScale9RasterSurface(file, functionName);
      const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
      expect(scale9RasterSurfaceRepairFailures(mutated)).toContain(
        `Scale9 must remove both raster scratch surfaces; found [${file}:${functionName}]`,
      );
      expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 1, budget 0');
    }
  }, 30_000);

  it('mutation-proves restoring a Scale9 target exceeds the exact zero floor', () => {
    const clean = cleanHostBypassReport;
    const mutated = createHostBypassReport(clean.scannedFiles, [
      ...clean.sites,
      ...clean.excluded,
      ...scanRestoredScale9RasterSurface('packages/scene2d-gl/src/glScale9Shape.ts', 'createGlScale9ShapeData'),
    ]);
    expect(textRasterSurfaceCurrentFailures(mutated)).not.toEqual([]);
    expect(scale9RasterSurfaceRepairFailures(mutated)).toContain(
      'Scale9 must remove both raster scratch surfaces; found [packages/scene2d-gl/src/glScale9Shape.ts:createGlScale9ShapeData]',
    );
  }, 30_000);

  it('pins all four H13 text-raster targets absent independently of the zero scratch ratchet', () => {
    const clean = cleanHostBypassReport;
    expect(textRasterSurfaceRepairFailures(clean)).toEqual([]);
    for (const [file, functionName] of [
      ['packages/scene2d-gl/src/glRichText.ts', 'getOffscreenCanvas'],
      ['packages/scene2d-gl/src/glTextLabel.ts', 'createGlTextLabelData'],
      ['packages/scene2d-wgpu/src/wgpuRichText.ts', 'getOffscreenCanvas'],
      ['packages/scene2d-wgpu/src/wgpuTextLabel.ts', 'createWgpuTextLabelData'],
    ] as const) {
      const restored = scanRestoredTextRasterSurface(file, functionName);
      const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
      expect(textRasterSurfaceRepairFailures(mutated)).toContain(
        `H13 must remove all four text-raster scratch surfaces; found [${file}:${functionName}]`,
      );
      expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 1, budget 0');
    }
  }, 30_000);

  it('pins both H15 bitmap-readback targets absent independently of the lowered scratch ratchet', () => {
    const clean = cleanHostBypassReport;
    expect(bitmapReadbackRepairFailures(clean)).toEqual([]);
    for (const [file, functionName] of [
      ['packages/bitmap/src/bitmapFrom.ts', 'createBitmapFromImageSource'],
      ['packages/bitmap/src/explainBitmapReadback.ts', 'explainBitmapReadback'],
    ] as const) {
      const restored = scanRestoredBitmapReadback(file, functionName);
      const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
      expect(bitmapReadbackRepairFailures(mutated)).toContain(
        `H15 must remove both bitmap-readback scratch surfaces; found [${file}:${functionName}]`,
      );
      expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 1, budget 0');
    }
  }, 30_000);

  it('mutation-proves restoring either H15 target exceeds the exact zero floor', () => {
    const clean = cleanHostBypassReport;
    for (const [file, functionName] of [
      ['packages/bitmap/src/bitmapFrom.ts', 'createBitmapFromImageSource'],
      ['packages/bitmap/src/explainBitmapReadback.ts', 'explainBitmapReadback'],
    ] as const) {
      const mutated = createHostBypassReport(clean.scannedFiles, [
        ...clean.sites,
        ...clean.excluded,
        ...scanRestoredBitmapReadback(file, functionName),
      ]);
      expect(textRasterSurfaceCurrentFailures(mutated)).not.toEqual([]);
      expect(bitmapReadbackRepairFailures(mutated)).toContain(
        `H15 must remove both bitmap-readback scratch surfaces; found [${file}:${functionName}]`,
      );
    }
  }, 30_000);

  it('pins both bitmapEncode scratch targets absent independently of the lowered ratchet', () => {
    const report = cleanHostBypassReport;
    expect(bitmapEncodeRepairFailures(report)).toEqual([]);
  }, 30_000);

  it.each([
    ['canvas', "document.createElement('canvas')"],
    ['image-data', 'new globalThis.ImageData(width, height)'],
  ] as const)(
    'mutation-proves restoring the bitmapEncode %s target',
    (target, expression) => {
      const clean = cleanHostBypassReport;
      const restored = scanRestoredBitmapEncode(target);
      const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
      expect(bitmapEncodeRepairFailures(mutated)).toContain(
        `Bitmap encoding must leave no portable scratch construction; found [packages/bitmap/src/bitmapEncode.ts:encodeBitmap:${expression}]`,
      );
    },
    30_000,
  );

  it('mutation-proves restoring both bitmapEncode targets exceeds the exact zero floor', () => {
    const clean = cleanHostBypassReport;
    const mutated = createHostBypassReport(clean.scannedFiles, [
      ...clean.sites,
      ...clean.excluded,
      ...scanRestoredBitmapEncode('canvas'),
      ...scanRestoredBitmapEncode('image-data'),
    ]);
    expect(countHostBypasses(mutated)['scratch-surface']).toBe(2);
    expect(hostBypassCurrentBudgetFailures(mutated, HOST_BYPASS_BUDGET)).not.toEqual([]);
    expect(bitmapEncodeRepairFailures(mutated)).not.toEqual([]);
  }, 30_000);

  it('pins the video capability target absent and both resource sites routed through backend', () => {
    const report = cleanHostBypassReport;
    expect(videoCapabilityRepairFailures(report)).toEqual([]);
  }, 30_000);

  it('mutation-proves restoring the video capability DOM target fails its named predicate', () => {
    const clean = cleanHostBypassReport;
    const restored = scanHostBypassSource(
      'packages/video/src/videoFormat.ts',
      `export function canPlayVideoType() { return document.createElement('video'); }`,
    );
    const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
    expect(videoCapabilityRepairFailures(mutated)).toContain(
      'S10 must remove the videoFormat canPlayVideoType DOM probe; found [packages/video/src/videoFormat.ts:canPlayVideoType]',
    );
  }, 30_000);

  it('mutation-proves restoring a videoResourceFrom DOM site fails the H8-C repair predicate', () => {
    const clean = cleanHostBypassReport;
    const restored = scanHostBypassSource(
      'packages/video/src/videoResourceFrom.ts',
      `export function createVideoResourceFromMediaStream() { return document.createElement('video'); }`,
    );
    const mutated = createHostBypassReport(clean.scannedFiles, [...clean.sites, ...clean.excluded, ...restored]);
    expect(videoCapabilityRepairFailures(mutated)).toContain(
      'H8-C must keep videoResourceFrom routed through the backend; found [packages/video/src/videoResourceFrom.ts:createVideoResourceFromMediaStream]',
    );
  }, 30_000);

  it('pins detector provenance against removal and false exhaustive wording', () => {
    expect(HOST_BYPASS_DETECTOR_PROVENANCE).toEqual({
      detects:
        'hand-written floor (not an exhaustive ceiling): direct document/window/navigator access, input listener and gamepad sampling, frame scheduling, caller-owned GL/WebGPU render-surface construction, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
      taxonomyVersion: 4,
      zeroMeaning: 'category zero means none found by current detectors, not that no bypasses exist',
    });
    expect(HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY.at(-1)).toEqual(HOST_BYPASS_DETECTOR_PROVENANCE);
    expect(hostBypassDetectorProvenanceHistoryFailures(HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY)).toEqual([]);
    expect(hostBypassDetectorProvenanceFailures(HOST_BYPASS_DETECTOR_PROVENANCE)).toEqual([]);
    expect(hostBypassDetectorProvenanceFailures({ ...HOST_BYPASS_DETECTOR_PROVENANCE, detects: '' })).toContain(
      'host-bypass detector provenance rewrites the accepted hand-written detection floor',
    );
    expect(
      hostBypassDetectorProvenanceFailures({
        ...HOST_BYPASS_DETECTOR_PROVENANCE,
        zeroMeaning: 'category zero proves no bypasses exist',
      }),
    ).toContain('host-bypass detector provenance rewrites the accepted non-exhaustive zero meaning');
  });

  it('preserves the append-only evidenced budget history and its category breakdowns', () => {
    expect(hostBypassBudgetHistoryFailures(HOST_BYPASS_BUDGET_HISTORY)).toEqual([]);
  });

  it('records immutable relabel and discovery events separately from repair progress', () => {
    expect(hostBypassClassificationHistoryFailures(HOST_BYPASS_CLASSIFICATION_HISTORY)).toEqual([]);
    expect(hostBypassV3ProgressHistoryFailures(HOST_BYPASS_V3_PROGRESS_HISTORY)).toEqual([]);
    expect(hostBypassV4ProgressHistoryFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(bitmapEncodeProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(bitmapReadbackProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(bitmapDrawTransferProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(videoCapabilityProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(shapeRasterSurfaceProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(scale9RasterSurfaceProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(textRasterSurfaceProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
  });

  it('mutation-proves S09 cannot collapse the immutable 26 -> 25 repair into 26 -> 24', () => {
    const s09Index = findV4ProgressIndex(
      'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
    );
    const s09 = HOST_BYPASS_V4_PROGRESS_HISTORY[s09Index]!;
    const prior = HOST_BYPASS_V4_PROGRESS_HISTORY[s09Index - 1]!;
    const mutated = [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      { ...s09, budget: { ...s09.budget, 'direct-dom': 11 }, total: s09.total - 1 },
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    expect(hostBypassV4ProgressHistoryFailures(mutated)).toContain(
      `host-bypass taxonomy v4 progress history[${s09Index}] declares 1 repaired site(s) but moves ${prior.total} -> ${s09.total - 1}`,
    );
  });

  it('mutation-proves either bitmapEncode checkpoint cannot be omitted or merged', () => {
    const omittedCanvas = [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, 11),
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(12),
    ];
    expect(bitmapEncodeProgressFailures(omittedCanvas)).not.toEqual([]);
    expect(hostBypassV4ProgressHistoryFailures(omittedCanvas)).toContain(
      'host-bypass taxonomy v4 progress history[11] declares 1 repaired site(s) but moves 16 -> 14',
    );
  });

  it('mutation-proves omitting the S09 ledger event fails history even when live-current still matches', () => {
    const s09Index = findV4ProgressIndex(
      'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
    );
    const omitted = [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    expect(bitmapDrawTransferProgressFailures(omitted)).toContain(
      'S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
    // With S09 dropped, pointer-lock slides into index 3 and its OWN declaration drives the message —
    // three sites, not the "one" the old index-keyed table would have assigned to whatever sat here.
    // That the message follows the entry rather than the position is the invariant repair working.
    expect(hostBypassV4ProgressHistoryFailures(omitted)).toContain(
      `host-bypass taxonomy v4 progress history[${s09Index}] declares 3 repaired site(s) but moves 26 -> 22`,
    );
    const report = cleanHostBypassReport;
    expect(hostBypassCurrentBudgetFailures(report, omitted.at(-1)!.budget)).toEqual([]);
  }, 30_000);

  // ★ THE DECLARATION AND THE DELTA MUST AGREE, IN BOTH DIRECTIONS. `repairedSites` lets a multi-site
  // repair be one honest checkpoint instead of several synthetic one-site steps — but an unchecked count
  // would just be a second source of truth about the same fact. Cross-checking it against the total delta
  // is what keeps it evidence.
  //
  // ★ LOCATED BY REASON, NEVER BY INDEX. The whole point of this repair is that a checkpoint's declared
  // count travels with the entry rather than its position; a test that hard-coded `[10]` would rebuild the
  // coupling the validator just shed, and would silently retarget the next time a slice lands ahead of it.
  it('mutation-proves a declared repairedSites that disagrees with the total delta is red both ways', () => {
    const screenReason =
      'window-management permission query and change subscription routed through two optional ScreenBackend operations';
    const at = HOST_BYPASS_V4_PROGRESS_HISTORY.findIndex((entry) => entry.reason === screenReason);
    // Loud, not silent: a drifted reason must fail here rather than yield -1 and slice into nonsense.
    expect(at).toBeGreaterThanOrEqual(0);
    const screen = HOST_BYPASS_V4_PROGRESS_HISTORY[at]!;
    const prior = HOST_BYPASS_V4_PROGRESS_HISTORY[at - 1]!;
    const rebuild = (repairedSites: number) => [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, at),
      { ...screen, repairedSites },
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(at + 1),
    ];

    // Understated, and overstated. Totals interpolated so the message cannot rot when the chain grows.
    expect(hostBypassV4ProgressHistoryFailures(rebuild(1))).toContain(
      `host-bypass taxonomy v4 progress history[${at}] declares 1 repaired site(s) but moves ${prior.total} -> ${screen.total}`,
    );
    expect(hostBypassV4ProgressHistoryFailures(rebuild(3))).toContain(
      `host-bypass taxonomy v4 progress history[${at}] declares 3 repaired site(s) but moves ${prior.total} -> ${screen.total}`,
    );

    // And the honest declaration stays green, so this cannot pass by rejecting everything.
    expect(screen.repairedSites).toBe(prior.total - screen.total);
    expect(hostBypassV4ProgressHistoryFailures(HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
  });

  it('mutation-proves S09 cannot rewrite the accepted S08 checkpoint', () => {
    const s08Index = findV4ProgressIndex(
      'WGPU root-surface creation routed through the selected WGPU render-surface provider',
    );
    const s08 = HOST_BYPASS_V4_PROGRESS_HISTORY[s08Index]!;
    const mutated = [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s08Index),
      { ...s08, reason: 'mutation: rewrite accepted S08 evidence' },
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s08Index + 1),
    ];
    expect(hostBypassV4ProgressHistoryFailures(mutated)).toContain(
      `host-bypass taxonomy v4 progress history[${s08Index}] rewrites immutable accepted checkpoint`,
    );
  });

  it('mutation-proves S09 checkpoint categories and reason independently', () => {
    const s09Index = findV4ProgressIndex(
      'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
    );
    const s09 = HOST_BYPASS_V4_PROGRESS_HISTORY[s09Index];
    const wrongCategories = [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      {
        ...s09,
        budget: { ...s09.budget, 'direct-dom': 11, 'scratch-surface': 14 },
      },
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    const wrongReason = [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      { ...s09, reason: 'mutation: wrong S09 reason' },
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    expect(bitmapDrawTransferProgressFailures(wrongCategories)).toContain(
      'S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
    expect(bitmapDrawTransferProgressFailures(wrongReason)).toContain(
      'S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
  });

  it('mutation-proves the H8 checkpoint declares exactly two repaired sites', () => {
    const h8Index = findV4ProgressIndex(
      'GL and WGPU shape raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    const h8 = HOST_BYPASS_V4_PROGRESS_HISTORY[h8Index];
    for (const repairedSites of [1, 3]) {
      const mutated = [
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, h8Index),
        { ...h8, repairedSites },
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(h8Index + 1),
      ];
      expect(hostBypassV4ProgressHistoryFailures(mutated)).toContain(
        `host-bypass taxonomy v4 progress history[${h8Index}] declares ${repairedSites} repaired site(s) but moves 12 -> 10`,
      );
      expect(shapeRasterSurfaceProgressFailures(mutated)).toContain(
        'H8 shape-raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      );
    }
  });

  it('mutation-proves the H15 checkpoint is exact and declares both repaired sites', () => {
    const h15Reason = 'Bitmap construction and explanation routed through the selected BitmapReadbackBackend';
    const h15Index = findV4ProgressIndex(h15Reason);
    const h15 = HOST_BYPASS_V4_PROGRESS_HISTORY[h15Index]!;
    const prior = HOST_BYPASS_V4_PROGRESS_HISTORY[h15Index - 1]!;
    for (const repairedSites of [1, 3]) {
      const mutated = [
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, h15Index),
        { ...h15, repairedSites },
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(h15Index + 1),
      ];
      expect(hostBypassV4ProgressHistoryFailures(mutated)).toContain(
        `host-bypass taxonomy v4 progress history[${h15Index}] declares ${repairedSites} repaired site(s) but moves ${prior.total} -> ${h15.total}`,
      );
      expect(bitmapReadbackProgressFailures(mutated)).toContain(
        'H15 bitmap-readback taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      );
    }

    const wrongReason = [
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, h15Index),
      { ...h15, reason: 'mutation: wrong H15 reason' },
      ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(h15Index + 1),
    ];
    expect(bitmapReadbackProgressFailures(wrongReason)).not.toEqual([]);
  });

  it('mutation-proves the Scale9 checkpoint declares exactly two repaired sites', () => {
    const scale9Index = findV4ProgressIndex(
      'GL and WGPU Scale9 raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    const scale9 = HOST_BYPASS_V4_PROGRESS_HISTORY[scale9Index]!;
    const prior = HOST_BYPASS_V4_PROGRESS_HISTORY[scale9Index - 1]!;
    for (const repairedSites of [1, 3]) {
      const mutated = [
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, scale9Index),
        { ...scale9, repairedSites },
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(scale9Index + 1),
      ];
      expect(hostBypassV4ProgressHistoryFailures(mutated)).toContain(
        `host-bypass taxonomy v4 progress history[${scale9Index}] declares ${repairedSites} repaired site(s) but moves ${prior.total} -> ${scale9.total}`,
      );
      expect(scale9RasterSurfaceProgressFailures(mutated)).toContain(
        'Scale9 raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      );
    }
  });

  it('mutation-proves the H13 checkpoint declares exactly four repaired sites', () => {
    const h13Index = findV4ProgressIndex(
      'GL and WGPU RichText and TextLabel scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    const h13 = HOST_BYPASS_V4_PROGRESS_HISTORY[h13Index]!;
    const prior = HOST_BYPASS_V4_PROGRESS_HISTORY[h13Index - 1]!;
    for (const repairedSites of [3, 5]) {
      const mutated = [
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, h13Index),
        { ...h13, repairedSites },
        ...HOST_BYPASS_V4_PROGRESS_HISTORY.slice(h13Index + 1),
      ];
      expect(hostBypassV4ProgressHistoryFailures(mutated)).toContain(
        `host-bypass taxonomy v4 progress history[${h13Index}] declares ${repairedSites} repaired site(s) but moves ${prior.total} -> ${h13.total}`,
      );
      expect(textRasterSurfaceProgressFailures(mutated)).toContain(
        'H13 text-raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      );
    }
  });

  it('mutation-proves that the v4 pure relabel cannot change the total', () => {
    const relabelIndex = HOST_BYPASS_CLASSIFICATION_HISTORY.length - 1;
    const relabel = HOST_BYPASS_CLASSIFICATION_HISTORY[relabelIndex];
    const mutated = [
      ...HOST_BYPASS_CLASSIFICATION_HISTORY.slice(0, relabelIndex),
      { ...relabel, toTotal: relabel.toTotal + 1 },
    ];
    expect(hostBypassClassificationHistoryFailures(mutated)).toContain(
      `host-bypass taxonomy history[${relabelIndex}] pure relabel changes total 28 -> 29`,
    );
  });

  it('mutation-proves that the v4 relabel cannot claim new findings', () => {
    const relabelIndex = HOST_BYPASS_CLASSIFICATION_HISTORY.length - 1;
    const relabel = HOST_BYPASS_CLASSIFICATION_HISTORY[relabelIndex];
    const mutated = [
      ...HOST_BYPASS_CLASSIFICATION_HISTORY.slice(0, relabelIndex),
      {
        ...relabel,
        newlyDetected: [
          { count: 1, kind: 'render-surface' as const, reason: 'mutation: hides a new finding in the relabel' },
        ],
      },
    ];
    expect(hostBypassClassificationHistoryFailures(mutated)).toContain(
      `host-bypass taxonomy history[${relabelIndex}] census delta 0 does not match 1 newly detected sites`,
    );
  });

  it('mutation-proves that the v4 relabel cannot lose its scratch-surface provenance', () => {
    const relabelIndex = HOST_BYPASS_CLASSIFICATION_HISTORY.length - 1;
    const relabel = HOST_BYPASS_CLASSIFICATION_HISTORY[relabelIndex];
    const mutated = [
      ...HOST_BYPASS_CLASSIFICATION_HISTORY.slice(0, relabelIndex),
      {
        ...relabel,
        recategorised: [{ ...relabel.recategorised[0], from: 'render-surface' as const }],
      },
    ];
    const failures = hostBypassClassificationHistoryFailures(mutated);
    expect(failures).toContain(
      `host-bypass taxonomy history[${relabelIndex}] rewrites immutable accepted classification evidence`,
    );
    expect(failures).toContain(
      `host-bypass taxonomy history[${relabelIndex}] derived categories do not match its evidenced after-budget`,
    );
  });

  it('mutation-proves that the v4 append cannot rewrite an accepted classification prefix', () => {
    const accepted = HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [
      { ...accepted, reason: 'mutation: rewrite accepted v1 evidence' },
      ...HOST_BYPASS_CLASSIFICATION_HISTORY.slice(1),
    ];
    expect(hostBypassClassificationHistoryFailures(mutated)).toContain(
      'host-bypass taxonomy history[0] rewrites immutable accepted classification evidence',
    );
  });

  it('mutation-proves that a pure relabel cannot change the total', () => {
    const relabel = HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [{ ...relabel, toTotal: relabel.toTotal + 1 }, HOST_BYPASS_CLASSIFICATION_HISTORY[1]];
    expect(hostBypassClassificationHistoryFailures(mutated)).toContain(
      'host-bypass taxonomy history[0] pure relabel changes total 30 -> 31',
    );
  });

  it('mutation-proves that the zero-new relabel cannot be mislabeled as new findings', () => {
    const relabel = HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [
      {
        ...relabel,
        newlyDetected: [{ count: 2, kind: 'input-ingress' as const, reason: 'mutation: mislabeled existing findings' }],
        recategorised: [],
      },
      HOST_BYPASS_CLASSIFICATION_HISTORY[1],
    ];
    const failures = hostBypassClassificationHistoryFailures(mutated);
    expect(failures).toContain('host-bypass taxonomy history[0] rewrites immutable accepted classification evidence');
    expect(failures).toContain(
      'host-bypass taxonomy history[0] derived categories do not match its evidenced after-budget',
    );
  });

  it('mutation-proves that the relabel cannot lose its direct-dom provenance', () => {
    const relabel = HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [
      {
        ...relabel,
        recategorised: [{ ...relabel.recategorised[0], from: 'input-ingress' as const }],
      },
      HOST_BYPASS_CLASSIFICATION_HISTORY[1],
    ];
    expect(hostBypassClassificationHistoryFailures(mutated)).toContain(
      'host-bypass taxonomy history[0] rewrites immutable accepted classification evidence',
    );
  });

  it('mutation-proves that scheduling discovery cannot be recorded as a relabel', () => {
    const discovery = HOST_BYPASS_CLASSIFICATION_HISTORY[1];
    const mutated = [
      HOST_BYPASS_CLASSIFICATION_HISTORY[0],
      {
        ...discovery,
        newlyDetected: [],
        recategorised: [
          {
            count: 3,
            from: 'input-ingress' as const,
            reason: 'mutation: hides newly classified scheduling',
            to: 'frame-scheduling' as const,
          },
        ],
      },
    ];
    expect(hostBypassClassificationHistoryFailures(mutated)).toContain(
      'host-bypass taxonomy history[1] derived categories do not match its evidenced after-budget',
    );
  });

  it('mutation-proves that coherently raising the accepted Bitmap checkpoint cannot rewrite history', () => {
    const checkpoint = HOST_BYPASS_BUDGET_HISTORY[4];
    const mutated = [
      ...HOST_BYPASS_BUDGET_HISTORY.slice(0, 4),
      {
        ...checkpoint,
        budget: { ...checkpoint.budget, 'scratch-surface': checkpoint.budget['scratch-surface'] + 1 },
        total: checkpoint.total + 1,
      },
      ...HOST_BYPASS_BUDGET_HISTORY.slice(5),
    ];
    expect(hostBypassBudgetHistoryFailures(mutated)).toContain(
      'host-bypass budget history[4] rewrites immutable accepted checkpoint total 31 (categories and reason are pinned)',
    );
  });

  it('pins the appended Shortcut checkpoint categories even when its total stays coherent', () => {
    const latest = HOST_BYPASS_BUDGET_HISTORY[HOST_BYPASS_BUDGET_HISTORY.length - 1];
    const mutated = [
      ...HOST_BYPASS_BUDGET_HISTORY.slice(0, -1),
      {
        ...latest,
        budget: {
          ...latest.budget,
          'direct-dom': latest.budget['direct-dom'] + 1,
          'scratch-surface': latest.budget['scratch-surface'] - 1,
        },
      },
    ];
    expect(hostBypassBudgetHistoryFailures(mutated)).toContain(
      'host-bypass budget history[5] rewrites immutable accepted checkpoint total 30 (categories and reason are pinned)',
    );
  });

  it('rejects an appended budget increase instead of accepting it as new history', () => {
    const latest = HOST_BYPASS_BUDGET_HISTORY[HOST_BYPASS_BUDGET_HISTORY.length - 1];
    const mutated = [
      ...HOST_BYPASS_BUDGET_HISTORY,
      {
        budget: { ...latest.budget, 'direct-dom': latest.budget['direct-dom'] + 1 },
        reason: 'mutation: ordinary bypass addition',
        total: latest.total + 1,
      },
    ];
    expect(hostBypassBudgetHistoryFailures(mutated)).toContain(
      'host-bypass budget history[6] total 31 is not below prior total 30',
    );
  });

  it('derives an exact one-to-one input listener registration/removal name pairing', () => {
    const operations = deriveInputIngressListenerOperations(cleanHostBypassReport);
    const expectedNames = [
      'beforeinput',
      'compositionupdate',
      'contextmenu',
      'gamepadconnected',
      'gamepaddisconnected',
      'keydown',
      'keyup',
      'mousemove',
      'pointercancel',
      'pointerdown',
      'pointermove',
      'pointerup',
      'wheel',
    ];
    expect(operations.registrationNames).toEqual(expectedNames);
    expect(operations.removalNames).toEqual(expectedNames);
    expect(inputIngressPairingFailures(operations)).toEqual([]);
  }, 30_000);

  it.each([
    [
      'an unpaired registration',
      `export function initializeWebInputIngressBackend(target: EventTarget) {
         target.addEventListener('keydown', run);
         target.addEventListener('keyup', run);
         return () => target.removeEventListener('keydown', run);
       }`,
    ],
    [
      'a mismatched removal name',
      `export function initializeWebInputIngressBackend(target: EventTarget) {
         target.addEventListener('keydown', run);
         return () => target.removeEventListener('keyup', run);
       }`,
    ],
  ])('mutation-proves that %s fails exact input listener pairing', (_name, source) => {
    const report = createHostBypassReport(1, scanHostBypassSource('packages/host-web/src/webInputIngress.ts', source));
    expect(inputIngressPairingFailures(deriveInputIngressListenerOperations(report))).not.toEqual([]);
  });

  it.each([
    ['direct DOM', `export function attach() { return document.createElement('video'); }`, 'direct-dom'],
    [
      'input ingress',
      `export function attach(target: EventTarget) { target.addEventListener('wheel', run); }`,
      'input-ingress',
    ],
    ['scratch surface', `export function pixels() { return new OffscreenCanvas(1, 1); }`, 'scratch-surface'],
    ['frame scheduling', `export function tick() { requestAnimationFrame(tick); }`, 'frame-scheduling'],
    [
      'WebGPU acquisition',
      `export async function gpu(canvas: HTMLCanvasElement) {
         const adapter = await navigator.gpu.requestAdapter();
         return canvas.getContext('webgpu');
       }`,
      'webgpu-acquisition',
    ],
  ] as const)('mutation-proves that a new %s bypass exceeds its runtime-derived baseline', (_name, mutation, kind) => {
    const clean = createHostBypassReport(1, scanHostBypassSource('packages/portable/src/portable.ts', 'export {};'));
    const budget = countHostBypasses(clean);
    const mutated = createHostBypassReport(1, scanHostBypassSource('packages/portable/src/portable.ts', mutation));
    expect(countHostBypasses(mutated)[kind]).toBeGreaterThan(budget[kind]);
    expect(hostBypassBudgetFailures(mutated, budget)).toContain(
      `${kind}: found ${countHostBypasses(mutated)[kind]}, budget 0`,
    );
  });

  it('classifies gamepad sampling and frame scheduling without widening locally shadowed calls', () => {
    const sites = scanHostBypassSource(
      'packages/input/src/inputManager.ts',
      `export function poll() {
         const supported = typeof navigator.getGamepads === 'function';
         const pads = navigator.getGamepads();
         const frame = requestAnimationFrame(poll);
         cancelAnimationFrame(frame);
         return { pads, supported };
       }`,
    );
    expect(sites.map((site) => site.kind)).toEqual([
      'input-ingress',
      'input-ingress',
      'frame-scheduling',
      'frame-scheduling',
    ]);

    const shadowed = scanHostBypassSource(
      'packages/input/src/shadowed.ts',
      `export function local(requestAnimationFrame: (callback: () => void) => number) {
         requestAnimationFrame(() => undefined);
       }
       function cancelAnimationFrame(_frame: number) {}
       cancelAnimationFrame(1);`,
    );
    expect(shadowed).toEqual([]);
  });

  it('mutation-proves that restoring the portable geolocation probe exceeds the lowered direct-DOM ratchet', () => {
    const clean = cleanHostBypassReport;
    const restoredProbe = scanHostBypassSource(
      'packages/geolocation/src/restoredGeolocationProbe.ts',
      `export function isGeolocationAvailable() {
         if (typeof navigator === 'undefined') return false;
         if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
         return typeof navigator.geolocation !== 'undefined' && navigator.geolocation !== null;
       }`,
    );
    const mutated = createHostBypassReport(clean.scannedFiles + 1, [
      ...clean.sites,
      ...clean.excluded,
      ...restoredProbe,
    ]);
    expect(restoredProbe).toHaveLength(3);
    expect(countHostBypasses(mutated)['direct-dom']).toBe(3);
    expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('direct-dom: found 3, budget 0');
  }, 30_000);

  it('mutation-proves that restoring portable Bitmap materialization exceeds the lowered scratch ratchet', () => {
    const clean = cleanHostBypassReport;
    const restoredBridge = scanHostBypassSource(
      'packages/image/src/restoredBitmapMaterialization.ts',
      `export function createImageResourceFromBitmap(bitmap: { width: number; height: number }) {
         const canvas = document.createElement('canvas');
         const imageData = new globalThis.ImageData(bitmap.width, bitmap.height);
         return { canvas, imageData };
       }`,
    );
    const mutated = createHostBypassReport(clean.scannedFiles + 1, [
      ...clean.sites,
      ...clean.excluded,
      ...restoredBridge,
    ]);
    expect(restoredBridge).toHaveLength(2);
    expect(countHostBypasses(mutated)['scratch-surface']).toBe(2);
    expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 2, budget 0');
  }, 30_000);

  it('mutation-proves that restoring Shortcut DOM platform detection exceeds the lowered direct-DOM ratchet', () => {
    const clean = cleanHostBypassReport;
    const restoredProbe = scanHostBypassSource(
      'packages/shortcut/src/restoredPlatformProbe.ts',
      `export function isMacOS() {
         return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '');
       }`,
    );
    const mutated = createHostBypassReport(clean.scannedFiles + 1, [
      ...clean.sites,
      ...clean.excluded,
      ...restoredProbe,
    ]);
    expect(restoredProbe).toHaveLength(1);
    expect(countHostBypasses(mutated)['direct-dom']).toBe(1);
    expect(hostBypassBudgetFailures(mutated, HOST_BYPASS_BUDGET)).toContain('direct-dom: found 1, budget 0');
  }, 30_000);

  it('partitions transport constructors to transport instead of admitting them to the host-bypass population', () => {
    const sites = scanHostBypassSource(
      'packages/socket/src/socket.ts',
      `export function connect() {
         const socket = new WebSocket('wss://example.test');
         const events = new EventSource('/events');
         const request = new Request('/request');
         return [socket, events, request];
       }`,
    );
    const report = createHostBypassReport(1, sites);
    expect(report.sites).toEqual([]);
    expect(report.excluded.map((site) => site.exclusion)).toEqual(['transport', 'transport', 'transport']);
    expect(formatHostBypassReport(report)).toContain(
      'TRANSPORT PARTITION primitives=fetch,XMLHttpRequest,Request,Image,WebSocket,EventSource',
    );
  });

  it('derives structural exclusions instead of naming current files', () => {
    const web = scanHostBypassSource(
      'packages/example/src/registerWebExample.ts',
      `export function registerWebExample() { return document.createElement('canvas'); }`,
    );
    const host = scanHostBypassSource(
      'packages/host-example/src/native.ts',
      `export function probe() { return navigator.gpu.requestAdapter(); }`,
    );
    const renderer = scanHostBypassSource(
      'packages/example-canvas/src/canvas.ts',
      `export function surface() { return document.createElement('canvas'); }`,
    );
    expect([...web, ...host, ...renderer].map((site) => site.exclusion)).toEqual([
      'explicit-web-adapter',
      'host-implementation',
      'technology-specific-renderer',
    ]);
  });

  it('drops the six WebGPU sites only when they move through an explicit web acquisition seam', () => {
    const directSource = `
      export async function acquire(canvas: HTMLCanvasElement) {
        if (!navigator.gpu) throw new Error('unsupported');
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();
        const format = navigator.gpu.getPreferredCanvasFormat();
        const context = canvas.getContext('webgpu');
        return { context, device, format };
      }
      export function supported() { return navigator.gpu !== null; }
    `;
    const direct = createHostBypassReport(
      1,
      scanHostBypassSource('packages/render-wgpu/src/wgpuHost.ts', directSource),
    );
    expect(countHostBypasses(direct)['webgpu-acquisition']).toBe(6);
    expect(direct.excluded).toEqual([]);

    const explicitWebSource = directSource
      .replace('function acquire', 'function acquireWebWgpuHost')
      .replace('function supported', 'function isWebWgpuSupported');
    const explicitWeb = createHostBypassReport(
      1,
      scanHostBypassSource('packages/render-wgpu/src/wgpuHost.ts', explicitWebSource),
    );
    expect(explicitWeb.sites).toEqual([]);
    expect(explicitWeb.excluded).toHaveLength(6);
    expect(explicitWeb.excluded.every((site) => site.exclusion === 'explicit-web-adapter')).toBe(true);

    const portableConsumer = createHostBypassReport(
      1,
      scanHostBypassSource(
        'packages/render-wgpu/src/wgpuRenderState.ts',
        `export function createWgpuRenderState(backend: WgpuHostBackend) { return backend.acquire(); }`,
      ),
    );
    expect(portableConsumer.sites).toEqual([]);
    expect(portableConsumer.excluded).toEqual([]);
  });
});

describe('createEmptyHostBypassReport', () => {
  // ★ Compared against the production path, never against a field list written here — a list would be a
  // second copy of the shape, which is the defect the factory exists to remove.
  it('supplies every field the real report producer does', () => {
    const produced = createHostBypassReport(0, []);
    expect(Object.keys(createEmptyHostBypassReport()).sort()).toEqual(Object.keys(produced).sort());
  });

  it('is empty rather than merely well-typed', () => {
    const empty = createEmptyHostBypassReport();
    expect(empty.scannedFiles).toBe(0);
    expect(empty.excluded).toEqual([]);
    expect(empty.sites).toEqual([]);
  });
});

let cleanHostBypassReport: ReturnType<typeof scanHostBypasses>;
