/**
 * Which content features an MD5 animation file (.md5anim) actually contains, determined by
 * scanning the text for section openings — the same vocabulary `parseMd5Anim` reads.
 *
 * Features:
 * - `Hierarchy` — present when a `hierarchy {` section exists (joint binding metadata).
 * - `Animation` — present when at least one `frame N {` section exists (actual motion data).
 *
 * The MD5 animation format does not carry mesh or material content — those live in the paired
 * `.md5mesh` file — so this analyzer never claims `Mesh`, `Skeleton`, or `Material` features.
 * It claims only what the `.md5anim` file itself contains: joint hierarchy metadata and frame
 * data.
 *
 * Build-time only: scans the line vocabulary and stops. No animation channels are built, no
 * coordinate conversion happens, and no AnimationClip is produced.
 *
 * Returns an empty set for a source with no recognized sections.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function collectMd5AnimFeatures(source: string): ReadonlySet<string> {
  const found = new Set<string>();
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('//')) continue;

    if (line === 'hierarchy {') {
      found.add('Hierarchy');
      continue;
    }

    if (line.startsWith('frame ') && line.endsWith('{')) {
      found.add('Animation');
      if (found.size === 2) break;
    }
  }
  return found;
}
