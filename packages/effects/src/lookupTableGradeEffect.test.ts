import { createLookupTableGradeEffect } from './lookupTableGradeEffect';

describe('createLookupTableGradeEffect', () => {
  it('tags the intent type', () => {
    expect(createLookupTableGradeEffect().kind).toBe('LookupTableGradeEffect');
  });

  it('carries options', () => {
    expect(createLookupTableGradeEffect({ size: 32, strength: 0.8 })).toMatchObject({ size: 32, strength: 0.8 });
  });
});
