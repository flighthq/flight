import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { AccessibilityBackend, AccessibilityNode, EntityWithoutRuntime } from '@flighthq/types/contract';
import { vi } from 'vitest';

import {
  announceAccessibility,
  clearAccessibilityTree,
  destroyAccessibility,
  removeAccessibilityNode,
  setAccessibilityFocus,
  setAccessibilityNode,
} from './accessibility';

describe('announceAccessibility', () => {
  it('returns the selected Host provider outcome and supplies the default liveness', () => {
    const provider = createProvider();
    const host = { accessibility: { provider } };

    expect(announceAccessibility(host, 'saved')).toEqual({ reason: 'ok' });
    expect(provider.announce).toHaveBeenCalledWith('saved', 'polite');
  });
});

describe('clearAccessibilityTree', () => {
  it('returns the selected Host provider outcome', () => {
    const provider = createProvider({ clear: vi.fn(() => ({ reason: 'no-dom' as const })) });

    expect(clearAccessibilityTree({ accessibility: { provider } })).toEqual({ reason: 'no-dom' });
  });
});

describe('destroyAccessibility', () => {
  it('destroys the selected Host provider and no other provider', () => {
    const first = createProvider();
    const second = createProvider();

    destroyAccessibility({ accessibility: { provider: first } });

    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.destroy).not.toHaveBeenCalled();
  });
});

describe('removeAccessibilityNode', () => {
  it('forwards the node id and returns a node-not-found outcome', () => {
    const provider = createProvider({ removeNode: vi.fn(() => ({ reason: 'node-not-found' as const })) });

    expect(removeAccessibilityNode({ accessibility: { provider } }, 'missing')).toEqual({
      reason: 'node-not-found',
    });
    expect(provider.removeNode).toHaveBeenCalledWith('missing');
  });
});

describe('setAccessibilityFocus', () => {
  it('forwards the node id and returns a focus-not-moved outcome', () => {
    const provider = createProvider({ setFocus: vi.fn(() => ({ reason: 'focus-not-moved' as const })) });

    expect(setAccessibilityFocus({ accessibility: { provider } }, 'subject')).toEqual({
      reason: 'focus-not-moved',
    });
    expect(provider.setFocus).toHaveBeenCalledWith('subject');
  });
});

describe('setAccessibilityNode', () => {
  it('publishes only through the explicitly supplied Host', () => {
    const first = createProvider();
    const second = createProvider();
    const subject: AccessibilityNode = { id: 'subject', label: 'Subject', role: 'button' };

    expect(setAccessibilityNode({ accessibility: { provider: first } }, subject)).toEqual({ reason: 'ok' });

    expect(first.setNode).toHaveBeenCalledWith(subject);
    expect(second.setNode).not.toHaveBeenCalled();
  });
});

function createProvider(overrides: Partial<EntityWithoutRuntime<AccessibilityBackend>> = {}): AccessibilityBackend {
  return {
    [EntityRuntimeKey]: undefined,
    announce: vi.fn(() => ({ reason: 'ok' as const })),
    clear: vi.fn(() => ({ reason: 'ok' as const })),
    destroy: vi.fn(),
    removeNode: vi.fn(() => ({ reason: 'ok' as const })),
    setFocus: vi.fn(() => ({ reason: 'ok' as const })),
    setNode: vi.fn(() => ({ reason: 'ok' as const })),
    ...overrides,
  };
}
