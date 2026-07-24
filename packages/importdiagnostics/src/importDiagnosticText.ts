import type { ImportDiagnostic } from '@flighthq/types';

// The human-text side of an import diagnostic — kept in its own concept module so a production bundle
// that records crumbs (or never engages diagnostics at all) sheds every byte of the text machinery.

// Renders one ImportDiagnostic crumb as a stable human-readable line for logs or a CLI. Shape:
// `<severity> <origin>: <kind>[ key=value …]`, detail keys sorted for deterministic output. Pure and
// never throws; allocates only on this opt-in formatting path (the returned string, plus a sorted keys
// array when the crumb carries detail) — a bundle that never expands a crumb sheds it entirely.
export function formatImportDiagnostic(diagnostic: Readonly<ImportDiagnostic>): string {
  const { detail, kind, origin, severity } = diagnostic;
  let detailText = '';
  if (detail !== undefined) {
    const keys = Object.keys(detail).sort();
    for (const key of keys) detailText += ` ${key}=${detail[key]}`;
  }
  return `${severity} ${origin}: ${kind}${detailText}`;
}
