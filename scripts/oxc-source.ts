import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { parseSync } from 'oxc-parser';
import type { EcmaScriptModule, Program } from 'oxc-parser';

export interface ParsedOxcSource {
  module: EcmaScriptModule;
  program: Program;
  text: string;
}

const sourceCache = new Map<string, ParsedOxcSource>();

// The TypeScript sources `.oxfmtrc.json` ignores by exact path: valid TypeScript that Oxc cannot parse
// (the compiler's `await` callable type labels). Directory and glob patterns are not exemptions.
export function getOxcUnsupportedSourcePaths(oxfmtConfigText: string): Set<string> {
  const config = JSON.parse(oxfmtConfigText) as { ignorePatterns?: unknown };
  const patterns = Array.isArray(config.ignorePatterns) ? config.ignorePatterns : [];
  return new Set(
    patterns.filter(
      (pattern): pattern is string =>
        typeof pattern === 'string' && /\.(?:d\.)?tsx?$/.test(pattern) && !/[*?[\]{}!]/.test(pattern),
    ),
  );
}

// Repository gates frequently ask several independent syntactic questions about the same file. Keep
// the source text and Oxc result together so each standalone gate reads and parses a file at most once.
export function getParsedOxcSource(filePath: string): ParsedOxcSource {
  const cached = sourceCache.get(filePath);
  if (cached !== undefined) return cached;

  const text = readFileSync(filePath, 'utf-8');
  const { errors, module, program } = parseSync(filePath, text, {
    lang: filePath.endsWith('.tsx') ? 'tsx' : filePath.endsWith('.d.ts') ? 'dts' : 'ts',
    sourceType: 'module',
  });
  if (errors.length > 0) throw new Error(`Could not parse ${filePath}: ${errors[0]?.message ?? 'unknown parse error'}`);

  const parsed = { module, program, text };
  sourceCache.set(filePath, parsed);
  return parsed;
}

// The parse of `filePath`, or `null` when it is one of `unsupportedPaths` (repository-relative, `/`
// separated) and Oxc rejects it. Any other parse failure still throws, and a listed file that Oxc can
// parse is checked normally, so the exemption lapses by itself once the parser accepts the syntax.
export function getParsedOxcSourceUnlessUnsupported(
  filePath: string,
  repositoryRoot: string,
  unsupportedPaths: ReadonlySet<string>,
): ParsedOxcSource | null {
  try {
    return getParsedOxcSource(filePath);
  } catch (error) {
    const path = relative(repositoryRoot, filePath).replaceAll('\\', '/');
    if (unsupportedPaths.has(path)) return null;
    throw error;
  }
}
