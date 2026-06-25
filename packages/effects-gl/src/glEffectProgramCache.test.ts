import { getGlEffectProgram, getGlEffectUniformLocation } from './glEffectProgramCache';

describe('getGlEffectProgram', () => {
  it('is a function', () => {
    expect(typeof getGlEffectProgram).toBe('function');
  });
});

describe('getGlEffectUniformLocation', () => {
  it('is a function', () => {
    expect(typeof getGlEffectUniformLocation).toBe('function');
  });
});
