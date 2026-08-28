import type {
  ScreenBackend,
  ScreenChangeEvent,
  ScreenInfo,
  ScreenMode,
  ScreenOperation,
  ScreenSignals,
} from '@flighthq/types/contract';

import {
  attachScreenSignals,
  createScreenInfo,
  createScreenMode,
  createScreenSignals,
  createWebScreenBackend,
  detachScreenSignals,
  dipToScreenPoint,
  dipToScreenRect,
  disposeScreenSignals,
  enableScreenSignals,
  explainScreenBackend,
  explainScreenOperation,
  getPrimaryScreen,
  getScreenBackend,
  getScreenBounds,
  getScreenById,
  getScreenContainingRect,
  getScreenCurrentMode,
  getScreenCursorPosition,
  getScreenCursorScreen,
  getScreenDetailPermission,
  getScreenModes,
  getScreenNearestPoint,
  getScreenNearestRect,
  getScreenWorkArea,
  getScreens,
  hasScreenOperation,
  installScreenHostBackend,
  observeScreenHostResult,
  onScreenChange,
  onScreenDetailPermissionChange,
  refreshScreens,
  requestScreenDetails,
  resetScreenBackendForTest,
  screenToDipPoint,
  screenToDipRect,
  setScreenBackend,
} from './screen';
function makeScreenInfo(overrides: Partial<ScreenInfo> = {}): ScreenInfo {
  return { ...createScreenInfo(), ...overrides };
}

function fakeBackend(screens: Partial<ScreenInfo>[]): ScreenBackend & {
  fire: (event?: Partial<ScreenChangeEvent>) => void;
} {
  let listener: ((event: Readonly<ScreenChangeEvent>) => void) | null = null;
  const infos: ScreenInfo[] = screens.map((s, i) => makeScreenInfo({ id: i, isPrimary: i === 0, ...s }));
  return {
    getScreens(out) {
      out.length = infos.length;
      for (let i = 0; i < infos.length; i += 1) {
        if (out[i] === undefined) out[i] = createScreenInfo();
        Object.assign(out[i], infos[i]);
      }
      return out;
    },
    getPrimaryScreen(out) {
      const primary = infos.find((s) => s.isPrimary) ?? infos[0];
      if (primary !== undefined) Object.assign(out, primary);
      return out;
    },
    subscribe(l) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    getCursorPosition(out) {
      out.x = 42;
      out.y = 84;
      return out;
    },
    fire(event?: Partial<ScreenChangeEvent>) {
      const defaultScreen = infos[0] ?? createScreenInfo();
      listener?.({
        kind: 'ScreenMetricsChanged',
        screen: defaultScreen,
        changedMetrics: { bounds: true, workArea: false, scaleFactor: false, orientation: false },
        ...event,
      });
    },
  };
}

