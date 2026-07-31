import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Classifies a package cell's named local target. The package.json is the implementation boundary,
// so ignored build residue must never make a removed target look live. A cell with historical
// package evidence but no target is stale; a charter without that evidence is genuinely unbuilt.
export function getLocalPackageTargetStatus(codePackagesDir, cellDir, cellName, packageName) {
  const scopedName = packageName?.match(/^@flighthq\/([^/]+)$/)?.[1];
  if (existsSync(join(codePackagesDir, scopedName ?? cellName, 'package.json'))) return 'built';
  if (['assessment.md', 'review.md', 'status.md'].some((file) => existsSync(join(cellDir, file)))) return 'stale';
  return 'unbuilt';
}
