import type { ScreenInfo, ElectronApi, ElectronDisplay } from '@flighthq/types';

import { createElectronScreenBackend } from './electronScreen';

function display(id: number, x: number): ElectronDisplay {
  return {
    id,
    bounds: { x, y: 0, width: 1920, height: 1080 },
    workArea: { x, y: 0, width: 1920, height: 1040 },
    scaleFactor: 2,
  };
}

function fakeElectron(): {
  electron: ElectronApi;
  listeners: Map<string, (() => void)[]>;
} {
  const listeners = new Map<string, (() => void)[]>();
  const primary = display(1, 0);
  const secondary = display(2, 1920);
  const electron = {
    screen: {
      getPrimaryDisplay: () => primary,
      getAllDisplays: () => [primary, secondary],
      on: (event: string, listener: () => void) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeListener: (event: string, listener: () => void) => {
        const list = listeners.get(event) ?? [];
        listeners.set(
          event,
          list.filter((l) => l !== listener),
        );
      },
    },
  } as unknown as ElectronApi;
  return { electron, listeners };
}

describe('createElectronScreenBackend', () => {
  it('fills the primary screen into out', () => {
    const { electron } = fakeElectron();
    const backend = createElectronScreenBackend(electron);
    const out = {} as ScreenInfo;
    const result = backend.getPrimaryScreen(out);
    expect(result).toBe(out);
    expect(out).toEqual({
      id: 1,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      workWidth: 1920,
      workHeight: 1040,
      scaleFactor: 2,
      isPrimary: true,
    });
  });

  it('enumerates all screens marking the primary', () => {
    const { electron } = fakeElectron();
    const backend = createElectronScreenBackend(electron);
    const out: ScreenInfo[] = [];
    backend.getScreens(out);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(1);
    expect(out[0].isPrimary).toBe(true);
    expect(out[1].id).toBe(2);
    expect(out[1].isPrimary).toBe(false);
    expect(out[1].x).toBe(1920);
  });

  it('subscribes to all change events and unsubscribes from all', () => {
    const fake = fakeElectron();
    const backend = createElectronScreenBackend(fake.electron);
    let count = 0;
    const off = backend.subscribe(() => {
      count++;
    });
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      for (const l of fake.listeners.get(event) ?? []) l();
    }
    expect(count).toBe(3);
    off();
    expect(fake.listeners.get('display-added')).toHaveLength(0);
    expect(fake.listeners.get('display-removed')).toHaveLength(0);
    expect(fake.listeners.get('display-metrics-changed')).toHaveLength(0);
  });
});
