// One joint influence on a vertex: the joint's index in the skeleton and its blend weight. The unit
// packSkinInfluences reduces to the fixed 4-slot joints0/weights0 channels.
export interface SkinInfluence {
  jointIndex: number;
  weight: number;
}
