// Deliberate build-time read of the committed size baseline (a canonical project artifact), so the
// cross-directory import is intentional rather than an accidental coupling.
// eslint-disable-next-line import/no-relative-parent-imports
import baseline from '../../../../tests/size/size.baseline.json';

// Real gzip byte sizes, pulled at build time from the project's committed size baseline
// (tests/size/size.baseline.json, written by `npm run size:baseline`). Reading the canonical figures
// here keeps the size story accurate and self-updating instead of hand-maintained. Build-time only.
const sizes: Record<string, number> = baseline;

// Fill each `.size-row[data-size="<example>:<renderer>"]` from the baseline: set its KB label and scale
// its bar relative to the largest figure shown. No-ops if the section (or a key) is absent, so the
// static fallback values in the markup remain.
export function fillSizeFigures(): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.size-row[data-size]'));
  if (rows.length === 0) return;
  const bytesOf = (row: HTMLElement): number => sizes[row.dataset.size ?? ''] ?? 0;
  const max = Math.max(...rows.map(bytesOf), 1);
  for (const row of rows) {
    const bytes = bytesOf(row);
    if (bytes <= 0) continue;
    const kb = row.querySelector<HTMLElement>('.kb');
    const fill = row.querySelector<HTMLElement>('.fill');
    if (kb !== null) kb.textContent = `${(bytes / 1024).toFixed(1)} KB`;
    if (fill !== null) fill.style.width = `${Math.round((bytes / max) * 100)}%`;
  }
}
