/**
 * Which content features an MD5 mesh file (.md5mesh) actually contains, determined by scanning
 * the text for section openings and shader references — the same vocabulary `parseMd5Mesh` reads.
 *
 * Features:
 * - `Mesh` — present when at least one `mesh {` section exists.
 * - `Skeleton` — present when a `joints {` section exists.
 * - `Material` — present when at least one mesh section contains a non-empty `shader` directive.
 *
 * Build-time only: scans the line vocabulary and stops. No geometry is baked, no joint hierarchy
 * is built, and no Scene3DDocument is produced, so the cost is one text scan rather than a full
 * import. Lives apart from `parseMd5Mesh` so a build tool that inventories MD5 files never pulls
 * in geometry decoding, skinning, or their transitive dependencies.
 *
 * Returns an empty set for a source with no recognized sections. MD5 mesh has no binary magic
 * number, so there is no readability gate — any text is syntactically scannable, even if empty.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
const MD5_MESH_FEATURE_SKELETON = 'Skeleton';
const MD5_MESH_FEATURE_MESH = 'Mesh';
const MD5_MESH_FEATURE_MATERIAL = 'Material';

/**
 * Every feature name this analyzer can report — the vocabulary it emits under `document.format`.
 *
 * Stated as one list, and the scan below uses these same names, so the vocabulary cannot drift from what
 * the scan actually emits. A build tool needs the whole list to tell a feature nothing claims from a
 * feature the analyzer never considered.
 */
export const MD5_MESH_FEATURE_NAMES: readonly string[] = [
  MD5_MESH_FEATURE_SKELETON,
  MD5_MESH_FEATURE_MESH,
  MD5_MESH_FEATURE_MATERIAL,
];

export function collectMd5MeshFeatures(source: string): ReadonlySet<string> {
  const found = new Set<string>();
  let inMesh = false;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('//')) continue;

    if (line === 'joints {') {
      found.add(MD5_MESH_FEATURE_SKELETON);
      continue;
    }

    if (line === 'mesh {') {
      found.add(MD5_MESH_FEATURE_MESH);
      inMesh = true;
      continue;
    }

    if (inMesh) {
      if (line === '}') {
        inMesh = false;
        continue;
      }
      if (line.startsWith('shader')) {
        const nameStart = line.indexOf('"');
        const nameEnd = line.indexOf('"', nameStart + 1);
        if (nameStart >= 0 && nameEnd > nameStart + 1) {
          found.add(MD5_MESH_FEATURE_MATERIAL);
        }
      }
    }
  }
  return found;
}
