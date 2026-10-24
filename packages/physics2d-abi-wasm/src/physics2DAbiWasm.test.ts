import { createPhysics2DAbi, initPhysics2DAbiWasm } from './physics2DAbiWasm.ts';

describe('physics2d-abi-wasm wiring', () => {
  it('initializes without error', () => {
    expect(() => initPhysics2DAbiWasm()).not.toThrow();
  });

  it('creates an ABI instance with version and capabilities', () => {
    const abi = createPhysics2DAbi();
    expect(abi.version).toBeGreaterThanOrEqual(0);
    expect(abi.capabilities).toBeGreaterThanOrEqual(0);
  });

  it('creates and destroys a world', () => {
    const abi = createPhysics2DAbi();
    const world = abi.createWorld();
    expect(world).toBeGreaterThanOrEqual(0);
    const status = abi.getWorldStatus(world);
    expect(status).toBe('Ready');
    abi.destroyWorld(world);
  });

  it('steps a world', () => {
    const abi = createPhysics2DAbi();
    const world = abi.createWorld();
    const status = abi.step(world, 1 / 60, null);
    expect(status).toBe('Complete');
    abi.destroyWorld(world);
  });
});
