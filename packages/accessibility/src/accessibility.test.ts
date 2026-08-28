import type { AccessibilityBackend, AccessibilityLiveness, AccessibilityNode } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  announceAccessibility,
  clearAccessibilityTree,
  createWebAccessibilityBackend,
  destroyAccessibilityBackend,
  explainAccessibilityBackend,
  explainAccessibilityOperation,
  getAccessibilityBackend,
  hasAccessibilityOperation,
  installAccessibilityHostBackend,
  observeAccessibilityHostResult,
  removeAccessibilityNode,
  resetAccessibilityBackendForTest,
  setAccessibilityBackend,
  setAccessibilityFocus,
  setAccessibilityNode,
} from './accessibility';

afterEach(() => {
  setAccessibilityBackend(null);
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('announceAccessibility', () => {
  it('dispatches the message and liveness to the backend', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    announceAccessibility('saved', 'assertive');
    expect(mock.calls.announce).toEqual([['saved', 'assertive']]);
  });

  it('defaults liveness to polite', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    announceAccessibility('loading');
    expect(mock.calls.announce).toEqual([['loading', 'polite']]);
  });
});

describe('clearAccessibilityTree', () => {
  it('dispatches a clear to the backend', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    clearAccessibilityTree();
    expect(mock.calls.clear).toBe(1);
  });
});

