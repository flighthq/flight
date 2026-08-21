// @vitest-environment jsdom

import { createBitmap, createBitmapFingerprint, formatBitmapFingerprint } from '@flighthq/bitmap/contract';
import type { DomRenderState } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FunctionalTarget } from './functionalVerify';
import {
  publishFunctionalRenderSync,
  registerFunctionalTarget,
  registerWgpuFunctionalTarget,
  runRenderVerification,
  snapshotFunctionalRender,
} from './functionalVerify';

// The verifier communicates through window globals; clear them between cases so state doesn't leak.
interface VerificationWindowLike {
  __ftTarget?: unknown;
  __ftVerification?: unknown;
  __ftRenderImage?: unknown;
  __ftProvideDomRenderPixels?: (readback: { data: Uint8ClampedArray; height: number; width: number } | null) => void;
  __ftBenchmarkTarget?: { run(): void | Promise<void> };
  __ftCaptureTimeoutMs?: number;
  __ftRealRequestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

// Stands in for the browser having stopped delivering frames: callbacks are accepted and never invoked.
// The verifier reads the harness-stashed rAF, so replacing that one covers the path it actually takes.
function stubNeverFiringAnimationFrames(): void {
  (window as unknown as VerificationWindowLike).__ftRealRequestAnimationFrame = () => 0;
}

// Drives the frame wait to its deadline under fake timers and asserts the bound it actually used. The
// elapsed time is the assertion: advancing just short of the expected deadline must not settle it.
async function expectFrameWaitTimeout(expectedMs: number): Promise<void> {
  vi.useFakeTimers();
  try {
    const run = runRenderVerification({}, 'webgl');
    const rejected = expect(run).rejects.toThrow(
      new RegExp(`stalled in stage awaitingFrame: no animation frame within ${expectedMs}ms`),
    );
    let settled = false;
    void run.catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(expectedMs - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
  } finally {
    vi.useRealTimers();
  }
}

function verification(): Record<string, unknown> {
  return (window as unknown as VerificationWindowLike).__ftVerification as Record<string, unknown>;
}

function resetVerificationWindow(): void {
  const w = window as unknown as VerificationWindowLike;
  w.__ftTarget = undefined;
  w.__ftVerification = undefined;
  w.__ftRenderImage = undefined;
  w.__ftProvideDomRenderPixels = undefined;
  w.__ftBenchmarkTarget = undefined;
  w.__ftRealRequestAnimationFrame = undefined;
  w.__ftCaptureTimeoutMs = undefined;
}

beforeEach(resetVerificationWindow);
afterEach(resetVerificationWindow);

// A minimal DOM target — the only backend snapshot/verification handles without a real GPU context.
function domTarget(element: HTMLElement): FunctionalTarget {
  return {
    kind: 'dom',
    state: { element } as unknown as DomRenderState,
    width: 10,
    height: 10,
    scale: 1,
    render: () => {},
  };
}

function provideDomRenderPixels(data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])): void {
  const provide = (window as unknown as VerificationWindowLike).__ftProvideDomRenderPixels;
  expect(provide).toBeTypeOf('function');
  provide?.({ data, height: 1, width: 2 });
}

describe('publishFunctionalRenderSync', () => {
  it('returns false when no target is registered', () => {
    expect(publishFunctionalRenderSync('webgl')).toBe(false);
  });

  it('returns false for a non-webgl target and does not publish', () => {
    registerFunctionalTarget(domTarget(document.createElement('div')));
    expect(publishFunctionalRenderSync('webgl')).toBe(false);
    expect((window as unknown as VerificationWindowLike).__ftRenderImage).toBeUndefined();
  });
});

describe('registerFunctionalTarget', () => {
  it('records the target on window and returns it', () => {
    const target = domTarget(document.createElement('div'));
    const returned = registerFunctionalTarget(target);
    expect(returned).toBe(target);
    expect((window as unknown as VerificationWindowLike).__ftTarget).toBe(target);
  });

  it('automatically exposes the last rendered root as repeatable benchmark work', async () => {
    let renders = 0;
    const target = domTarget(document.createElement('div'));
    target.render = () => renders++;
    const registered = registerFunctionalTarget(target);
    registered.render({} as never);
    await (window as unknown as VerificationWindowLike).__ftBenchmarkTarget?.run();
    expect(renders).toBe(2);
  });
});

