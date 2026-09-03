import type { HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasTransform2DRuntime } from './HasTransform2D';
import type { NodeRuntime } from './Node';
import type { Node2DRuntime, Node2DTraits } from './Node2D';

describe('Node2DRuntime', () => {
  // These do NOT prove the interface form: an interface and the intersection typedef it replaced are
  // the same type, so nothing observable separates them and no test can. They are forward guards —
  // the shape a future edit could break — and the reason to name the shape is that a declaration can
  // be found, read, and errored against by name, which is a source property rather than a type one.
  it('is assignable to every runtime it specialises, so naming it introduced no second root', () => {
    expectTypeOf<Node2DRuntime>().toMatchTypeOf<NodeRuntime<Node2DTraits>>();
    expectTypeOf<Node2DRuntime>().toMatchTypeOf<HasBoundsRectangleRuntime>();
    expectTypeOf<Node2DRuntime>().toMatchTypeOf<HasTransform2DRuntime>();
  });

  it('carries the scene back-pointer that was the anonymous half of the old typedef', () => {
    expectTypeOf<Node2DRuntime>().toHaveProperty('scene2d');
    const runtime = { scene2d: null } as unknown as Node2DRuntime;
    expect(runtime.scene2d).toBeNull();
  });
});
