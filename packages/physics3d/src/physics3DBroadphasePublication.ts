import type { Physics3DWorld, SpatialAabb3D } from '@flighthq/types/contract';

export function getPhysics3DBroadphaseBodyIndices(world: Physics3DWorld): Set<number> {
  const existing = physics3DBroadphasePublicationByWorld.get(world);
  if (existing !== undefined && existing.index === world.index) return existing.bodyIndices;

  // A hydrated world or a caller-supplied pre-populated backend can already hold bodies before this
  // module has observed it. Rebuild once when the world/index pairing is first seen (and whenever the
  // public backend reference changes), then maintain the set alongside physics3d's own operations.
  const bodyIndices = new Set<number>();
  for (let bodyIndex = 0; bodyIndex < world.bodies.length; bodyIndex += 1) {
    const id = world.bodies[bodyIndex].index;
    if (world.index.explainSpatialIndexing(id).mode !== 'absent') bodyIndices.add(id);
  }
  const created = { bodyIndices, index: world.index };
  physics3DBroadphasePublicationByWorld.set(world, created);
  return created.bodyIndices;
}

// Uses the backend's distinct insert/update vocabulary even though update is contractually an upsert. The
// latter is result-correct, but spatial diagnostics deliberately report update of a missing id as a
// lifecycle fault. Physics3d knows whether it has published each body, so preserving that information
// keeps a supported add-body-then-add-collider sequence silent without paying explain() on the hot path.
export function publishPhysics3DBroadphaseBody(
  world: Physics3DWorld,
  bodyIndex: number,
  bounds: Readonly<SpatialAabb3D>,
  bodyIndices = getPhysics3DBroadphaseBodyIndices(world),
): void {
  if (bodyIndices.has(bodyIndex)) {
    const updated = world.index.updateSpatialObject(bodyIndex, bounds);
    if (!updated && world.index.explainSpatialIndexing(bodyIndex).mode === 'absent') {
      bodyIndices.delete(bodyIndex);
    }
    return;
  }

  const inserted = world.index.insertSpatialObject(bodyIndex, bounds);
  if (inserted || world.index.explainSpatialIndexing(bodyIndex).mode !== 'absent') {
    bodyIndices.add(bodyIndex);
  }
}

// Removes a body's publication only when physics3d previously placed it in the backend. A colliderless
// body is valid authored state, and repeatedly asking the backend to remove its never-published id would
// turn that ordinary state into a false `missing-id` lifecycle notice whenever spatial diagnostics are on.
export function withdrawPhysics3DBroadphaseBody(
  world: Physics3DWorld,
  bodyIndex: number,
  bodyIndices = getPhysics3DBroadphaseBodyIndices(world),
): void {
  if (!bodyIndices.delete(bodyIndex)) {
    // A caller-supplied backend may already contain the id when physics3d first sees it. Consult the
    // backend only on this uncommon withdrawal path so stale external publication is still removed
    // without adding another map lookup to every moving body on every step.
    if (world.index.explainSpatialIndexing(bodyIndex).mode === 'absent') return;
  }
  world.index.removeSpatialObject(bodyIndex);
}

interface Physics3DBroadphasePublication {
  bodyIndices: Set<number>;
  index: Physics3DWorld['index'];
}

const physics3DBroadphasePublicationByWorld = new WeakMap<Physics3DWorld, Physics3DBroadphasePublication>();
