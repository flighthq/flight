import { createColorGradeEffect } from './colorGradeEffect';

describe('createColorGradeEffect', () => {
  it('tags the intent type', () => {
    expect(createColorGradeEffect().kind).toBe('ColorGradeEffect');
  });

  it('carries options', () => {
    expect(createColorGradeEffect({ exposure: 1, saturation: 1.2 })).toMatchObject({ exposure: 1, saturation: 1.2 });
  });
});
