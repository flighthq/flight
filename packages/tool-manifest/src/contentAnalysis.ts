import type { Manifest } from './manifest.js';
import { createManifest } from './manifest.js';

// The seam between a domain and this package.
//
// A DOMAIN analyzer (a SWF tag census, an AWD2 block census) reads one content file and reports what it
// observed, as plain ids under plain kind names. It then supplies a MAPPING from those ids to manifest
// features. Neither the observation vocabulary nor the mapping lives here: this package owns the shape
// of the exchange and nothing about any format. That is what lets a domain be added without editing
// this package, and what lets this package be tested without pretending to understand a format.

/** One content file as an analyzer saw it: observed ids, grouped by a kind the analyzer names. */
export interface ContentAnalysis {
  readonly observations: Readonly<Record<string, readonly string[]>>;
  readonly schemaVersion: 1;
  /** Where this came from — a path, a URL, or any identifier the analyzer chose. Reported in problems. */
  readonly source: string;
}

/**
 * How one observation kind becomes manifest features.
 *
 * `features` maps an observed id to the feature ids it requires; an observed id with no entry is
 * reported as unmapped rather than dropped, because silently ignoring something the content actually
 * contains is how a build ends up missing a handler it needed.
 */
export interface AnalysisMapping {
  readonly features: Readonly<Record<string, readonly string[]>>;
  /** The manifest feature group this kind's features belong to. */
  readonly group: string;
}

/** Mappings by observation kind. A kind with no mapping is reported, not ignored. */
export type AnalysisMappings = Readonly<Record<string, AnalysisMapping>>;

/** What `contentToManifest` produced, and everything it could not account for. */
export interface ContentManifestResult {
  readonly manifest: Manifest;
  readonly unmapped: readonly string[];
}

export const CONTENT_ANALYSIS_SCHEMA_VERSION = 1;

/** What `validateContentAnalysis` reports: the parsed analysis, or the reasons it is not one. */
export interface ContentAnalysisValidation {
  readonly analysis: ContentAnalysis | null;
  readonly problems: readonly string[];
}

/**
 * Turns one analysis into the manifest it implies, through the supplied mappings.
 *
 * Everything the mappings cannot explain is returned in `unmapped` — an unknown observation kind, or an
 * observed id the kind's mapping does not name. A caller decides whether that is fatal; this function
 * does not, because a domain that is still growing its mapping and a build that must not ship without a
 * handler are both legitimate readings of the same result.
 */
export function contentToManifest(
  analysis: Readonly<ContentAnalysis>,
  mappings: AnalysisMappings,
): ContentManifestResult {
  const features: Record<string, string[]> = {};
  const unmapped: string[] = [];

  for (const kind of Object.keys(analysis.observations).sort()) {
    const mapping = mappings[kind];
    if (mapping === undefined) {
      for (const id of analysis.observations[kind]!) unmapped.push(`${kind}:${id}`);
      continue;
    }
    for (const id of analysis.observations[kind]!) {
      const required = mapping.features[id];
      if (required === undefined) {
        unmapped.push(`${kind}:${id}`);
        continue;
      }
      (features[mapping.group] ??= []).push(...required);
    }
  }

  return { manifest: createManifest(features), unmapped: [...new Set(unmapped)].sort() };
}

/** Parses JSON text into a content analysis, reporting every problem rather than throwing. */
export function readContentAnalysis(text: string): ContentAnalysisValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { analysis: null, problems: [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  return validateContentAnalysis(parsed);
}

/** Checks an unknown value against the analysis shape, collecting every problem in one pass. */
export function validateContentAnalysis(value: unknown): ContentAnalysisValidation {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { analysis: null, problems: ['content analysis must be an object'] };
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== CONTENT_ANALYSIS_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion must be ${CONTENT_ANALYSIS_SCHEMA_VERSION}, got ${JSON.stringify(record.schemaVersion)}`,
    );
  }
  if (typeof record.source !== 'string' || record.source.length === 0)
    problems.push('source must be a non-empty string');

  const observations: Record<string, readonly string[]> = {};
  if (typeof record.observations !== 'object' || record.observations === null || Array.isArray(record.observations)) {
    problems.push('observations must be an object');
  } else {
    for (const [kind, ids] of Object.entries(record.observations as Record<string, unknown>)) {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        problems.push(`observations.${kind} must be an array of strings`);
        continue;
      }
      observations[kind] = ids as readonly string[];
    }
  }

  if (problems.length > 0) return { analysis: null, problems };
  return {
    analysis: {
      observations,
      schemaVersion: CONTENT_ANALYSIS_SCHEMA_VERSION,
      source: record.source as string,
    },
    problems: [],
  };
}
