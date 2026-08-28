import type { MenuBackend, MenuItemTemplate, MenuReplacementGuaranteeDeclaration } from '@flighthq/types/contract';

import {
  cloneMenuTemplate,
  createMenuItemTemplate,
  destroyMenuBackend,
  enableMenuSignals,
  explainMenuBackend,
  explainMenuReplacementGuarantee,
  getMenuBackend,
  getMenuSignals,
  hasMenuHostBackend,
  hasMenuReplacementGuarantee,
  installMenuHostBackend,
  observeMenuHostResult,
  onMenuSelect,
  resetMenuBackendForTest,
  setApplicationMenu,
  setMenuBackend,
  showContextMenu,
  showWebContextMenu,
  validateMenuItemTemplate,
} from './menu';

function fakeBackend(overrides?: Partial<MenuBackend>): MenuBackend {
  return {
    destroy: () => {},
    setApplicationMenu: () => true,
    popupContextMenu: () => Promise.resolve(null),
    subscribeSelect: () => () => {},
    ...overrides,
  };
}

const unsupportedDestroyBeforeInstall: MenuReplacementGuaranteeDeclaration = {
  guarantee: 'native-destroy-before-install',
  liftableBy: ['atomic-replace-retains-old-on-rejection', 'rollback-or-undo', 'current-app-menu-getter'],
  reason: 'no-atomic-replace-rollback-or-current-menu',
  support: 'unsupported',
};

const unsupportedClearToSentinel: MenuReplacementGuaranteeDeclaration = {
  guarantee: 'native-clear-to-sentinel',
  liftableBy: ['atomic-replace-retains-old-on-rejection', 'rollback-or-undo', 'current-app-menu-getter'],
  reason: 'no-atomic-replace-rollback-or-current-menu',
  support: 'unsupported',
};

const supportedDestroyBeforeInstall: MenuReplacementGuaranteeDeclaration = {
  guarantee: 'native-destroy-before-install',
  liftableBy: [],
  reason: null,
  support: 'supported',
};

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

describe('destroyMenuBackend', () => {
  afterEach(() => resetMenuBackendForTest());

  it('destroys a host-only backend once after clearing selection', () => {
    const sentinel = getMenuBackend();
    let destroyCalls = 0;
    installMenuHostBackend(
      fakeBackend({
        destroy() {
          destroyCalls++;
          expect(getMenuBackend()).toBe(sentinel);
        },
      }),
    );

    destroyMenuBackend();
    destroyMenuBackend();
    expect(destroyCalls).toBe(1);
    expect(getMenuBackend()).toBe(sentinel);
    expect(hasMenuHostBackend()).toBe(false);
  });

  it('destroys distinct custom and host origins once each in captured order', () => {
    const destroyed: string[] = [];
    installMenuHostBackend(fakeBackend({ destroy: () => destroyed.push('host') }));
    setMenuBackend(fakeBackend({ destroy: () => destroyed.push('custom') }));

    destroyMenuBackend();
    expect(destroyed).toEqual(['custom', 'host']);
  });

  it('destroys a backend aliased into both slots exactly once', () => {
    let destroyCalls = 0;
    const shared = fakeBackend({ destroy: () => destroyCalls++ });
    installMenuHostBackend(shared);
    setMenuBackend(shared);

    destroyMenuBackend();
    expect(destroyCalls).toBe(1);
  });

  it('is re-entrant-safe because the slots are empty before release', () => {
    const sentinel = getMenuBackend();
    let destroyCalls = 0;
    setMenuBackend(
      fakeBackend({
        destroy() {
          destroyCalls++;
          destroyMenuBackend();
          expect(getMenuBackend()).toBe(sentinel);
        },
      }),
    );

    destroyMenuBackend();
    expect(destroyCalls).toBe(1);
  });

  it('keeps Route2 limitations unsupported before teardown and unobserved after slots clear', () => {
    const sentinel = getMenuBackend();
    const guarantees = [unsupportedDestroyBeforeInstall, unsupportedClearToSentinel] as const;
    const supportDuringDestroy: string[] = [];
    setMenuBackend(
      fakeBackend({
        replacementGuarantees: guarantees,
        destroy() {
          expect(getMenuBackend()).toBe(sentinel);
          for (const { guarantee } of guarantees) {
            const explanation = explainMenuReplacementGuarantee(guarantee);
            expect(explanation.implemented).toBe(false);
            expect(explanation.layer).toBe('sentinel');
            supportDuringDestroy.push(explanation.support);
            expect(hasMenuReplacementGuarantee(guarantee)).toBe(false);
          }
        },
      }),
    );
    for (const { guarantee } of guarantees) {
      expect(explainMenuReplacementGuarantee(guarantee).support).toBe('unsupported');
    }

    destroyMenuBackend();

    expect(supportDuringDestroy).toEqual(['unobserved', 'unobserved']);
    for (const { guarantee } of guarantees) {
      expect(explainMenuReplacementGuarantee(guarantee).support).toBe('unobserved');
      expect(hasMenuReplacementGuarantee(guarantee)).toBe(false);
    }
  });

  it('does not let a newly installed host inherit prior host diagnostics', () => {
    installMenuHostBackend(fakeBackend());
    installMenuHostBackend(fakeBackend());
    observeMenuHostResult('popupContextMenu', true);
    destroyMenuBackend();

    installMenuHostBackend(fakeBackend());
    expect(explainMenuBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: null,
      viability: 'unobserved',
    });
  });
});

