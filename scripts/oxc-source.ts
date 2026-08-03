import { readFileSync } from 'node:fs';

import { parseSync } from 'oxc-parser';
import type { EcmaScriptModule, Program } from 'oxc-parser';

export interface ParsedOxcSource {
  module: EcmaScriptModule;
  program: Program;
  text: string;
}

const sourceCache = new Map<string, ParsedOxcSource>();

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