describe('createWebAccessibilityBackend', () => {
  it('creates an element carrying role, aria-label, and mapped state attributes', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('play', 'button', { label: 'Play', states: { disabled: true, pressed: false } }));
    const element = container.querySelector('[data-flight-accessibility-id="play"]');
    expect(element).not.toBeNull();
    expect(element?.getAttribute('role')).toBe('button');
    expect(element?.getAttribute('aria-label')).toBe('Play');
    expect(element?.getAttribute('aria-disabled')).toBe('true');
    expect(element?.getAttribute('aria-pressed')).toBe('false');
  });

  it('maps description to aria-description and title, and value to text and aria-valuetext', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('vol', 'slider', { description: 'Volume level', value: '70%' }));
    const element = container.querySelector('[data-flight-accessibility-id="vol"]');
    expect(element?.getAttribute('aria-description')).toBe('Volume level');
    expect(element?.getAttribute('title')).toBe('Volume level');
    expect(element?.getAttribute('aria-valuetext')).toBe('70%');
    expect(element?.textContent).toBe('70%');
  });

  it('maps range and level numerics to their aria attributes', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('bar', 'progressbar', { states: { valueMin: 0, valueMax: 100, valueNow: 42, level: 2 } }));
    const element = container.querySelector('[data-flight-accessibility-id="bar"]');
    expect(element?.getAttribute('aria-valuemin')).toBe('0');
    expect(element?.getAttribute('aria-valuemax')).toBe('100');
    expect(element?.getAttribute('aria-valuenow')).toBe('42');
    expect(element?.getAttribute('aria-level')).toBe('2');
  });

  it('updates an existing node in place without duplicating the element', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('cb', 'checkbox', { label: 'Mute', states: { checked: false } }));
    backend.setNode(node('cb', 'checkbox', { label: 'Muted', states: { checked: true } }));
    const matches = container.querySelectorAll('[data-flight-accessibility-id="cb"]');
    expect(matches.length).toBe(1);
    expect(matches[0].getAttribute('aria-label')).toBe('Muted');
    expect(matches[0].getAttribute('aria-checked')).toBe('true');
  });

  it('clears an attribute when an updated node drops the field', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('cb', 'checkbox', { label: 'Mute', states: { checked: true } }));
    backend.setNode(node('cb', 'checkbox', {}));
    const element = container.querySelector('[data-flight-accessibility-id="cb"]');
    expect(element?.hasAttribute('aria-label')).toBe(false);
    expect(element?.hasAttribute('aria-checked')).toBe(false);
    expect(element?.textContent).toBe('');
  });

  it('nests a child element under its parentId element', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('menu', 'menu', { label: 'File' }));
    backend.setNode(node('item', 'menuitem', { label: 'Open', parentId: 'menu' }));
    const parent = container.querySelector('[data-flight-accessibility-id="menu"]');
    const child = container.querySelector('[data-flight-accessibility-id="item"]');
    expect(child?.parentElement).toBe(parent);
  });

  it('re-parents an element when parentId changes', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('a', 'group', {}));
    backend.setNode(node('b', 'group', {}));
    backend.setNode(node('leaf', 'button', { parentId: 'a' }));
    const child = () => container.querySelector('[data-flight-accessibility-id="leaf"]');
    expect(child()?.parentElement?.getAttribute('data-flight-accessibility-id')).toBe('a');
    backend.setNode(node('leaf', 'button', { parentId: 'b' }));
    expect(child()?.parentElement?.getAttribute('data-flight-accessibility-id')).toBe('b');
  });

  it('removes a node and its descendant subtree', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('menu', 'menu', {}));
    backend.setNode(node('item', 'menuitem', { parentId: 'menu' }));
    backend.removeNode('menu');
    expect(container.querySelector('[data-flight-accessibility-id="menu"]')).toBeNull();
    expect(container.querySelector('[data-flight-accessibility-id="item"]')).toBeNull();
    // The descendant id is dropped from tracking too, so re-adding it lands at the root.
    backend.setNode(node('item', 'menuitem', { parentId: 'menu' }));
    expect(container.querySelector('[data-flight-accessibility-id="item"]')?.parentElement).toBe(container);
  });

  it('focuses a node element and reports missing ids as false', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('field', 'textbox', { label: 'Name' }));
    expect(backend.setFocus('field')).toBe(true);
    const element = container.querySelector('[data-flight-accessibility-id="field"]');
    expect(document.activeElement).toBe(element);
    expect(backend.setFocus('missing')).toBe(false);
  });

  it('writes announcements into the polite and assertive live regions', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.announce('level complete', 'polite');
    backend.announce('warning', 'assertive');
    const polite = container.querySelector('[data-flight-accessibility-live="polite"]');
    const assertive = container.querySelector('[data-flight-accessibility-live="assertive"]');
    expect(polite?.getAttribute('aria-live')).toBe('polite');
    expect(polite?.textContent).toBe('level complete');
    expect(assertive?.getAttribute('aria-live')).toBe('assertive');
    expect(assertive?.textContent).toBe('warning');
  });

  it('empties the container on clear', () => {
    const container = document.createElement('div');
    const backend = createWebAccessibilityBackend(container);
    backend.setNode(node('a', 'button', {}));
    backend.announce('hi', 'polite');
    expect(container.childElementCount).toBeGreaterThan(0);
    backend.clear();
    expect(container.childElementCount).toBe(0);
  });

  it('defaults its container into document.body', () => {
    const backend = createWebAccessibilityBackend();
    backend.setNode(node('a', 'button', {}));
    expect(document.querySelector('[data-flight-accessibility-id="a"]')).not.toBeNull();
    expect(document.body.querySelector('[data-flight-accessibility]')).not.toBeNull();
  });

  it('is a sentinel no-op when no DOM is available', () => {
    vi.stubGlobal('document', undefined);
    const backend = createWebAccessibilityBackend();
    expect(() => backend.setNode(node('a', 'button', {}))).not.toThrow();
    expect(() => backend.removeNode('a')).not.toThrow();
    expect(() => backend.announce('hi', 'polite')).not.toThrow();
    expect(() => backend.clear()).not.toThrow();
    expect(backend.setFocus('a')).toBe(false);
  });
});

