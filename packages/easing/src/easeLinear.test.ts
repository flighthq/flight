import { easeLinear } from './easeLinear';

describe('easeLinear', () => {
  it('returns 0 at t=0', () => {
    expect(easeLinear(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeLinear(1)).toBe(1);
  });

  it('returns t unchanged', () => {
    expect(easeLinear(0.5)).toBe(0.5);
    expect(easeLinear(0.25)).toBe(0.25);
    expect(easeLinear(0.75)).toBe(0.75);
  });
});
