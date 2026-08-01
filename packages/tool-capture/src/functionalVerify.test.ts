// @vitest-environment jsdom

import type { DomRenderState } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  __ftBenchmarkTarget?: { run(): void | Promise<void> };
  __ftRealRequestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

// Stands in for the browser having stopped delivering frames: callbacks are accepted and never invoked.
// The verifier reads the harness-stashed rAF, so replacing that one covers the path it actually takes.
function stubNeverFiringAnimationFrames(): void {
  (window as unknown as VerificationWindowLike).__ftRealRequestAnimationFrame = () => 0;
}

function verification(): Record<string, unknown> {
  return (window as unknown as VerificationWindowLike).__ftVerification as Record<string, unknown>;
}

afterEach(() => {
  const w = window as unknown as VerificationWindowLike;
  w.__ftTarget = undefined;
  w.__ftVerification = undefined;
  w.__ftRenderImage = undefined;
  w.__ftBenchmarkTarget = undefined;
  w.__ftRealRequestAnimationFrame = undefined;
});

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

  it('passes a DOM render that emitted content and records the verification', async () => {
    const host = document.createElement('div');
    host.appendChild(document.createElement('span'));
    registerFunctionalTarget(domTarget(host));
    await runRenderVerification({}, 'dom');
    expect(verification()).toMatchObject({ render: 'dom', state: 'passed', error: null });
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
    vi.useFakeTimers();
    try {
      const run = runRenderVerification({}, 'webgl');
      const rejected = expect(run).rejects.toThrow(/stalled in stage awaitingFrame: no animation frame within 4000ms/);
      await vi.advanceTimersByTimeAsync(4_000);
      await rejected;
    } finally {
      vi.useRealTimers();
    }

    // The failure is terminal and carries its location — the runner's outer wait would otherwise have
    // reported the bare `state: pending` this replaces.
    expect(verification()).toMatchObject({ state: 'failed', stage: 'awaitingFrame' });
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
