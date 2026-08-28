import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countP5HostBypasses,
  createEmptyP5HostBypassReport,
  createP5HostBypassReport,
  deriveP5InputIngressListenerOperations,
  formatP5HostBypassReport,
  P5_HOST_BYPASS_BUDGET,
  P5_HOST_BYPASS_BUDGET_HISTORY,
  P5_HOST_BYPASS_CLASSIFICATION_HISTORY,
  P5_HOST_BYPASS_DETECTOR_PROVENANCE,
  P5_HOST_BYPASS_SLICE_GUIDANCE,
  P5_HOST_BYPASS_V3_PROGRESS_HISTORY,
  p5HostBypassBudgetFailures,
  p5HostBypassBudgetHistoryFailures,
  p5HostBypassClassificationHistoryFailures,
  p5HostBypassDetectorProvenanceFailures,
  p5HostBypassSliceGuidanceFailures,
  p5InputIngressPairingFailures,
  p5HostBypassV3ProgressHistoryFailures,
  scanP5HostBypasses,
  scanP5HostBypassSource,
} from './p5-host-bypass';

const ROOT = resolve(import.meta.dirname, '..');

describe('P5 host-bypass derived gate', () => {
  it('derives the live population without a source-file roster and enforces the ratchet', () => {
    const report = scanP5HostBypasses(ROOT);
    const formatted = formatP5HostBypassReport(report);
    console.log(formatted);
    expect(p5HostBypassBudgetFailures(report, P5_HOST_BYPASS_BUDGET)).toEqual([]);
    expect(formatted).toContain(
      'P5 outstanding=28 direct-dom=12 input-ingress=0 frame-scheduling=0 scratch-surface=16 webgpu-acquisition=0',
    );
    expect(formatted).toContain(
      'v1 -> v2 total 30 -> 30 (0 census delta) recategorised=2 from-to=direct-dom->input-ingress=2 new=0 detected=none',
    );
    expect(formatted).toContain(
      'v2 -> v3 total 30 -> 33 (+3 classified) recategorised=0 from-to=none new=3 detected=frame-scheduling=3',
    );
    expect(formatted).toContain('28 (-5 fixed)');
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

  it('pins detector provenance against removal and false exhaustive wording', () => {
    expect(P5_HOST_BYPASS_DETECTOR_PROVENANCE).toEqual({
      detects:
        'hand-written floor (not an exhaustive ceiling): direct document/window/navigator access, input listener and gamepad sampling, frame scheduling, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
      zeroMeaning: 'category zero means none found by current detectors, not that no bypasses exist',
    });
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
    expect(countP5HostBypasses(mutated)['direct-dom']).toBe(15);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('direct-dom: found 15, budget 12');
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
    expect(countP5HostBypasses(mutated)['scratch-surface']).toBe(18);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain(
      'scratch-surface: found 18, budget 16',
    );
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
    expect(countP5HostBypasses(mutated)['direct-dom']).toBe(13);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('direct-dom: found 13, budget 12');
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
