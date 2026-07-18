// @vitest-environment jsdom

import type { DomRenderState } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

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
}

afterEach(() => {
  const w = window as unknown as VerificationWindowLike;
  w.__ftTarget = undefined;
  w.__ftVerification = undefined;
  w.__ftRenderImage = undefined;
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
  });

  it('passes a DOM render that emitted content and records the verification', async () => {
    const host = document.createElement('div');
    host.appendChild(document.createElement('span'));
    registerFunctionalTarget(domTarget(host));
    await runRenderVerification({}, 'dom');
    expect((window as unknown as VerificationWindowLike).__ftVerification).toMatchObject({ render: 'dom' });
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