describe('enableMenuSignals', () => {
  it('returns a stable instance across calls', () => {
    expect(enableMenuSignals()).toBe(enableMenuSignals());
  });
});

describe('explainMenuBackend', () => {
  afterEach(() => resetMenuBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetMenuBackendForTest();
    const explanation = explainMenuBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setMenuBackend(fakeBackend());
    expect(explainMenuBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installMenuHostBackend(fakeBackend());
    expect(explainMenuBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installMenuHostBackend(fakeBackend());
    installMenuHostBackend(fakeBackend());
    expect(explainMenuBackend().conflict).toBe(true);
  });

  it('reports observed viability after observeMenuHostResult', () => {
    installMenuHostBackend(fakeBackend());
    observeMenuHostResult('popupContextMenu', true);
    const explanation = explainMenuBackend();
    expect(explanation.operation).toBe('popupContextMenu');
    expect(explanation.viability).toBe('available');
  });
});

describe('explainMenuReplacementGuarantee', () => {
  afterEach(() => resetMenuBackendForTest());

  it('reports sentinel and unobserved when no real backend is selected', () => {
    resetMenuBackendForTest();
    expect(explainMenuReplacementGuarantee('native-destroy-before-install')).toEqual({
      guarantee: 'native-destroy-before-install',
      implemented: false,
      layer: 'sentinel',
      liftableBy: [],
      operation: 'destroy',
      reason: null,
      support: 'unobserved',
    });
  });

  it('reports a present destroy operation and its unsupported guarantee independently', () => {
    setMenuBackend(fakeBackend({ replacementGuarantees: [unsupportedDestroyBeforeInstall] }));
    expect(explainMenuReplacementGuarantee('native-destroy-before-install')).toEqual({
      ...unsupportedDestroyBeforeInstall,
      implemented: true,
      layer: 'custom',
      operation: 'destroy',
    });
  });

  it('derives guarantee metadata from the selected backend identity without retaining stale metadata', () => {
    const host = fakeBackend({ replacementGuarantees: [supportedDestroyBeforeInstall] });
    const limitedCustom = fakeBackend({ replacementGuarantees: [unsupportedDestroyBeforeInstall] });
    installMenuHostBackend(host);
    setMenuBackend(limitedCustom);
    expect(explainMenuReplacementGuarantee('native-destroy-before-install').support).toBe('unsupported');

    setMenuBackend(null);
    expect(explainMenuReplacementGuarantee('native-destroy-before-install').support).toBe('supported');
    expect(explainMenuReplacementGuarantee('native-destroy-before-install').layer).toBe('host');

    setMenuBackend(fakeBackend());
    expect(explainMenuReplacementGuarantee('native-destroy-before-install').support).toBe('unobserved');
    expect(explainMenuReplacementGuarantee('native-destroy-before-install').layer).toBe('custom');
  });
});

describe('getMenuBackend', () => {
  afterEach(() => resetMenuBackendForTest());

  it('returns the sentinel when no backend is installed', () => {
    resetMenuBackendForTest();
    expect(getMenuBackend()).not.toBeNull();
  });
});

describe('getMenuBackend sentinel', () => {
  afterEach(() => resetMenuBackendForTest());

  it('reports no native application menu', () => {
    resetMenuBackendForTest();
    const backend = getMenuBackend();
    expect(backend.setApplicationMenu([])).toBe(false);
  });

  it('returns an unsubscribe function from subscribeSelect', () => {
    resetMenuBackendForTest();
    const backend = getMenuBackend();
    expect(typeof backend.subscribeSelect(() => {})).toBe('function');
  });

  it('returns null from popupContextMenu', async () => {
    resetMenuBackendForTest();
    const backend = getMenuBackend();
    await expect(backend.popupContextMenu([], 0, 0)).resolves.toBeNull();
  });
});

describe('getMenuSignals', () => {
  it('returns the active signal group once enabled', () => {
    const signals = enableMenuSignals();
    expect(getMenuSignals()).toBe(signals);
  });
});

describe('hasMenuHostBackend', () => {
  afterEach(() => resetMenuBackendForTest());

  it('reports false when the host slot is empty', () => {
    expect(hasMenuHostBackend()).toBe(false);
  });

  it('does not mistake a higher-precedence custom backend for a host backend', () => {
    setMenuBackend(fakeBackend());
    expect(hasMenuHostBackend()).toBe(false);
  });

  it('reports true when the host slot is occupied', () => {
    installMenuHostBackend(fakeBackend());
    expect(hasMenuHostBackend()).toBe(true);
  });
});

describe('hasMenuReplacementGuarantee', () => {
  afterEach(() => resetMenuBackendForTest());

  it('agrees with explanation support rather than operation presence', () => {
    const declarations = [supportedDestroyBeforeInstall, unsupportedDestroyBeforeInstall, undefined] as const;
    for (const declaration of declarations) {
      setMenuBackend(fakeBackend({ replacementGuarantees: declaration === undefined ? undefined : [declaration] }));
      const explanation = explainMenuReplacementGuarantee('native-destroy-before-install');
      expect(hasMenuReplacementGuarantee('native-destroy-before-install')).toBe(explanation.support === 'supported');
      expect(explanation.implemented).toBe(true);
    }
  });
});

describe('installMenuHostBackend', () => {
  afterEach(() => resetMenuBackendForTest());

  it('installs a host backend that getMenuBackend returns', () => {
    const backend = fakeBackend();
    installMenuHostBackend(backend);
    expect(getMenuBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installMenuHostBackend(first);
    installMenuHostBackend(second);
    expect(getMenuBackend()).toBe(first);
    expect(explainMenuBackend().conflict).toBe(true);
  });

  it('does not set conflict when the same backend is installed twice', () => {
    const backend = fakeBackend();
    installMenuHostBackend(backend);
    installMenuHostBackend(backend);
    expect(explainMenuBackend().conflict).toBe(false);
  });
});

describe('observeMenuHostResult', () => {
  afterEach(() => resetMenuBackendForTest());

  it('records a successful observation', () => {
    installMenuHostBackend(fakeBackend());
    observeMenuHostResult('popupContextMenu', true);
    const explanation = explainMenuBackend();
    expect(explanation.operation).toBe('popupContextMenu');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installMenuHostBackend(fakeBackend());
    observeMenuHostResult('popupContextMenu', false);
    expect(explainMenuBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('onMenuSelect', () => {
  afterEach(() => resetMenuBackendForTest());

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

describe('resetMenuBackendForTest', () => {
  it('clears all backend slots', () => {
    const backend = fakeBackend();
    setMenuBackend(backend);
    installMenuHostBackend(fakeBackend());
    observeMenuHostResult('popupContextMenu', true);
    resetMenuBackendForTest();
    expect(getMenuBackend()).not.toBe(backend);
    expect(explainMenuBackend().layer).toBe('host-not-enabled');
    expect(explainMenuBackend().conflict).toBe(false);
    expect(explainMenuBackend().viability).toBe('unobserved');
  });

  it('releases both backend slots through whole teardown', () => {
    const destroyed: string[] = [];
    installMenuHostBackend(fakeBackend({ destroy: () => destroyed.push('host') }));
    setMenuBackend(fakeBackend({ destroy: () => destroyed.push('custom') }));

    resetMenuBackendForTest();
    expect(destroyed).toEqual(['custom', 'host']);
  });
});

describe('setApplicationMenu', () => {
  afterEach(() => resetMenuBackendForTest());

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
  afterEach(() => resetMenuBackendForTest());

  it('installs a custom backend and reverts to the sentinel on null', () => {
    const backend = fakeBackend();
    setMenuBackend(backend);
    expect(getMenuBackend()).toBe(backend);
    setMenuBackend(null);
    expect(getMenuBackend()).not.toBe(backend);
  });

  it('destroys the outgoing backend while it is still the active backend', () => {
    const order: string[] = [];
    const first = fakeBackend({
      destroy() {
        order.push('destroy');
        order.push(`sees-self:${getMenuBackend() === first}`);
      },
    });
    const second = fakeBackend();
    setMenuBackend(first);
    setMenuBackend(second);
    expect(order).toEqual(['destroy', 'sees-self:true']);
    expect(getMenuBackend()).toBe(second);
  });

  it('does not install replacement when outgoing destroy throws', () => {
    let shouldThrow = true;
    const first = fakeBackend({
      destroy() {
        if (shouldThrow) throw new Error('teardown failed');
      },
    });
    const second = fakeBackend();
    setMenuBackend(first);
    expect(() => setMenuBackend(second)).toThrow('teardown failed');
    expect(getMenuBackend()).toBe(first);
    shouldThrow = false;
  });

  it('does not destroy a backend that is being re-assigned to the same slot', () => {
    let destroyCalls = 0;
    const backend = fakeBackend({ destroy: () => destroyCalls++ });
    setMenuBackend(backend);
    setMenuBackend(backend);
    expect(destroyCalls).toBe(0);
  });

  it('is safe to call destroy twice (idempotent)', () => {
    let destroyCalls = 0;
    const backend = fakeBackend({ destroy: () => destroyCalls++ });
    setMenuBackend(backend);
    setMenuBackend(null);
    expect(destroyCalls).toBe(1);
    setMenuBackend(null);
    expect(destroyCalls).toBe(1);
  });

  it('destroys when clearing to null', () => {
    let destroyed = false;
    const backend = fakeBackend({ destroy: () => (destroyed = true) });
    setMenuBackend(backend);
    expect(destroyed).toBe(false);
    setMenuBackend(null);
    expect(destroyed).toBe(true);
  });

  it('does not destroy a backend that is still retained in the host slot', () => {
    let destroyCalls = 0;
    const shared = fakeBackend({ destroy: () => destroyCalls++ });
    installMenuHostBackend(shared);
    setMenuBackend(shared);
    setMenuBackend(null);
    expect(destroyCalls).toBe(0);
  });
});

describe('showContextMenu', () => {
  afterEach(() => resetMenuBackendForTest());

  it('resolves the id returned by the backend popup', async () => {
    setMenuBackend(fakeBackend({ popupContextMenu: () => Promise.resolve('copy') }));
    await expect(showContextMenu([], 0, 0)).resolves.toBe('copy');
  });

  // The rest of this block exercises the real web renderer through the default backend, in jsdom.
  describe('web renderer', () => {
    const menuItems: MenuItemTemplate[] = [
      { id: 'open', label: 'Open' },
      { id: 'disabled', label: 'Disabled', enabled: false },
      { type: 'separator' },
      { id: 'recent', label: 'Recent', submenu: [{ id: 'file1', label: 'File 1' }], type: 'submenu' },
      { id: 'quit', label: 'Quit' },
    ];

    beforeEach(() => {
      resetMenuBackendForTest();
      setMenuBackend(fakeBackend({ popupContextMenu: showWebContextMenu }));
      document.body.innerHTML = '';
    });

    function press(key: string): void {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }

    function renderedMenu(): HTMLUListElement {
      return document.body.querySelector('ul') as HTMLUListElement;
    }

    it('resolves with the clicked item id', async () => {
      const promise = showContextMenu(menuItems, 10, 10);
      renderedMenu().querySelector<HTMLElement>('li[data-item-id="quit"]')!.click();
      await expect(promise).resolves.toBe('quit');
    });

    it('resolves null when dismissed with Escape', async () => {
      const promise = showContextMenu(menuItems, 10, 10);
      press('Escape');
      await expect(promise).resolves.toBeNull();
    });

    it('removes its DOM once dismissed', async () => {
      const promise = showContextMenu(menuItems, 10, 10);
      expect(renderedMenu()).not.toBeNull();
      press('Escape');
      await promise;
      expect(renderedMenu()).toBeNull();
    });

    it('marks a disabled item unfocusable and gives it no click handler', async () => {
      const promise = showContextMenu(menuItems, 10, 10);
      const disabled = renderedMenu().querySelector<HTMLElement>('li[data-item-id="disabled"]')!;
      expect(disabled.getAttribute('data-enabled')).toBe('false');

      disabled.click();
      let settled = false;
      void promise.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);

      press('Escape');
      await promise;
    });

    // Arrow travel must visit only the rows of this menu level. A submenu is a nested <ul> inside its
    // parent <li>, so a descendant query also matched every collapsed submenu row — display:none
    // entries that stole a keypress and could be selected unseen. Third ArrowDown lands on 'quit'
    // (open → recent → quit); before the fix it landed on the hidden 'file1'.
    it('skips the rows of a collapsed submenu when arrowing through the menu', async () => {
      const promise = showContextMenu(menuItems, 10, 10);
      press('ArrowDown');
      press('ArrowDown');
      press('ArrowDown');
      press('Enter');
      await expect(promise).resolves.toBe('quit');
    });

    // With nothing focused, ArrowUp enters at the bottom of the menu. -1 is a sentinel rather than a
    // position, so running it through the wrap arithmetic used to land one row short of the end.
    it('enters at the last item when the first key is ArrowUp', async () => {
      const promise = showContextMenu(menuItems, 10, 10);
      press('ArrowUp');
      press('Enter');
      await expect(promise).resolves.toBe('quit');
    });

    it('omits an item marked visible: false', async () => {
      const promise = showContextMenu(
        [
          { id: 'shown', label: 'Shown' },
          { id: 'hidden', label: 'Hidden', visible: false },
        ],
        0,
        0,
      );
      const menu = renderedMenu();
      expect(menu.querySelector('li[data-item-id="hidden"]')).toBeNull();
      expect(menu.querySelector('li[data-item-id="shown"]')).not.toBeNull();
      press('Escape');
      await promise;
    });

    // A hidden item must not merely be styled away: if it were still in the DOM it would keep its
    // place in arrow travel, which is the bug `visible` exists to avoid.
    it('does not give a hidden item a place in arrow travel', async () => {
      const promise = showContextMenu(
        [
          { id: 'first', label: 'First' },
          { id: 'hidden', label: 'Hidden', visible: false },
          { id: 'last', label: 'Last' },
        ],
        0,
        0,
      );
      press('ArrowDown');
      press('ArrowDown');
      press('Enter');
      await expect(promise).resolves.toBe('last');
    });

    it('renders a tooltip and a sublabel when supplied', async () => {
      const promise = showContextMenu(
        [{ id: 'save', label: 'Save', sublabel: 'All files', toolTip: 'Save now' }],
        0,
        0,
      );
      const li = renderedMenu().querySelector<HTMLElement>('li[data-item-id="save"]')!;
      expect(li.title).toBe('Save now');
      expect(li.textContent).toContain('All files');
      press('Escape');
      await promise;
    });

    it('draws a radio dot and a checkbox tick from the item type', async () => {
      const promise = showContextMenu(
        [
          { id: 'r', label: 'Radio', type: 'radio', checked: true },
          { id: 'c', label: 'Check', type: 'checkbox', checked: true },
        ],
        0,
        0,
      );
      const menu = renderedMenu();
      expect(menu.querySelector<HTMLElement>('li[data-item-id="r"]')!.textContent).toContain('●');
      expect(menu.querySelector<HTMLElement>('li[data-item-id="c"]')!.textContent).toContain('✓');
      press('Escape');
      await promise;
    });

    it('resolves null when the backdrop is clicked', async () => {
      const promise = showContextMenu(menuItems, 10, 10);
      const overlay = document.body.querySelector<HTMLElement>('div')!;
      overlay.click();
      await expect(promise).resolves.toBeNull();
    });
  });
});

describe('showWebContextMenu', () => {
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
    const promise = showWebContextMenu(
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
    const selected = showWebContextMenu([{ id: 'copy', label: 'Copy' }], 0, 0);
    getRootMenu().querySelector<HTMLElement>('li')!.click();
    await expect(selected).resolves.toBe('copy');
    expect(document.body.querySelector('ul')).toBeNull();

    const dismissed = showWebContextMenu([{ id: 'paste', label: 'Paste' }], 0, 0);
    getOverlay().click();
    await expect(dismissed).resolves.toBeNull();
  });

  it('wraps keyboard focus and selects with Enter or Space', async () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'disabled', label: 'Disabled', enabled: false },
      { id: 'last', label: 'Last' },
    ];

    const enterSelection = showWebContextMenu(items, 0, 0);
    press('ArrowUp');
    expect(getRootMenu().querySelector('[data-focused="true"]')?.getAttribute('data-item-id')).toBe('last');
    press('Enter');
    await expect(enterSelection).resolves.toBe('last');

    const spaceSelection = showWebContextMenu(items, 0, 0);
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(getRootMenu().querySelector('[data-focused="true"]')?.getAttribute('data-item-id')).toBe('first');
    press(' ');
    await expect(spaceSelection).resolves.toBe('first');
  });

  it('dismisses on Escape', async () => {
    const promise = showWebContextMenu([{ id: 'copy', label: 'Copy' }], 0, 0);
    press('Escape');
    await expect(promise).resolves.toBeNull();
  });

  it('opens a submenu on hover and resolves a child selection', async () => {
    const promise = showWebContextMenu(
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
    const promise = showWebContextMenu([{ id: 'copy', label: 'Copy' }], 40, 30);
    expect(getRootMenu().style.left).toBe('0px');
    expect(getRootMenu().style.top).toBe('0px');
    getOverlay().click();
    await promise;
  });
});

describe('validateMenuItemTemplate', () => {
  it('returns null for a well-formed item', () => {
    expect(validateMenuItemTemplate(createMenuItemTemplate({ id: 'ok', label: 'Ok' }))).toBeNull();
  });

  it('rejects checked state on an item that is not a checkbox or radio', () => {
    expect(validateMenuItemTemplate({ id: 'copy', label: 'Copy', type: 'normal', checked: true })).toContain('checked');
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

  it('accepts checked on a checkbox item', () => {
    expect(validateMenuItemTemplate({ id: 'wrap', label: 'Wrap', type: 'checkbox', checked: true })).toBeNull();
  });

  it('accepts checked on a radio item', () => {
    expect(validateMenuItemTemplate({ id: 'left', label: 'Left', type: 'radio', checked: false })).toBeNull();
  });

  // The web backend draws its tick from `checked` alone, so a normal item carrying it renders a mark
  // nothing can clear, while native backends tend to drop it — one descriptor, two wrong results.
  it('rejects checked on a normal item', () => {
    expect(validateMenuItemTemplate({ id: 'copy', label: 'Copy', checked: true })).not.toBeNull();
  });

  it('rejects checked on a submenu item', () => {
    expect(
      validateMenuItemTemplate({ id: 'more', label: 'More', type: 'submenu', checked: true, submenu: [{ id: 'a' }] }),
    ).not.toBeNull();
  });

  // checked: false is still a claim about checkability, so it is rejected on a non-toggle item too —
  // otherwise the rule would only catch half the mistake.
  it('rejects checked: false on a normal item', () => {
    expect(validateMenuItemTemplate({ id: 'copy', label: 'Copy', checked: false })).not.toBeNull();
  });

  it('rejects two checked radios in the same group', () => {
    const parent = createMenuItemTemplate({
      id: 'align',
      type: 'submenu',
      submenu: [
        { id: 'left', label: 'Left', type: 'radio', checked: true },
        { id: 'right', label: 'Right', type: 'radio', checked: true },
      ],
    });
    expect(validateMenuItemTemplate(parent)).toContain('radio group');
  });

  it('accepts one checked radio in a group', () => {
    const parent = createMenuItemTemplate({
      id: 'align',
      type: 'submenu',
      submenu: [
        { id: 'left', label: 'Left', type: 'radio', checked: true },
        { id: 'right', label: 'Right', type: 'radio', checked: false },
      ],
    });
    expect(validateMenuItemTemplate(parent)).toBeNull();
  });

  // A separator ends the run, so the two checked radios below belong to different groups and are both
  // legitimate — the rule is about adjacency, not about the whole child list.
  it('accepts a checked radio in each of two groups split by a separator', () => {
    const parent = createMenuItemTemplate({
      id: 'view',
      type: 'submenu',
      submenu: [
        { id: 'left', label: 'Left', type: 'radio', checked: true },
        { type: 'separator' },
        { id: 'small', label: 'Small', type: 'radio', checked: true },
      ],
    });
    expect(validateMenuItemTemplate(parent)).toBeNull();
  });

  it('reports the offending child of a submenu', () => {
    const parent = createMenuItemTemplate({
      id: 'view',
      type: 'submenu',
      submenu: [{ id: 'zoom', label: 'Zoom', checked: true }],
    });
    expect(validateMenuItemTemplate(parent)).toContain('checked');
  });
});
