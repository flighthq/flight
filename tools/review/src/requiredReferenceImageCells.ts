export interface ReviewCoverageManifest {
  subjects?: Record<string, Record<string, readonly string[]>>;
}

/**
 * Groups the cells a subject owes a reference image by scene name.
 *
 * ★ THE REQUIREMENT COMES FROM THE COVERAGE MANIFEST, NOT FROM `.artifacts`. Review discovery walks the
 * capture output, so a required cell that produced no screenshot was skipped by a bare `continue` — and
 * when its only sibling was a declared control (hidden by design), the whole scene vanished from the
 * review tool with no row saying so. The gate still failed it as `missing-reference-image`, which put the
 * report and the place a reviewer goes to fix it in disagreement. reference-image-check.ts carries the
 * same rule from the pack side.
 */
export function readRequiredReferenceImageCells(
  manifest: ReviewCoverageManifest,
  subject: string,
): Map<string, string[]> {
  const required = new Map<string, string[]>();
  const cells = manifest.subjects?.[subject];
  if (cells === undefined) return required;
  for (const [cell, kinds] of Object.entries(cells)) {
    if (!kinds.includes('referenceImage')) continue;
    // Split on the LAST slash: the renderer is one segment, the scene name may itself contain slashes.
    const slash = cell.lastIndexOf('/');
    if (slash <= 0 || slash === cell.length - 1) continue;
    const name = cell.slice(0, slash);
    required.set(name, [...(required.get(name) ?? []), cell.slice(slash + 1)]);
  }
  return required;
}
