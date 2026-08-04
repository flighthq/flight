// Which family of a Skeleton2D an AnimationChannel's target addresses. It is the registry key
// `applyAnimationClipToSkeleton2D` dispatches on, exactly as a `*Kind` keys a renderer, an effect runner or
// a decompressor — a plain string, so the key, the serialized form and the vocabulary are one value.
//
// The kind exists because the family is OPEN and already large. The two 2D-skeletal formats animate eight
// things that are not bone transforms — slot attachment, slot colour, IK, transform, path, deform, draw
// order and event — and both binary parsers already walk every one of those records. Dispatching on target
// SHAPE (`typeof target.boneIndex === 'number'`) is legible for two families and an order-dependent probe
// at eight, where adding one target whose fields happen to overlap another silently reroutes it.
//
// A third-party target carries a vendor-prefixed kind (`'acme.RopeTarget'`) and registers its own binder,
// so an unused family costs a consumer nothing.
export const Skeleton2DAnimationTargetKind = {
  Bone: 'Skeleton2D.BoneTarget',
  Constraint: 'Skeleton2D.ConstraintTarget',
  Deform: 'Skeleton2D.DeformTarget',
  Slot: 'Skeleton2D.SlotTarget',
} as const;

export type Skeleton2DAnimationTargetKind = string;
