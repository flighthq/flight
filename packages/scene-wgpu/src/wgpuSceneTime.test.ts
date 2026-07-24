import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import { getWgpuSceneTime, setWgpuSceneTime } from './wgpuSceneTime';

describe('getWgpuSceneTime', () => {
  it('defaults to zero and reads the state-scoped value', () => {
    const { state } = makeWgpuSceneState();
    expect(getWgpuSceneTime(state)).toBe(0);
    setWgpuSceneTime(state, 2.5);
    expect(getWgpuSceneTime(state)).toBe(2.5);
  });
});

describe('setWgpuSceneTime', () => {
  it('does not leak across render states', () => {
    const first = makeWgpuSceneState().state;
    const second = makeWgpuSceneState().state;
    setWgpuSceneTime(first, 4);
    expect(getWgpuSceneTime(second)).toBe(0);
  });
});