describe('registerWgpuFunctionalTarget', () => {
  // Enabling wgpu frame capture needs a real WgpuRenderState; end-to-end coverage is the functional
  // suite's job. Here we only assert the entry point is wired.
  it('is a callable registrar', () => {
    expect(typeof registerWgpuFunctionalTarget).toBe('function');
  });
});

describe('runRenderVerification', () => {
  it('throws on a blank DOM render (no elements or text)', async () => {
    registerFunctionalTarget(domTarget(document.createElement('div')));
    await expect(runRenderVerification({}, 'dom')).rejects.toThrow(/blank render/);
    expect(verification()).toMatchObject({ state: 'failed', error: expect.stringContaining('blank render') });
  });

  it('fails terminally when no DOM target was registered', async () => {
    await expect(runRenderVerification({}, 'dom')).rejects.toThrow(/no DOM target/);
    expect(verification()).toMatchObject({ state: 'failed' });
  });

  it('runs DOM pixels through coverage, the scene oracle, and fingerprinting', async () => {
    const host = document.createElement('div');
    host.appendChild(document.createElement('span'));
    registerFunctionalTarget(domTarget(host));
    const assertRender = vi.fn();
    const run = runRenderVerification({ assertRender }, 'dom');
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    provideDomRenderPixels(pixels);
    await run;

    const bitmap = createBitmap(2, 1);
    bitmap.data.set(pixels);
    const expectedFingerprint = formatBitmapFingerprint(createBitmapFingerprint(bitmap, 16));

    expect(assertRender).toHaveBeenCalledOnce();
    expect(verification()).toMatchObject({
      render: 'dom',
      state: 'passed',
      coverage: 0.5,
      fingerprint: expectedFingerprint,
      error: null,
    });
  });

  it('rejects nonempty DOM structure whose supplied pixels are blank', async () => {
    const host = document.createElement('div');
    host.appendChild(document.createElement('span'));
    registerFunctionalTarget(domTarget(host));
    const run = runRenderVerification({}, 'dom');
    provideDomRenderPixels(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]));

    await expect(run).rejects.toThrow(/coverage/);
    expect(verification()).toMatchObject({ state: 'failed', stage: 'measuring' });
  });

  it('does not wait for an animation frame on webgpu', async () => {
    // webgpu pixels are already in the retained capture buffer when the verifier runs, so it must not
    // depend on the browser scheduling a frame for a canvas it never presents. With rAF stubbed out
    // entirely, this reaches the readback and fails there — if it still waited, it would never return.
    stubNeverFiringAnimationFrames();

    await expect(runRenderVerification({}, 'webgpu')).rejects.toThrow(/no readable render bitmap/);
    expect(verification()).toMatchObject({ state: 'failed', stage: 'readingBack' });
  });

  it('fails by name when the animation frame never arrives, naming the stage it sat in', async () => {
    stubNeverFiringAnimationFrames();

    // No injected budget: the wait falls back to the runner's default ceiling and takes its share of it.
    await expectFrameWaitTimeout(12_000);

    // The failure is terminal and carries its location — the runner's outer wait would otherwise have
    // reported the bare `state: pending` this replaces.
    expect(verification()).toMatchObject({ state: 'failed', stage: 'awaitingFrame' });
  });

  it('scales its wait with the budget the runner injected', async () => {
    // The regression this prevents: the runner raised its budget for a contended machine and the page's
    // own bounds stayed pinned to the old ceiling, turning slow-but-working captures into hard failures.
    stubNeverFiringAnimationFrames();
    (window as unknown as VerificationWindowLike).__ftCaptureTimeoutMs = 45_000;

    await expectFrameWaitTimeout(12_000);
  });

  it('ignores an injected budget that is not a usable number', async () => {
    stubNeverFiringAnimationFrames();
    (window as unknown as VerificationWindowLike).__ftCaptureTimeoutMs = 0;

    await expectFrameWaitTimeout(12_000);
  });
});

describe('snapshotFunctionalRender', () => {
  it('returns null for a DOM target', async () => {
    registerFunctionalTarget(domTarget(document.createElement('div')));
    expect(await snapshotFunctionalRender()).toBeNull();
  });

  it('returns null when no target and no canvas is present', async () => {
    expect(await snapshotFunctionalRender()).toBeNull();
  });
});
