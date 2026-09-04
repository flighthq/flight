import { createKuwaharaEffect, initializeKuwaharaEffect } from './kuwaharaEffect';

describe('createKuwaharaEffect', () => {
  it('tags the intent type', () => {
    expect(createKuwaharaEffect().kind).toBe('KuwaharaEffect');
  });

  it('carries options', () => {
    expect(createKuwaharaEffect({ radius: 3 })).toMatchObject({ radius: 3 });
  });
});
describe('initializeKuwaharaEffect', () => {
  it('is the construction initializer of createKuwaharaEffect', () => {
    expect(typeof initializeKuwaharaEffect).toBe('function');
  });
});
