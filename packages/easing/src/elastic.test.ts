import { Elastic } from './elastic';

describe('Elastic', () => {
  it('easeIn returns 0 at t=0 and 1 at t=1', () => {
    expect(Elastic.easeIn(0)).toBe(0);
    expect(Elastic.easeIn(1)).toBe(1);
  });

  it('easeOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Elastic.easeOut(0)).toBe(0);
    expect(Elastic.easeOut(1)).toBe(1);
  });

  it('easeInOut returns 0 at t=0 and 1 at t=1', () => {
    expect(Elastic.easeInOut(0)).toBe(0);
    expect(Elastic.easeInOut(1)).toBe(1);
  });

  it('easeOut oscillates past 1 near the end', () => {
    expect(Elastic.easeOut(0.6)).toBeGreaterThan(1);
  });

  it('easeIn oscillates below 0 before reaching target', () => {
    expect(Elastic.easeIn(0.8)).toBeLessThan(0);
  });
});
