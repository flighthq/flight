import type { StatusBarInfo } from '@flighthq/types';

import type { CapacitorApi } from './capacitorModule';
import { createCapacitorStatusBarBackend } from './capacitorStatusBar';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeCapacitor(info = { visible: true, style: 'Dark', color: '#112233', overlays: true }) {
  const calls: Array<{ method: string; arg?: unknown }> = [];
  const capacitor = {
    statusBar: {
      async getInfo() {
        return info;
      },
      async setStyle(arg: unknown) {
        calls.push({ method: 'setStyle', arg });
      },
      async setBackgroundColor(arg: unknown) {
        calls.push({ method: 'setBackgroundColor', arg });
      },
      async setOverlaysWebView(arg: unknown) {
        calls.push({ method: 'setOverlaysWebView', arg });
      },
      async show() {
        calls.push({ method: 'show' });
      },
      async hide() {
        calls.push({ method: 'hide' });
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, calls };
}

function blankInfo(): StatusBarInfo {
  return { color: 1, height: 1, overlaysContent: false, style: 'default', visible: false };
}

describe('createCapacitorStatusBarBackend', () => {
  it('maps setters onto the Capacitor plugin', () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorStatusBarBackend(capacitor);
    backend.setStyle('light');
    backend.setBackgroundColor(0x112233ff);
    backend.setOverlaysContent(true);
    backend.setVisible(false);
    expect(calls[0].arg).toEqual({ style: 'Light' });
    expect(calls[1].arg).toEqual({ color: '#112233' });
    expect(calls[2].arg).toEqual({ overlay: true });
    expect(calls[3].method).toBe('hide');
  });

  it('fills the info snapshot from the prefetch once it resolves', async () => {
    const backend = createCapacitorStatusBarBackend(fakeCapacitor().capacitor);
    await flush();
    const info = backend.getInfo(blankInfo());
    expect(info.visible).toBe(true);
    expect(info.style).toBe('dark');
    expect(info.color).toBe(0x112233ff);
    expect(info.overlaysContent).toBe(true);
    expect(info.height).toBe(-1);
  });
});
