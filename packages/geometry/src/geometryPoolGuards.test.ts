import { geometryPoolReleaseGuard, setGeometryPoolReleaseGuard } from './geometryPoolGuards';

afterEach(() => {
  setGeometryPoolReleaseGuard(null);
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
