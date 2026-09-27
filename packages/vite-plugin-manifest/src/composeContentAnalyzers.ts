import { mergeRequirementSets } from '@flighthq/requirement/contract';

import type { ContentAnalyzer } from './contentAnalyzers.ts';

/**
 * One analyzer for an extension SEVERAL format families claim, answering the union of what they report.
 *
 * ★ THE UNION IS THE ANSWER, NOT A PRECEDENCE. `.json` is a TexturePacker sheet, an Aseprite sheet, a texture
 * atlas, a Tiled map, a Lottie animation, a Spine skeleton, a DragonBones armature, a Unity particle config and a
 * BMFont descriptor — and a single file can legitimately be readable by more than one of those FAMILIES at once:
 * the spritesheet and texture-atlas registries both read TexturePacker, because one file is usable as either
 * depending on which API the app calls. Nothing at build time knows which the app will call, so picking a winner
 * would be a guess that silently drops the implementation the app actually needs. Reporting both costs a second
 * parser in the bundle; reporting one costs a bundle that cannot read its own asset.
 *
 * A family whose detector does not recognise the file contributes an EMPTY set, so the union is exactly "every
 * family that recognised it" with no filtering step of its own.
 *
 * `covers` INTERSECTS rather than unions, which `mergeRequirementSets` already does: a merged set may claim
 * completeness for a facet only where every member inspected it, and a positive requirement from one member is
 * still a fact even when another member inspected nothing.
 *
 * Readability is ANY member, which is what makes the "requires nothing" and "nothing could read this" answers
 * distinguishable for a shared extension: a `.json` no family recognises reports unreadable, and the plugin says
 * so, instead of emitting an empty manifest that looks like a document needing no implementations.
 */
export function composeContentAnalyzers(analyzers: readonly ContentAnalyzer[]): ContentAnalyzer {
  return {
    analyze: (source, decompressors, references) =>
      mergeRequirementSets(analyzers.map((analyzer) => analyzer.analyze(source, decompressors, references))),
    // Declared references are unioned across members, and every member receives every text. An analyzer's
    // contract is already to stay usable on fewer texts than it asked for, so a member seeing a sibling file it
    // did not ask for is the same case it must already handle.
    collectReferences: (source) => analyzers.flatMap((analyzer) => analyzer.collectReferences?.(source) ?? []),
    isReadable: (source, decompressors) => analyzers.some((analyzer) => analyzer.isReadable(source, decompressors)),
  };
}
