// Acyclic build entry for the scene3d node contracts (Node3D, Skeleton3D, Skin), selected through the
// `.scene3d-node-types` module suffix by lanes that scene3d's main lane depends on (meshgeometry's Mesh
// extends Node3D, while scene3d's documents reference Mesh). The published contract.ts re-exports it.
export * from './types/Node3D.ts';
export * from './types/Skeleton3D.ts';
export * from './types/Skin.ts';
