import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type {
  EntityWithoutRuntime,
  HasMenuApplication,
  HasMenuHighlight,
  HasMenuPopup,
  HasMenuSelect,
  MenuApplicationBackend,
  MenuHighlightBackend,
  MenuItemTemplate,
  MenuPopupBackend,
  MenuSelectBackend,
} from '@flighthq/types/contract';

import {
  attachMenuHighlight,
  attachMenuSelect,
  cloneMenuTemplate,
  createMenuHighlight,
  createMenuItemTemplate,
  createMenuSelect,
  destroyMenuApplication,
  detachMenuHighlight,
  detachMenuSelect,
  disposeMenuHighlight,
  disposeMenuSelect,
  enableMenuSignals,
  getMenuSignals,
  setApplicationMenu,
  showContextMenu,
  validateMenuItemTemplate,
} from './menu';

// A host exposing exactly the slots a test needs. Nothing is installed anywhere: two of these can be
// live at once, which is the property the ambient model could not express.
function popupHost(result: string | null, calls: string[] = []): HasMenuPopup & { calls: string[] } {
  return {
    calls,
    menu: {
      popup: (() => {
        const out = allocateEntity<EntityWithoutRuntime<MenuPopupBackend>>();
        out.popup = (_items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null> => {
          calls.push(`popup@${x},${y}`);
          return Promise.resolve(result);
        };
        return finishEntity(out);
      })(),
    },
  };
}

function applicationHost(accepted: boolean, seen: MenuItemTemplate[][] = []): HasMenuApplication {
  return {
    menu: {
      application: (() => {
        const out = allocateEntity<EntityWithoutRuntime<MenuApplicationBackend>>();
        out.setApplicationMenu = (items: readonly MenuItemTemplate[]): boolean => {
          seen.push([...items]);
          return accepted;
        };
        return finishEntity(out);
      })(),
    },
  };
}

function selectHost(): HasMenuSelect & { emit(id: string): void; subscriberCount(): number } {
  const listeners = new Set<(id: string) => void>();
  return {
    emit(id: string): void {
      for (const listener of listeners) listener(id);
    },
    menu: {
      select: (() => {
        const out = allocateEntity<EntityWithoutRuntime<MenuSelectBackend>>();
        out.subscribe = (listener: (id: string) => void): (() => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        };
        return finishEntity(out);
      })(),
    },
    subscriberCount(): number {
      return listeners.size;
    },
  };
}

function highlightHost(): HasMenuHighlight & { emit(id: string): void } {
  const listeners = new Set<(id: string) => void>();
  return {
    emit(id: string): void {
      for (const listener of listeners) listener(id);
    },
    menu: {
      highlight: (() => {
        const out = allocateEntity<EntityWithoutRuntime<MenuHighlightBackend>>();
        out.subscribe = (listener: (id: string) => void): (() => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        };
        return finishEntity(out);
      })(),
    },
  };
}

describe('attachMenuHighlight', () => {
  it('delivers highlight ids into the entity signal', () => {
    const host = highlightHost();
    const highlight = createMenuHighlight();
    const seen: string[] = [];
    connectSignal(highlight.onMenuItemHighlight, (id) => seen.push(id));
    attachMenuHighlight(host, highlight);
    host.emit('open');
    expect(seen).toEqual(['open']);
  });
});

describe('attachMenuSelect', () => {
  // ★ FALSIFIER 3, first half — the select event fires while attached.
  it('delivers selections into the entity signal', () => {
    const host = selectHost();
    const select = createMenuSelect();
    const seen: string[] = [];
    connectSignal(select.onMenuItemSelect, (id) => seen.push(id));
    attachMenuSelect(host, select);
    host.emit('save');
    expect(seen).toEqual(['save']);
  });

  // Re-attaching must not leave the first subscription live, or one emit would arrive twice.
  it('replaces its own subscription rather than stacking them', () => {
    const host = selectHost();
    const select = createMenuSelect();
    const seen: string[] = [];
    connectSignal(select.onMenuItemSelect, (id) => seen.push(id));
    attachMenuSelect(host, select);
    attachMenuSelect(host, select);
    expect(host.subscriberCount()).toBe(1);
    host.emit('save');
    expect(seen).toEqual(['save']);
  });
});

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

describe('createMenuHighlight', () => {
  it('allocates an inert entity that delivers nothing until attached', () => {
    const highlight = createMenuHighlight();
    const seen: string[] = [];
    connectSignal(highlight.onMenuItemHighlight, (id) => seen.push(id));
    highlightHost().emit('never');
    expect(seen).toEqual([]);
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

describe('createMenuSelect', () => {
  it('allocates an inert entity that delivers nothing until attached', () => {
    const select = createMenuSelect();
    const seen: string[] = [];
    connectSignal(select.onMenuItemSelect, (id) => seen.push(id));
    selectHost().emit('never');
    expect(seen).toEqual([]);
  });
});

describe('destroyMenuApplication', () => {
  function applicationHostWith(provider: EntityWithoutRuntime<MenuApplicationBackend>): HasMenuApplication {
    return {
      menu: {
        application: (() => {
          const out = allocateEntity<any>();
          Object.assign(out, provider);
          return finishEntity(out);
        })(),
      },
    };
  }

  it('destroys each distinct provider exactly once, even when hosts alias one', () => {
    let destroyed = 0;
    const shared = { destroy: () => destroyed++, setApplicationMenu: () => true };
    // ★ ALIAS SAFETY: two hosts, ONE provider object. Destroying it twice would clear a successor's menu.
    destroyMenuApplication(applicationHostWith(shared), applicationHostWith(shared));
    expect(destroyed).toBe(1);
  });

  it('never destroys an already-released provider a second time', () => {
    let destroyed = 0;
    const provider = { destroy: () => destroyed++, setApplicationMenu: () => true };
    destroyMenuApplication(applicationHostWith(provider));
    destroyMenuApplication(applicationHostWith(provider));
    expect(destroyed).toBe(1);
  });

  // ★ ATTEMPT-ALL then rethrow: a throwing obligation must not strand its siblings.
  it('attempts every provider and rethrows the first error after the siblings run', () => {
    let secondDestroyed = false;
    const failing = {
      destroy: () => {
        throw new Error('first failed');
      },
      setApplicationMenu: () => true,
    };
    const healthy = { destroy: () => (secondDestroyed = true), setApplicationMenu: () => true };
    expect(() => destroyMenuApplication(applicationHostWith(failing), applicationHostWith(healthy))).toThrow(
      'first failed',
    );
    expect(secondDestroyed).toBe(true);
  });

  // ★ RETRY ONLY THE FAILURES: the thrower stays retained, the successes do not.
  it('retries a failed obligation and leaves the succeeded one released', () => {
    let attempts = 0;
    let healthyDestroyed = 0;
    const flaky = {
      destroy: () => {
        attempts++;
        if (attempts === 1) throw new Error('transient');
      },
      setApplicationMenu: () => true,
    };
    const healthy = { destroy: () => healthyDestroyed++, setApplicationMenu: () => true };
    expect(() => destroyMenuApplication(applicationHostWith(flaky), applicationHostWith(healthy))).toThrow();
    expect(() => destroyMenuApplication(applicationHostWith(flaky), applicationHostWith(healthy))).not.toThrow();
    expect(attempts).toBe(2);
    expect(healthyDestroyed).toBe(1);
  });

  it('tolerates a provider that declares no destroy', () => {
    expect(() => destroyMenuApplication(applicationHostWith({ setApplicationMenu: () => true }))).not.toThrow();
  });
});

describe('detachMenuHighlight', () => {
  it('is safe on an entity that was never attached', () => {
    expect(() => detachMenuHighlight(createMenuHighlight())).not.toThrow();
  });
});

describe('detachMenuSelect', () => {
  // ★ FALSIFIER 3, second half — after unsubscribe the event must NOT fire.
  it('stops delivery and releases the provider subscription', () => {
    const host = selectHost();
    const select = createMenuSelect();
    const seen: string[] = [];
    connectSignal(select.onMenuItemSelect, (id) => seen.push(id));
    attachMenuSelect(host, select);
    host.emit('first');
    detachMenuSelect(select);
    host.emit('second');
    expect(seen).toEqual(['first']);
    expect(host.subscriberCount()).toBe(0);
  });

  // ★ ORIGIN-PINNED: detaching one entity must not end another entity's subscription, even on one host.
  it('ends only its own subscription', () => {
    const host = selectHost();
    const kept = createMenuSelect();
    const dropped = createMenuSelect();
    const keptSeen: string[] = [];
    connectSignal(kept.onMenuItemSelect, (id) => keptSeen.push(id));
    attachMenuSelect(host, kept);
    attachMenuSelect(host, dropped);
    detachMenuSelect(dropped);
    host.emit('still-here');
    expect(keptSeen).toEqual(['still-here']);
  });
});

describe('disposeMenuHighlight', () => {
  // Same contract as disposeMenuSelect: detach the provider subscription AND clear the entity's own
  // listeners, so a leak in either path is visible here.
  it('detaches and clears listeners', () => {
    const host = highlightHost();
    const highlight = createMenuHighlight();
    const seen: string[] = [];
    connectSignal(highlight.onMenuItemHighlight, (id) => seen.push(id));
    attachMenuHighlight(host, highlight);
    disposeMenuHighlight(highlight);
    host.emit('after-dispose');
    expect(seen).toEqual([]);
  });
});

describe('disposeMenuSelect', () => {
  // The signal path is proven INDEPENDENTLY of the subscription path: after dispose, both the provider
  // subscription and the entity's listeners are gone, so a leak in either one is visible here.
  it('detaches and clears listeners', () => {
    const host = selectHost();
    const select = createMenuSelect();
    const seen: string[] = [];
    connectSignal(select.onMenuItemSelect, (id) => seen.push(id));
    attachMenuSelect(host, select);
    disposeMenuSelect(select);
    host.emit('after-dispose');
    expect(seen).toEqual([]);
    expect(host.subscriberCount()).toBe(0);
  });
});

describe('enableMenuSignals', () => {
  it('returns the same group on repeated calls', () => {
    expect(enableMenuSignals()).toBe(enableMenuSignals());
  });
});

describe('getMenuSignals', () => {
  it('returns the enabled group', () => {
    const signals = enableMenuSignals();
    expect(getMenuSignals()).toBe(signals);
  });
});

describe('setApplicationMenu', () => {
  // ★ FALSIFIER 2 — assert the RETURN VALUE and the DELIVERED ITEMS, never mere operation presence.
  // A structural "does it have setApplicationMenu" probe passed on the old web stub, which answered
  // false unconditionally; only the delivered items distinguish a real install.
  it('reports the provider result and delivers the items', () => {
    const seen: MenuItemTemplate[][] = [];
    const items = [{ id: 'quit', label: 'Quit' }];
    expect(setApplicationMenu(applicationHost(true, seen), items)).toBe(true);
    expect(seen).toEqual([items]);
  });

  it('reports a refused install as false', () => {
    expect(setApplicationMenu(applicationHost(false), [{ id: 'quit', label: 'Quit' }])).toBe(false);
  });
});

describe('showContextMenu', () => {
  // ★ FALSIFIER 1 — two hosts live at once, each serving its own popup. Under the ambient model there
  // was exactly one answer per process, so this assertion could not be written at all.
  it('routes each call to the host it was given', async () => {
    const first = popupHost('from-first');
    const second = popupHost('from-second');
    await expect(showContextMenu(first, [], 1, 2)).resolves.toBe('from-first');
    await expect(showContextMenu(second, [], 3, 4)).resolves.toBe('from-second');
    expect(first.calls).toEqual(['popup@1,2']);
    expect(second.calls).toEqual(['popup@3,4']);
  });

  it('emits the core open/close dispatcher signals around the call', async () => {
    const signals = enableMenuSignals();
    const order: string[] = [];
    connectSignal(signals.onContextMenuOpen, () => order.push('open'));
    connectSignal(signals.onContextMenuClose, () => order.push('close'));
    await showContextMenu(popupHost('x'), [], 0, 0);
    expect(order).toEqual(['open', 'close']);
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
