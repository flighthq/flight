import { createSsrEffect } from './ssrEffect';

describe('createSsrEffect', () => {
  it('tags the intent type', () => {
    expect(createSsrEffect().kind).toBe('SsrEffect');
  });

  it('carries options', () => {
    expect(createSsrEffect({ maxDistance: 10, steps: 32 })).toMatchObject({ maxDistance: 10, steps: 32 });
  });
});
