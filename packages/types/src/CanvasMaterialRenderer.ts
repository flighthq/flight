import type { CanvasMaterialState } from './CanvasMaterialState';
import type { Material } from './Material';

// Per-backend behavior for a material kind on Canvas, registered against the kind on the
// render state via registerCanvasMaterialRenderer. Unlike the Gl renderer, this is
// declarative: it returns a draw-state delta rather than issuing context calls, so the canvas
// renderer can diff against current context state and centrally manage save()/restore().
//
// The deliberate Gl/Canvas asymmetry — imperative bind() versus declarative getState() —
// is intentional: GPU uniform upload is irreducibly imperative and per-shader, while canvas
// draw state is naturally key-value. Each backend expresses materials in its own idiom.
export interface CanvasMaterialRenderer {
  getState(material: Readonly<Material>): CanvasMaterialState;
}
