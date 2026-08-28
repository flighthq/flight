import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countP5HostBypasses,
  createP5HostBypassReport,
  deriveP5InputIngressListenerOperations,
  formatP5HostBypassReport,
  P5_HOST_BYPASS_BUDGET,
  P5_HOST_BYPASS_BUDGET_HISTORY,
  p5HostBypassBudgetFailures,
  p5HostBypassBudgetHistoryFailures,
  p5InputIngressPairingFailures,
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
      'P5 outstanding=31 direct-dom=15 input-ingress=0 scratch-surface=16 webgpu-acquisition=0',
    );
    expect(formatted).toContain('33 (-3 fixed)');
    expect(formatted).toContain('31 (-2 fixed)');
  }, 30_000);

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
    ]);
    expect(p5HostBypassBudgetHistoryFailures(P5_HOST_BYPASS_BUDGET_HISTORY)).toEqual([]);
  });

  it('mutation-proves that coherently raising the latest checkpoint cannot rewrite accepted history', () => {
    const latest = P5_HOST_BYPASS_BUDGET_HISTORY[P5_HOST_BYPASS_BUDGET_HISTORY.length - 1];
    const mutated = [
      ...P5_HOST_BYPASS_BUDGET_HISTORY.slice(0, -1),
      {
        ...latest,
        budget: { ...latest.budget, 'scratch-surface': latest.budget['scratch-surface'] + 1 },
        total: latest.total + 1,
      },
    ];
    expect(p5HostBypassBudgetHistoryFailures(mutated)).toContain(
      'P5 budget history[4] rewrites immutable accepted checkpoint total 31 (categories and reason are pinned)',
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
      'P5 budget history[5] total 32 is not below prior total 31',
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
    expect(countP5HostBypasses(mutated)['direct-dom']).toBe(18);
    expect(p5HostBypassBudgetFailures(mutated, P5_HOST_BYPASS_BUDGET)).toContain('direct-dom: found 18, budget 15');
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
