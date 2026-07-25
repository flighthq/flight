import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { getWgpuScene3DTime, setWgpuScene3DTime } from './wgpuScene3DTime';

describe('getWgpuScene3DTime', () => {
  it('defaults to zero and reads the state-scoped value', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuScene3DTime(state)).toBe(0);
    setWgpuScene3DTime(state, 2.5);
    expect(getWgpuScene3DTime(state)).toBe(2.5);
  });
});

describe('setWgpuScene3DTime', () => {
  it('does not leak across render states', () => {
    const first = makeWgpuScene3DState().state;
    const second = makeWgpuScene3DState().state;
    setWgpuScene3DTime(first, 4);
    expect(getWgpuScene3DTime(second)).toBe(0);
  });
});
