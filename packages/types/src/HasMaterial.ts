import type { Material, MaterialData } from './Material';
import type { Node, NodeTraits } from './Node';

// Opt-in node trait. A freshly created node has no material (null → DefaultMaterialKind, the
// standard pipeline). `materialData` holds per-node data the material consumes, and is null until
// the material needs it. (A color transform is not a material — it is the HasColorTransform trait.)
export interface HasMaterial {
  material: Material | null;
  materialData: MaterialData | null;
}

export type MaterialNode<Traits extends object = NodeTraits> = Node<Traits> & HasMaterial;