afterEach(() => setScreenBackend(null));
describe('attachScreenSignals', () => {
  it('fans out ScreenAdded to onScreenAdded signal', () => {
    const backend = fakeBackend([{ width: 1920, height: 1080 }]);
    setScreenBackend(backend);
    const signals = createScreenSignals();
    const received: ScreenInfo[] = [];
    signals.onScreenAdded.emit = (s) => received.push(s);
    attachScreenSignals(signals);
    backend.fire({ kind: 'ScreenAdded', changedMetrics: null });
    expect(received).toHaveLength(1);
    detachScreenSignals(signals);
  });

  it('fans out ScreenRemoved to onScreenRemoved signal', () => {
    const backend = fakeBackend([{}]);
    setScreenBackend(backend);
    const signals = createScreenSignals();
    const removed: ScreenInfo[] = [];
    signals.onScreenRemoved.emit = (s) => removed.push(s);
    attachScreenSignals(signals);
    backend.fire({ kind: 'ScreenRemoved', changedMetrics: null });
    expect(removed).toHaveLength(1);
    detachScreenSignals(signals);
  });

  it('fans out ScreenMetricsChanged to onScreenMetricsChanged signal', () => {
    const backend = fakeBackend([{}]);
    setScreenBackend(backend);
    const signals = createScreenSignals();
    const events: ScreenChangeEvent[] = [];
    signals.onScreenMetricsChanged.emit = (e) => events.push(e);
    attachScreenSignals(signals);
    backend.fire();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('ScreenMetricsChanged');
    detachScreenSignals(signals);
  });

  it('is idempotent — tears down prior subscription before re-attaching', () => {
    const backend = fakeBackend([{}]);
    setScreenBackend(backend);
    const signals = createScreenSignals();
    let count = 0;
    signals.onScreenMetricsChanged.emit = () => count++;
    attachScreenSignals(signals);
    attachScreenSignals(signals); // second attach: should not double-fire
    backend.fire();
    expect(count).toBe(1);
    detachScreenSignals(signals);
  });
});
describe('createScreenInfo', () => {
  it('allocates with scaleFactor 1 and isPrimary false', () => {
    const info = createScreenInfo();
    expect(info.scaleFactor).toBe(1);
    expect(info.isPrimary).toBe(false);
    expect(info.width).toBe(0);
    expect(info.height).toBe(0);
  });

  it('defaults sentinel fields to -1 and empty/false', () => {
    const info = createScreenInfo();
    expect(info.rotation).toBe(-1);
    expect(info.refreshRate).toBe(-1);
    expect(info.colorDepth).toBe(-1);
    expect(info.pixelDepth).toBe(-1);
    expect(info.physicalWidth).toBe(-1);
    expect(info.physicalHeight).toBe(-1);
    expect(info.maxLuminance).toBe(-1);
    expect(info.depthPerComponent).toBe(-1);
    expect(info.dpi).toBe(-1);
    expect(info.label).toBe('');
    expect(info.colorSpace).toBe('srgb');
    expect(info.isHdr).toBe(false);
    expect(info.internal).toBe(false);
    expect(info.monochrome).toBe(false);
    expect(info.touchSupport).toBe('unknown');
    expect(info.orientation).toBe('Landscape');
  });
});
describe('createScreenMode', () => {
  it('allocates with sentinel fields', () => {
    const mode = createScreenMode();
    expect(mode.width).toBe(0);
    expect(mode.height).toBe(0);
    expect(mode.refreshRate).toBe(-1);
    expect(mode.colorDepth).toBe(-1);
    expect(mode.pixelFormat).toBe('');
  });
});
describe('createScreenSignals', () => {
  it('allocates inert signals', () => {
    const signals = createScreenSignals();
    expect(signals.onScreenAdded).toBeDefined();
    expect(signals.onScreenRemoved).toBeDefined();
    expect(signals.onScreenMetricsChanged).toBeDefined();
  });
});
describe('createWebScreenBackend', () => {
  it('returns a backend whose reads fill out without throwing', () => {
    const backend = createWebScreenBackend();
    const primary = createScreenInfo();
    expect(() => backend.getPrimaryScreen(primary)).not.toThrow();
    const screens: ScreenInfo[] = [];
    expect(() => backend.getScreens(screens)).not.toThrow();
    expect(Array.isArray(screens)).toBe(true);
  });

  it('returns an unsubscribe function from subscribe without throwing', () => {
    const backend = createWebScreenBackend();
    let unsubscribe: (() => void) | undefined;
    expect(() => {
      unsubscribe = backend.subscribe(() => {});
    }).not.toThrow();
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe?.()).not.toThrow();
  });

  it('getCursorPosition returns a numeric point', () => {
    const backend = createWebScreenBackend();
    const out = { x: 0, y: 0 };
    expect(() => backend.getCursorPosition(out)).not.toThrow();
    expect(typeof out.x).toBe('number');
    expect(typeof out.y).toBe('number');
  });

  it('getModes returns at least one entry', () => {
    const backend = createWebScreenBackend();
    const screen = createScreenInfo();
    const modes: ScreenMode[] = [];
    backend.getModes?.(screen, modes);
    expect(modes.length).toBeGreaterThanOrEqual(1);
  });

  it('upgrades to multi-monitor via _upgrade when Screen Details API is available', () => {
    const backend = createWebScreenBackend() as ReturnType<typeof createWebScreenBackend> & {
      _upgrade?: (d: unknown) => void;
    };
    // Simulate a ScreenDetails object with two monitors.
    const fakeDetails = {
      currentScreen: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        availLeft: 0,
        availTop: 0,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24,
        devicePixelRatio: 1,
        refreshRate: 144,
        isPrimary: true,
        isInternal: false,
        label: 'Main Display',
      },
      screens: [
        {
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          availLeft: 0,
          availTop: 0,
          availWidth: 1920,
          availHeight: 1040,
          colorDepth: 24,
          pixelDepth: 24,
          devicePixelRatio: 1,
          refreshRate: 144,
          isPrimary: true,
          isInternal: false,
          label: 'Main Display',
        },
        {
          left: 1920,
          top: 0,
          width: 2560,
          height: 1440,
          availLeft: 1920,
          availTop: 0,
          availWidth: 2560,
          availHeight: 1440,
          colorDepth: 30,
          pixelDepth: 30,
          devicePixelRatio: 2,
          refreshRate: 60,
          isPrimary: false,
          isInternal: false,
          label: 'External Monitor',
        },
      ],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    expect(typeof backend._upgrade).toBe('function');
    backend._upgrade!(fakeDetails);

    // getScreens now returns two monitors.
    const out: ScreenInfo[] = [];
    backend.getScreens(out);
    expect(out).toHaveLength(2);
    expect(out[0].width).toBe(1920);
    expect(out[0].refreshRate).toBe(144);
    expect(out[0].label).toBe('Main Display');
    expect(out[1].width).toBe(2560);
    expect(out[1].x).toBe(1920);
    expect(out[1].refreshRate).toBe(60);
    expect(out[1].label).toBe('External Monitor');
    expect(out[1].scaleFactor).toBe(2);
  });

  it('getPrimaryScreen returns the isPrimary screen after Screen Details upgrade', () => {
    const backend = createWebScreenBackend() as ReturnType<typeof createWebScreenBackend> & {
      _upgrade?: (d: unknown) => void;
    };
    const fakeDetails = {
      currentScreen: {
        left: 1920,
        top: 0,
        width: 2560,
        height: 1440,
        availLeft: 1920,
        availTop: 0,
        availWidth: 2560,
        availHeight: 1440,
        colorDepth: 30,
        pixelDepth: 30,
        devicePixelRatio: 2,
        refreshRate: 60,
        isPrimary: false,
        isInternal: false,
        label: 'External',
      },
      screens: [
        {
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          availLeft: 0,
          availTop: 0,
          availWidth: 1920,
          availHeight: 1040,
          colorDepth: 24,
          pixelDepth: 24,
          devicePixelRatio: 1,
          refreshRate: 120,
          isPrimary: true,
          isInternal: true,
          label: 'Built-in',
        },
        {
          left: 1920,
          top: 0,
          width: 2560,
          height: 1440,
          availLeft: 1920,
          availTop: 0,
          availWidth: 2560,
          availHeight: 1440,
          colorDepth: 30,
          pixelDepth: 30,
          devicePixelRatio: 2,
          refreshRate: 60,
          isPrimary: false,
          isInternal: false,
          label: 'External',
        },
      ],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    backend._upgrade!(fakeDetails);
    const out = createScreenInfo();
    backend.getPrimaryScreen(out);
    expect(out.isPrimary).toBe(true);
    expect(out.width).toBe(1920);
    expect(out.label).toBe('Built-in');
    expect(out.internal).toBe(true);
    expect(out.refreshRate).toBe(120);
  });
});
describe('detachScreenSignals', () => {
  it('stops delivery after detach', () => {
    const backend = fakeBackend([{}]);
    setScreenBackend(backend);
    const signals = createScreenSignals();
    let count = 0;
    signals.onScreenMetricsChanged.emit = () => count++;
    attachScreenSignals(signals);
    backend.fire();
    detachScreenSignals(signals);
    backend.fire();
    expect(count).toBe(1);
  });

  it('is safe to call when not attached', () => {
    const signals = createScreenSignals();
    expect(() => detachScreenSignals(signals)).not.toThrow();
  });
});
describe('dipToScreenPoint', () => {
  it('converts DIP to physical pixels', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 2 });
    const out = { x: 0, y: 0 };
    dipToScreenPoint(screen, { x: 10, y: 20 }, out);
    expect(out.x).toBe(20);
    expect(out.y).toBe(40);
  });

  it('accounts for screen origin offset', () => {
    const screen = makeScreenInfo({ x: 100, y: 50, scaleFactor: 2 });
    const out = { x: 0, y: 0 };
    dipToScreenPoint(screen, { x: 110, y: 60 }, out);
    expect(out.x).toBe(20);
    expect(out.y).toBe(20);
  });

  it('is alias-safe when out is the same object as point', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 3 });
    const point = { x: 5, y: 10 };
    dipToScreenPoint(screen, point, point);
    expect(point.x).toBe(15);
    expect(point.y).toBe(30);
  });
});
describe('dipToScreenRect', () => {
  it('scales and offsets the rect', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 2 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    dipToScreenRect(screen, { x: 10, y: 20, width: 50, height: 100 }, out);
    expect(out.x).toBe(20);
    expect(out.y).toBe(40);
    expect(out.width).toBe(100);
    expect(out.height).toBe(200);
  });

  it('is alias-safe when out is the same object as rect', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 2 });
    const rect = { x: 5, y: 10, width: 20, height: 30 };
    dipToScreenRect(screen, rect, rect);
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    expect(rect.width).toBe(40);
    expect(rect.height).toBe(60);
  });
});
describe('disposeScreenSignals', () => {
  it('stops delivery and is safe to call multiple times', () => {
    const backend = fakeBackend([{}]);
    setScreenBackend(backend);
    const signals = createScreenSignals();
    attachScreenSignals(signals);
    expect(() => disposeScreenSignals(signals)).not.toThrow();
    expect(() => disposeScreenSignals(signals)).not.toThrow();
  });
});
describe('enableScreenSignals', () => {
  it('returns a ScreenSignals group with inert signals', () => {
    const signals = enableScreenSignals();
    expect(signals.onScreenAdded).toBeDefined();
    expect(signals.onScreenMetricsChanged).toBeDefined();
    expect(signals.onScreenRemoved).toBeDefined();
  });
});
describe('explainScreenBackend', () => {
  afterEach(() => resetScreenBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetScreenBackendForTest();
    const explanation = explainScreenBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setScreenBackend(fakeBackend([]));
    expect(explainScreenBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installScreenHostBackend(fakeBackend([]));
    expect(explainScreenBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installScreenHostBackend(fakeBackend([]));
    installScreenHostBackend(fakeBackend([]));
    expect(explainScreenBackend().conflict).toBe(true);
  });
});
describe('explainScreenOperation', () => {
  afterEach(() => {
    resetScreenBackendForTest();
  });

  // ★ With nothing installed, the sentinel still answers every call,
  // so a query resolving through the getter would report every operation implemented. It must not.
  it('reports sentinel and no implementation when nothing is installed', () => {
    resetScreenBackendForTest();
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(explainScreenOperation(operation)).toEqual({ implemented: false, layer: 'sentinel', operation });
    }
  });

  // ★ THE ARM THAT ACTUALLY CATCHES A SENTINEL COUNTED AS SUPPORT. Optional operations are not enough:
  // the sentinel does not implement those either, so a query resolving through getScreenBackend() would
  // agree by accident. A REQUIRED operation is the one the sentinel does answer, so this is where a
  // getter-based implementation reports a lie.
  it('reports a required operation as unimplemented when only the sentinel serves it', () => {
    resetScreenBackendForTest();
    expect(explainScreenOperation('getScreens')).toEqual({
      implemented: false,
      layer: 'sentinel',
      operation: 'getScreens',
    });
  });

  it('reports a custom backend as implementing only what it provides', () => {
    setScreenBackend(partialBackend());
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(hasScreenOperation(operation)).toBe(false);
    }
    expect(explainScreenOperation(OPTIONAL_OPERATIONS[0]).layer).toBe('sentinel');
  });

  it('reports an operation the backend does provide', () => {
    const operation = OPTIONAL_OPERATIONS[0];
    setScreenBackend({ ...partialBackend(), [operation]: () => undefined } as ScreenBackend);
    expect(explainScreenOperation(operation)).toEqual({ implemented: true, layer: 'custom', operation });
  });

  it('falls through to the host for an operation the custom backend omits', () => {
    const operation = OPTIONAL_OPERATIONS[0];
    installScreenHostBackend({ ...partialBackend(), [operation]: () => undefined } as ScreenBackend);
    setScreenBackend(partialBackend());
    expect(explainScreenOperation(operation)).toEqual({ implemented: true, layer: 'host', operation });
  });
});
describe('getPrimaryScreen', () => {
  it('fills and returns the passed out object', () => {
    setScreenBackend(fakeBackend([{ width: 1920, isPrimary: true }]));
    const out = createScreenInfo();
    const result = getPrimaryScreen(out);
    expect(result).toBe(out);
    expect(out.isPrimary).toBe(true);
  });
});
describe('getScreenBackend', () => {
  it('falls back to a web backend', () => {
    expect(getScreenBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend([{}]);
    setScreenBackend(backend);
    expect(getScreenBackend()).toBe(backend);
  });
});
describe('getScreenBounds', () => {
  it('fills out with screen x/y/width/height', () => {
    const screen = makeScreenInfo({ x: 10, y: 20, width: 1920, height: 1080 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const result = getScreenBounds(screen, out);
    expect(result).toBe(out);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(1920);
    expect(out.height).toBe(1080);
  });
});
describe('getScreenById', () => {
  it('returns the screen with matching id', () => {
    setScreenBackend(fakeBackend([{ width: 1920 }, { width: 2560 }]));
    const out = createScreenInfo();
    const result = getScreenById(1, out);
    expect(result).toBe(out);
    expect(out.width).toBe(2560);
  });

  it('returns null when id not found', () => {
    setScreenBackend(fakeBackend([{ width: 1920 }]));
    const out = createScreenInfo();
    expect(getScreenById(99, out)).toBeNull();
  });
});
describe('getScreenContainingRect', () => {
  it('returns the screen with the most overlap', () => {
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1920, height: 1080, isPrimary: true },
        { id: 1, x: 1920, y: 0, width: 1920, height: 1080, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    // Rect spans from x=1900 to x=2100: 20px on screen 0, 180px on screen 1 → screen 1 wins.
    getScreenContainingRect({ x: 1900, y: 0, width: 200, height: 100 }, out);
    expect(out.id).toBe(1);
  });

  it('falls back to nearest by center when no overlap', () => {
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1920, height: 1080, isPrimary: true },
        { id: 1, x: 1920, y: 0, width: 1920, height: 1080, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    // Rect is far to the right — nearest center is screen 1
    getScreenContainingRect({ x: 5000, y: 0, width: 10, height: 10 }, out);
    expect(out.id).toBe(1);
  });
});
describe('getScreenCurrentMode', () => {
  it('derives a mode from the screen fields', () => {
    const screen = makeScreenInfo({ width: 2560, height: 1440, refreshRate: 144, colorDepth: 32 });
    const out = createScreenMode();
    const result = getScreenCurrentMode(screen, out);
    expect(result).toBe(out);
    expect(out.width).toBe(2560);
    expect(out.height).toBe(1440);
    expect(out.refreshRate).toBe(144);
    expect(out.colorDepth).toBe(32);
  });
});
describe('getScreenCursorPosition', () => {
  it('returns a point using the backend getCursorPosition', () => {
    setScreenBackend(fakeBackend([{}]));
    const out = { x: 0, y: 0 };
    const result = getScreenCursorPosition(out);
    expect(result).toBe(out);
    expect(out.x).toBe(42);
    expect(out.y).toBe(84);
  });

  it('returns (0,0) sentinel from the web backend before first pointermove', () => {
    const backend = createWebScreenBackend();
    const out = { x: 99, y: 99 };
    backend.getCursorPosition(out);
    // Web backend returns 0,0 sentinel until a pointermove occurs in a real browser.
    expect(typeof out.x).toBe('number');
    expect(typeof out.y).toBe('number');
  });
});
describe('getScreenCursorScreen', () => {
  it('returns the screen nearest to the cursor position', () => {
    const backend = fakeBackend([
      { id: 0, x: 0, y: 0, width: 1920, height: 1080, isPrimary: true },
      { id: 1, x: 1920, y: 0, width: 1920, height: 1080, isPrimary: false },
    ]);
    // Override getCursorPosition to point to screen 1.
    backend.getCursorPosition = (out) => {
      out.x = 2000;
      out.y = 500;
      return out;
    };
    setScreenBackend(backend);
    const out = createScreenInfo();
    getScreenCursorScreen(out);
    expect(out.id).toBe(1);
  });
});
describe('getScreenDetailPermission', () => {
  it('returns a valid permission state string without throwing', async () => {
    const state = await getScreenDetailPermission();
    expect(['granted', 'denied', 'prompt']).toContain(state);
  });

  it('returns prompt when the Permissions API is unavailable (jsdom)', async () => {
    // jsdom does not implement navigator.permissions.query for window-management.
    const state = await getScreenDetailPermission();
    expect(state).toBe('prompt');
  });
});

describe('getScreenModes', () => {
  it('calls getModes on the backend when available', () => {
    const modes: ScreenMode[] = [{ width: 1920, height: 1080, refreshRate: 60, colorDepth: 32, pixelFormat: '' }];
    const backend = fakeBackend([{}]);
    backend.getModes = (_s, out) => {
      out.length = 1;
      out[0] = modes[0];
      return out;
    };
    setScreenBackend(backend);
    const screen = createScreenInfo();
    const out: ScreenMode[] = [];
    getScreenModes(screen, out);
    expect(out).toHaveLength(1);
    expect(out[0].width).toBe(1920);
  });

  it('falls back to a synthetic single mode when getModes is absent', () => {
    const backend = fakeBackend([{ width: 3840, height: 2160 }]);
    delete (backend as Partial<ScreenBackend>).getModes;
    setScreenBackend(backend);
    const screen = makeScreenInfo({ width: 3840, height: 2160 });
    const out: ScreenMode[] = [];
    getScreenModes(screen, out);
    expect(out).toHaveLength(1);
    expect(out[0].width).toBe(3840);
  });
});
describe('getScreenNearestPoint', () => {
  it('returns the screen that contains the point', () => {
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1920, height: 1080, isPrimary: true },
        { id: 1, x: 1920, y: 0, width: 1920, height: 1080, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    getScreenNearestPoint({ x: 2000, y: 100 }, out);
    expect(out.id).toBe(1);
  });

  it('returns the nearest screen when point is outside all screens', () => {
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1920, height: 1080, isPrimary: true },
        { id: 1, x: 1920, y: 0, width: 1920, height: 1080, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    // Point far to the right — nearest is screen 1
    getScreenNearestPoint({ x: 9999, y: 540 }, out);
    expect(out.id).toBe(1);
  });
});
describe('getScreenNearestRect', () => {
  it('returns the screen that fully contains the rectangle', () => {
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1920, height: 1080, isPrimary: true },
        { id: 1, x: 1920, y: 0, width: 1920, height: 1080, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    const result = getScreenNearestRect({ x: 2000, y: 100, width: 200, height: 100 }, out);
    expect(result).toBe(out);
    expect(out.id).toBe(1);
  });

  it('prefers the containing screen even when a neighbor center is closer', () => {
    // Rect sits wholly on the wide screen 1 near its left edge; screen 0's center (500) is nearer
    // the rect center (1060) than screen 1's center (3000), yet containment must still win.
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1000, height: 1000, isPrimary: true },
        { id: 1, x: 1000, y: 0, width: 4000, height: 1000, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    getScreenNearestRect({ x: 1010, y: 0, width: 100, height: 100 }, out);
    expect(out.id).toBe(1);
  });

  it('falls back to the screen nearest by center when no screen contains the rectangle', () => {
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1920, height: 1080, isPrimary: true },
        { id: 1, x: 1920, y: 0, width: 1920, height: 1080, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    // Rect is far to the right, contained by neither screen — nearest center is screen 1.
    getScreenNearestRect({ x: 5000, y: 0, width: 10, height: 10 }, out);
    expect(out.id).toBe(1);
  });

  it('picks by center distance where getScreenContainingRect picks by overlap area', () => {
    // A rect straddling both screens, contained by neither: screen 1 has the larger overlap (300px
    // vs 100px), but the rect center (1100) is nearer screen 0's center (500) than screen 1's (3000).
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1000, height: 1000, isPrimary: true },
        { id: 1, x: 1000, y: 0, width: 4000, height: 1000, isPrimary: false },
      ]),
    );
    const rect = { x: 900, y: 0, width: 400, height: 100 };
    const nearest = createScreenInfo();
    const containing = createScreenInfo();
    getScreenNearestRect(rect, nearest);
    getScreenContainingRect(rect, containing);
    expect(nearest.id).toBe(0);
    expect(containing.id).toBe(1);
  });

  it('resolves a center-distance tie to the first such screen', () => {
    // Two equally-sized screens; a rect centered on their shared seam is equidistant from both
    // centers, so the first screen in order wins.
    setScreenBackend(
      fakeBackend([
        { id: 0, x: 0, y: 0, width: 1000, height: 1000, isPrimary: true },
        { id: 1, x: 1000, y: 0, width: 1000, height: 1000, isPrimary: false },
      ]),
    );
    const out = createScreenInfo();
    getScreenNearestRect({ x: 900, y: 400, width: 200, height: 200 }, out);
    expect(out.id).toBe(0);
  });
});
describe('getScreens', () => {
  it('fills the out array to the screen count and returns it', () => {
    setScreenBackend(fakeBackend([{ width: 1920 }, { width: 2560 }, { width: 3840 }]));
    const out: ScreenInfo[] = [];
    const result = getScreens(out);
    expect(result).toBe(out);
    expect(out.length).toBe(3);
    expect(out[0].isPrimary).toBe(true);
  });
});
describe('getScreenWorkArea', () => {
  it('fills out with screen x/y/workWidth/workHeight', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, workWidth: 1920, workHeight: 1040 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const result = getScreenWorkArea(screen, out);
    expect(result).toBe(out);
    expect(out.width).toBe(1920);
    expect(out.height).toBe(1040);
  });
});
describe('hasScreenOperation', () => {
  afterEach(() => {
    resetScreenBackendForTest();
  });

  it('agrees with explainScreenOperation for every optional operation', () => {
    setScreenBackend(partialBackend());
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(hasScreenOperation(operation)).toBe(explainScreenOperation(operation).implemented);
    }
  });
});
describe('installScreenHostBackend', () => {
  afterEach(() => resetScreenBackendForTest());

  it('installs a host backend that getScreenBackend returns', () => {
    const backend = fakeBackend([]);
    installScreenHostBackend(backend);
    expect(getScreenBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend([]);
    const second = fakeBackend([]);
    installScreenHostBackend(first);
    installScreenHostBackend(second);
    expect(getScreenBackend()).toBe(first);
    expect(explainScreenBackend().conflict).toBe(true);
  });
});
describe('observeScreenHostResult', () => {
  afterEach(() => resetScreenBackendForTest());

  it('records a successful observation', () => {
    installScreenHostBackend(fakeBackend([]));
    observeScreenHostResult('getScreens', true);
    const explanation = explainScreenBackend();
    expect(explanation.operation).toBe('getScreens');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installScreenHostBackend(fakeBackend([]));
    observeScreenHostResult('getScreens', false);
    expect(explainScreenBackend().viability).toBe('runtime-api-unavailable');
  });
});
describe('onScreenChange', () => {
  it('delivers change events to the listener and unsubscribes', () => {
    const backend = fakeBackend([{}]);
    setScreenBackend(backend);
    const events: ScreenChangeEvent[] = [];
    const unsubscribe = onScreenChange((e) => events.push(e));
    backend.fire();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('ScreenMetricsChanged');
    unsubscribe();
    backend.fire();
    expect(events).toHaveLength(1);
  });
});
describe('onScreenDetailPermissionChange', () => {
  it('returns a no-op unsubscribe when the Permissions API is unavailable', () => {
    const hadPermissions = 'permissions' in navigator;
    const original = (navigator as { permissions?: unknown }).permissions;
    delete (navigator as { permissions?: unknown }).permissions;
    try {
      const unsubscribe = onScreenDetailPermissionChange(() => {});
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
    } finally {
      if (hadPermissions) (navigator as { permissions?: unknown }).permissions = original;
    }
  });

  it('delivers the new state when the permission status fires a change', async () => {
    const listeners: Array<() => void> = [];
    const status = {
      state: 'prompt' as 'denied' | 'granted' | 'prompt',
      addEventListener: (_type: 'change', l: () => void) => listeners.push(l),
      removeEventListener: (_type: 'change', l: () => void) => {
        const i = listeners.indexOf(l);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    const original = (navigator as { permissions?: unknown }).permissions;
    (navigator as { permissions?: unknown }).permissions = {
      query: () => Promise.resolve(status),
    };
    try {
      // ★ CONSTRUCTED AFTER THE STUB, deliberately. The web adapter declares these two operations by
      // PRESENCE — it spreads them in only when `navigator.permissions` exists, which is the
      // absence-of-an-export ruling applied to a capability the platform may not have. So the backend
      // must be built once the stub is installed; building it first would correctly omit them.
      setScreenBackend(createWebScreenBackend());
      const states: string[] = [];
      const unsubscribe = onScreenDetailPermissionChange((s) => states.push(s));
      // Let the query promise resolve so the change listener is registered.
      await Promise.resolve();
      await Promise.resolve();
      status.state = 'granted';
      for (const l of listeners) l();
      expect(states).toEqual(['granted']);
      unsubscribe();
      expect(listeners).toHaveLength(0);
    } finally {
      if (original === undefined) delete (navigator as { permissions?: unknown }).permissions;
      else (navigator as { permissions?: unknown }).permissions = original;
    }
  });
});
describe('refreshScreens', () => {
  it('is callable without throwing', () => {
    expect(() => refreshScreens()).not.toThrow();
  });
});

describe('requestScreenDetails', () => {
  it('returns false in jsdom where getScreenDetails is unavailable', async () => {
    const result = await requestScreenDetails();
    expect(result).toBe(false);
  });

  it('returns true and upgrades the web backend when getScreenDetails resolves', async () => {
    // Install a fresh web backend so requestScreenDetails can upgrade it.
    const webBackend = createWebScreenBackend();
    setScreenBackend(webBackend);

    const fakeDetails = {
      currentScreen: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        availLeft: 0,
        availTop: 0,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24,
        devicePixelRatio: 1,
        refreshRate: 60,
        isPrimary: true,
        isInternal: false,
        label: 'Monitor A',
      },
      screens: [
        {
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          availLeft: 0,
          availTop: 0,
          availWidth: 1920,
          availHeight: 1040,
          colorDepth: 24,
          pixelDepth: 24,
          devicePixelRatio: 1,
          refreshRate: 60,
          isPrimary: true,
          isInternal: false,
          label: 'Monitor A',
        },
        {
          left: 1920,
          top: 0,
          width: 1280,
          height: 1024,
          availLeft: 1920,
          availTop: 0,
          availWidth: 1280,
          availHeight: 1024,
          colorDepth: 24,
          pixelDepth: 24,
          devicePixelRatio: 1,
          refreshRate: 75,
          isPrimary: false,
          isInternal: false,
          label: 'Monitor B',
        },
      ],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Temporarily inject getScreenDetails onto window.
    const win = window as Window & { getScreenDetails?: () => Promise<unknown> };
    win.getScreenDetails = () => Promise.resolve(fakeDetails);
    try {
      const result = await requestScreenDetails();
      expect(result).toBe(true);
      // After upgrade, getScreens returns two monitors.
      const out: ScreenInfo[] = [];
      getScreens(out);
      expect(out).toHaveLength(2);
      expect(out[0].label).toBe('Monitor A');
      expect(out[1].label).toBe('Monitor B');
      expect(out[1].refreshRate).toBe(75);
    } finally {
      delete win.getScreenDetails;
    }
  });

  it('returns false when getScreenDetails rejects', async () => {
    const win = window as Window & { getScreenDetails?: () => Promise<unknown> };
    win.getScreenDetails = () => Promise.reject(new Error('Permission denied'));
    try {
      const result = await requestScreenDetails();
      expect(result).toBe(false);
    } finally {
      delete win.getScreenDetails;
    }
  });
});

describe('resetScreenBackendForTest', () => {
  it('clears all backend slots', () => {
    setScreenBackend(fakeBackend([]));
    installScreenHostBackend(fakeBackend([]));
    observeScreenHostResult('getScreens', true);
    resetScreenBackendForTest();
    expect(explainScreenBackend().layer).toBe('host-not-enabled');
    expect(explainScreenBackend().conflict).toBe(false);
    expect(explainScreenBackend().viability).toBe('unobserved');
  });
});

// ★ THE SEAM COVERS BOTH CONSUMERS. Each operation is optional, so a host that cannot answer omits it
// and the caller falls back to exactly what the old inline `typeof navigator === 'undefined'` guard
// produced — `'prompt'` for the query, a no-op unsubscribe for the subscription. These pin that
// equivalence, and that a backend which throws is normalised rather than propagated.
describe('screen window-management permission seam', () => {
  function backendWithout(): ScreenBackend {
    return createWebScreenBackend();
  }

  it('falls back to prompt when the backend omits the query operation', async () => {
    const backend = backendWithout();
    delete (backend as { queryWindowManagementPermission?: unknown }).queryWindowManagementPermission;
    setScreenBackend(backend);
    expect(await getScreenDetailPermission()).toBe('prompt');
  });

  it('returns the state the backend reports', async () => {
    setScreenBackend({
      ...backendWithout(),
      queryWindowManagementPermission: () => Promise.resolve('granted' as const),
    });
    expect(await getScreenDetailPermission()).toBe('granted');
  });

  // A rejected provider promise must read as "not yet asked", never as an escaping rejection.
  it('normalises a rejecting query to prompt', async () => {
    setScreenBackend({
      ...backendWithout(),
      queryWindowManagementPermission: () => Promise.reject(new Error('permission service unavailable')),
    });
    expect(await getScreenDetailPermission()).toBe('prompt');
  });

  it('returns a no-op unsubscribe when the backend omits the subscribe operation', () => {
    const backend = backendWithout();
    delete (backend as { subscribeWindowManagementPermission?: unknown }).subscribeWindowManagementPermission;
    setScreenBackend(backend);
    const unsubscribe = onScreenDetailPermissionChange(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('delegates the subscription to the backend and returns its unsubscribe', () => {
    let received: string | null = null;
    let unsubscribed = false;
    setScreenBackend({
      ...backendWithout(),
      subscribeWindowManagementPermission: (listener) => {
        listener('denied');
        return () => {
          unsubscribed = true;
        };
      },
    });
    const unsubscribe = onScreenDetailPermissionChange((state) => {
      received = state;
    });
    expect(received).toBe('denied');
    unsubscribe();
    expect(unsubscribed).toBe(true);
  });

  // A throwing subscribe must not take the caller down; it degrades to the omitted-operation answer.
  it('normalises a throwing subscribe to a no-op unsubscribe', () => {
    setScreenBackend({
      ...backendWithout(),
      subscribeWindowManagementPermission: () => {
        throw new Error('subscription refused');
      },
    });
    expect(() => onScreenDetailPermissionChange(() => {})()).not.toThrow();
  });
});

describe('screenToDipPoint', () => {
  it('converts physical pixels to DIP', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 2 });
    const out = { x: 0, y: 0 };
    screenToDipPoint(screen, { x: 20, y: 40 }, out);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
  });

  it('accounts for screen origin offset', () => {
    const screen = makeScreenInfo({ x: 100, y: 50, scaleFactor: 2 });
    const out = { x: 0, y: 0 };
    screenToDipPoint(screen, { x: 20, y: 20 }, out);
    expect(out.x).toBe(110);
    expect(out.y).toBe(60);
  });

  it('is alias-safe when out is the same object as point', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 4 });
    const point = { x: 16, y: 32 };
    screenToDipPoint(screen, point, point);
    expect(point.x).toBe(4);
    expect(point.y).toBe(8);
  });

  it('is the inverse of dipToScreenPoint', () => {
    const screen = makeScreenInfo({ x: 200, y: 100, scaleFactor: 2 });
    const original = { x: 250, y: 150 };
    const physical = { x: 0, y: 0 };
    dipToScreenPoint(screen, original, physical);
    const recovered = { x: 0, y: 0 };
    screenToDipPoint(screen, physical, recovered);
    expect(recovered.x).toBeCloseTo(original.x);
    expect(recovered.y).toBeCloseTo(original.y);
  });
});

