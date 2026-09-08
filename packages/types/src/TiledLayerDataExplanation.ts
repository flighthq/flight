// Why a tile layer's encoded payload did or did not decode. `decodeTiledBase64Layer` returns a bare
// `null` for two different causes, and the difference is the whole diagnosis: a caller who never
// supplied an inflate seam has a wiring problem, while a caller whose seam returned null has a corrupt
// or unexpected payload. A single sentinel maps both to the same answer, so the reason is a query.
//
// `preservedAsZeroGrid` states what the parse did with the layer rather than restating the reason: a
// layer that failed to decode is kept in the document as an all-zero grid, never dropped, so a caller
// counting layers still sees it.
export type TiledLayerDataFailure = 'compressed-without-inflate' | 'inflate-failed';

export interface TiledLayerDataExplanation {
  preservedAsZeroGrid: boolean;
  reason: TiledLayerDataFailure | 'decoded';
}
