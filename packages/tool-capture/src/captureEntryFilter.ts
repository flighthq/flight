// Entry selection for the capture CLI.
//
// ★ WHY AN EXACT MODE EXISTS. `--filter` is a SUBSTRING match, so a name that is contained in a longer
// name cannot be selected alone: `material-depth` also selects `material-depth-orthographic`. That is
// harmless while a run only reads, and it is a defect the moment a run WRITES ground truth — a recapture
// under a substring filter rewrites the baseline of an entry nobody named. A selector that silently
// selects MORE than it was given is the same shape as a CLI that silently accepts flags it does not
// know: the caller is told nothing, and the extra work looks deliberate afterwards.
//
// Substring stays the default because it is the useful thing for read-only exploration. Exactness is
// opt-in, and it is what any writing operation should use.

import { rendererMatchesFilter } from './captureEntries.js';

export function assertCaptureSelectionNotEmpty<T extends { name: string; renderers: readonly string[] }>(
  entries: readonly T[],
  filter: string | undefined,
  exact: string | undefined,
  rendererFilter: readonly string[],
  label: string,
): void {
  if (entries.length === 0) {
    if (exact !== undefined) throw new Error(`${label}: --filter-exact '${exact}' matched no entries`);
    if (filter !== undefined) throw new Error(`${label}: --filter '${filter}' matched no entries`);
    throw new Error(`${label}: no entries found`);
  }
  if (rendererFilter.length === 0) return;
  if (entries.some((e) => e.renderers.some((r) => rendererMatchesFilter(r, rendererFilter)))) return;
  throw new Error(
    `${label}: --renderer '${rendererFilter.join(',')}' matched no renderers in ${entries.length} selected entr${entries.length === 1 ? 'y' : 'ies'}`,
  );
}

/** Selects entries by name: exact when `exact` is given, else substring. Both is a programmer error. */
export function selectCaptureEntriesByName<T extends { name: string }>(
  entries: readonly T[],
  filter: string | undefined,
  exact: string | undefined,
): T[] {
  if (filter !== undefined && exact !== undefined) {
    throw new Error('Pass --filter or --filter-exact, not both — they are different selections');
  }
  if (exact !== undefined) return entries.filter((entry) => entry.name === exact);
  if (filter !== undefined) return entries.filter((entry) => entry.name.includes(filter));
  return [...entries];
}
