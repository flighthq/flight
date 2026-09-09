export interface PathBooleanExplanation {
  readonly operation: 'offset' | 'simplify';
  readonly reason: 'collapsed-or-degenerate' | 'empty-input' | 'non-finite-delta';
}