// Whole-backend teardown. What this frees is DOM the backend owns — the published element tree, the live
// regions, and the hidden overlay container it appended to document.body.
describe('destroyAccessibilityBackend', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  // ★ The correction `clear()` cannot make: clear empties the tree but LEAVES the container in the
  // document, so replacing a backend after clearing leaks one orphaned container per replacement.
  it('removes the overlay container it created, which clear does not', () => {
    const backend = createWebAccessibilityBackend();
    backend.setNode({ id: 'a', role: 'button', label: 'A', parentId: undefined });
    const containers = () => document.querySelectorAll('[data-flight-accessibility]').length;
    expect(containers()).toBe(1);

    backend.clear();
    expect(containers()).toBe(1);

    backend.destroy!();
    expect(containers()).toBe(0);
  });

  // ★ Ownership is decided at construction. A container handed in belongs to the caller and must survive.
  it('leaves a caller-supplied container in place', () => {
    const supplied = document.createElement('div');
    document.body.appendChild(supplied);
    const backend = createWebAccessibilityBackend(supplied);
    backend.setNode({ id: 'a', role: 'button', label: 'A', parentId: undefined });

    backend.destroy!();
    expect(supplied.isConnected).toBe(true);
    expect(supplied.children.length).toBe(0);
    supplied.remove();
  });

  it('destroys the installed backend exactly once and clears the slot', () => {
    const destroyed: string[] = [];
    setAccessibilityBackend({ ...inertBackend(), destroy: () => destroyed.push('only') });
    destroyAccessibilityBackend();
    destroyAccessibilityBackend();
    expect(destroyed).toEqual(['only']);
  });

  it('is safe with nothing installed', () => {
    resetAccessibilityBackendForTest();
    expect(() => destroyAccessibilityBackend()).not.toThrow();
  });
});

describe('explainAccessibilityBackend', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetAccessibilityBackendForTest();
    const explanation = explainAccessibilityBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setAccessibilityBackend(getAccessibilityBackend());
    expect(explainAccessibilityBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installAccessibilityHostBackend(getAccessibilityBackend());
    expect(explainAccessibilityBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installAccessibilityHostBackend({ ...getAccessibilityBackend() });
    installAccessibilityHostBackend({ ...getAccessibilityBackend() });
    expect(explainAccessibilityBackend().conflict).toBe(true);
  });
});

describe('explainAccessibilityOperation', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  // A required operation is the one the sentinel DOES answer, so this is where a query resolving through
  // getAccessibilityBackend() would report a lie.
  it('reports a required operation as unimplemented when only the sentinel serves it', () => {
    resetAccessibilityBackendForTest();
    expect(explainAccessibilityOperation('setNode')).toEqual({
      implemented: false,
      layer: 'sentinel',
      operation: 'setNode',
    });
  });

  it('reports only what an installed backend provides', () => {
    setAccessibilityBackend(inertBackend());
    expect(hasAccessibilityOperation('setNode')).toBe(true);
    expect(hasAccessibilityOperation('destroy')).toBe(false);
  });
});

describe('getAccessibilityBackend', () => {
  it('lazily returns a stable web default', () => {
    const first = getAccessibilityBackend();
    expect(first).toBe(getAccessibilityBackend());
  });

  it('returns the installed backend', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    expect(getAccessibilityBackend()).toBe(mock.backend);
  });
});

describe('hasAccessibilityOperation', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  it('agrees with explainAccessibilityOperation', () => {
    setAccessibilityBackend(inertBackend());
    for (const operation of ['setNode', 'clear', 'destroy'] as const) {
      expect(hasAccessibilityOperation(operation)).toBe(explainAccessibilityOperation(operation).implemented);
    }
  });
});

function node(
  id: string,
  role: AccessibilityNode['role'],
  rest: Readonly<Omit<AccessibilityNode, 'id' | 'role'>>,
): AccessibilityNode {
  return { id, role, ...rest };
}

interface MockAccessibilityCalls {
  setNode: AccessibilityNode[];
  removeNode: string[];
  clear: number;
  setFocus: string[];
  announce: (readonly [string, AccessibilityLiveness])[];
}

function createMockAccessibilityBackend(): { backend: AccessibilityBackend; calls: MockAccessibilityCalls } {
  const calls: MockAccessibilityCalls = { setNode: [], removeNode: [], clear: 0, setFocus: [], announce: [] };
  const backend: AccessibilityBackend = {
    setNode(target) {
      calls.setNode.push(target as AccessibilityNode);
    },
    removeNode(id) {
      calls.removeNode.push(id);
    },
    clear() {
      calls.clear += 1;
    },
    setFocus(id) {
      calls.setFocus.push(id);
      return id === 'ok';
    },
    announce(message, liveness) {
      calls.announce.push([message, liveness]);
    },
  };
  return { backend, calls };
}

