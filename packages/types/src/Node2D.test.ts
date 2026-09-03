import type { HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasTransform2DRuntime } from './HasTransform2D';
import type { NodeRuntime } from './Node';
import type { Node2DRuntime, Node2DTraits } from './Node2D';

describe('Node2DRuntime', () => {
  it('is a named interface a declaration can extend, not an intersection typedef', () => {
    // The point of the seam: a subsystem adds its slot by EXTENDING the runtime. An intersection
    // typedef ending in an anonymous overlay cannot be extended, so every subsystem had to re-state
    // the whole intersection to add one field.
    interface SubsystemRuntime extends Node2DRuntime {
      subsystemSlot: string | null;
    }
    const runtime = { subsystemSlot: 'attached' } as unknown as SubsystemRuntime;
    expect(runtime.subsystemSlot).toBe('attached');
  });

  it('is still assignable to the node runtime it specialises, so no second root was introduced', () => {
    // The risk in naming a shape is rooting it somewhere new. This pins the direction that matters:
    // a Node2DRuntime must still BE a NodeRuntime<Node2DTraits>, checked by the compiler rather than
    // by a runtime assertion that could not observe it either way.
    expectTypeOf<Node2DRuntime>().toMatchTypeOf<NodeRuntime<Node2DTraits>>();
    expectTypeOf<Node2DRuntime>().toMatchTypeOf<HasBoundsRectangleRuntime>();
    expectTypeOf<Node2DRuntime>().toMatchTypeOf<HasTransform2DRuntime>();
  });

  it('carries the scene back-pointer that was the anonymous half of the old typedef', () => {
    const runtime = { scene2d: null } as unknown as Node2DRuntime;
    expect(runtime.scene2d).toBeNull();
  });
});
