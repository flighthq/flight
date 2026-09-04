import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { AccessibilityNode } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebAccessibilityBackend,
  initializeWebAccessibilityBackend,
  webAccessibilityBackend,
} from './webAccessibility';
import { webHost } from './webHost';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('createWebAccessibilityBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createWebAccessibilityBackend()).toBe(true);
  });

  it('returns exact no-dom outcomes when a document is unavailable', () => {
    vi.stubGlobal('document', undefined);
    const provider = createWebAccessibilityBackend();

    expect(provider.announce('saved', 'polite')).toEqual({ reason: 'no-dom' });
    expect(provider.clear()).toEqual({ reason: 'no-dom' });
    expect(provider.removeNode('missing')).toEqual({ reason: 'no-dom' });
    expect(provider.setFocus('missing')).toEqual({ reason: 'no-dom' });
    expect(provider.setNode(node('subject', 'button'))).toEqual({ reason: 'no-dom' });
  });

  it('reflects node data, updates in place, and follows parent identity', () => {
    const container = document.createElement('div');
    const provider = createWebAccessibilityBackend(container);

    expect(provider.setNode(node('first', 'group'))).toEqual({ reason: 'ok' });
    expect(provider.setNode(node('second', 'group'))).toEqual({ reason: 'ok' });
    expect(
      provider.setNode(
        node('subject', 'slider', {
          description: 'Playback position',
          label: 'Position',
          parentId: 'first',
          states: { disabled: true, valueMax: 100, valueMin: 0, valueNow: 42 },
          value: '42%',
        }),
      ),
    ).toEqual({ reason: 'ok' });

    const subject = container.querySelector<HTMLElement>('[data-flight-accessibility-id="subject"]');
    expect(subject?.getAttribute('role')).toBe('slider');
    expect(subject?.getAttribute('aria-label')).toBe('Position');
    expect(subject?.getAttribute('aria-description')).toBe('Playback position');
    expect(subject?.getAttribute('title')).toBe('Playback position');
    expect(subject?.getAttribute('aria-valuetext')).toBe('42%');
    expect(subject?.getAttribute('aria-disabled')).toBe('true');
    expect(subject?.getAttribute('aria-valuemin')).toBe('0');
    expect(subject?.getAttribute('aria-valuemax')).toBe('100');
    expect(subject?.getAttribute('aria-valuenow')).toBe('42');
    expect(subject?.textContent).toBe('42%');
    expect(subject?.parentElement?.getAttribute('data-flight-accessibility-id')).toBe('first');

    expect(provider.setNode(node('subject', 'button', { parentId: 'second' }))).toEqual({ reason: 'ok' });
    const matches = container.querySelectorAll('[data-flight-accessibility-id="subject"]');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.getAttribute('role')).toBe('button');
    expect(matches[0]?.hasAttribute('aria-label')).toBe(false);
    expect(matches[0]?.hasAttribute('aria-disabled')).toBe(false);
    expect(matches[0]?.textContent).toBe('');
    expect(matches[0]?.parentElement?.getAttribute('data-flight-accessibility-id')).toBe('second');
  });

  it('removes a node subtree and reports a missing identity', () => {
    const container = document.createElement('div');
    const provider = createWebAccessibilityBackend(container);
    provider.setNode(node('parent', 'group'));
    provider.setNode(node('child', 'button', { parentId: 'parent' }));

    expect(provider.removeNode('parent')).toEqual({ reason: 'ok' });
    expect(container.querySelector('[data-flight-accessibility-id="parent"]')).toBeNull();
    expect(container.querySelector('[data-flight-accessibility-id="child"]')).toBeNull();
    expect(provider.removeNode('child')).toEqual({ reason: 'node-not-found' });

    provider.setNode(node('child', 'button', { parentId: 'parent' }));
    expect(container.querySelector('[data-flight-accessibility-id="child"]')?.parentElement).toBe(container);
  });

  it('focuses a connected node and distinguishes missing and unmoved focus', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const provider = createWebAccessibilityBackend(container);
    provider.setNode(node('field', 'textbox'));

    expect(provider.setFocus('field')).toEqual({ reason: 'ok' });
    expect(document.activeElement).toBe(container.querySelector('[data-flight-accessibility-id="field"]'));
    expect(provider.setFocus('missing')).toEqual({ reason: 'node-not-found' });

    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => undefined);
    provider.setNode(node('other', 'button'));
    expect(provider.setFocus('other')).toEqual({ reason: 'focus-not-moved' });
  });

  it('writes polite and assertive announcements into stable live regions', () => {
    const container = document.createElement('div');
    const provider = createWebAccessibilityBackend(container);

    expect(provider.announce('saved', 'polite')).toEqual({ reason: 'ok' });
    expect(provider.announce('warning', 'assertive')).toEqual({ reason: 'ok' });
    expect(provider.announce('saved again', 'polite')).toEqual({ reason: 'ok' });

    const polite = container.querySelectorAll('[data-flight-accessibility-live="polite"]');
    const assertive = container.querySelector('[data-flight-accessibility-live="assertive"]');
    expect(polite).toHaveLength(1);
    expect(polite[0]?.getAttribute('aria-live')).toBe('polite');
    expect(polite[0]?.getAttribute('aria-atomic')).toBe('true');
    expect(polite[0]?.textContent).toBe('saved again');
    expect(assertive?.textContent).toBe('warning');
  });

  it('clears only tracked DOM from a borrowed root and can be reused', () => {
    const container = document.createElement('div');
    const foreignNode = document.createElement('span');
    foreignNode.setAttribute('data-flight-accessibility-id', 'caller');
    const foreignRegion = document.createElement('span');
    foreignRegion.setAttribute('data-flight-accessibility-live', 'polite');
    container.append(foreignNode, foreignRegion);
    const provider = createWebAccessibilityBackend(container);
    provider.setNode(node('owned', 'button'));
    provider.announce('owned', 'assertive');

    expect(provider.clear()).toEqual({ reason: 'ok' });
    expect([...container.children]).toEqual([foreignNode, foreignRegion]);

    provider.setNode(node('owned-again', 'button'));
    provider.announce('owned again', 'assertive');
    expect(provider.clear()).toEqual({ reason: 'ok' });
    expect([...container.children]).toEqual([foreignNode, foreignRegion]);
  });

  it('removes an owned root exactly once and cannot resurrect after destroy', () => {
    const provider = createWebAccessibilityBackend();
    provider.setNode(node('subject', 'button'));
    provider.announce('saved', 'polite');
    expect(document.querySelectorAll('[data-flight-accessibility]')).toHaveLength(1);

    provider.destroy();
    provider.destroy();
    expect(document.querySelectorAll('[data-flight-accessibility]')).toHaveLength(0);
    expect(provider.announce('later', 'polite')).toEqual({ reason: 'destroyed' });
    expect(provider.clear()).toEqual({ reason: 'destroyed' });
    expect(provider.removeNode('subject')).toEqual({ reason: 'destroyed' });
    expect(provider.setFocus('subject')).toEqual({ reason: 'destroyed' });
    expect(provider.setNode(node('later', 'button'))).toEqual({ reason: 'destroyed' });
    expect(document.querySelectorAll('[data-flight-accessibility]')).toHaveLength(0);
  });

  it('preserves a borrowed root and every untracked child on destroy', () => {
    const container = document.createElement('div');
    const before = document.createElement('span');
    const after = document.createElement('span');
    container.appendChild(before);
    document.body.appendChild(container);
    const provider = createWebAccessibilityBackend(container);
    provider.setNode(node('subject', 'button'));
    provider.announce('saved', 'polite');
    container.appendChild(after);

    provider.destroy();

    expect(container.isConnected).toBe(true);
    expect([...container.children]).toEqual([before, after]);
    expect(provider.setNode(node('later', 'button'))).toEqual({ reason: 'destroyed' });
  });

  it('keeps distinct explicit Host provider DOM and lifecycles isolated', () => {
    const firstRoot = document.createElement('div');
    const secondRoot = document.createElement('div');
    document.body.append(firstRoot, secondRoot);
    const firstHost = { accessibility: { provider: createWebAccessibilityBackend(firstRoot) } };
    const secondHost = { accessibility: { provider: createWebAccessibilityBackend(secondRoot) } };

    firstHost.accessibility.provider.setNode(node('subject', 'button', { label: 'First' }));
    secondHost.accessibility.provider.setNode(node('subject', 'button', { label: 'Second' }));
    firstHost.accessibility.provider.destroy();

    expect(firstRoot.querySelector('[data-flight-accessibility-id]')).toBeNull();
    expect(secondRoot.querySelector('[data-flight-accessibility-id]')?.getAttribute('aria-label')).toBe('Second');
    expect(firstHost.accessibility.provider.setNode(node('later', 'button'))).toEqual({ reason: 'destroyed' });
    expect(secondHost.accessibility.provider.setNode(node('later', 'button'))).toEqual({ reason: 'ok' });

    secondHost.accessibility.provider.destroy();
    secondHost.accessibility.provider.destroy();
    expect(secondRoot.querySelector('[data-flight-accessibility-id]')).toBeNull();
  });
});

describe('initializeWebAccessibilityBackend', () => {
  it('is the construction initializer of createWebAccessibilityBackend', () => {
    expect(typeof initializeWebAccessibilityBackend).toBe('function');
  });
});

function node(
  id: string,
  role: AccessibilityNode['role'],
  extras: Omit<AccessibilityNode, 'id' | 'role'> = {},
): AccessibilityNode {
  return { id, role, ...extras };
}
describe('webAccessibilityBackend', () => {
  it('is the stable Entity provider published by webHost', () => {
    expect(EntityRuntimeKey in webAccessibilityBackend).toBe(true);
    expect(webHost.accessibility.provider).toBe(webAccessibilityBackend);
  });
});
