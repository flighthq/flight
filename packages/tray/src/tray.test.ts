import type {
  MenuItemTemplate,
  TrayBackend,
  TrayBalloonOptions,
  TrayCapabilities,
  TrayEventData,
  TrayEventType,
  TrayIconOptions,
} from '@flighthq/types';

import {
  createTrayIcon,
  createWebTrayBackend,
  destroyTrayIcon,
  displayTrayBalloon,
  getTrayBackend,
  getTrayCapabilities,
  getTrayIconBounds,
  getTrayIcons,
  getTrayIconTitle,
  getTrayIconTooltip,
  isTrayDestroyed,
  onTrayEvent,
  popupTrayContextMenu,
  removeTrayBalloon,
  setTrayBackend,
  setTrayIcon,
  setTrayIconContextMenu,
  setTrayIconTemplate,
  setTrayIconTitle,
  setTrayIconTooltip,
  setTrayIgnoreDoubleClickEvents,
  setTrayPressedIcon,
  startTrayIconAnimation,
} from './tray';

// Fake backend state per icon.
interface FakeTray {
  balloon: TrayBalloonOptions | null;
  contextMenu: readonly MenuItemTemplate[] | null;
  destroyed: boolean;
  icon: string;
  id: number;
  ignoreDoubleClick: boolean;
  isTemplate: boolean;
  options: TrayIconOptions;
  pressedIcon: string;
  title: string;
  tooltip: string;
}

// Full fake backend implementing every TrayBackend method for test control.
function fakeBackend(caps: Partial<TrayCapabilities> = {}): TrayBackend & {
  capabilities: TrayCapabilities;
  fireEvent(event: TrayEventData): void;
  lastPopupPosition: { x: number; y: number } | null;
  trays: Map<number, FakeTray>;
} {
  const capabilities: TrayCapabilities = {
    balloon: caps.balloon ?? true,
    bounds: caps.bounds ?? true,
    clickEvents: caps.clickEvents ?? true,
    dropFiles: caps.dropFiles ?? false,
    pressedIcon: caps.pressedIcon ?? true,
    title: caps.title ?? true,
  };
  let nextId = 1;
  let eventListener: ((event: Readonly<TrayEventData>) => void) | null = null;
  const trays = new Map<number, FakeTray>();

  return {
    capabilities,
    trays,
    lastPopupPosition: null,
    create(options) {
      const id = nextId++;
      trays.set(id, {
        balloon: null,
        contextMenu: null,
        destroyed: false,
        icon: options.icon ?? '',
        id,
        ignoreDoubleClick: false,
        isTemplate: options.iconTemplate ?? false,
        options,
        pressedIcon: '',
        title: options.title ?? '',
        tooltip: options.tooltip ?? '',
      });
      return id;
    },
    destroy(id) {
      const tray = trays.get(id);
      if (tray) tray.destroyed = true;
    },
    displayBalloon(id, options) {
      const tray = trays.get(id);
      if (tray) tray.balloon = options;
    },
    getBounds(id) {
      if (!trays.has(id)) return null;
      return { height: 22, width: 22, x: 100, y: 0 };
    },
    getCapabilities() {
      return capabilities;
    },
    getTitle(id) {
      return trays.get(id)?.title ?? '';
    },
    getTooltip(id) {
      return trays.get(id)?.tooltip ?? '';
    },
    isDestroyed(id) {
      const tray = trays.get(id);
      return tray === undefined || tray.destroyed;
    },
    listIds() {
      return Array.from(trays.keys()).filter((id) => !trays.get(id)!.destroyed);
    },
    popUpContextMenu(id, position) {
      this.lastPopupPosition = position ? { x: position.x, y: position.y } : null;
    },
    removeBalloon(id) {
      const tray = trays.get(id);
      if (tray) tray.balloon = null;
    },
    setContextMenu(id, items) {
      const tray = trays.get(id);
      if (tray) tray.contextMenu = items;
    },
    setIcon(id, icon) {
      const tray = trays.get(id);
      if (tray) tray.icon = icon;
    },
    setIgnoreDoubleClickEvents(id, ignore) {
      const tray = trays.get(id);
      if (tray) tray.ignoreDoubleClick = ignore;
    },
    setPressedIcon(id, icon) {
      const tray = trays.get(id);
      if (tray) tray.pressedIcon = icon;
    },
    setTemplate(id, isTemplate) {
      const tray = trays.get(id);
      if (tray) tray.isTemplate = isTemplate;
    },
    setTitle(id, title) {
      const tray = trays.get(id);
      if (tray) tray.title = title;
    },
    setTooltip(id, tooltip) {
      const tray = trays.get(id);
      if (tray) tray.tooltip = tooltip;
    },
    subscribe(listener) {
      eventListener = listener;
      return () => {
        eventListener = null;
      };
    },
    fireEvent(event) {
      eventListener?.(event);
    },
  };
}

