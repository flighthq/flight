import { createAppWindow } from '@flighthq/app/contract';
import { allocateEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { Surface } from '@flighthq/surface/contract';

import type { HostGlCapability } from './types.ts';
import { attachWindowRenderContext, detachWindowRenderContext } from './windowRenderContext.ts';

describe('attachWindowRenderContext', () => {
  it('emits onRenderContextLost from host render-context ingress', () => {
    const hostGl = recordingHostGl();
    const win = createAppWindow();
    let called = false;
    connectSignal(win.onRenderContextLost, () => {
      called = true;
    });
    attachWindowRenderContext(hostGl, win, createSurface());
    hostGl.emitLost();
    expect(called).toBe(true);
  });

  it('emits onRenderContextRestored from host render-context ingress', () => {
    const hostGl = recordingHostGl();
    const win = createAppWindow();
    let called = false;
    connectSignal(win.onRenderContextRestored, () => {
      called = true;
    });
    attachWindowRenderContext(hostGl, win, createSurface());
    hostGl.emitRestored();
    expect(called).toBe(true);
  });

  it('releases the origin provider before attaching a replacement provider', () => {
    const origin = recordingHostGl();
    const replacement = recordingHostGl();
    const win = createAppWindow();
    const surface = createSurface();
    attachWindowRenderContext(origin, win, surface);
    attachWindowRenderContext(replacement, win, surface);
    detachWindowRenderContext(win);
    expect(origin.calls).toEqual(['subscribe', 'release']);
    expect(replacement.calls).toEqual(['subscribe', 'release']);
  });
});

describe('detachWindowRenderContext', () => {
  it('releases render-context ingress', () => {
    const hostGl = recordingHostGl();
    const win = createAppWindow();
    let called = false;
    connectSignal(win.onRenderContextLost, () => {
      called = true;
    });
    attachWindowRenderContext(hostGl, win, createSurface());
    detachWindowRenderContext(win);
    hostGl.emitLost();
    expect(called).toBe(false);
    expect(hostGl.calls).toEqual(['subscribe', 'release']);
  });
});

function createSurface(): Surface {
  return allocateEntity<Surface>();
}

type RecordingHostGl = HostGlCapability & { calls: string[]; emitLost(): void; emitRestored(): void };

function recordingHostGl(): RecordingHostGl {
  let onLost: (() => void) | null = null;
  let onRestored: (() => void) | null = null;
  const calls: string[] = [];
  const out = {} as RecordingHostGl;
  out.calls = calls;
  out.emitLost = () => onLost?.();
  out.emitRestored = () => onRestored?.();
  out.subscribe = (_surface: Readonly<Surface>, nextLost: () => void, nextRestored: () => void) => {
    calls.push('subscribe');
    onLost = nextLost;
    onRestored = nextRestored;
    return () => {
      calls.push('release');
      if (onLost === nextLost) onLost = null;
      if (onRestored === nextRestored) onRestored = null;
    };
  };
  return out;
}
