// @vitest-environment jsdom

import type { DomRenderState } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installCaptureTarget, verifyCaptureTarget } from './capturePage';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol';

afterEach(() => {
  const flags = window as typeof window & { __ftTarget?: unknown; __ftVerification?: unknown };
  flags.__ftTarget = undefined;
  flags.__ftVerification = undefined;
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
