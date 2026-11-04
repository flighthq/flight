import {
  geometryPoolReleaseGuard,
  getGeometryPoolReleaseGuard,
  setGeometryPoolReleaseGuard,
} from './geometryPoolGuards.ts';

afterEach(() => {
  setGeometryPoolReleaseGuard(null);
});

describe('getGeometryPoolReleaseGuard', () => {
  it('reads the installed release callback, or null when none is installed', () => {
    expect(getGeometryPoolReleaseGuard()).toBeNull();
    const guard = (): void => {};
    setGeometryPoolReleaseGuard(guard);
    expect(getGeometryPoolReleaseGuard()).toBe(guard);
  });
});

describe('setGeometryPoolReleaseGuard', () => {
  it('installs and removes the internal release callback', () => {
    const guard = (): void => {};
    setGeometryPoolReleaseGuard(guard);
    expect(geometryPoolReleaseGuard).toBe(guard);

    setGeometryPoolReleaseGuard(null);
    expect(geometryPoolReleaseGuard).toBeNull();
  });
});
