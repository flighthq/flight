import {
  createGodRaysEffect,
  createScreenSpaceFogEffect,
  createSsaoEffect,
  createSsrEffect,
} from './atmosphericEffects';

describe('createGodRaysEffect', () => {
  it('tags the intent type', () => {
    expect(createGodRaysEffect().type).toBe('godRays');
  });

  it('carries options', () => {
    expect(createGodRaysEffect({ centerX: 0.5, centerY: 0.25, density: 0.9 })).toMatchObject({
      centerX: 0.5,
      centerY: 0.25,
      density: 0.9,
    });
  });
});

describe('createScreenSpaceFogEffect', () => {
  it('tags the intent type', () => {
    expect(createScreenSpaceFogEffect().type).toBe('screenSpaceFog');
  });

  it('carries options', () => {
    expect(createScreenSpaceFogEffect({ color: 0xaabbccff, density: 0.4 })).toMatchObject({
      color: 0xaabbccff,
      density: 0.4,
    });
  });
});

describe('createSsaoEffect', () => {
  it('tags the intent type', () => {
    expect(createSsaoEffect().type).toBe('ssao');
  });

  it('carries options', () => {
    expect(createSsaoEffect({ radius: 4, intensity: 1.5 })).toMatchObject({ radius: 4, intensity: 1.5 });
  });
});

describe('createSsrEffect', () => {
  it('tags the intent type', () => {
    expect(createSsrEffect().type).toBe('ssr');
  });

  it('carries options', () => {
    expect(createSsrEffect({ maxDistance: 10, steps: 32 })).toMatchObject({ maxDistance: 10, steps: 32 });
  });
});
