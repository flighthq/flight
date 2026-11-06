// Identity-only side of the genuine effects-canvas <-> Canvas renderer contract cycle. The owner
// contract stores this state but does not inspect it; runtime consumers resolve the full compatibility
// header after this acyclic declaration build completes.
export type CanvasRenderState = object;
