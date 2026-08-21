import { getCollisionSupport3D } from '@flighthq/collision/contract';
import type { Physics3DCollisionExplanation, Physics3DWorld } from '@flighthq/types/contract';

// Reports which of a world's collider kinds the narrow phase cannot detect, as plain data.
//
// This answers a question a stepping world cannot: `stepPhysics3D` succeeds whether or not the collision
// registries were populated, and an empty contact set is the correct output for a world where nothing is
// touching AND the output for a world where nothing CAN touch. The two are indistinguishable from the
// callsite, and the second one presents as bodies sinking through the ground for no stated reason.
//
// Separately importable, and consulted rather than continuous: a shipping build that never asks links
// neither this nor the guard that phrases it.
export function explainPhysics3DCollision(world: Readonly<Physics3DWorld>): Physics3DCollisionExplanation {
  const unsupported = new Set<string>();
  for (const body of world.bodies) {
    for (const collider of body.colliders) {
      const kind = collider.world.kind;
      if (getCollisionSupport3D(kind) === null) unsupported.add(kind);
    }
  }

  // Sorted so the value is stable for a given world however its bodies were inserted, which is what lets
  // a guard key a warning on it without re-reporting the same fault under a different order.
  const unsupportedKinds = [...unsupported].sort();
  return {
    unsupportedKinds,
    status: unsupportedKinds.length > 0 ? 'missing-support' : 'ready',
  };
}
