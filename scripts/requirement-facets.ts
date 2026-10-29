// Validates the requirement-facet vocabulary. Its single authority is the Rust `RequirementFacet`
// declaration in crates/flight-requirement, generated into @flighthq/requirement; a declaration rather
// than an inventory derived from current scene walks can name a facet no producer emits yet, which makes
// an unreported facet visible as missing coverage. `@flighthq/types` only re-exports it.
//
// `npm run facets` and `npm run facets:check` both verify: unique, well-formed and sorted ids and names,
// and a `@flighthq/types` RequirementFacet that is a re-export rather than a second definition.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RequirementFacet } from '../packages/requirement/src/types.ts';

export function verifyRequirementFacets(facets: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  const entries = Object.entries(facets);
  const ids = new Set<string>();
  for (const [name, id] of entries) {
    if (ids.has(id)) problems.push(`duplicate id: ${id}`);
    ids.add(id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(id)) problems.push(`malformed id: ${id}`);
    if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) problems.push(`malformed name: ${name}`);
  }
  const sorted = entries.map(([, id]) => id).sort();
  for (let index = 0; index < entries.length; index++) {
    if (entries[index][1] !== sorted[index]) {
      problems.push(`out of order at ${index}: ${entries[index][1]} should be ${sorted[index]}`);
      break;
    }
  }
  return problems;
}

export function verifyTypesRequirementFacetAlias(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/\b(?:const|type|enum)\s+RequirementFacet\b/.test(code)) {
    return ['packages/types/src/RequirementFacet.ts defines RequirementFacet instead of re-exporting it'];
  }
  if (!/export\s*\{\s*RequirementFacet\s*\}\s*from\s*'@flighthq\/requirement\/contract'/.test(code)) {
    return ['packages/types/src/RequirementFacet.ts must re-export RequirementFacet from @flighthq/requirement'];
  }
  return [];
}

const REPO_ROOT = join(import.meta.dirname, '..');
const TYPES_ALIAS_PATH = join(REPO_ROOT, 'packages', 'types', 'src', 'RequirementFacet.ts');

function main(): void {
  const problems = [
    ...verifyRequirementFacets(RequirementFacet),
    ...verifyTypesRequirementFacetAlias(readFileSync(TYPES_ALIAS_PATH, 'utf8')),
  ];
  if (problems.length > 0) {
    console.error(`✗ requirement-facet vocabulary is malformed:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${Object.keys(RequirementFacet).length} requirement facets, owned by @flighthq/requirement`);
}

main();
