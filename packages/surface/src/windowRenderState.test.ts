import { createAppWindow } from '@flighthq/app/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { emitSignal } from '@flighthq/signals/contract';

import type { HostSurfaceResizeCapability, Surface } from './types.ts';
import { attachWindowRenderState, detachWindowRenderState } from './windowRenderState.ts';

describe('attachWindowRenderState', () => {
  it('sizes the surface from the window', () => {
    const resize = recordingResize();
    const win = createAppWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 2;
    attachWindowRenderState(resize, win, createSurface());
    expect(resize.calls).toEqual(['resize:1600,1200']);
  });

  it('keeps onResize core-owned while reapplying the backing size', () => {
    const resize = recordingResize();
    const win = createAppWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 1;
    attachWindowRenderState(resize, win, createSurface());
    win.width = 400;
    win.devicePixelRatio = 2;
    emitSignal(win.onResize, undefined);
    expect(resize.calls).toEqual(['resize:800,600', 'resize:800,1200']);
  });

  it('pins resize commands to the provider captured at attachment', () => {
    const origin = recordingResize();
    const win = createAppWindow();
    win.width = 320;
    win.height = 200;
    attachWindowRenderState(origin, win, createSurface());
    win.width = 640;
    emitSignal(win.onResize, undefined);
    expect(origin.calls).toEqual(['resize:320,200', 'resize:640,200']);
  });

  it('replaces a previous attachment on the same window', () => {
    const origin = recordingResize();
    const replacement = recordingResize();
    const win = createAppWindow();
    win.width = 10;
    win.height = 10;
    attachWindowRenderState(origin, win, createSurface());
    attachWindowRenderState(replacement, win, createSurface());
    win.width = 20;
    emitSignal(win.onResize, undefined);
    expect(origin.calls).toEqual(['resize:10,10']);
    expect(replacement.calls).toEqual(['resize:10,10', 'resize:20,10']);
  });
});

describe('detachWindowRenderState', () => {
  it('stops reacting to window resize', () => {
    const resize = recordingResize();
    const win = createAppWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 1;
    attachWindowRenderState(resize, win, createSurface());
    detachWindowRenderState(win);
    win.width = 400;
    emitSignal(win.onResize, undefined);
    expect(resize.calls).toEqual(['resize:800,600']);
  });
});

function createSurface(): Surface {
  return finishEntity(allocateEntity<Surface>());
}

function recordingResize(): HostSurfaceResizeCapability & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resize: (_surface: Readonly<Surface>, width: number, height: number) => {
      calls.push(`resize:${width},${height}`);
    },
  };
}
