import { describe, expect, expectTypeOf, it } from 'vitest';

import type { HasMaterial } from './HasMaterial.ts';
import type { Material } from './Material.ts';
import type { Material2D } from './Material2D.ts';
import type { Material3D } from './Material3D.ts';
import type { Mesh } from './Mesh.ts';
import type { PhongMaterial } from './PhongMaterial.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';
import type { Scene3DRenderProxy } from './Scene3DRenderProxy.ts';
import type { StandardMaterial } from './StandardMaterial.ts';

// These are compile-time assertions: the file failing to typecheck IS the failure signal. The runtime
// `expect` calls exist only so vitest reports a passing case; the `@ts-expect-error` lines are the
// real test, and each would become a compile error the moment the nominal separation regressed.
describe('Material2D', () => {
  it('rejects a 3D material at the 2D attachment point', () => {
    // The defect this separation fixes: Material2D adds no data, so without the phantom dimension key
    // a PhongMaterial assigned straight into a 2D node's material slot compiled clean.
    // @ts-expect-error a 3D material must not attach to HasMaterial
    const attached: HasMaterial['material'] = null as unknown as PhongMaterial;
    expect(attached).toBeDefined();
  });

  it('rejects a 3D material on the 2D render proxy', () => {
    // @ts-expect-error a 3D material must not reach RenderProxy2D
    const onProxy: RenderProxy2D['material'] = null as unknown as Material3D;
    expect(onProxy).toBeDefined();
  });

  it('accepts a 2D material at the 2D attachment point', () => {
    const attached: HasMaterial['material'] = null as unknown as StandardMaterial;
    const onProxy: RenderProxy2D['material'] = null as unknown as StandardMaterial;
    expect(attached).toBeDefined();
    expect(onProxy).toBeDefined();
  });

  it('is not interchangeable with the 3D branch in either direction', () => {
    expectTypeOf<Material3D>().not.toMatchTypeOf<Material2D>();
    expectTypeOf<Material2D>().not.toMatchTypeOf<Material3D>();
  });

  it('keeps the base Material wide: it still widens into either branch', () => {
    // The separation must not make the base unusable — a bare Material declares no dimension key, so
    // it stays assignable into both, and both widen back to it.
    expectTypeOf<Material>().toMatchTypeOf<Material2D>();
    expectTypeOf<Material2D>().toMatchTypeOf<Material>();
    expectTypeOf<Material3D>().toMatchTypeOf<Material>();
  });

  it('adds no runtime member: the dimension key is ambient and optional', () => {
    // A Material2D literal needs nothing beyond the base — proof the key costs no data and nothing
    // has to be written or serialized.
    const material = { kind: 'TestMaterial' } as unknown as Material2D;
    expect(Object.keys(material)).toEqual(['kind']);
    expect(Object.getOwnPropertySymbols(material)).toEqual([]);
  });
});

describe('Material3D', () => {
  it('rejects a 2D material in a mesh material slot', () => {
    // @ts-expect-error a 2D material must not attach to Mesh.materials
    const slots: Mesh['materials'] = [null as unknown as StandardMaterial];
    expect(slots).toBeDefined();
  });

  it('rejects a 2D material on the 3D render proxy', () => {
    // @ts-expect-error a 2D material must not reach Scene3DRenderProxy
    const onProxy: Scene3DRenderProxy['material'] = null as unknown as StandardMaterial;
    expect(onProxy).toBeDefined();
  });

  it('accepts a 3D material in a mesh material slot and on the 3D proxy', () => {
    const slots: Mesh['materials'] = [null as unknown as PhongMaterial];
    const onProxy: Scene3DRenderProxy['material'] = null as unknown as PhongMaterial;
    expect(slots).toBeDefined();
    expect(onProxy).toBeDefined();
  });
});
