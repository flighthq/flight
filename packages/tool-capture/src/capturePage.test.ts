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
    __ftProvideDomRenderPixels?: (readback: { data: Uint8ClampedArray; height: number; width: number } | null) => void;
  };
  flags.__flightCapture = undefined;
  flags.__flightCaptureVerify = undefined;
  flags.__ftTarget = undefined;
  flags.__ftVerification = undefined;
  flags.__ftBenchmarkTarget = undefined;
  flags.__ftProvideDomRenderPixels = undefined;
}

async function provideDomRenderPixels(): Promise<void> {
  const flags = window as unknown as {
    __ftProvideDomRenderPixels?: (readback: { data: Uint8ClampedArray; height: number; width: number } | null) => void;
  };
  await vi.waitFor(() => expect(flags.__ftProvideDomRenderPixels).toBeTypeOf('function'));
  flags.__ftProvideDomRenderPixels?.({
    data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    height: 1,
    width: 2,
  });
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
    const verification = installCaptureElementTarget({ renderer: 'dom', element, verify: true });
    await provideDomRenderPixels();
    await expect(verification).resolves.toMatchObject({
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
    const verification = installCaptureTarget({
      renderer: 'dom',
      state: { element } as unknown as DomRenderState,
      width: 800,
      height: 600,
      render,
      verify: true,
    });
    await provideDomRenderPixels();
    const result = await verification;

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
    const verification = verifyCaptureTarget({}, 'dom');
    await provideDomRenderPixels();
    await expect(verification).resolves.toMatchObject({ state: 'passed' });
  });
});