// Per-operation availability for ScreenBackend. The operations below are the ones the interface declares
// OPTIONAL, so a host that omits them is compliant rather than broken — that is the absence-of-an-export
// ruling, and this is the query that makes it observable.
const OPTIONAL_OPERATIONS: readonly ScreenOperation[] = ['getModes'];

describe('screenToDipRect', () => {
  it('scales the rect back to DIP', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 2 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    screenToDipRect(screen, { x: 20, y: 40, width: 100, height: 200 }, out);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(50);
    expect(out.height).toBe(100);
  });

  it('is alias-safe when out is the same object as rect', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 2 });
    const rect = { x: 10, y: 20, width: 40, height: 60 };
    screenToDipRect(screen, rect, rect);
    expect(rect.x).toBe(5);
    expect(rect.y).toBe(10);
    expect(rect.width).toBe(20);
    expect(rect.height).toBe(30);
  });

  it('is the inverse of dipToScreenRect', () => {
    const screen = makeScreenInfo({ x: 0, y: 0, scaleFactor: 3 });
    const original = { x: 10, y: 20, width: 100, height: 200 };
    const physical = { x: 0, y: 0, width: 0, height: 0 };
    dipToScreenRect(screen, original, physical);
    const recovered = { x: 0, y: 0, width: 0, height: 0 };
    screenToDipRect(screen, physical, recovered);
    expect(recovered.x).toBeCloseTo(original.x);
    expect(recovered.y).toBeCloseTo(original.y);
    expect(recovered.width).toBeCloseTo(original.width);
    expect(recovered.height).toBeCloseTo(original.height);
  });
});

describe('setScreenBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setScreenBackend(fakeBackend([{}]));
    setScreenBackend(null);
    expect(getScreenBackend()).not.toBeNull();
  });
});

// A host implementing only the REQUIRED members — partial support declared by absence.
function partialBackend(): ScreenBackend {
  return {
    getScreens: (() => undefined) as never,
    getPrimaryScreen: (() => undefined) as never,
    subscribe: (() => undefined) as never,
    getCursorPosition: (() => undefined) as never,
  } as ScreenBackend;
}
