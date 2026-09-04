import type { LayoutResolver } from '@flighthq/types/contract';

import { createLayoutState, initializeLayoutState, registerLayoutResolver } from './layoutState';

const resolver: LayoutResolver = () => null;

describe('createLayoutState', () => {
  it('starts with an empty resolver registry and no retained failure', () => {
    const state = createLayoutState();
    expect(state.resolvers.size).toBe(0);
    expect(state.lastFailureKind).toBeNull();
    expect(state.lastFailureNodeIndex).toBe(-1);
    expect(state.lastFailureParentIndex).toBe(-1);
    expect(state.guard).toBeNull();
  });
});

describe('initializeLayoutState', () => {
  it('is the construction initializer of createLayoutState', () => {
    expect(typeof initializeLayoutState).toBe('function');
  });
});
describe('registerLayoutResolver', () => {
  it('is open, last-write-wins, and accepts null to unregister', () => {
    const state = createLayoutState();
    const replacement: LayoutResolver = () => 'InvalidItemStyle';
    registerLayoutResolver(state, 'acme.Flow', resolver);
    registerLayoutResolver(state, 'acme.Flow', replacement);
    expect(state.resolvers.get('acme.Flow')).toBe(replacement);
    registerLayoutResolver(state, 'acme.Flow', null);
    expect(state.resolvers.has('acme.Flow')).toBe(false);
  });
});
