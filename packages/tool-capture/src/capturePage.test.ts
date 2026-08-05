// @vitest-environment jsdom

import type { DomRenderState } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  failCaptureTargetVerification,
  installCaptureElementTarget,
  installCaptureTarget,
  registerCaptureBenchmarkTarget,
  verifyCaptureTarget,
} from './capturePage';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol';

function resetCapturePageWindow(): void {
  const flags = window as typeof window & {
    __flightCapture?: boolean;
    __flightCaptureVerify?: boolean;
    __ftTarget?: unknown;
    __ftVerification?: unknown;
    __ftBenchmarkTarget?: unknown;
  };
  flags.__flightCapture = undefined;
  flags.__flightCaptureVerify = undefined;
  flags.__ftTarget = undefined;
  flags.__ftVerification = undefined;
  flags.__ftBenchmarkTarget = undefined;
}

beforeEach(resetCapturePageWindow);
afterEach(resetCapturePageWindow);

describe('failCaptureTargetVerification', () => {
  it('publishes a terminal reason when setup fails before verification starts', () => {
    const result = failCaptureTargetVerification('canvas', new Error('unsupported backend capability'));

    expect(result).toMatchObject({
      protocolVersion: CAPTURE_PROTOCOL_VERSION,
      render: 'canvas',
      state: 'failed',
      stage: 'done',
      error: 'unsupported backend capability',
    });
    expect((window as typeof window & { __ftVerification?: unknown }).__ftVerification).toBe(result);
  });
});

describe('installCaptureElementTarget', () => {
  it('adapts a renderer-owned DOM element without requiring a Flight render state', async () => {
    const element = document.createElement('div');
    element.textContent = 'reference renderer';
    await expect(installCaptureElementTarget({ renderer: 'dom', element, verify: true })).resolves.toMatchObject({
      render: 'dom',
      state: 'passed',
    });
  });

  it('requires the existing context for WebGL targets', () => {
    const element = document.createElement('canvas');
    expect(() => installCaptureElementTarget({ renderer: 'webgl', element })).toThrow(/existing WebGL context/);
  });
});

describe('installCaptureTarget', () => {
  it('registers, draws, and completes the versioned handshake in one call', async () => {
    const element = document.createElement('div');
    const render = vi.fn(() => {
      element.textContent = 'ready';
    });
    const result = await installCaptureTarget({
      renderer: 'dom',
      state: { element } as unknown as DomRenderState,
      width: 800,
      height: 600,
      render,
      verify: true,
    });

    expect(render).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      protocolVersion: CAPTURE_PROTOCOL_VERSION,
      render: 'dom',
      state: 'passed',
      error: null,
    });
  });

  it('stays inert outside a capture browser unless verification is forced', async () => {
    const element = document.createElement('div');
    element.textContent = 'ready';
    const result = await installCaptureTarget({
      renderer: 'dom',
      state: { element } as unknown as DomRenderState,
      width: 1,
      height: 1,
    });
    expect(result).toBeNull();
  });
});

describe('registerCaptureBenchmarkTarget', () => {
  it('publishes custom repeatable work for the benchmark runner', () => {
    const target = { kind: 'wasm', run() {}, synchronize() {} };
    expect(registerCaptureBenchmarkTarget(target)).toBe(target);
    expect((window as unknown as { __ftBenchmarkTarget?: unknown }).__ftBenchmarkTarget).toBe(target);
  });
});

describe('verifyCaptureTarget', () => {
  it('completes a target registered by a shared project factory', async () => {
    const element = document.createElement('div');
    element.textContent = 'factory render';
    await installCaptureTarget({
      renderer: 'dom',
      state: { element } as unknown as DomRenderState,
      width: 1,
      height: 1,
    });
    await expect(verifyCaptureTarget({}, 'dom')).resolves.toMatchObject({ state: 'passed' });
  });
});
