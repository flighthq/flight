import { createKuwaharaEffect } from './kuwaharaEffect';

describe('createKuwaharaEffect', () => {
  it('tags the intent type', () => {
    expect(createKuwaharaEffect().kind).toBe('KuwaharaEffect');
  });

  it('carries options', () => {
    expect(createKuwaharaEffect({ radius: 3 })).toMatchObject({ radius: 3 });
  });
});
