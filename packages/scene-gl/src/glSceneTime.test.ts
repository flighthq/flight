import { makeGlSceneState } from './glSceneTestHelper';
import { getGlSceneTime, setGlSceneTime } from './glSceneTime';

describe('getGlSceneTime', () => {
  it('defaults to 0 before any setGlSceneTime', () => {
    const { state } = makeGlSceneState();
    expect(getGlSceneTime(state)).toBe(0);
  });

  it('returns the value set by setGlSceneTime', () => {
    const { state } = makeGlSceneState();
    setGlSceneTime(state, 2.75);
    expect(getGlSceneTime(state)).toBe(2.75);
  });
});

describe('setGlSceneTime', () => {
  it('overwrites the stored time on repeated calls', () => {
    const { state } = makeGlSceneState();
    setGlSceneTime(state, 1);
    setGlSceneTime(state, 4.5);
    expect(getGlSceneTime(state)).toBe(4.5);
  });

  it('keeps time per state (two states do not share)', () => {
    const a = makeGlSceneState();
    const b = makeGlSceneState();
    setGlSceneTime(a.state, 3);
    expect(getGlSceneTime(b.state)).toBe(0);
  });
});
