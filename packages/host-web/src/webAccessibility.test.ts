import type { AccessibilityNode } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { webHostAccessibility } from './webAccessibility';
import { webHost } from './webHost';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  webHostAccessibility.clear();
});

describe('webHostAccessibility', () => {
  it('is the stable provider published by webHost', () => {
    expect(webHost.accessibility.tree).toBe(webHostAccessibility);
  });

  it('reflects node data, updates in place, and follows parent identity', () => {
    expect(webHostAccessibility.setNode(node('first', 'group'))).toEqual({ reason: 'ok' });
    expect(webHostAccessibility.setNode(node('second', 'group'))).toEqual({ reason: 'ok' });
    expect(
      webHostAccessibility.setNode(
        node('subject', 'slider', {
          description: 'Playback position',
          label: 'Position',
          parentId: 'first',
          states: { disabled: true, valueMax: 100, valueMin: 0, valueNow: 42 },
          value: '42%',
        }),
      ),
    ).toEqual({ reason: 'ok' });

    const subject = document.querySelector<HTMLElement>('[data-flight-accessibility-id="subject"]');
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

    expect(webHostAccessibility.setNode(node('subject', 'button', { parentId: 'second' }))).toEqual({ reason: 'ok' });
    const matches = document.querySelectorAll('[data-flight-accessibility-id="subject"]');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.getAttribute('role')).toBe('button');
    expect(matches[0]?.hasAttribute('aria-label')).toBe(false);
    expect(matches[0]?.hasAttribute('aria-disabled')).toBe(false);
    expect(matches[0]?.textContent).toBe('');
    expect(matches[0]?.parentElement?.getAttribute('data-flight-accessibility-id')).toBe('second');
  });

  it('removes a node subtree and reports a missing identity', () => {
    webHostAccessibility.setNode(node('parent', 'group'));
    webHostAccessibility.setNode(node('child', 'button', { parentId: 'parent' }));

    expect(webHostAccessibility.removeNode('parent')).toEqual({ reason: 'ok' });
    expect(document.querySelector('[data-flight-accessibility-id="parent"]')).toBeNull();
    expect(document.querySelector('[data-flight-accessibility-id="child"]')).toBeNull();
    expect(webHostAccessibility.removeNode('child')).toEqual({ reason: 'node-not-found' });

    webHostAccessibility.setNode(node('child', 'button', { parentId: 'parent' }));
    expect(document.querySelector('[data-flight-accessibility-id="child"]')).not.toBeNull();
  });

  it('focuses a connected node and distinguishes missing and unmoved focus', () => {
    webHostAccessibility.setNode(node('field', 'textbox'));

    expect(webHostAccessibility.setFocus('field')).toEqual({ reason: 'ok' });
    expect(document.activeElement).toBe(document.querySelector('[data-flight-accessibility-id="field"]'));
    expect(webHostAccessibility.setFocus('missing')).toEqual({ reason: 'node-not-found' });

    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => undefined);
    webHostAccessibility.setNode(node('other', 'button'));
    expect(webHostAccessibility.setFocus('other')).toEqual({ reason: 'focus-not-moved' });
  });

  it('writes polite and assertive announcements into stable live regions', () => {
    expect(webHostAccessibility.announce('saved', 'polite')).toEqual({ reason: 'ok' });
    expect(webHostAccessibility.announce('warning', 'assertive')).toEqual({ reason: 'ok' });
    expect(webHostAccessibility.announce('saved again', 'polite')).toEqual({ reason: 'ok' });

    const polite = document.querySelectorAll('[data-flight-accessibility-live="polite"]');
    const assertive = document.querySelector('[data-flight-accessibility-live="assertive"]');
    expect(polite).toHaveLength(1);
    expect(polite[0]?.getAttribute('aria-live')).toBe('polite');
    expect(polite[0]?.getAttribute('aria-atomic')).toBe('true');
    expect(polite[0]?.textContent).toBe('saved again');
    expect(assertive?.textContent).toBe('warning');
  });

  it('clear removes tracked DOM and allows reuse', () => {
    webHostAccessibility.setNode(node('owned', 'button'));
    webHostAccessibility.announce('owned', 'assertive');

    expect(webHostAccessibility.clear()).toEqual({ reason: 'ok' });
    expect(document.querySelector('[data-flight-accessibility-id="owned"]')).toBeNull();

    webHostAccessibility.setNode(node('owned-again', 'button'));
    webHostAccessibility.announce('owned again', 'assertive');
    expect(webHostAccessibility.clear()).toEqual({ reason: 'ok' });
    expect(document.querySelector('[data-flight-accessibility-id="owned-again"]')).toBeNull();
  });
});

function node(
  id: string,
  role: AccessibilityNode['role'],
  extras: Omit<AccessibilityNode, 'id' | 'role'> = {},
): AccessibilityNode {
  return { id, role, ...extras };
}
