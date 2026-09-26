/**
 * The feature name meaning "this file references materials" — true of the OBJ text alone.
 *
 * It is deliberately NOT a requirement key. `parseObjRequirements` replaces it with the shading models the
 * referenced MTL actually declares, because a renderer and a parser handler are chosen by MODEL, and this
 * name cannot answer either question.
 */
export const OBJ_MATERIAL_FEATURE = 'Material';

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
  [OBJ_MATERIAL_FEATURE, ['usemtl', 'mtllib']],
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

  const remaining = OBJ_FEATURE_DIRECTIVES.size;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trimStart();
    if (raw.length === 0 || raw.charCodeAt(0) === 35) continue;

    const whitespaceIndex = raw.search(/\s/);
    const directive = whitespaceIndex < 0 ? raw : raw.slice(0, whitespaceIndex);

    const feature = directiveToFeature.get(directive);
    if (feature !== undefined && !found.has(feature)) {
      found.add(feature);
      if (found.size === remaining) break;
    }
  }
  return found;
}

/**
 * The material libraries an OBJ file references, as the `mtllib` paths it states.
 *
 * ★ PATHS, NOT CONTENT. This function does no I/O: it reports what the file asks for and leaves reading it
 * to whoever owns a filesystem. That keeps the analysis side pure — the build tool resolves these against
 * the OBJ's own directory and hands the text back — and it is the only way an analyzer can reach a sibling
 * file without taking a dependency on how the caller stores its assets.
 *
 * One `mtllib` line may name several libraries, and a file may state the directive more than once; every
 * path is reported once, in the order first seen, so a caller reads each library exactly once.
 */
export function collectObjMaterialLibraryReferences(source: string): readonly string[] {
  const references: string[] = [];
  const seen = new Set<string>();
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.charCodeAt(0) === 35) continue;
    if (!line.startsWith('mtllib')) continue;
    for (const path of line.slice('mtllib'.length).trim().split(/\s+/)) {
      if (path.length === 0 || seen.has(path)) continue;
      seen.add(path);
      references.push(path);
    }
  }
  return references;
}
