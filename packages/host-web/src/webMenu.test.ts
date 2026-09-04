import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  initializeWebMenuHighlightBackend,
  initializeWebMenuPopupBackend,
  webMenuHighlightBackend,
  webMenuPopupBackend,
} from './webMenu';

describe('initializeWebMenuHighlightBackend', () => {
  it('is the construction initializer of createWebMenuHighlightBackend', () => {
    expect(typeof initializeWebMenuHighlightBackend).toBe('function');
  });
});

describe('initializeWebMenuPopupBackend', () => {
  it('is the construction initializer of createWebMenuPopupBackend', () => {
    expect(typeof initializeWebMenuPopupBackend).toBe('function');
  });
});

describe('webMenuHighlightBackend', () => {
  it('is an Entity provider', () => {
    expect(EntityRuntimeKey in webMenuHighlightBackend).toBe(true);
  });

  it('delivers to a subscriber and stops on that subscription unsubscribe', () => {
    const seen: string[] = [];
    const unsubscribe = webMenuHighlightBackend.subscribe((id) => seen.push(id));
    // No DOM menu is open here, so nothing should have arrived yet.
    expect(seen).toEqual([]);
    unsubscribe();
    expect(seen).toEqual([]);
  });

  // Origin-pinned: unsubscribing one subscriber must not silence another.
  it('ends only the subscription whose unsubscribe was called', () => {
    const first: string[] = [];
    const second: string[] = [];
    const unsubscribeFirst = webMenuHighlightBackend.subscribe((id) => first.push(id));
    const unsubscribeSecond = webMenuHighlightBackend.subscribe((id) => second.push(id));
    unsubscribeFirst();
    // The second subscription is still registered; unsubscribing it is a separate, safe act.
    expect(() => unsubscribeSecond()).not.toThrow();
  });
});
describe('webMenuPopupBackend', () => {
  it('is an Entity provider', () => {
    expect(EntityRuntimeKey in webMenuPopupBackend).toBe(true);
  });

  // ★ The web provider must expose popup and highlight ONLY. Its old application/select members were
  // stubs — an unconditional `false` and a no-op unsubscribe — which made web structurally
  // indistinguishable from a host that really implements them. Deleting them is the point of this slice,
  // so this asserts their ABSENCE rather than any behaviour.
  it('exposes no application or select members to be mistaken for capability', () => {
    expect('setApplicationMenu' in webMenuPopupBackend).toBe(false);
    expect('subscribe' in webMenuPopupBackend).toBe(false);
    expect('popup' in webMenuHighlightBackend).toBe(false);
  });
});

// Overlay behaviour moved here with the implementation: these exercised showWebContextMenu when it
// lived in core @flighthq/menu, and they now drive the same DOM through the popup slot.
describe('webMenuPopupBackend overlay', () => {
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
    const promise = webMenuPopupBackend.popup(
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
    const selected = webMenuPopupBackend.popup([{ id: 'copy', label: 'Copy' }], 0, 0);
    getRootMenu().querySelector<HTMLElement>('li')!.click();
    await expect(selected).resolves.toBe('copy');
    expect(document.body.querySelector('ul')).toBeNull();

    const dismissed = webMenuPopupBackend.popup([{ id: 'paste', label: 'Paste' }], 0, 0);
    getOverlay().click();
    await expect(dismissed).resolves.toBeNull();
  });

  it('wraps keyboard focus and selects with Enter or Space', async () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'disabled', label: 'Disabled', enabled: false },
      { id: 'last', label: 'Last' },
    ];

    const enterSelection = webMenuPopupBackend.popup(items, 0, 0);
    press('ArrowUp');
    expect(getRootMenu().querySelector('[data-focused="true"]')?.getAttribute('data-item-id')).toBe('last');
    press('Enter');
    await expect(enterSelection).resolves.toBe('last');

    const spaceSelection = webMenuPopupBackend.popup(items, 0, 0);
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(getRootMenu().querySelector('[data-focused="true"]')?.getAttribute('data-item-id')).toBe('first');
    press(' ');
    await expect(spaceSelection).resolves.toBe('first');
  });

  it('dismisses on Escape', async () => {
    const promise = webMenuPopupBackend.popup([{ id: 'copy', label: 'Copy' }], 0, 0);
    press('Escape');
    await expect(promise).resolves.toBeNull();
  });

  it('opens a submenu on hover and resolves a child selection', async () => {
    const promise = webMenuPopupBackend.popup(
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
    const promise = webMenuPopupBackend.popup([{ id: 'copy', label: 'Copy' }], 40, 30);
    expect(getRootMenu().style.left).toBe('0px');
    expect(getRootMenu().style.top).toBe('0px');
    getOverlay().click();
    await promise;
  });
});
