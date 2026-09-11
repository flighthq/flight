import type { StatusBarInfo, CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  capacitorHostStatusBarColor,
  capacitorHostStatusBarInfo,
  capacitorHostStatusBarOverlays,
  capacitorHostStatusBarStyle,
  capacitorHostStatusBarVisibility,
  capacitorHostUi,
} from './capacitorStatusBar';

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
  return {
    [EntityRuntimeKey]: undefined,
    color: 1,
    height: 1,
    overlaysContent: false,
    style: 'default',
    visible: false,
  };
}

describe('capacitorHostStatusBarColor', () => {
  it('constructs the color provider as an Entity', () => {
    expect(EntityRuntimeKey in capacitorHostStatusBarColor(fakeCapacitor().capacitor)).toBe(true);
  });
});

describe('capacitorHostStatusBarInfo', () => {
  it('constructs the info provider as an Entity', () => {
    expect(EntityRuntimeKey in capacitorHostStatusBarInfo(fakeCapacitor().capacitor)).toBe(true);
  });
});

describe('capacitorHostStatusBarOverlays', () => {
  it('constructs the overlays provider as an Entity', () => {
    expect(EntityRuntimeKey in capacitorHostStatusBarOverlays(fakeCapacitor().capacitor)).toBe(true);
  });
});

describe('capacitorHostStatusBarStyle', () => {
  it('constructs the style provider as an Entity', () => {
    expect(EntityRuntimeKey in capacitorHostStatusBarStyle(fakeCapacitor().capacitor)).toBe(true);
  });
});

describe('capacitorHostStatusBarVisibility', () => {
  it('constructs the visibility provider as an Entity', () => {
    expect(EntityRuntimeKey in capacitorHostStatusBarVisibility(fakeCapacitor().capacitor)).toBe(true);
  });
});

describe('capacitorHostUi', () => {
  it('publishes the exact status-bar slots over one shared Entity', () => {
    const ui = capacitorHostUi(fakeCapacitor().capacitor);
    expect(Object.keys(ui).sort()).toEqual([
      'statusBarColor',
      'statusBarInfo',
      'statusBarOverlays',
      'statusBarStyle',
      'statusBarVisibility',
    ]);
    expect(new Set(Object.values(ui))).toHaveLength(1);
    expect(EntityRuntimeKey in ui.statusBarInfo).toBe(true);
  });

  it('maps setters onto the Capacitor plugin', () => {
    const { capacitor, calls } = fakeCapacitor();
    const ui = capacitorHostUi(capacitor);
    ui.statusBarStyle.setStyle('light');
    ui.statusBarColor.setBackgroundColor(0x112233ff);
    ui.statusBarOverlays.setOverlaysContent(true);
    ui.statusBarVisibility.setVisible(false);
    expect(calls[0].arg).toEqual({ style: 'Light' });
    expect(calls[1].arg).toEqual({ color: '#112233' });
    expect(calls[2].arg).toEqual({ overlay: true });
    expect(calls[3].method).toBe('hide');
  });

  it('fills the info snapshot from the prefetch once it resolves', async () => {
    const backend = capacitorHostUi(fakeCapacitor().capacitor).statusBarInfo;
    await flush();
    const info = backend.getInfo(blankInfo());
    expect(info.visible).toBe(true);
    expect(info.style).toBe('dark');
    expect(info.color).toBe(0x112233ff);
    expect(info.overlaysContent).toBe(true);
    expect(info.height).toBe(-1);
  });
});
