// Plain diagnostic data explaining whether a scene's punctual-light arrays need the explicit
// per-object forward-light selection pass before a draw. The core draw path stays silent and
// allocation-free; explainSceneForwardLightSelection is the separately importable query.
export interface SceneForwardLightSelectionExplanation {
  pointLightCount: number;
  reason: 'selection-prepared' | 'selection-required' | 'within-budget';
  selectionPrepared: boolean;
  spotLightCount: number;
}
