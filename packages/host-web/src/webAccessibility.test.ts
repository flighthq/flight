import type { AccessibilityNode } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebAccessibilityBackend,
  initializeWebAccessibilityBackend,
  webHostAccessibility,
} from './webAccessibility';
import { webHost } from './webHost';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
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
describe('webHostAccessibility', () => {
  it('is the stable Entity provider published by webHost', () => {
    expect(webHost.accessibility.tree).toBe(webHostAccessibility);
  });
});
