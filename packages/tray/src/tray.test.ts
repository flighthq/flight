import type { MenuItemTemplate, TrayBackend, TrayEventType, TrayIconOptions } from '@flighthq/types';

import {
  createTrayIcon,
  createWebTrayBackend,
  destroyTrayIcon,
  getTrayBackend,
  onTrayEvent,
  setTrayBackend,
  setTrayContextMenu,
  setTrayIconTitle,
  setTrayIconTooltip,
} from './tray';

interface FakeTray {
  id: number;
  options: TrayIconOptions;
  tooltip: string;
  title: string;
  contextMenu: readonly MenuItemTemplate[] | null;
  destroyed: boolean;
}

function fakeBackend(): TrayBackend & {
  trays: Map<number, FakeTray>;
  fireEvent(id: number, event: TrayEventType): void;
} {
  let eventListener: ((id: number, event: TrayEventType) => void) | null = null;
  return {
    trays: new Map<number, FakeTray>(),
    create(options) {
      const id = this.trays.size + 1;
      this.trays.set(id, { id, options, tooltip: '', title: '', contextMenu: null, destroyed: false });
      return id;
    },
    destroy(id) {
      const tray = this.trays.get(id);
      if (tray) tray.destroyed = true;
    },
    setTooltip(id, tooltip) {
      const tray = this.trays.get(id);
      if (tray) tray.tooltip = tooltip;
    },
    setTitle(id, title) {
      const tray = this.trays.get(id);
      if (tray) tray.title = title;
    },
    setContextMenu(id, items) {
      const tray = this.trays.get(id);
      if (tray) tray.contextMenu = items;
    },
    subscribe(listener) {
      eventListener = listener;
      return () => {
        eventListener = null;
      };
    },
    fireEvent(id, event) {
      eventListener?.(id, event);
    },
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
    expect(typeof backend.subscribe(() => {})).toBe('function');
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

describe('onTrayEvent', () => {
  it('delivers tray events via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    let receivedId = -1;
    let receivedEvent: TrayEventType | null = null;
    onTrayEvent((id, event) => {
      receivedId = id;
      receivedEvent = event;
    });
    backend.fireEvent(7, 'rightClick');
    expect(receivedId).toBe(7);
    expect(receivedEvent).toBe('rightClick');
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    let count = 0;
    const unsubscribe = onTrayEvent(() => {
      count += 1;
    });
    backend.fireEvent(1, 'click');
    unsubscribe();
    backend.fireEvent(1, 'click');
    expect(count).toBe(1);
  });
});

describe('setTrayBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setTrayBackend(fakeBackend());
    setTrayBackend(null);
    expect(getTrayBackend()).not.toBeNull();
  });
});

describe('setTrayContextMenu', () => {
  it('sets the context menu via the active backend', () => {
    const backend = fakeBackend();
    setTrayBackend(backend);
    const tray = createTrayIcon()!;
    const items: readonly MenuItemTemplate[] = [{ id: 'quit', label: 'Quit' }];
    setTrayContextMenu(tray, items);
    expect(backend.trays.get(tray.id)!.contextMenu).toBe(items);
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
