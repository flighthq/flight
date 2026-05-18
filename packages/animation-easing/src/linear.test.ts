import { Linear } from './linear';

describe('Linear', () => {
  it('easeNone returns 0 at t=0', () => {
    expect(Linear.easeNone(0)).toBe(0);
  });

  it('easeNone returns 1 at t=1', () => {
    expect(Linear.easeNone(1)).toBe(1);
  });

  it('easeNone returns t unchanged', () => {
    expect(Linear.easeNone(0.5)).toBe(0.5);
    expect(Linear.easeNone(0.25)).toBe(0.25);
    expect(Linear.easeNone(0.75)).toBe(0.75);
  });
});