function makeTrayEvent(overrides: Partial<TrayEventData> = {}): TrayEventData {
  return {
    altKey: false,
    bounds: null,
    ctrlKey: false,
    dropFiles: null,
    dropText: null,
    id: 1,
    metaKey: false,
    position: null,
    shiftKey: false,
    type: 'click',
    ...overrides,
  };
}

afterEach(() => setTrayBackend(null));

describe('createTrayIcon', () => {
  it('creates a tray via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon({ tooltip: 'App' });
    expect(tray).not.toBeNull();
    expect(backend.trays.get(tray!.id)!.options.tooltip).toBe('App');
  });

  it('passes iconTemplate option to backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon({ icon: 'icon.png', iconTemplate: true });
    expect(backend.trays.get(tray!.id)!.isTemplate).toBe(true);
  });

  it('returns null on the web backend (no tray)', () => {
    expect(createTrayIcon()).toBeNull();
  });
});

describe('createWebTrayBackend', () => {
  it('returns sentinels without throwing (web has no tray)', () => {
    const backend = createWebTrayBackend();
    expect(backend.create({})).toBe(-1);
    expect(() => backend.destroy(0)).not.toThrow();
    expect(() => backend.setTooltip(0, 'x')).not.toThrow();
    expect(() => backend.setTitle(0, 'x')).not.toThrow();
    expect(() => backend.setContextMenu(0, [])).not.toThrow();
    expect(() => backend.setIcon(0, 'icon.png')).not.toThrow();
    expect(() => backend.setTemplate(0, true)).not.toThrow();
    expect(() => backend.setPressedIcon(0, 'pressed.png')).not.toThrow();
    expect(() => backend.setIgnoreDoubleClickEvents(0, true)).not.toThrow();
    expect(() => backend.popUpContextMenu(0)).not.toThrow();
    expect(() => backend.displayBalloon(0, { title: 'T', text: 'B' })).not.toThrow();
    expect(() => backend.removeBalloon(0)).not.toThrow();
    expect(backend.getBounds(0)).toBeNull();
    expect(backend.getTitle(0)).toBe('');
    expect(backend.getTooltip(0)).toBe('');
    expect(backend.isDestroyed(0)).toBe(true);
    expect(backend.listIds()).toEqual([]);
    expect(typeof backend.subscribe(() => {})).toBe('function');
  });

  it('web capabilities are all false', () => {
    const backend = createWebTrayBackend();
    const caps = backend.getCapabilities();
    expect(caps.balloon).toBe(false);
    expect(caps.bounds).toBe(false);
    expect(caps.clickEvents).toBe(false);
    expect(caps.dropFiles).toBe(false);
    expect(caps.pressedIcon).toBe(false);
    expect(caps.title).toBe(false);
  });
});

describe('destroyTrayIcon', () => {
  it('destroys the tray via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    destroyTrayIcon(tray);
    expect(backend.trays.get(tray.id)!.destroyed).toBe(true);
  });
});

describe('displayTrayBalloon', () => {
  it('passes balloon options to the backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    const opts: TrayBalloonOptions = { title: 'Alert', text: 'Something happened' };
    displayTrayBalloon(tray, opts);
    expect(backend.trays.get(tray.id)!.balloon).toStrictEqual(opts);
  });

  it('accepts optional balloon fields', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    const opts: TrayBalloonOptions = {
      title: 'Alert',
      text: 'Body',
      iconType: 'warning',
      largeIcon: true,
      noSound: true,
      respectQuietTime: true,
    };
    displayTrayBalloon(tray, opts);
    expect(backend.trays.get(tray.id)!.balloon?.iconType).toBe('warning');
  });

  it('is a no-op on the web backend', () => {
    expect(() => displayTrayBalloon({ id: 0 }, { title: 'T', text: 'B' })).not.toThrow();
  });
});

