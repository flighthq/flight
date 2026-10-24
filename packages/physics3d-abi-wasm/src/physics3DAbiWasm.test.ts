import { createPhysics3DAbi, initPhysics3DAbiWasm } from './physics3DAbiWasm.ts';

describe('physics3d-abi-wasm wiring', () => {
  it('initializes without error', () => {
    expect(() => initPhysics3DAbiWasm()).not.toThrow();
  });

  it('creates an ABI instance with version and capabilities', () => {
    const abi = createPhysics3DAbi();
    expect(abi.version).toBeGreaterThanOrEqual(0);
    expect(abi.capabilities).toBeGreaterThanOrEqual(0);
  });

  it('creates and destroys a world', () => {
    const abi = createPhysics3DAbi();
    const world = abi.createWorld();
    expect(world).toBeGreaterThanOrEqual(0);
    const status = abi.getWorldStatus(world);
    expect(status).toBe('Ready');
    abi.destroyWorld(world);
  });

  it('steps a world', () => {
    const abi = createPhysics3DAbi();
    const world = abi.createWorld();
    const status = abi.step(world, 1 / 60, null);
    expect(status).toBe('Complete');
    abi.destroyWorld(world);
  });
});
