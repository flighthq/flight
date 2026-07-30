import type { MenuBackend } from '@flighthq/types/contract';

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

describe('createWebMenuBackend context-menu renderer', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function getRootMenu(): HTMLUListElement {
    const menu = document.body.querySelector('ul');
    expect(menu).not.toBeNull();
    return menu as HTMLUListElement;
  }

  function getOverlay(): HTMLDivElement {
    const overlay = document.body.querySelector('div');
    expect(overlay).not.toBeNull();
    return overlay as HTMLDivElement;
  }

  function press(key: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }

  it('renders separators, checked kinds, accelerators, and disabled items', async () => {
    const promise = createWebMenuBackend().popupContextMenu(
      [
        { id: 'checked', label: 'Checked', type: 'checkbox', checked: true },
        { id: 'chosen', label: 'Chosen', type: 'radio', checked: true },
        { type: 'separator' },
        { id: 'save', label: 'Save', accelerator: 'Ctrl+S' },
        { id: 'disabled', label: 'Disabled', enabled: false },
      ],
      10,
      20,
    );
    const items = getRootMenu().querySelectorAll(':scope > li');
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toBe('✓Checked');
    expect(items[1].textContent).toBe('●Chosen');
    expect(items[2].getAttribute('data-enabled')).toBeNull();
    expect(items[3].textContent).toBe('SaveCtrl+S');
    expect(items[4].getAttribute('data-enabled')).toBe('false');

    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    items[4].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(settled).toBe(false);
    getOverlay().click();
    await expect(promise).resolves.toBeNull();
  });

  it('selects enabled items by click and dismisses on outside click', async () => {
    const backend = createWebMenuBackend();
    const selected = backend.popupContextMenu([{ id: 'copy', label: 'Copy' }], 0, 0);
    getRootMenu().querySelector<HTMLElement>('li')!.click();
    await expect(selected).resolves.toBe('copy');
    expect(document.body.querySelector('ul')).toBeNull();

    const dismissed = backend.popupContextMenu([{ id: 'paste', label: 'Paste' }], 0, 0);
    getOverlay().click();
    await expect(dismissed).resolves.toBeNull();
  });

  it('wraps keyboard focus and selects with Enter or Space', async () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'disabled', label: 'Disabled', enabled: false },
      { id: 'last', label: 'Last' },
    ];

    const enterSelection = createWebMenuBackend().popupContextMenu(items, 0, 0);
    press('ArrowUp');
    expect(getRootMenu().querySelector('[data-focused="true"]')?.getAttribute('data-item-id')).toBe('last');
    press('Enter');
    await expect(enterSelection).resolves.toBe('last');

    const spaceSelection = createWebMenuBackend().popupContextMenu(items, 0, 0);
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(getRootMenu().querySelector('[data-focused="true"]')?.getAttribute('data-item-id')).toBe('first');
    press(' ');
    await expect(spaceSelection).resolves.toBe('first');
  });

  it('dismisses on Escape', async () => {
    const promise = createWebMenuBackend().popupContextMenu([{ id: 'copy', label: 'Copy' }], 0, 0);
    press('Escape');
    await expect(promise).resolves.toBeNull();
  });

  it('opens a submenu on hover and resolves a child selection', async () => {
    const promise = createWebMenuBackend().popupContextMenu(
      [{ id: 'file', label: 'File', type: 'submenu', submenu: [{ id: 'open', label: 'Open' }] }],
      0,
      0,
    );
    const parent = getRootMenu().querySelector<HTMLElement>(':scope > li')!;
    const submenu = parent.querySelector<HTMLElement>('ul')!;
    expect(submenu.style.display).toBe('none');
    parent.dispatchEvent(new MouseEvent('mouseenter'));
    expect(submenu.style.display).toBe('block');
    submenu.querySelector<HTMLElement>('li')!.click();
    await expect(promise).resolves.toBe('open');
  });

  it('clamps a menu that overflows the viewport', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(1900, 1900, 100, 100));
    const promise = createWebMenuBackend().popupContextMenu([{ id: 'copy', label: 'Copy' }], 40, 30);
    expect(getRootMenu().style.left).toBe('0px');
    expect(getRootMenu().style.top).toBe('0px');
    getOverlay().click();
    await promise;
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

  it('rejects checked state on an item that is not a checkbox or radio', () => {
    expect(validateMenuItemTemplate({ id: 'copy', label: 'Copy', type: 'normal', checked: true })).toContain('checked');
  });

  it('rejects multiple checked radios in one contiguous sibling group', () => {
    expect(
      validateMenuItemTemplate({
        type: 'submenu',
        submenu: [
          { id: 'left', type: 'radio', checked: true },
          { id: 'right', type: 'radio', checked: true },
        ],
      }),
    ).toContain('multiple checked radio');
  });

  it('allows checked radios in separate contiguous groups', () => {
    expect(
      validateMenuItemTemplate({
        type: 'submenu',
        submenu: [
          { id: 'left', type: 'radio', checked: true },
          { id: 'copy', type: 'normal' },
          { id: 'right', type: 'radio', checked: true },
        ],
      }),
    ).toBeNull();
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
