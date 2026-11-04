interface SourceDiscoveryOptions {
  readonly availableFileNames: readonly string[];
  readonly libSource: string;
  readonly manifestSource: string;
}

// Package generation follows the crate's default production module graph. Directory enumeration is
// deliberately insufficient: path modules used only by `#[cfg(test)]` or `object-api` sugar live
// beside production sources but are not part of the default crate.
export function collectPackageSourceFileNames(options: SourceDiscoveryOptions): string[] {
  const available = new Set(options.availableFileNames);
  const defaultFeatures = collectDefaultFeatures(options.manifestSource);
  const result: string[] = [];
  const modulePattern = /^((?:\s*#\[[^\n]*\]\s*\n)*)\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/gm;

  for (const match of options.libSource.matchAll(modulePattern)) {
    const attributes = match[1];
    const moduleName = match[2];
    if (moduleName === 'contract' || moduleName === 'sugar') continue;
    if (!attributesEnableModule(attributes, defaultFeatures)) continue;
    const fileName = `${moduleName}.rs`;
    if (available.has(fileName)) result.push(fileName);
  }

  return [...new Set(result)].sort();
}

function attributesEnableModule(attributes: string, defaultFeatures: ReadonlySet<string>): boolean {
  for (const line of attributes.split(/\r?\n/)) {
    const match = line.trim().match(/^#\[\s*cfg\s*\((.*)\)\s*\]$/);
    if (match && !evaluateCfg(match[1], defaultFeatures)) return false;
  }
  return true;
}

function collectDefaultFeatures(manifest: string): Set<string> {
  const header = /^\[features\]\s*$/m.exec(manifest);
  if (!header) return new Set();
  const remainder = manifest.slice(header.index + header[0].length);
  const nextSection = /^\[/m.exec(remainder);
  const features = nextSection ? remainder.slice(0, nextSection.index) : remainder;
  const defaults = features.match(/^\s*default\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? '';
  return new Set([...defaults.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

function evaluateCfg(predicate: string, defaultFeatures: ReadonlySet<string>): boolean {
  const value = predicate.trim();
  if (value === 'test') return false;
  const feature = value.match(/^feature\s*=\s*"([^"]+)"$/);
  if (feature) return defaultFeatures.has(feature[1]);
  for (const operator of ['all', 'any', 'not'] as const) {
    const prefix = `${operator}(`;
    if (!value.startsWith(prefix) || !value.endsWith(')')) continue;
    const terms = splitTopLevel(value.slice(prefix.length, -1));
    if (operator === 'all') return terms.every((term) => evaluateCfg(term, defaultFeatures));
    if (operator === 'any') return terms.some((term) => evaluateCfg(term, defaultFeatures));
    return terms.length === 1 ? !evaluateCfg(terms[0], defaultFeatures) : true;
  }
  // Platform and toolchain predicates are not feature selection. Keep their modules visible rather
  // than silently dropping a production surface the generator cannot evaluate itself.
  return true;
}

function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}