describe('getTrayBackend', () => {
  it('falls back to a web backend', () => {
    expect(getTrayBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    expect(getTrayBackend()).toBe(backend);
  });
});

describe('getTrayCapabilities', () => {
  it('returns capabilities from the active backend', () => {
    const backend = fakeBackend({ balloon: true, bounds: false });
    setTrayBackend(backend);
    const caps = getTrayCapabilities();
    expect(caps.balloon).toBe(true);
    expect(caps.bounds).toBe(false);
  });

  it('returns all-false capabilities on web', () => {
    const caps = getTrayCapabilities();
    expect(Object.values(caps).every((v) => v === false)).toBe(true);
  });
});

describe('getTrayIconBounds', () => {
  it('returns bounds from the backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    const bounds = getTrayIconBounds(tray);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.height).toBeGreaterThan(0);
  });

  it('returns null on web', () => {
    expect(getTrayIconBounds({ id: 0 })).toBeNull();
  });
});

describe('getTrayIcons', () => {
  it('returns all live tray icons', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const t1 = createTrayIcon()!;
    const t2 = createTrayIcon()!;
    const icons = getTrayIcons();
    expect(icons.map((t) => t.id)).toContain(t1.id);
    expect(icons.map((t) => t.id)).toContain(t2.id);
  });

  it('excludes destroyed tray icons', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const t1 = createTrayIcon()!;
    destroyTrayIcon(t1);
    const icons = getTrayIcons();
    expect(icons.map((t) => t.id)).not.toContain(t1.id);
  });

  it('returns empty array on web', () => {
    expect(getTrayIcons()).toEqual([]);
  });
});

describe('getTrayIconTitle', () => {
  it('returns the current title', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    setTrayIconTitle(tray, 'MyApp');
    expect(getTrayIconTitle(tray)).toBe('MyApp');
  });

  it('returns empty string on web', () => {
    expect(getTrayIconTitle({ id: 0 })).toBe('');
  });
});

describe('getTrayIconTooltip', () => {
  it('returns the current tooltip', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    setTrayIconTooltip(tray, 'Hover tip');
    expect(getTrayIconTooltip(tray)).toBe('Hover tip');
  });

  it('returns empty string on web', () => {
    expect(getTrayIconTooltip({ id: 0 })).toBe('');
  });
});

describe('isTrayDestroyed', () => {
  it('returns false for a live tray', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    expect(isTrayDestroyed(tray)).toBe(false);
  });

  it('returns true after destroyTrayIcon', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    destroyTrayIcon(tray);
    expect(isTrayDestroyed(tray)).toBe(true);
  });

  it('returns true on web (no trays exist)', () => {
    expect(isTrayDestroyed({ id: 0 })).toBe(true);
  });
});

describe('onTrayEvent', () => {
  it('delivers rich TrayEventData via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    let received: TrayEventData | null = null;
    onTrayEvent((event) => {
      received = event;
    });
    const evt = makeTrayEvent({
      id: 7,
      type: 'rightClick',
      bounds: { x: 100, y: 0, width: 22, height: 22 },
      shiftKey: true,
    });
    backend.fireEvent(evt);
    expect(received).not.toBeNull();
    expect(received!.id).toBe(7);
    expect(received!.type).toBe('rightClick');
    expect(received!.bounds).toMatchObject({ x: 100, y: 0 });
    expect(received!.shiftKey).toBe(true);
  });

  it('delivers drop events with file payloads', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    let received: TrayEventData | null = null;
    onTrayEvent((e) => {
      received = e;
    });
    backend.fireEvent(makeTrayEvent({ type: 'dropFiles', dropFiles: ['/path/to/file.txt'] }));
    expect(received!.dropFiles).toEqual(['/path/to/file.txt']);
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    let count = 0;
    const unsubscribe = onTrayEvent(() => {
      count += 1;
    });
    backend.fireEvent(makeTrayEvent({ type: 'click' }));
    unsubscribe();
    backend.fireEvent(makeTrayEvent({ type: 'click' }));
    expect(count).toBe(1);
  });

  it('delivers balloon events', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const types: TrayEventType[] = [];
    onTrayEvent((e) => {
      types.push(e.type);
    });
    backend.fireEvent(makeTrayEvent({ type: 'balloonShow' }));
    backend.fireEvent(makeTrayEvent({ type: 'balloonClick' }));
    backend.fireEvent(makeTrayEvent({ type: 'balloonClose' }));
    expect(types).toEqual(['balloonShow', 'balloonClick', 'balloonClose']);
  });
});

describe('popupTrayContextMenu', () => {
  it('pops up the context menu without a position', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    popupTrayContextMenu(tray);
    // No error thrown; position was unset
    expect(backend.lastPopupPosition).toBeNull();
  });

  it('pops up the context menu at a given position', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    popupTrayContextMenu(tray, { x: 200, y: 50 });
    expect(backend.lastPopupPosition).toEqual({ x: 200, y: 50 });
  });

  it('is a no-op on web', () => {
    expect(() => popupTrayContextMenu({ id: 0 }, { x: 0, y: 0 })).not.toThrow();
  });
});

