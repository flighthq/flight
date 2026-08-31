import type { Material, MaterialData } from './Material';
import type { NodeOf, NodeTraits } from './Node';

// Opt-in node trait. A freshly created node has no material (null → StandardMaterialKind, the
// standard pipeline). `materialData` holds per-node data the material consumes, and is null until
// the material needs it. (A color adjustment is not a material — it is the HasColorScaleBias trait.)
export interface HasMaterial {
  material: Material | null;
  materialData: MaterialData | null;
}

export type MaterialNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasMaterial;
