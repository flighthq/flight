// Declarative draw-state delta a material contributes on Canvas. The material renderer
// returns this; the canvas renderer applies it, diffs it against the current context to skip
// redundant writes, and owns save()/restore() bracketing. Both fields are optional and merge
// over the node's universal appearance (alpha maps to globalAlpha and is handled separately,
// so it is intentionally absent here).
//
// Canvas materials are intentionally sparse: most appearance effects (color transform, blur)
// are offscreen-filter territory on Canvas, not materials. Anything needing work around the
// draw rather than draw-state is a filter pass, not a material.
export interface CanvasMaterialState {
  composite?: GlobalCompositeOperation;
  filter?: string;
}
