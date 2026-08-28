import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countP5HostBypasses,
  createP5HostBypassReport,
  deriveP5InputIngressListenerOperations,
  formatP5HostBypassReport,
  P5_HOST_BYPASS_BUDGET,
  p5HostBypassBudgetFailures,
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
      'P5 outstanding=36 direct-dom=18 input-ingress=0 scratch-surface=18 webgpu-acquisition=0',
    );
  }, 30_000);

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
