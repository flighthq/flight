import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countP5HostBypasses,
  createEmptyP5HostBypassReport,
  createP5HostBypassReport,
  deriveP5InputIngressListenerOperations,
  formatP5HostBypassReport,
  p5BitmapEncodeProgressFailures,
  p5BitmapEncodeRepairFailures,
  p5BitmapDrawTransferProgressFailures,
  p5BitmapDrawTransferRepairFailures,
  p5GlExampleRunnerOwnershipFailures,
  p5GlRenderSurfaceConsumerFailures,
  p5GlRenderSurfaceConsumerSourceFailures,
  p5GlRenderSurfaceProviderBoundaryFailures,
  p5WgpuExampleRunnerOwnershipFailures,
  p5WgpuRenderSurfaceConsumerFailures,
  p5WgpuRenderSurfaceConsumerSourceFailures,
  p5WgpuRenderSurfaceProviderBoundaryFailures,
  p5WgpuRenderSurfaceRepairFailures,
  P5_HOST_BYPASS_BUDGET,
  P5_HOST_BYPASS_BUDGET_HISTORY,
  P5_HOST_BYPASS_CLASSIFICATION_HISTORY,
  P5_HOST_BYPASS_DETECTOR_PROVENANCE,
  P5_HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY,
  P5_HOST_BYPASS_SLICE_GUIDANCE,
  P5_HOST_BYPASS_V3_PROGRESS_HISTORY,
  P5_HOST_BYPASS_V4_PROGRESS_HISTORY,
  p5HostBypassBudgetFailures,
  p5HostBypassBudgetHistoryFailures,
  p5HostBypassClassificationHistoryFailures,
  p5HostBypassCurrentBudgetFailures,
  p5HostBypassDetectorProvenanceFailures,
  p5HostBypassDetectorProvenanceHistoryFailures,
  p5HostBypassSliceGuidanceFailures,
  p5InputIngressPairingFailures,
  p5HostBypassV3ProgressHistoryFailures,
  p5HostBypassV4ProgressHistoryFailures,
  p5ShapeRasterSurfaceCurrentFailures,
  p5ShapeRasterSurfaceProgressFailures,
  p5ShapeRasterSurfaceRepairFailures,
  p5VideoCapabilityRepairFailures,
  p5VideoCapabilityProgressFailures,
  scanP5HostBypasses,
  scanP5HostBypassSource,
} from './p5-host-bypass';

const ROOT = resolve(import.meta.dirname, '..');

function scanRestoredBitmapDrawTransfer() {
  return scanP5HostBypassSource(
    'packages/bitmap/src/bitmapDraw.ts',
    `export function drawBitmap(width: number, height: number) {
       return new globalThis.ImageData(width, height);
     }`,
  );
}

function scanRestoredBitmapEncode(expression: 'canvas' | 'image-data') {
  return scanP5HostBypassSource(
    'packages/bitmap/src/bitmapEncode.ts',
    expression === 'canvas'
      ? `export function encodeBitmap() { return document.createElement('canvas'); }`
      : `export function encodeBitmap(width: number, height: number) {
           return new globalThis.ImageData(width, height);
         }`,
  );
}

function scanRestoredShapeRasterSurface(
  file: 'packages/scene2d-gl/src/glShapeData.ts' | 'packages/scene2d-wgpu/src/wgpuShapeData.ts',
  functionName: 'acquireGlShapeRasterSurface' | 'acquireWgpuShapeRasterSurface',
) {
  return scanP5HostBypassSource(file, `export function ${functionName}() { return document.createElement('canvas'); }`);
}

