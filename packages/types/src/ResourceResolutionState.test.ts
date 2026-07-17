import { ResourceResolutionState } from './ResourceResolutionState';

describe('ResourceResolutionState', () => {
  it('names the four lifecycle states as canonical PascalCase values', () => {
    expect(ResourceResolutionState.Unresolved).toBe('Unresolved');
    expect(ResourceResolutionState.Loading).toBe('Loading');
    expect(ResourceResolutionState.Resolved).toBe('Resolved');
    expect(ResourceResolutionState.Failed).toBe('Failed');
  });

  it('is a closed four-member vocabulary', () => {
    expect(Object.values(ResourceResolutionState).sort()).toEqual(['Failed', 'Loading', 'Resolved', 'Unresolved']);
  });
});