describe('installAccessibilityHostBackend', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  it('installs a host backend that getAccessibilityBackend returns', () => {
    const backend = getAccessibilityBackend();
    installAccessibilityHostBackend(backend);
    expect(getAccessibilityBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = { ...getAccessibilityBackend() };
    const second = { ...getAccessibilityBackend() };
    installAccessibilityHostBackend(first);
    installAccessibilityHostBackend(second);
    expect(getAccessibilityBackend()).toBe(first);
    expect(explainAccessibilityBackend().conflict).toBe(true);
  });
});

describe('observeAccessibilityHostResult', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  it('records a successful observation', () => {
    installAccessibilityHostBackend(getAccessibilityBackend());
    observeAccessibilityHostResult('setNode', true);
    const explanation = explainAccessibilityBackend();
    expect(explanation.operation).toBe('setNode');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installAccessibilityHostBackend(getAccessibilityBackend());
    observeAccessibilityHostResult('setNode', false);
    expect(explainAccessibilityBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('removeAccessibilityNode', () => {
  it('dispatches the id to the backend', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    removeAccessibilityNode('gone');
    expect(mock.calls.removeNode).toEqual(['gone']);
  });
});

describe('resetAccessibilityBackendForTest', () => {
  it('clears all backend slots', () => {
    setAccessibilityBackend(getAccessibilityBackend());
    installAccessibilityHostBackend(getAccessibilityBackend());
    observeAccessibilityHostResult('setNode', true);
    resetAccessibilityBackendForTest();
    expect(explainAccessibilityBackend().layer).toBe('host-not-enabled');
    expect(explainAccessibilityBackend().conflict).toBe(false);
    expect(explainAccessibilityBackend().viability).toBe('unobserved');
  });
});

describe('setAccessibilityBackend', () => {
  it('installs a backend that later commands dispatch through', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    setAccessibilityNode(node('a', 'button', {}));
    expect(mock.calls.setNode.length).toBe(1);
  });

  it('reverts to the sentinel when passed null', () => {
    const sentinel = getAccessibilityBackend();
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    expect(getAccessibilityBackend()).toBe(mock.backend);
    setAccessibilityBackend(null);
    expect(getAccessibilityBackend()).toBe(sentinel);
  });
});

describe('setAccessibilityBackend replacement lifetime', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  it('destroys the outgoing backend when a new one replaces it', () => {
    const destroyed: string[] = [];
    setAccessibilityBackend({ ...inertBackend(), destroy: () => destroyed.push('first') });
    setAccessibilityBackend({ ...inertBackend(), destroy: () => destroyed.push('second') });
    expect(destroyed).toEqual(['first']);
  });

  it('destroys the outgoing backend when removed with null', () => {
    const destroyed: string[] = [];
    setAccessibilityBackend({ ...inertBackend(), destroy: () => destroyed.push('only') });
    setAccessibilityBackend(null);
    expect(destroyed).toEqual(['only']);
  });

  it('does not destroy when the same backend is installed again', () => {
    const destroyed: string[] = [];
    const only = { ...inertBackend(), destroy: () => destroyed.push('only') };
    setAccessibilityBackend(only);
    setAccessibilityBackend(only);
    expect(destroyed).toEqual([]);
  });
});

describe('setAccessibilityFocus', () => {
  it('dispatches the id and returns the backend result', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    expect(setAccessibilityFocus('ok')).toBe(true);
    expect(setAccessibilityFocus('nope')).toBe(false);
    expect(mock.calls.setFocus).toEqual(['ok', 'nope']);
  });
});

describe('setAccessibilityNode', () => {
  it('dispatches the node to the backend', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    const target = node('a', 'button', { label: 'Go' });
    setAccessibilityNode(target);
    expect(mock.calls.setNode).toEqual([target]);
  });
});

// A backend implementing only the required members — partial support declared by absence.
function inertBackend(): AccessibilityBackend {
  return {
    announce: () => undefined,
    clear: () => undefined,
    removeNode: () => undefined,
    setFocus: () => false,
    setNode: () => undefined,
  };
}
