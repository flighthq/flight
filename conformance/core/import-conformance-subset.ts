export interface ImportConformanceSubsetOutcome {
  outcome: 'importedWrong' | 'passed' | 'silentlyWrong' | 'threw' | 'unsupportedClean';
  reference: string;
}

export function formatImportConformanceSubset(outcomes: readonly Readonly<ImportConformanceSubsetOutcome>[]): string {
  const counts = new Map<string, number>();
  for (const result of outcomes) counts.set(result.outcome, (counts.get(result.outcome) ?? 0) + 1);
  const lines = ['Subset import outcomes only — not a conformance score.', `Fixtures visited: ${outcomes.length}`];
  for (const outcome of ['passed', 'unsupportedClean', 'importedWrong', 'silentlyWrong', 'threw']) {
    lines.push(`${outcome}: ${counts.get(outcome) ?? 0}`);
  }
  return `${lines.join('\n')}\n`;
}