function findV4ProgressIndex(reason: string): number {
  const index = P5_HOST_BYPASS_V4_PROGRESS_HISTORY.findIndex((entry) => entry.reason === reason);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe('P5 host-bypass derived gate', () => {
  it('derives the live population without a source-file roster and enforces the ratchet', () => {
    const report = scanP5HostBypasses(ROOT);
    const formatted = formatP5HostBypassReport(report);
    console.log(formatted);
    expect(p5HostBypassBudgetFailures(report, P5_HOST_BYPASS_BUDGET)).toEqual([]);
    expect(formatted).toContain(
      'P5 outstanding=10 direct-dom=2 input-ingress=0 frame-scheduling=0 scratch-surface=8 render-surface=0 webgpu-acquisition=0',
    );
    expect(p5HostBypassCurrentBudgetFailures(report, P5_HOST_BYPASS_BUDGET)).toEqual([]);
    expect(p5ShapeRasterSurfaceCurrentFailures(report)).toEqual([]);
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
      '28 direct-dom=12 input-ingress=0 frame-scheduling=0 scratch-surface=14 render-surface=2 webgpu-acquisition=0 — P5 taxonomy v4 classification baseline',
    );
    expect(countP5HostBypasses(report)['render-surface']).toBe(0);
    expect(formatted).toContain('28 (-5 fixed)');
    expect(formatted).toContain(
      '14 (-2 fixed) direct-dom=4 input-ingress=0 frame-scheduling=0 scratch-surface=10 render-surface=0 webgpu-acquisition=0 — GL and WGPU shape raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    expect(formatted).toContain('DETECTS hand-written floor (not an exhaustive ceiling):');
    expect(formatted).toContain('ZERO category zero means none found by current detectors, not that no bypasses exist');
    expect(formatted).toContain('33 (-3 fixed)');
    expect(formatted).toContain('31 (-2 fixed)');
    expect(formatted).toContain('30 (-1 fixed)');
    expect(formatted).toContain(
      'SLICE a P5 seam repair is complete only when every existing production consumer migrates in the same slice; a lowered census alone is incomplete',
    );
  }, 30_000);

  it('pins same-slice production consumer migration as part of a P5 repair', () => {
    expect(p5HostBypassSliceGuidanceFailures(P5_HOST_BYPASS_SLICE_GUIDANCE)).toEqual([]);
    expect(p5HostBypassSliceGuidanceFailures('a lowered census is sufficient')).toContain(
      'P5 seam-slice guidance no longer requires same-slice production consumer migration',
    );
  });

  it('derives GL surface ownership for every direct functional consumer and both shared owners', () => {
    expect(p5GlRenderSurfaceConsumerFailures(ROOT)).toEqual([]);
  });

  it('mutation-proves a direct functional GL consumer cannot omit its Web enabler', () => {
    const file = 'functional/scenes/camera-orthographic.webgl.ts';
    const source = readFileSync(join(ROOT, file), 'utf8').replace('enableHostWebGlRenderSurface();', '');
    expect(p5GlRenderSurfaceConsumerSourceFailures(file, source)).toEqual([
      expect.stringContaining('GL surface creation is not immediately preceded by enableHostWebGlRenderSurface()'),
    ]);
  });

  it('mutation-proves the shared functional harness cannot omit its Web enabler', () => {
    const file = 'tools/harness/webgl.ts';
    const source = readFileSync(join(ROOT, file), 'utf8').replace('enableHostWebGlRenderSurface();', '');
    expect(p5GlRenderSurfaceConsumerSourceFailures(file, source)).toEqual([
      expect.stringContaining('GL surface creation is not immediately preceded by enableHostWebGlRenderSurface()'),
    ]);
  });

  it('mutation-proves the generated example WebGL owner cannot omit its Web enabler', () => {
    const source = readFileSync(join(ROOT, 'examples/runners/web/vite.config.ts'), 'utf8').replace(
      '`enableHostWebGlRenderSurface();`',
      '`mutation removed WebGL surface enabler`',
    );
    expect(p5GlExampleRunnerOwnershipFailures(source)).toContain(
      'examples WebGL entry does not call enableHostWebGlRenderSurface()',
    );
  });

  it('pins the portable GL provider against DOM restoration and WGPU cross-fallback', () => {
    const source = readFileSync(join(ROOT, 'packages/render-gl/src/glElement.ts'), 'utf8');
    expect(p5GlRenderSurfaceProviderBoundaryFailures(source)).toEqual([]);
    expect(p5GlRenderSurfaceProviderBoundaryFailures(`${source}\ncreateWgpuCanvasElement(1, 1);`)).toContain(
      'portable GL surface provider crosses into the WGPU surface boundary',
    );
    expect(p5GlRenderSurfaceProviderBoundaryFailures(`${source}\ndocument.createElement('canvas');`)).toContain(
      'portable GL surface provider reads document instead of returning null',
    );
  });

  it('derives WGPU surface ownership for every direct functional consumer and both shared owners', () => {
    expect(p5WgpuRenderSurfaceConsumerFailures(ROOT)).toEqual([]);
  });

  it('mutation-proves a direct functional WGPU consumer cannot omit its Web enabler', () => {
    const file = 'functional/scenes/camera-orthographic.webgpu.ts';
    const source = readFileSync(join(ROOT, file), 'utf8').replace('enableHostWebWgpuRenderSurface();', '');
    expect(p5WgpuRenderSurfaceConsumerSourceFailures(file, source)).toEqual([
      expect.stringContaining('WGPU surface creation is not immediately preceded by enableHostWebWgpuRenderSurface()'),
    ]);
  });

  it('mutation-proves the shared functional WebGPU harness cannot omit its Web enabler', () => {
    const file = 'tools/harness/webgpu.ts';
    const source = readFileSync(join(ROOT, file), 'utf8').replace('enableHostWebWgpuRenderSurface();', '');
    expect(p5WgpuRenderSurfaceConsumerSourceFailures(file, source)).toEqual([
      expect.stringContaining('WGPU surface creation is not immediately preceded by enableHostWebWgpuRenderSurface()'),
    ]);
  });

  it('mutation-proves the generated example WebGPU owner cannot omit or delay its Web enabler', () => {
    const source = readFileSync(join(ROOT, 'examples/runners/web/vite.config.ts'), 'utf8');
    expect(
      p5WgpuExampleRunnerOwnershipFailures(
        source.replace('`enableHostWebWgpuRenderSurface();`', '`mutation removed WebGPU surface enabler`'),
      ),
    ).toContain('examples WebGPU entry does not call enableHostWebWgpuRenderSurface()');
    const branch = source.match(/  if \(render === 'webgpu'\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(p5WgpuExampleRunnerOwnershipFailures(source.replace(branch, '').concat(`\n${branch}`))).toContain(
      'examples WebGPU enabler does not run before the capture render dynamic import',
    );
  });

  it('pins the portable WGPU provider against DOM, GL and acquisition fallback independently', () => {
    const source = readFileSync(join(ROOT, 'packages/render-wgpu/src/wgpuElement.ts'), 'utf8');
    expect(p5WgpuRenderSurfaceProviderBoundaryFailures(source)).toEqual([]);
    expect(p5WgpuRenderSurfaceProviderBoundaryFailures(`${source}\ncreateGlCanvasElement(1, 1);`)).toContain(
      'portable WGPU surface provider crosses into the GL surface boundary',
    );
    expect(p5WgpuRenderSurfaceProviderBoundaryFailures(`${source}\ngetWgpuHostBackend();`)).toContain(
      'portable WGPU surface provider crosses into the WGPU acquisition boundary',
    );
    expect(p5WgpuRenderSurfaceProviderBoundaryFailures(`${source}\ndocument.createElement('canvas');`)).toContain(
      'portable WGPU surface provider reads document instead of returning null',
    );
  });

  it('pins zero remaining render-surface sites after S08', () => {
    const report = scanP5HostBypasses(ROOT);
    expect(p5WgpuRenderSurfaceRepairFailures(report)).toEqual([]);
    const restored = scanP5HostBypassSource(
      'packages/render-wgpu/src/wgpuElement.ts',
      `export function createWgpuCanvasElement() { return document.createElement('canvas'); }`,
    );
    const withWgpu = createP5HostBypassReport(report.scannedFiles, [...report.p5, ...report.excluded, ...restored]);
    expect(p5WgpuRenderSurfaceRepairFailures(withWgpu)).toContain(
      'S08 must leave no render surfaces; found [packages/render-wgpu/src/wgpuElement.ts:createWgpuCanvasElement]',
    );
  }, 30_000);

  it('mutation-proves restoring the portable GL DOM factory exceeds the v4 render ratchet', () => {
    const clean = scanP5HostBypasses(ROOT);
    const restored = scanP5HostBypassSource(
      'packages/render-gl/src/glElement.ts',
      `export function createGlCanvasElement() { return document.createElement('canvas'); }`,
    );
    const mutated = createP5HostBypassReport(clean.scannedFiles, [...clean.p5, ...clean.excluded, ...restored]);
    expect(countP5HostBypasses(mutated)['render-surface']).toBe(1);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('render-surface: found 1, budget 0');
  }, 30_000);

  it('mutation-proves restoring the portable WGPU DOM factory exceeds the v4 render ratchet', () => {
    const clean = scanP5HostBypasses(ROOT);
    const restored = scanP5HostBypassSource(
      'packages/render-wgpu/src/wgpuElement.ts',
      `export function createWgpuCanvasElement() { return document.createElement('canvas'); }`,
    );
    const mutated = createP5HostBypassReport(clean.scannedFiles, [...clean.p5, ...clean.excluded, ...restored]);
    expect(countP5HostBypasses(mutated)['render-surface']).toBe(1);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('render-surface: found 1, budget 0');
  }, 30_000);

  it('pins the S09 bitmapDraw target absent independently of the lowered scratch ratchet', () => {
    const clean = scanP5HostBypasses(ROOT);
    expect(p5BitmapDrawTransferRepairFailures(clean)).toEqual([]);
    const restored = scanRestoredBitmapDrawTransfer();
    const mutated = createP5HostBypassReport(clean.scannedFiles, [...clean.p5, ...clean.excluded, ...restored]);
    expect(p5BitmapDrawTransferRepairFailures(mutated)).toContain(
      'S09 must remove the bitmapDraw global ImageData transfer; found [packages/bitmap/src/bitmapDraw.ts:drawBitmap]',
    );
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 9, budget 8');
  }, 30_000);

  it('mutation-proves restoring the S09 target while removing a different scratch site cannot substitute', () => {
    const clean = scanP5HostBypasses(ROOT);
    const otherScratch = clean.p5.find((site) => site.kind === 'scratch-surface')!;
    const mutated = createP5HostBypassReport(clean.scannedFiles, [
      ...clean.p5.filter((site) => site !== otherScratch),
      ...clean.excluded,
      ...scanRestoredBitmapDrawTransfer(),
    ]);
    expect(countP5HostBypasses(mutated)['scratch-surface']).toBe(8);
    expect(p5HostBypassCurrentBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toEqual([]);
    expect(p5BitmapDrawTransferRepairFailures(mutated)).toContain(
      'S09 must remove the bitmapDraw global ImageData transfer; found [packages/bitmap/src/bitmapDraw.ts:drawBitmap]',
    );
  }, 30_000);

  it('mutation-proves an extra removal fails the exact live-current assertion at total 9', () => {
    const clean = scanP5HostBypasses(ROOT);
    const otherScratch = clean.p5.find((site) => site.kind === 'scratch-surface')!;
    const mutated = createP5HostBypassReport(clean.scannedFiles, [
      ...clean.p5.filter((site) => site !== otherScratch),
      ...clean.excluded,
    ]);
    expect(p5BitmapDrawTransferRepairFailures(mutated)).toEqual([]);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toEqual([]);
    expect(p5HostBypassCurrentBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toEqual([
      'P5 current scratch-surface: found 7, expected 8',
      'P5 current outstanding: found 9, expected 10',
    ]);
  }, 30_000);

  it('pins both H8 shape-raster targets absent independently of the lowered scratch ratchet', () => {
    const clean = scanP5HostBypasses(ROOT);
    expect(p5ShapeRasterSurfaceRepairFailures(clean)).toEqual([]);
    for (const [file, functionName] of [
      ['packages/scene2d-gl/src/glShapeData.ts', 'acquireGlShapeRasterSurface'],
      ['packages/scene2d-wgpu/src/wgpuShapeData.ts', 'acquireWgpuShapeRasterSurface'],
    ] as const) {
      const restored = scanRestoredShapeRasterSurface(file, functionName);
      const mutated = createP5HostBypassReport(clean.scannedFiles, [...clean.p5, ...clean.excluded, ...restored]);
      expect(p5ShapeRasterSurfaceRepairFailures(mutated)).toContain(
        `H8 must remove both shape-raster scratch surfaces; found [${file}:${functionName}]`,
      );
      expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain(
        'scratch-surface: found 9, budget 8',
      );
    }
  }, 30_000);

  it('mutation-proves restoring an H8 target while removing a different scratch site cannot substitute', () => {
    const clean = scanP5HostBypasses(ROOT);
    const otherScratch = clean.p5.find((site) => site.kind === 'scratch-surface')!;
    const mutated = createP5HostBypassReport(clean.scannedFiles, [
      ...clean.p5.filter((site) => site !== otherScratch),
      ...clean.excluded,
      ...scanRestoredShapeRasterSurface('packages/scene2d-gl/src/glShapeData.ts', 'acquireGlShapeRasterSurface'),
    ]);
    expect(p5ShapeRasterSurfaceCurrentFailures(mutated)).toEqual([]);
    expect(p5ShapeRasterSurfaceRepairFailures(mutated)).toContain(
      'H8 must remove both shape-raster scratch surfaces; found [packages/scene2d-gl/src/glShapeData.ts:acquireGlShapeRasterSurface]',
    );
  }, 30_000);

  it('mutation-proves the H8 exact-current guard rejects an extra unrelated removal', () => {
    const clean = scanP5HostBypasses(ROOT);
    const otherScratch = clean.p5.find((site) => site.kind === 'scratch-surface')!;
    const mutated = createP5HostBypassReport(clean.scannedFiles, [
      ...clean.p5.filter((site) => site !== otherScratch),
      ...clean.excluded,
    ]);
    expect(p5ShapeRasterSurfaceRepairFailures(mutated)).toEqual([]);
    expect(p5ShapeRasterSurfaceCurrentFailures(mutated)).toEqual([
      'P5 current scratch-surface: found 7, expected 8',
      'P5 current outstanding: found 9, expected 10',
    ]);
  }, 30_000);

  it('pins both bitmapEncode scratch targets absent independently of the lowered ratchet', () => {
    const report = scanP5HostBypasses(ROOT);
    expect(p5BitmapEncodeRepairFailures(report)).toEqual([]);
  }, 30_000);

  it.each([
    ['canvas', "document.createElement('canvas')"],
    ['image-data', 'new globalThis.ImageData(width, height)'],
  ] as const)(
    'mutation-proves restoring the bitmapEncode %s target',
    (target, expression) => {
      const clean = scanP5HostBypasses(ROOT);
      const restored = scanRestoredBitmapEncode(target);
      const mutated = createP5HostBypassReport(clean.scannedFiles, [...clean.p5, ...clean.excluded, ...restored]);
      expect(p5BitmapEncodeRepairFailures(mutated)).toContain(
        `Bitmap encoding must leave no portable scratch construction; found [packages/bitmap/src/bitmapEncode.ts:encodeBitmap:${expression}]`,
      );
    },
    30_000,
  );

  it('mutation-proves same-count removal elsewhere cannot substitute for either bitmapEncode target', () => {
    const clean = scanP5HostBypasses(ROOT);
    const otherScratch = clean.p5.filter((site) => site.kind === 'scratch-surface').slice(0, 2);
    const mutated = createP5HostBypassReport(clean.scannedFiles, [
      ...clean.p5.filter((site) => !otherScratch.includes(site)),
      ...clean.excluded,
      ...scanRestoredBitmapEncode('canvas'),
      ...scanRestoredBitmapEncode('image-data'),
    ]);
    expect(countP5HostBypasses(mutated)['scratch-surface']).toBe(8);
    expect(p5HostBypassCurrentBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toEqual([]);
    expect(p5BitmapEncodeRepairFailures(mutated)).not.toEqual([]);
  }, 30_000);

  it('pins the video capability target absent and both exact resource survivors present', () => {
    const report = scanP5HostBypasses(ROOT);
    expect(p5VideoCapabilityRepairFailures(report)).toEqual([]);
  }, 30_000);

  it('mutation-proves restoring the video capability DOM target fails its named predicate', () => {
    const clean = scanP5HostBypasses(ROOT);
    const restored = scanP5HostBypassSource(
      'packages/video/src/videoFormat.ts',
      `export function canPlayVideoType() { return document.createElement('video'); }`,
    );
    const mutated = createP5HostBypassReport(clean.scannedFiles, [...clean.p5, ...clean.excluded, ...restored]);
    expect(p5VideoCapabilityRepairFailures(mutated)).toContain(
      'S10 must remove the videoFormat canPlayVideoType DOM probe; found [packages/video/src/videoFormat.ts:canPlayVideoType]',
    );
  }, 30_000);

  it('mutation-proves both exact video capability resource survivors independently', () => {
    const clean = scanP5HostBypasses(ROOT);
    for (const functionName of ['createVideoResourceFromMediaStream', 'loadVideoResourceFromUrl']) {
      const mutated = createP5HostBypassReport(
        clean.scannedFiles,
        [...clean.p5, ...clean.excluded].filter(
          (site) =>
            !(
              site.file === 'packages/video/src/videoResourceFrom.ts' &&
              site.functionName === functionName &&
              site.expression === "document.createElement('video')"
            ),
        ),
      );
      expect(p5VideoCapabilityRepairFailures(mutated)).toContain(
        `S10 must preserve both videoResourceFrom DOM resource sites; missing [packages/video/src/videoResourceFrom.ts:${functionName}]`,
      );
    }
  }, 30_000);

  it('pins detector provenance against removal and false exhaustive wording', () => {
    expect(P5_HOST_BYPASS_DETECTOR_PROVENANCE).toEqual({
      detects:
        'hand-written floor (not an exhaustive ceiling): direct document/window/navigator access, input listener and gamepad sampling, frame scheduling, caller-owned GL/WebGPU render-surface construction, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
      taxonomyVersion: 4,
      zeroMeaning: 'category zero means none found by current detectors, not that no bypasses exist',
    });
    expect(P5_HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY).toEqual([
      {
        detects:
          'hand-written floor (not an exhaustive ceiling): direct document/window/navigator access, input listener and gamepad sampling, frame scheduling, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
        taxonomyVersion: 3,
        zeroMeaning: 'category zero means none found by current detectors, not that no bypasses exist',
      },
      P5_HOST_BYPASS_DETECTOR_PROVENANCE,
    ]);
    expect(p5HostBypassDetectorProvenanceHistoryFailures(P5_HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY)).toEqual([]);
    expect(p5HostBypassDetectorProvenanceFailures(P5_HOST_BYPASS_DETECTOR_PROVENANCE)).toEqual([]);
    expect(p5HostBypassDetectorProvenanceFailures({ ...P5_HOST_BYPASS_DETECTOR_PROVENANCE, detects: '' })).toContain(
      'P5 detector provenance rewrites the accepted hand-written detection floor',
    );
    expect(
      p5HostBypassDetectorProvenanceFailures({
        ...P5_HOST_BYPASS_DETECTOR_PROVENANCE,
        zeroMeaning: 'category zero proves no bypasses exist',
      }),
    ).toContain('P5 detector provenance rewrites the accepted non-exhaustive zero meaning');
  });

  it('preserves the append-only evidenced budget history and its category breakdowns', () => {
    expect(P5_HOST_BYPASS_BUDGET_HISTORY).toEqual([
      {
        budget: { 'direct-dom': 18, 'input-ingress': 26, 'scratch-surface': 18, 'webgpu-acquisition': 6 },
        reason: 'initial runtime-derived P5 host-bypass census',
        total: 68,
      },
      {
        budget: { 'direct-dom': 18, 'input-ingress': 26, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
        reason: 'WebGPU acquisition routed through the structural host backend',
        total: 62,
      },
      {
        budget: { 'direct-dom': 18, 'input-ingress': 0, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
        reason: 'input listeners routed through the process-wide ingress backend',
        total: 36,
      },
      {
        budget: { 'direct-dom': 15, 'input-ingress': 0, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
        reason: 'geolocation availability routed through the selected backend',
        total: 33,
      },
      {
        budget: { 'direct-dom': 15, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
        reason: 'Bitmap materialization routed through the selected image backend',
        total: 31,
      },
      {
        budget: { 'direct-dom': 14, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
        reason: 'Shortcut platform identity routed through the selected platform backend',
        total: 30,
      },
    ]);
    expect(p5HostBypassBudgetHistoryFailures(P5_HOST_BYPASS_BUDGET_HISTORY)).toEqual([]);
  });

  it('records immutable relabel and discovery events separately from repair progress', () => {
    expect(P5_HOST_BYPASS_CLASSIFICATION_HISTORY).toEqual([
      {
        fromBudget: { 'direct-dom': 14, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
        fromTotal: 30,
        fromVersion: 1,
        newlyDetected: [],
        reason: 'navigator.getGamepads sampling recategorised as input ingress',
        recategorised: [
          {
            count: 2,
            from: 'direct-dom',
            reason: 'navigator.getGamepads capability read and poll call',
            to: 'input-ingress',
          },
        ],
        toBudget: { 'direct-dom': 12, 'input-ingress': 2, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
        toTotal: 30,
        toVersion: 2,
      },
      {
        fromBudget: { 'direct-dom': 12, 'input-ingress': 2, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
        fromTotal: 30,
        fromVersion: 2,
        newlyDetected: [
          {
            count: 3,
            kind: 'frame-scheduling',
            reason: 'two requestAnimationFrame calls and one cancelAnimationFrame call',
          },
        ],
        reason: 'gamepad frame scheduling added to P5 classification coverage',
        recategorised: [],
        toBudget: {
          'direct-dom': 12,
          'input-ingress': 2,
          'frame-scheduling': 3,
          'scratch-surface': 16,
          'webgpu-acquisition': 0,
        },
        toTotal: 33,
        toVersion: 3,
      },
      {
        fromBudget: {
          'direct-dom': 12,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 16,
          'webgpu-acquisition': 0,
        },
        fromTotal: 28,
        fromVersion: 3,
        newlyDetected: [],
        reason: 'GL and WebGPU root canvases recategorised as caller-owned render surfaces',
        recategorised: [
          {
            count: 2,
            from: 'scratch-surface',
            reason: 'render-gl and render-wgpu root canvas factories',
            to: 'render-surface',
          },
        ],
        toBudget: {
          'direct-dom': 12,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 14,
          'render-surface': 2,
          'webgpu-acquisition': 0,
        },
        toTotal: 28,
        toVersion: 4,
      },
    ]);
    expect(p5HostBypassClassificationHistoryFailures(P5_HOST_BYPASS_CLASSIFICATION_HISTORY)).toEqual([]);
    expect(P5_HOST_BYPASS_V3_PROGRESS_HISTORY).toEqual([
      {
        budget: {
          'direct-dom': 12,
          'input-ingress': 2,
          'frame-scheduling': 3,
          'scratch-surface': 16,
          'webgpu-acquisition': 0,
        },
        reason: 'P5 taxonomy v3 classification baseline',
        total: 33,
      },
      {
        budget: {
          'direct-dom': 12,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 16,
          'webgpu-acquisition': 0,
        },
        reason: 'gamepad sampling and scheduling moved into the explicit Web ingress adapter',
        total: 28,
      },
    ]);
    expect(p5HostBypassV3ProgressHistoryFailures(P5_HOST_BYPASS_V3_PROGRESS_HISTORY)).toEqual([]);
    expect(P5_HOST_BYPASS_V4_PROGRESS_HISTORY).toEqual([
      {
        budget: {
          'direct-dom': 12,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 14,
          'render-surface': 2,
          'webgpu-acquisition': 0,
        },
        reason: 'P5 taxonomy v4 classification baseline',
        repairedSites: 0,
        total: 28,
      },
      {
        budget: {
          'direct-dom': 12,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 14,
          'render-surface': 1,
          'webgpu-acquisition': 0,
        },
        reason: 'GL root-surface creation routed through the selected GL render-surface provider',
        repairedSites: 1,
        total: 27,
      },
      {
        budget: {
          'direct-dom': 12,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 14,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'WGPU root-surface creation routed through the selected WGPU render-surface provider',
        repairedSites: 1,
        total: 26,
      },
      {
        budget: {
          'direct-dom': 12,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 13,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
        repairedSites: 1,
        total: 25,
      },
      {
        budget: {
          'direct-dom': 9,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 13,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Input pointer-lock exit and state queries routed through the selected input ingress backend',
        repairedSites: 3,
        total: 22,
      },
      {
        budget: {
          'direct-dom': 8,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 13,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Video MIME capability probing routed through the selected video capability backend',
        repairedSites: 1,
        total: 21,
      },
      {
        budget: {
          'direct-dom': 7,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 13,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Font face loading routed through the selected font-loading backend',
        repairedSites: 1,
        total: 20,
      },
      {
        budget: {
          'direct-dom': 6,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 13,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Font face registration routed through the selected font-loading backend',
        repairedSites: 1,
        total: 19,
      },
      {
        budget: {
          'direct-dom': 5,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 13,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Font availability check routed through the selected font-loading backend',
        repairedSites: 1,
        total: 18,
      },
      {
        budget: {
          'direct-dom': 4,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 13,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Font readiness query routed through the selected font-loading backend',
        repairedSites: 1,
        total: 17,
      },
      {
        budget: {
          'direct-dom': 4,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 12,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Image-resource capture composed through the existing image-source readback primitive',
        repairedSites: 1,
        total: 16,
      },
      {
        budget: {
          'direct-dom': 4,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 11,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Bitmap encoding scratch canvas creation routed through the selected bitmap encode backend',
        repairedSites: 1,
        total: 15,
      },
      {
        budget: {
          'direct-dom': 4,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 10,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'Bitmap encoding ImageData construction routed through the selected bitmap encode backend',
        repairedSites: 1,
        total: 14,
      },
      {
        budget: {
          'direct-dom': 2,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 10,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason:
          'window-management permission query and change subscription routed through two optional ScreenBackend operations',
        repairedSites: 2,
        total: 12,
      },
      {
        budget: {
          'direct-dom': 2,
          'input-ingress': 0,
          'frame-scheduling': 0,
          'scratch-surface': 8,
          'render-surface': 0,
          'webgpu-acquisition': 0,
        },
        reason: 'GL and WGPU shape raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
        repairedSites: 2,
        total: 10,
      },
    ]);
    expect(p5HostBypassV4ProgressHistoryFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(p5BitmapEncodeProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(p5BitmapDrawTransferProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(p5VideoCapabilityProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
    expect(p5ShapeRasterSurfaceProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
  });

  it('mutation-proves S09 cannot collapse the immutable 26 -> 25 repair into 26 -> 24', () => {
    const s09Index = findV4ProgressIndex(
      'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
    );
    const s09 = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[s09Index];
    const mutated = [
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      { ...s09, budget: { ...s09.budget, 'direct-dom': 11 }, total: 24 },
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    expect(p5HostBypassV4ProgressHistoryFailures(mutated)).toContain(
      `P5 taxonomy v4 progress history[${s09Index}] declares 1 repaired site(s) but moves 26 -> 24`,
    );
  });

  it('mutation-proves either bitmapEncode checkpoint cannot be omitted or merged', () => {
    const omittedCanvas = [
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, 11),
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(12),
    ];
    expect(p5BitmapEncodeProgressFailures(omittedCanvas)).not.toEqual([]);
    expect(p5HostBypassV4ProgressHistoryFailures(omittedCanvas)).toContain(
      'P5 taxonomy v4 progress history[11] declares 1 repaired site(s) but moves 16 -> 14',
    );
  });

  it('mutation-proves omitting the S09 ledger event fails history even when live-current still matches', () => {
    const s09Index = findV4ProgressIndex(
      'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
    );
    const omitted = [
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    expect(p5BitmapDrawTransferProgressFailures(omitted)).toContain(
      'S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
    // With S09 dropped, pointer-lock slides into index 3 and its OWN declaration drives the message —
    // three sites, not the "one" the old index-keyed table would have assigned to whatever sat here.
    // That the message follows the entry rather than the position is the invariant repair working.
    expect(p5HostBypassV4ProgressHistoryFailures(omitted)).toContain(
      `P5 taxonomy v4 progress history[${s09Index}] declares 3 repaired site(s) but moves 26 -> 22`,
    );
    const report = scanP5HostBypasses(ROOT);
    expect(p5HostBypassCurrentBudgetFailures(report, omitted.at(-1)!.budget)).toEqual([]);
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
    const at = P5_HOST_BYPASS_V4_PROGRESS_HISTORY.findIndex((entry) => entry.reason === screenReason);
    // Loud, not silent: a drifted reason must fail here rather than yield -1 and slice into nonsense.
    expect(at).toBeGreaterThanOrEqual(0);
    const screen = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[at]!;
    const prior = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[at - 1]!;
    const rebuild = (repairedSites: number) => [
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, at),
      { ...screen, repairedSites },
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(at + 1),
    ];

    // Understated, and overstated. Totals interpolated so the message cannot rot when the chain grows.
    expect(p5HostBypassV4ProgressHistoryFailures(rebuild(1))).toContain(
      `P5 taxonomy v4 progress history[${at}] declares 1 repaired site(s) but moves ${prior.total} -> ${screen.total}`,
    );
    expect(p5HostBypassV4ProgressHistoryFailures(rebuild(3))).toContain(
      `P5 taxonomy v4 progress history[${at}] declares 3 repaired site(s) but moves ${prior.total} -> ${screen.total}`,
    );

    // And the honest declaration stays green, so this cannot pass by rejecting everything.
    expect(screen.repairedSites).toBe(prior.total - screen.total);
    expect(p5HostBypassV4ProgressHistoryFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY)).toEqual([]);
  });

  it('mutation-proves S09 cannot rewrite the accepted S08 checkpoint', () => {
    const s08 = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[2];
    const mutated = [
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, 2),
      { ...s08, reason: 'mutation: rewrite accepted S08 evidence' },
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(3),
    ];
    expect(p5HostBypassV4ProgressHistoryFailures(mutated)).toContain(
      'P5 taxonomy v4 progress history[2] rewrites immutable accepted checkpoint',
    );
  });

  it('mutation-proves S09 checkpoint categories and reason independently', () => {
    const s09Index = findV4ProgressIndex(
      'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
    );
    const s09 = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[s09Index];
    const wrongCategories = [
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      {
        ...s09,
        budget: { ...s09.budget, 'direct-dom': 11, 'scratch-surface': 14 },
      },
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    const wrongReason = [
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, s09Index),
      { ...s09, reason: 'mutation: wrong S09 reason' },
      ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(s09Index + 1),
    ];
    expect(p5BitmapDrawTransferProgressFailures(wrongCategories)).toContain(
      'S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
    expect(p5BitmapDrawTransferProgressFailures(wrongReason)).toContain(
      'S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
  });

  it('mutation-proves the H8 checkpoint declares exactly two repaired sites', () => {
    const h8Index = findV4ProgressIndex(
      'GL and WGPU shape raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
    );
    const h8 = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[h8Index];
    for (const repairedSites of [1, 3]) {
      const mutated = [
        ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(0, h8Index),
        { ...h8, repairedSites },
        ...P5_HOST_BYPASS_V4_PROGRESS_HISTORY.slice(h8Index + 1),
      ];
      expect(p5HostBypassV4ProgressHistoryFailures(mutated)).toContain(
        `P5 taxonomy v4 progress history[${h8Index}] declares ${repairedSites} repaired site(s) but moves 16 -> 14`,
      );
      expect(p5ShapeRasterSurfaceProgressFailures(mutated)).toContain(
        'H8 shape-raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      );
    }
  });

  it('mutation-proves that the v4 pure relabel cannot change the total', () => {
    const relabelIndex = P5_HOST_BYPASS_CLASSIFICATION_HISTORY.length - 1;
    const relabel = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[relabelIndex];
    const mutated = [
      ...P5_HOST_BYPASS_CLASSIFICATION_HISTORY.slice(0, relabelIndex),
      { ...relabel, toTotal: relabel.toTotal + 1 },
    ];
    expect(p5HostBypassClassificationHistoryFailures(mutated)).toContain(
      `P5 taxonomy history[${relabelIndex}] pure relabel changes total 28 -> 29`,
    );
  });

  it('mutation-proves that the v4 relabel cannot claim new findings', () => {
    const relabelIndex = P5_HOST_BYPASS_CLASSIFICATION_HISTORY.length - 1;
    const relabel = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[relabelIndex];
    const mutated = [
      ...P5_HOST_BYPASS_CLASSIFICATION_HISTORY.slice(0, relabelIndex),
      {
        ...relabel,
        newlyDetected: [
          { count: 1, kind: 'render-surface' as const, reason: 'mutation: hides a new finding in the relabel' },
        ],
      },
    ];
    expect(p5HostBypassClassificationHistoryFailures(mutated)).toContain(
      `P5 taxonomy history[${relabelIndex}] census delta 0 does not match 1 newly detected sites`,
    );
  });

  it('mutation-proves that the v4 relabel cannot lose its scratch-surface provenance', () => {
    const relabelIndex = P5_HOST_BYPASS_CLASSIFICATION_HISTORY.length - 1;
    const relabel = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[relabelIndex];
    const mutated = [
      ...P5_HOST_BYPASS_CLASSIFICATION_HISTORY.slice(0, relabelIndex),
      {
        ...relabel,
        recategorised: [{ ...relabel.recategorised[0], from: 'render-surface' as const }],
      },
    ];
    const failures = p5HostBypassClassificationHistoryFailures(mutated);
    expect(failures).toContain(
      `P5 taxonomy history[${relabelIndex}] rewrites immutable accepted classification evidence`,
    );
    expect(failures).toContain(
      `P5 taxonomy history[${relabelIndex}] derived categories do not match its evidenced after-budget`,
    );
  });

  it('mutation-proves that the v4 append cannot rewrite an accepted classification prefix', () => {
    const accepted = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [
      { ...accepted, reason: 'mutation: rewrite accepted v1 evidence' },
      ...P5_HOST_BYPASS_CLASSIFICATION_HISTORY.slice(1),
    ];
    expect(p5HostBypassClassificationHistoryFailures(mutated)).toContain(
      'P5 taxonomy history[0] rewrites immutable accepted classification evidence',
    );
  });

  it('mutation-proves that a pure relabel cannot change the total', () => {
    const relabel = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [{ ...relabel, toTotal: relabel.toTotal + 1 }, P5_HOST_BYPASS_CLASSIFICATION_HISTORY[1]];
    expect(p5HostBypassClassificationHistoryFailures(mutated)).toContain(
      'P5 taxonomy history[0] pure relabel changes total 30 -> 31',
    );
  });

  it('mutation-proves that the zero-new relabel cannot be mislabeled as new findings', () => {
    const relabel = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [
      {
        ...relabel,
        newlyDetected: [{ count: 2, kind: 'input-ingress' as const, reason: 'mutation: mislabeled existing findings' }],
        recategorised: [],
      },
      P5_HOST_BYPASS_CLASSIFICATION_HISTORY[1],
    ];
    const failures = p5HostBypassClassificationHistoryFailures(mutated);
    expect(failures).toContain('P5 taxonomy history[0] rewrites immutable accepted classification evidence');
    expect(failures).toContain('P5 taxonomy history[0] derived categories do not match its evidenced after-budget');
  });

  it('mutation-proves that the relabel cannot lose its direct-dom provenance', () => {
    const relabel = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[0];
    const mutated = [
      {
        ...relabel,
        recategorised: [{ ...relabel.recategorised[0], from: 'input-ingress' as const }],
      },
      P5_HOST_BYPASS_CLASSIFICATION_HISTORY[1],
    ];
    expect(p5HostBypassClassificationHistoryFailures(mutated)).toContain(
      'P5 taxonomy history[0] rewrites immutable accepted classification evidence',
    );
  });

  it('mutation-proves that scheduling discovery cannot be recorded as a relabel', () => {
    const discovery = P5_HOST_BYPASS_CLASSIFICATION_HISTORY[1];
    const mutated = [
      P5_HOST_BYPASS_CLASSIFICATION_HISTORY[0],
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
    expect(p5HostBypassClassificationHistoryFailures(mutated)).toContain(
      'P5 taxonomy history[1] derived categories do not match its evidenced after-budget',
    );
  });

  it('mutation-proves that coherently raising the accepted Bitmap checkpoint cannot rewrite history', () => {
    const checkpoint = P5_HOST_BYPASS_BUDGET_HISTORY[4];
    const mutated = [
      ...P5_HOST_BYPASS_BUDGET_HISTORY.slice(0, 4),
      {
        ...checkpoint,
        budget: { ...checkpoint.budget, 'scratch-surface': checkpoint.budget['scratch-surface'] + 1 },
        total: checkpoint.total + 1,
      },
      ...P5_HOST_BYPASS_BUDGET_HISTORY.slice(5),
    ];
    expect(p5HostBypassBudgetHistoryFailures(mutated)).toContain(
      'P5 budget history[4] rewrites immutable accepted checkpoint total 31 (categories and reason are pinned)',
    );
  });

  it('pins the appended Shortcut checkpoint categories even when its total stays coherent', () => {
    const latest = P5_HOST_BYPASS_BUDGET_HISTORY[P5_HOST_BYPASS_BUDGET_HISTORY.length - 1];
    const mutated = [
      ...P5_HOST_BYPASS_BUDGET_HISTORY.slice(0, -1),
      {
        ...latest,
        budget: {
          ...latest.budget,
          'direct-dom': latest.budget['direct-dom'] + 1,
          'scratch-surface': latest.budget['scratch-surface'] - 1,
        },
      },
    ];
    expect(p5HostBypassBudgetHistoryFailures(mutated)).toContain(
      'P5 budget history[5] rewrites immutable accepted checkpoint total 30 (categories and reason are pinned)',
    );
  });

  it('rejects an appended budget increase instead of accepting it as new history', () => {
    const latest = P5_HOST_BYPASS_BUDGET_HISTORY[P5_HOST_BYPASS_BUDGET_HISTORY.length - 1];
    const mutated = [
      ...P5_HOST_BYPASS_BUDGET_HISTORY,
      {
        budget: { ...latest.budget, 'direct-dom': latest.budget['direct-dom'] + 1 },
        reason: 'mutation: ordinary bypass addition',
        total: latest.total + 1,
      },
    ];
    expect(p5HostBypassBudgetHistoryFailures(mutated)).toContain(
      'P5 budget history[6] total 31 is not below prior total 30',
    );
  });

  it('derives an exact one-to-one input listener registration/removal name pairing', () => {
    const operations = deriveP5InputIngressListenerOperations(scanP5HostBypasses(ROOT));
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
    expect(p5InputIngressPairingFailures(operations)).toEqual([]);
  }, 30_000);

  it.each([
    [
      'an unpaired registration',
      `export function createWebInputIngressBackend(target: EventTarget) {
         target.addEventListener('keydown', run);
         target.addEventListener('keyup', run);
         return () => target.removeEventListener('keydown', run);
       }`,
    ],
    [
      'a mismatched removal name',
      `export function createWebInputIngressBackend(target: EventTarget) {
         target.addEventListener('keydown', run);
         return () => target.removeEventListener('keyup', run);
       }`,
    ],
  ])('mutation-proves that %s fails exact input listener pairing', (_name, source) => {
    const report = createP5HostBypassReport(1, scanP5HostBypassSource('packages/input/src/inputIngressWeb.ts', source));
    expect(p5InputIngressPairingFailures(deriveP5InputIngressListenerOperations(report))).not.toEqual([]);
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
    const clean = createP5HostBypassReport(
      1,
      scanP5HostBypassSource('packages/portable/src/portable.ts', 'export {};'),
    );
    const budget = countP5HostBypasses(clean);
    const mutated = createP5HostBypassReport(1, scanP5HostBypassSource('packages/portable/src/portable.ts', mutation));
    expect(countP5HostBypasses(mutated)[kind]).toBeGreaterThan(budget[kind]);
    expect(p5HostBypassBudgetFailures(mutated, budget)).toContain(
      `${kind}: found ${countP5HostBypasses(mutated)[kind]}, budget 0`,
    );
  });

  it('classifies gamepad sampling and frame scheduling without widening locally shadowed calls', () => {
    const sites = scanP5HostBypassSource(
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

    const shadowed = scanP5HostBypassSource(
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
    const clean = scanP5HostBypasses(ROOT);
    const restoredProbe = scanP5HostBypassSource(
      'packages/geolocation/src/restoredGeolocationProbe.ts',
      `export function isGeolocationAvailable() {
         if (typeof navigator === 'undefined') return false;
         if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
         return typeof navigator.geolocation !== 'undefined' && navigator.geolocation !== null;
       }`,
    );
    const mutated = createP5HostBypassReport(clean.scannedFiles + 1, [
      ...clean.p5,
      ...clean.excluded,
      ...restoredProbe,
    ]);
    expect(restoredProbe).toHaveLength(3);
    expect(countP5HostBypasses(mutated)['direct-dom']).toBe(5);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('direct-dom: found 5, budget 2');
  }, 30_000);

  it('mutation-proves that restoring portable Bitmap materialization exceeds the lowered scratch ratchet', () => {
    const clean = scanP5HostBypasses(ROOT);
    const restoredBridge = scanP5HostBypassSource(
      'packages/image/src/restoredBitmapMaterialization.ts',
      `export function createImageResourceFromBitmap(bitmap: { width: number; height: number }) {
         const canvas = document.createElement('canvas');
         const imageData = new globalThis.ImageData(bitmap.width, bitmap.height);
         return { canvas, imageData };
       }`,
    );
    const mutated = createP5HostBypassReport(clean.scannedFiles + 1, [
      ...clean.p5,
      ...clean.excluded,
      ...restoredBridge,
    ]);
    expect(restoredBridge).toHaveLength(2);
    expect(countP5HostBypasses(mutated)['scratch-surface']).toBe(10);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('scratch-surface: found 10, budget 8');
  }, 30_000);

  it('mutation-proves that restoring Shortcut DOM platform detection exceeds the lowered direct-DOM ratchet', () => {
    const clean = scanP5HostBypasses(ROOT);
    const restoredProbe = scanP5HostBypassSource(
      'packages/shortcut/src/restoredPlatformProbe.ts',
      `export function isMacOS() {
         return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '');
       }`,
    );
    const mutated = createP5HostBypassReport(clean.scannedFiles + 1, [
      ...clean.p5,
      ...clean.excluded,
      ...restoredProbe,
    ]);
    expect(restoredProbe).toHaveLength(1);
    expect(countP5HostBypasses(mutated)['direct-dom']).toBe(3);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('direct-dom: found 3, budget 2');
  }, 30_000);

  it('partitions transport constructors to P3 instead of admitting them to the P5 population', () => {
    const sites = scanP5HostBypassSource(
      'packages/socket/src/socket.ts',
      `export function connect() {
         const socket = new WebSocket('wss://example.test');
         const events = new EventSource('/events');
         const request = new Request('/request');
         return [socket, events, request];
       }`,
    );
    const report = createP5HostBypassReport(1, sites);
    expect(report.p5).toEqual([]);
    expect(report.excluded.map((site) => site.exclusion)).toEqual(['p3-transport', 'p3-transport', 'p3-transport']);
    expect(formatP5HostBypassReport(report)).toContain(
      'P3 PARTITION owner=builder3 primitives=fetch,XMLHttpRequest,Request,Image,WebSocket,EventSource',
    );
  });

  it('derives structural exclusions instead of naming current files', () => {
    const web = scanP5HostBypassSource(
      'packages/example/src/registerWebExample.ts',
      `export function registerWebExample() { return document.createElement('canvas'); }`,
    );
    const host = scanP5HostBypassSource(
      'packages/host-example/src/native.ts',
      `export function probe() { return navigator.gpu.requestAdapter(); }`,
    );
    const renderer = scanP5HostBypassSource(
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
    const direct = createP5HostBypassReport(
      1,
      scanP5HostBypassSource('packages/render-wgpu/src/wgpuHost.ts', directSource),
    );
    expect(countP5HostBypasses(direct)['webgpu-acquisition']).toBe(6);
    expect(direct.excluded).toEqual([]);

    const explicitWebSource = directSource
      .replace('function acquire', 'function acquireWebWgpuHost')
      .replace('function supported', 'function isWebWgpuSupported');
    const explicitWeb = createP5HostBypassReport(
      1,
      scanP5HostBypassSource('packages/render-wgpu/src/wgpuHost.ts', explicitWebSource),
    );
    expect(explicitWeb.p5).toEqual([]);
    expect(explicitWeb.excluded).toHaveLength(6);
    expect(explicitWeb.excluded.every((site) => site.exclusion === 'explicit-web-adapter')).toBe(true);

    const portableConsumer = createP5HostBypassReport(
      1,
      scanP5HostBypassSource(
        'packages/render-wgpu/src/wgpuRenderState.ts',
        `export function createWgpuRenderState(backend: WgpuHostBackend) { return backend.acquire(); }`,
      ),
    );
    expect(portableConsumer.p5).toEqual([]);
    expect(portableConsumer.excluded).toEqual([]);
  });
});

describe('createEmptyP5HostBypassReport', () => {
  // ★ Compared against the production path, never against a field list written here — a list would be a
  // second copy of the shape, which is the defect the factory exists to remove.
  it('supplies every field the real report producer does', () => {
    const produced = createP5HostBypassReport(0, []);
    expect(Object.keys(createEmptyP5HostBypassReport()).sort()).toEqual(Object.keys(produced).sort());
  });

  it('is empty rather than merely well-typed', () => {
    const empty = createEmptyP5HostBypassReport();
    expect(empty.scannedFiles).toBe(0);
    expect(empty.excluded).toEqual([]);
    expect(empty.p5).toEqual([]);
  });
});
