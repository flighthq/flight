// Owned by `@flighthq/scene3d`. These deprecated re-exports keep existing `@flighthq/types` imports
// compiling until consumers import the owning package.

import type { Node3DFieldsKey as OwnedNode3DFieldsKey } from '@flighthq/scene3d/contract';

/** @deprecated Import from `@flighthq/scene3d/contract`. */
export type { Node3DFields, Node3D, Node3DRuntime } from '@flighthq/scene3d/contract';

// Structural copies (core may cross into an owner only with type-only edges). The registered symbol makes
// the key the very same value as the owner's, and the cast gives it the owner's unique type.
/** @deprecated Import from `@flighthq/scene3d/contract`. */
export const Node3DKind = 'Node3D';
/** @deprecated Import from `@flighthq/scene3d/contract`. */
export const Node3DFieldsKey = Symbol.for('@flighthq/scene3d/Node3DFields') as typeof OwnedNode3DFieldsKey;
