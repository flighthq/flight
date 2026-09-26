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
const MD5_ANIM_FEATURE_HIERARCHY = 'Hierarchy';
const MD5_ANIM_FEATURE_ANIMATION = 'Animation';

/**
 * Every feature name this analyzer can report — the vocabulary it emits under `document.format`.
 *
 * Stated as one list, and the scan below uses these same names, so the vocabulary cannot drift from what
 * the scan actually emits. A build tool needs the whole list to tell a feature nothing claims from a
 * feature the analyzer never considered.
 */
export const MD5_ANIM_FEATURE_NAMES: readonly string[] = [MD5_ANIM_FEATURE_HIERARCHY, MD5_ANIM_FEATURE_ANIMATION];

export function collectMd5AnimFeatures(source: string): ReadonlySet<string> {
  const found = new Set<string>();
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('//')) continue;

    if (line === 'hierarchy {') {
      found.add(MD5_ANIM_FEATURE_HIERARCHY);
      continue;
    }

    if (line.startsWith('frame ') && line.endsWith('{')) {
      found.add(MD5_ANIM_FEATURE_ANIMATION);
      if (found.size === 2) break;
    }
  }
  return found;
}
