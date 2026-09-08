export type TextMarkupIssueKind = 'unknown-tag' | 'unresolved-font-color' | 'unsafe-href';

// One lossy decision made by parseTextMarkup. The parse still succeeds; this record tells tooling
// exactly which token was ignored or sanitized without coupling the core parser to message strings.
export interface TextMarkupIssue {
  kind: TextMarkupIssueKind;
  offset: number;
  tag: string;
  value: string | null;
}

// Pull-style diagnostics for a markup parse. An empty issues array means every token the source used
// was represented by the selected registry and all guarded attribute values resolved safely.
export interface TextMarkupExplanation {
  issues: TextMarkupIssue[];
}

// Optional parser seam installed by enableTextMarkupGuards. Null is the production default.
export type TextMarkupGuard = (issue: Readonly<TextMarkupIssue>) => void;
