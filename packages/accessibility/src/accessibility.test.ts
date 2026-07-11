import type { AccessibilityBackend, AccessibilityLiveness, AccessibilityNode } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  announceAccessibility,
  clearAccessibilityTree,
  createWebAccessibilityBackend,
  getAccessibilityBackend,
  removeAccessibilityNode,
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

describe('removeAccessibilityNode', () => {
  it('dispatches the id to the backend', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    removeAccessibilityNode('gone');
    expect(mock.calls.removeNode).toEqual(['gone']);
  });
});

describe('setAccessibilityBackend', () => {
  it('installs a backend that later commands dispatch through', () => {
    const mock = createMockAccessibilityBackend();
    setAccessibilityBackend(mock.backend);
    setAccessibilityNode(node('a', 'button', {}));
    expect(mock.calls.setNode.length).toBe(1);
  });

  it('restores a fresh, distinct web default when passed null', () => {
    const original = getAccessibilityBackend();
    setAccessibilityBackend(null);
    const restored = getAccessibilityBackend();
    expect(restored).not.toBe(original);
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
