import type { MenuBackend, MenuItemTemplate } from '@flighthq/types';

import {
  createMenuItemTemplate,
  createWebMenuBackend,
  getMenuBackend,
  onMenuSelect,
  setApplicationMenu,
  setMenuBackend,
  showContextMenu,
} from './menu';

function fakeBackend(): MenuBackend & {
  lastMenu: readonly MenuItemTemplate[] | null;
  clickResult: string | null;
  fireSelect(id: string): void;
} {
  let selectListener: ((id: string) => void) | null = null;
  return {
    lastMenu: null,
    clickResult: null,
    setApplicationMenu(items) {
      this.lastMenu = items;
      return true;
    },
    async popupContextMenu() {
      return this.clickResult;
    },
    subscribeSelect(listener) {
      selectListener = listener;
      return () => {
        selectListener = null;
      };
    },
    fireSelect(id) {
      selectListener?.(id);
    },
  };
}

afterEach(() => setMenuBackend(null));

describe('createMenuItemTemplate', () => {
  it('fills defaults (type normal, enabled true)', () => {
    const item = createMenuItemTemplate();
    expect(item.type).toBe('normal');
    expect(item.enabled).toBe(true);
  });

  it('overrides defaults with provided fields', () => {
    const item = createMenuItemTemplate({ label: 'Quit', role: 'quit', type: 'separator', enabled: false });
    expect(item.label).toBe('Quit');
    expect(item.role).toBe('quit');
    expect(item.type).toBe('separator');
    expect(item.enabled).toBe(false);
  });
});

describe('createWebMenuBackend', () => {
  it('returns sentinels without throwing (web has no native menus)', async () => {
    const backend = createWebMenuBackend();
    expect(backend.setApplicationMenu([])).toBe(false);
    expect(await backend.popupContextMenu([], 0, 0)).toBeNull();
    expect(typeof backend.subscribeSelect(() => {})).toBe('function');
  });
});

describe('getMenuBackend', () => {
  it('falls back to a web backend', () => {
    expect(getMenuBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setMenuBackend(backend);
    expect(getMenuBackend()).toBe(backend);
  });
});

describe('onMenuSelect', () => {
  it('delivers the selected item id via the active backend', () => {
    const backend = fakeBackend();
    setMenuBackend(backend);
    let received: string | null = null;
    onMenuSelect((id) => {
      received = id;
    });
    backend.fireSelect('quit');
    expect(received).toBe('quit');
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setMenuBackend(backend);
    let count = 0;
    const unsubscribe = onMenuSelect(() => {
      count += 1;
    });
    backend.fireSelect('a');
    unsubscribe();
    backend.fireSelect('b');
    expect(count).toBe(1);
  });
});

describe('setApplicationMenu', () => {
  it('sets the menu via the active backend', () => {
    const backend = fakeBackend();
    setMenuBackend(backend);
    const items = [createMenuItemTemplate({ label: 'File' })];
    expect(setApplicationMenu(items)).toBe(true);
    expect(backend.lastMenu).toBe(items);
  });

  it('returns false on the web backend', () => {
    expect(setApplicationMenu([])).toBe(false);
  });
});

describe('setMenuBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setMenuBackend(fakeBackend());
    setMenuBackend(null);
    expect(getMenuBackend()).not.toBeNull();
  });
});

describe('showContextMenu', () => {
  it('resolves the clicked item id via the active backend', async () => {
    const backend = fakeBackend();
    backend.clickResult = 'paste';
    setMenuBackend(backend);
    expect(await showContextMenu([createMenuItemTemplate({ id: 'paste' })], 10, 20)).toBe('paste');
  });

  it('resolves null on the web backend', async () => {
    expect(await showContextMenu([], 0, 0)).toBeNull();
  });
});
