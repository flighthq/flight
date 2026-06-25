import type { MenuBackend } from '@flighthq/types';

import {
  cloneMenuTemplate,
  createMenuItemTemplate,
  createWebMenuBackend,
  enableMenuSignals,
  getMenuBackend,
  getMenuSignals,
  onMenuSelect,
  setApplicationMenu,
  setMenuBackend,
  showContextMenu,
  validateMenuItemTemplate,
} from './menu';

function fakeBackend(overrides?: Partial<MenuBackend>): MenuBackend {
  return {
    setApplicationMenu: () => true,
    popupContextMenu: () => Promise.resolve(null),
    subscribeSelect: () => () => {},
    ...overrides,
  };
}

describe('cloneMenuTemplate', () => {
  it('produces an equal but distinct tree', () => {
    const original = createMenuItemTemplate({
      id: 'file',
      type: 'submenu',
      submenu: [{ id: 'open', label: 'Open' }],
    });
    const clone = cloneMenuTemplate(original);
    expect(clone).toStrictEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.submenu).not.toBe(original.submenu);
    expect(clone.submenu![0]).not.toBe(original.submenu![0]);
  });
});

describe('createMenuItemTemplate', () => {
  it('fills type and enabled defaults', () => {
    const item = createMenuItemTemplate({ id: 'copy', label: 'Copy' });
    expect(item.type).toBe('normal');
    expect(item.enabled).toBe(true);
  });

  it('normalizes submenu children recursively', () => {
    const item = createMenuItemTemplate({ type: 'submenu', submenu: [{ id: 'child' }] });
    expect(item.submenu![0].type).toBe('normal');
    expect(item.submenu![0].enabled).toBe(true);
  });
});

describe('createWebMenuBackend', () => {
  it('reports no native application menu', () => {
    const backend = createWebMenuBackend();
    expect(backend.setApplicationMenu([])).toBe(false);
  });

  it('returns an unsubscribe function from subscribeSelect', () => {
    const backend = createWebMenuBackend();
    expect(typeof backend.subscribeSelect(() => {})).toBe('function');
  });
});

describe('enableMenuSignals', () => {
  it('returns a stable instance across calls', () => {
    expect(enableMenuSignals()).toBe(enableMenuSignals());
  });
});

describe('getMenuBackend', () => {
  afterEach(() => setMenuBackend(null));

  it('lazily returns a web default backend', () => {
    setMenuBackend(null);
    expect(getMenuBackend()).not.toBeNull();
  });
});

describe('getMenuSignals', () => {
  it('returns the active signal group once enabled', () => {
    const signals = enableMenuSignals();
    expect(getMenuSignals()).toBe(signals);
  });
});

describe('onMenuSelect', () => {
  afterEach(() => setMenuBackend(null));

  it('delivers the selected id from the backend', () => {
    let captured: ((id: string) => void) | null = null;
    setMenuBackend(
      fakeBackend({
        subscribeSelect: (l) => {
          captured = l;
          return () => {};
        },
      }),
    );
    const received: string[] = [];
    onMenuSelect((id) => received.push(id));
    captured!('save');
    expect(received).toEqual(['save']);
  });
});

describe('setApplicationMenu', () => {
  afterEach(() => setMenuBackend(null));

  it('delegates to the active backend', () => {
    let installed = 0;
    setMenuBackend(
      fakeBackend({
        setApplicationMenu: (i) => {
          installed = i.length;
          return true;
        },
      }),
    );
    expect(setApplicationMenu([{ id: 'a' }])).toBe(true);
    expect(installed).toBe(1);
  });
});

describe('setMenuBackend', () => {
  afterEach(() => setMenuBackend(null));

  it('installs an explicit backend and reverts to the web default on null', () => {
    const backend = fakeBackend();
    setMenuBackend(backend);
    expect(getMenuBackend()).toBe(backend);
    setMenuBackend(null);
    expect(getMenuBackend()).not.toBe(backend);
  });
});

describe('showContextMenu', () => {
  afterEach(() => setMenuBackend(null));

  it('resolves the id returned by the backend popup', async () => {
    setMenuBackend(fakeBackend({ popupContextMenu: () => Promise.resolve('copy') }));
    await expect(showContextMenu([], 0, 0)).resolves.toBe('copy');
  });
});

describe('validateMenuItemTemplate', () => {
  it('returns null for a well-formed item', () => {
    expect(validateMenuItemTemplate(createMenuItemTemplate({ id: 'ok', label: 'Ok' }))).toBeNull();
  });

  it('rejects a separator that carries a label', () => {
    expect(validateMenuItemTemplate({ type: 'separator', label: 'X' })).not.toBeNull();
  });

  it('throws on a cyclic submenu reference', () => {
    const node = createMenuItemTemplate({ type: 'submenu' });
    node.submenu = [node];
    expect(() => validateMenuItemTemplate(node)).toThrow();
  });
});
