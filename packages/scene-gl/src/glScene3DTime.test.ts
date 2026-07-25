import { makeGlScene3DState } from './glScene3DTestHelper';
import { getGlScene3DTime, setGlScene3DTime } from './glScene3DTime';

describe('getGlScene3DTime', () => {
  it('defaults to 0 before any setGlScene3DTime', () => {
    const { state } = makeGlScene3DState();
    expect(getGlScene3DTime(state)).toBe(0);
  });

  it('returns the value set by setGlScene3DTime', () => {
    const { state } = makeGlScene3DState();
    setGlScene3DTime(state, 2.75);
    expect(getGlScene3DTime(state)).toBe(2.75);
  });
});

describe('setGlScene3DTime', () => {
  it('overwrites the stored time on repeated calls', () => {
    const { state } = makeGlScene3DState();
    setGlScene3DTime(state, 1);
    setGlScene3DTime(state, 4.5);
    expect(getGlScene3DTime(state)).toBe(4.5);
  });

  it('keeps time per state (two states do not share)', () => {
    const a = makeGlScene3DState();
    const b = makeGlScene3DState();
    setGlScene3DTime(a.state, 3);
    expect(getGlScene3DTime(b.state)).toBe(0);
  });
});
