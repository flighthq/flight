import type { MaterialData } from './Material';
import type { Material2D } from './Material2D';
import type { NodeOf, NodeTraits } from './Node';

// Opt-in node trait. A freshly created node has no material (null → StandardMaterialKind, the
// standard pipeline). `materialData` holds per-node data the material consumes, and is null until
// the material needs it. (A color adjustment is not a material — it is the HasColorScaleBias trait.)
export interface HasMaterial {
  // Narrowed to the 2D branch: this trait only ever hangs off a 2D node, so a 3D material here is a
  // compile error rather than a missing-renderer diagnostic at draw time.
  material: Material2D | null;
  materialData: MaterialData | null;
}

export type MaterialNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasMaterial;
