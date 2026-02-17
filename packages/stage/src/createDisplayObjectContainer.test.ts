import { createDisplayObjectContainer } from './createDisplayObjectContainer';
import { getDerivedState } from './internal/derivedState';

describe('createDisplayObjectContainer', () => {
  it('can be instantiated', () => {
    const container = createDisplayObjectContainer();
    expect(container).not.toBeNull();
  });

  it('starts with zero children', () => {
    const container = createDisplayObjectContainer();
    const containerState = getDerivedState(container);
    expect(containerState.children!.length).toBe(0);
  });
});