describe('removeTrayBalloon', () => {
  it('removes the active balloon', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    displayTrayBalloon(tray, { title: 'T', text: 'B' });
    removeTrayBalloon(tray);
    expect(backend.trays.get(tray.id)!.balloon).toBeNull();
  });

  it('is a no-op on web', () => {
    expect(() => removeTrayBalloon({ id: 0 })).not.toThrow();
  });
});

describe('setTrayBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setTrayBackend(fakeBackend());
    setTrayBackend(null);
    expect(getTrayBackend()).not.toBeNull();
  });
});

describe('setTrayIcon', () => {
  it('updates the icon at runtime', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon({ icon: 'idle.png' })!;
    setTrayIcon(tray, 'active.png');
    expect(backend.trays.get(tray.id)!.icon).toBe('active.png');
  });

  it('is a no-op on web', () => {
    expect(() => setTrayIcon({ id: 0 }, 'icon.png')).not.toThrow();
  });
});

describe('setTrayIconContextMenu', () => {
  it('sets the context menu via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    const items: readonly MenuItemTemplate[] = [{ id: 'quit', label: 'Quit' }];
    setTrayIconContextMenu(tray, items);
    expect(backend.trays.get(tray.id)!.contextMenu).toBe(items);
  });
});

describe('setTrayIconTemplate', () => {
  it('marks the icon as a template image', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    setTrayIconTemplate(tray, true);
    expect(backend.trays.get(tray.id)!.isTemplate).toBe(true);
  });

  it('clears the template flag', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon({ iconTemplate: true })!;
    setTrayIconTemplate(tray, false);
    expect(backend.trays.get(tray.id)!.isTemplate).toBe(false);
  });

  it('is a no-op on web', () => {
    expect(() => setTrayIconTemplate({ id: 0 }, true)).not.toThrow();
  });
});

describe('setTrayIconTitle', () => {
  it('sets the title via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    setTrayIconTitle(tray, 'Hello');
    expect(backend.trays.get(tray.id)!.title).toBe('Hello');
  });
});

describe('setTrayIconTooltip', () => {
  it('sets the tooltip via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    setTrayIconTooltip(tray, 'Tip');
    expect(backend.trays.get(tray.id)!.tooltip).toBe('Tip');
  });
});

describe('setTrayIgnoreDoubleClickEvents', () => {
  it('sets the ignore double-click flag', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    setTrayIgnoreDoubleClickEvents(tray, true);
    expect(backend.trays.get(tray.id)!.ignoreDoubleClick).toBe(true);
  });

  it('is a no-op on web', () => {
    expect(() => setTrayIgnoreDoubleClickEvents({ id: 0 }, true)).not.toThrow();
  });
});

describe('setTrayPressedIcon', () => {
  it('sets the pressed icon image', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    setTrayPressedIcon(tray, 'pressed.png');
    expect(backend.trays.get(tray.id)!.pressedIcon).toBe('pressed.png');
  });

  it('is a no-op on web', () => {
    expect(() => setTrayPressedIcon({ id: 0 }, 'pressed.png')).not.toThrow();
  });
});

describe('startTrayIconAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cycles through frames at the given interval', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon({ icon: 'frame0.png' })!;
    const frames = ['frame0.png', 'frame1.png', 'frame2.png'];
    startTrayIconAnimation(tray, frames, 100);
    // Initial frame set immediately
    expect(backend.trays.get(tray.id)!.icon).toBe('frame0.png');
    vi.advanceTimersByTime(100);
    expect(backend.trays.get(tray.id)!.icon).toBe('frame1.png');
    vi.advanceTimersByTime(100);
    expect(backend.trays.get(tray.id)!.icon).toBe('frame2.png');
    vi.advanceTimersByTime(100);
    // Wraps around
    expect(backend.trays.get(tray.id)!.icon).toBe('frame0.png');
  });

  it('stop function cancels animation', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    const frames = ['a.png', 'b.png'];
    const stop = startTrayIconAnimation(tray, frames, 50);
    vi.advanceTimersByTime(50);
    expect(backend.trays.get(tray.id)!.icon).toBe('b.png');
    stop();
    vi.advanceTimersByTime(200);
    // Frame stays at b.png after stop
    expect(backend.trays.get(tray.id)!.icon).toBe('b.png');
  });

  it('returns a no-op stop for empty frames', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    const stop = startTrayIconAnimation(tray, [], 100);
    expect(() => stop()).not.toThrow();
  });
});
