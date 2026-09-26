/**
 * The OBJ features a build can be asked to support, keyed by the directive(s) that evidence each.
 *
 * ★ DIRECTIVES, NOT VERTEX DATA. A file with `v` positions but no topology directive (`f`, `l`,
 * `p`) produces no geometry, so vertex data alone does not warrant a geometry claim. Each entry
 * names the directives whose presence means the feature is USED, not merely declared.
 *
 * `Material` is evidenced by `usemtl` or `mtllib`: both reference external material definitions,
 * and either one means the file's author intended materials. A `mtllib` with no matching `usemtl`
 * still loads the library — the parser accepts it — so the directive alone is evidence.
 */
export const OBJ_FEATURE_DIRECTIVES: ReadonlyMap<string, readonly string[]> = new Map([
  ['Face', ['f']],
  ['Line', ['l']],
  ['Material', ['usemtl', 'mtllib']],
  ['Point', ['p']],
]);

/**
 * Which features one OBJ document actually contains.
 *
 * Build-time only: scans the directive vocabulary of the source text and stops. No geometry is
 * parsed, no material library is resolved, and no Scene3DDocument is produced, so the cost is one
 * text scan rather than a full import. Lives apart from `parseObj` so a build tool that inventories
 * OBJ files never pulls in geometry decoding, material resolution, or their transitive dependencies.
 *
 * Returns an empty set for a source with no recognized directives — there is no magic-number
 * readability gate for OBJ (any text is syntactically valid, even if empty).
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function collectObjFeatures(source: string): ReadonlySet<string> {
  const found = new Set<string>();
  const directiveToFeature = new Map<string, string>();
  for (const [feature, directives] of OBJ_FEATURE_DIRECTIVES) {
    for (const directive of directives) directiveToFeature.set(directive, feature);
  }

  const remaining = directiveToFeature.size;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trimStart();
    if (raw.length === 0 || raw.charCodeAt(0) === 35) continue;

    const spaceIndex = raw.indexOf(' ');
    const directive = spaceIndex < 0 ? raw.trimEnd() : raw.slice(0, spaceIndex);

    const feature = directiveToFeature.get(directive);
    if (feature !== undefined && !found.has(feature)) {
      found.add(feature);
      if (found.size === remaining) break;
    }
  }
  return found;
}
