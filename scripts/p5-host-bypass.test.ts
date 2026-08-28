import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countP5HostBypasses,
  createP5HostBypassReport,
  formatP5HostBypassReport,
  P5_HOST_BYPASS_BUDGET,
  p5HostBypassBudgetFailures,
  scanP5HostBypasses,
  scanP5HostBypassSource,
} from './p5-host-bypass';

const ROOT = resolve(import.meta.dirname, '..');

describe('P5 host-bypass derived gate', () => {
  it('derives the live population without a source-file roster and enforces the ratchet', () => {
    const report = scanP5HostBypasses(ROOT);
    console.log(formatP5HostBypassReport(report));
    expect(p5HostBypassBudgetFailures(report, P5_HOST_BYPASS_BUDGET)).toEqual([]);
  }, 30_000);

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
});
