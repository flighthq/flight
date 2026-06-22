import { createOutlineEffect } from './outlineEffect';

describe('createOutlineEffect', () => {
  it('tags the intent type', () => {
    expect(createOutlineEffect().kind).toBe('OutlineEffect');
  });

  it('carries options', () => {
    expect(createOutlineEffect({ threshold: 0.2, thickness: 1.5, color: 0x000000ff })).toMatchObject({
      threshold: 0.2,
      thickness: 1.5,
      color: 0x000000ff,
    });
  });
});
