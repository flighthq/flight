// Functional assertion sensitivity census: which scene oracles can distinguish WHERE pixels landed,
// rather than only whether the expected population of colours exists somewhere in an analysis area.
//
// This is a source instrument, not a renderer. It deliberately reports the evidence it used for every
// scene so a reader can dispute a classification without reverse-engineering a count. Its conservative
// rule is:
//
//   able  — a threshold consumes a named pixel sample, spatial bounds/neighbourhood, or two distinct
//           call-site regions;
//   blind — thresholds consume only an aggregate such as a count, average, histogram, or coverage
//           fraction, which survives rearranging the sampled pixels;
//   gap   — no executable throw threshold is reachable from assertRender;
//   exempt — reserved for explicit, hand-reviewed non-image contracts (none at this baseline).
//
// The scanner is dependency-free on purpose. A census used to recover the repository's assertion state
// must still run in a checkout before npm dependencies have been installed. It masks comments and strings,
// balances function/loop delimiters, follows local helper calls, and — critically — reads helper CALL-SITE
// arguments. Looking only inside an averaging helper made effect-inner-shadow a known false positive: four
// calls compare four named edge regions, so its threshold does depend on WHERE.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUTPUT_PATH = 'agents/functional-assertion-census.md';
const PIXEL_READER = /^getBitmapPixel(?:Channel|Luminance|Rgb)?$/;
const SPATIAL_PARAMETER = /^(?:from|to|x\d*|y\d*|left|right|top|bottom|start|end|region|band)/i;
const SPATIAL_BOUNDS =
  /\b(?:findColorBounds|assertSquareBounds|minX|maxX|minY|maxY|leftmost|rightmost|topmost|bottommost|widestRow|firstLit|lastLit|brightest[XY]|centroid[XY]|topMean[XY]|bottomMean[XY]|transitionWidth|radialMidDim|tangentialMidDim)\b/;
const SPATIAL_NEIGHBOUR =
  /\b(?:adjacent|delta|deltas|gradient|highFrequency|neighbou?r|previous|steepSteps?|transitions?)\b/i;

// Hand-reviewed known answers are executable controls, not overrides that silently bless arbitrary rows.
// Every invocation re-analyses the source and fails if any answer changes. material-wireframe used to be
// the important negative: its circular loop looked positional while both thresholds consumed only bright/dark
// population counts. Its direct per-edge color samples are now positive controls for the repaired oracle.
export const ASSERTION_SENSITIVITY_CONTROLS = {
  'functional/scenes/effect-film-grain.webgl.ts': 'able',
  'functional/scenes/effect-god-rays.webgl.ts': 'able',
  'functional/scenes/effect-inner-shadow.webgl.ts': 'able',
  'functional/scenes/effect-radial-blur.webgl.ts': 'able',
  'functional/scenes/material-wireframe.webgl.ts': 'able',
  'functional/scenes/material-wireframe.webgpu.ts': 'able',
  'functional/scenes/particle-motion-blur.webgl.ts': 'able',
  'functional/scenes/particle-motion-blur.webgpu.ts': 'able',
  'functional/scenes/shape-stroke.ts': 'able',
  'functional/scenes/text-native.dom.ts': 'able',
};

/** Replace comments and string contents with spaces while retaining every offset and newline. */
export function maskTypeScript(source) {
  const chars = [...source];
  let index = 0;
  while (index < chars.length) {
    const current = chars[index];
    const next = chars[index + 1];
    if (current === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 2;
      while (index < chars.length && chars[index] !== '\n') chars[index++] = ' ';
      continue;
    }
    if (current === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 2;
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) {
        if (chars[index] !== '\n') chars[index] = ' ';
        index += 1;
      }
      if (index < chars.length) {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        index += 2;
      }
      continue;
    }
    if (current === "'" || current === '"' || current === '`') {
      const quote = current;
      chars[index++] = ' ';
      while (index < chars.length) {
        if (chars[index] === '\\') {
          chars[index] = ' ';
          if (chars[index + 1] !== '\n') chars[index + 1] = ' ';
          index += 2;
          continue;
        }
        if (chars[index] === quote) {
          chars[index++] = ' ';
          break;
        }
        if (chars[index] !== '\n') chars[index] = ' ';
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return chars.join('');
}

function matchingDelimiter(masked, open, left, right) {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === left) depth += 1;
    else if (masked[index] === right && --depth === 0) return index;
  }
  return null;
}

function lineAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (source[index] === '\n') line += 1;
  return line;
}

function splitArguments(source, masked, open, close) {
  const arguments_ = [];
  let start = open + 1;
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = start; index < close; index += 1) {
    const character = masked[index];
    if (character === '(') round += 1;
    else if (character === ')') round -= 1;
    else if (character === '[') square += 1;
    else if (character === ']') square -= 1;
    else if (character === '{') curly += 1;
    else if (character === '}') curly -= 1;
    else if (character === ',' && round === 0 && square === 0 && curly === 0) {
      arguments_.push(source.slice(start, index).replace(/\s+/g, ' ').trim());
      start = index + 1;
    }
  }
  const tail = source.slice(start, close).replace(/\s+/g, ' ').trim();
  if (tail.length > 0) arguments_.push(tail);
  return arguments_;
}

function collectFunctions(masked) {
  const definitions = new Map();
  const declarations = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of masked.matchAll(declarations)) {
    const name = match[1];
    const openParameter = match.index + match[0].lastIndexOf('(');
    const closeParameter = matchingDelimiter(masked, openParameter, '(', ')');
    if (closeParameter === null) continue;
    let bodyStart = masked.indexOf('{', closeParameter + 1);
    const declarationEnd = masked.indexOf(';', closeParameter + 1);
    if (bodyStart < 0 || (declarationEnd >= 0 && declarationEnd < bodyStart)) continue;
    if (/^\s*:\s*\{/.test(masked.slice(closeParameter + 1, bodyStart + 1))) {
      const returnTypeEnd = matchingDelimiter(masked, bodyStart, '{', '}');
      if (returnTypeEnd === null) continue;
      bodyStart = masked.indexOf('{', returnTypeEnd + 1);
      if (bodyStart < 0) continue;
    }
    const bodyEnd = matchingDelimiter(masked, bodyStart, '{', '}');
    if (bodyEnd === null) continue;
    definitions.set(name, {
      bodyEnd,
      bodyStart: bodyStart + 1,
      declarationEnd: bodyStart,
      name,
      parameters: masked
        .slice(openParameter + 1, closeParameter)
        .split(',')
        .map((parameter) => parameter.trim().match(/^[A-Za-z_$][\w$]*/)?.[0])
        .filter((parameter) => parameter !== undefined),
      start: match.index,
    });
  }

  const blockArrows = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)[^=;]*=>\s*\{/g;
  for (const match of masked.matchAll(blockArrows)) {
    const name = match[1];
    const bodyStart = match.index + match[0].lastIndexOf('{');
    const bodyEnd = matchingDelimiter(masked, bodyStart, '{', '}');
    if (bodyEnd === null) continue;
    definitions.set(name, {
      bodyEnd,
      bodyStart: bodyStart + 1,
      declarationEnd: bodyStart,
      name,
      parameters: match[2]
        .split(',')
        .map((parameter) => parameter.trim().match(/^[A-Za-z_$][\w$]*/)?.[0])
        .filter((parameter) => parameter !== undefined),
      start: match.index,
    });
  }

  const expressionArrows = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)[^=;]*=>\s*/g;
  for (const match of masked.matchAll(expressionArrows)) {
    const name = match[1];
    if (definitions.has(name)) continue;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = masked.indexOf(';', bodyStart);
    if (bodyEnd < 0) continue;
    definitions.set(name, {
      bodyEnd,
      bodyStart,
      declarationEnd: bodyStart,
      name,
      parameters: match[2]
        .split(',')
        .map((parameter) => parameter.trim().match(/^[A-Za-z_$][\w$]*/)?.[0])
        .filter((parameter) => parameter !== undefined),
      start: match.index,
    });
  }
  return definitions;
}

function nestedFunctions(definition, definitions) {
  return [...definitions.values()].filter(
    (candidate) =>
      candidate.name !== definition.name &&
      candidate.start >= definition.bodyStart &&
      candidate.bodyEnd <= definition.bodyEnd,
  );
}

function inNestedFunction(offset, definition, definitions) {
  return nestedFunctions(definition, definitions).some(
    (candidate) => offset >= candidate.start && offset <= candidate.bodyEnd,
  );
}

function collectCalls(source, masked, definition, definitions) {
  const calls = [];
  const body = masked.slice(definition.bodyStart, definition.bodyEnd);
  const callPattern = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of body.matchAll(callPattern)) {
    const offset = definition.bodyStart + match.index;
    if (inNestedFunction(offset, definition, definitions)) continue;
    const callee = match[1];
    if (callee === 'if' || callee === 'for' || callee === 'switch' || callee === 'while') continue;
    const open = definition.bodyStart + match.index + match[0].lastIndexOf('(');
    const close = matchingDelimiter(masked, open, '(', ')');
    if (close === null || close > definition.bodyEnd) continue;
    calls.push({ arguments: splitArguments(source, masked, open, close), callee, offset });
  }
  return calls;
}

function loopRanges(masked, definition) {
  const ranges = [];
  const body = masked.slice(definition.bodyStart, definition.bodyEnd);
  for (const match of body.matchAll(/\b(?:for|while)\s*\(/g)) {
    const open = definition.bodyStart + match.index + match[0].lastIndexOf('(');
    const conditionEnd = matchingDelimiter(masked, open, '(', ')');
    if (conditionEnd === null) continue;
    const blockStart = masked.indexOf('{', conditionEnd + 1);
    if (blockStart < 0 || blockStart >= definition.bodyEnd) continue;
    const blockEnd = matchingDelimiter(masked, blockStart, '{', '}');
    if (blockEnd !== null && blockEnd <= definition.bodyEnd) ranges.push([blockStart, blockEnd]);
  }
  return ranges;
}

function isInsideLoop(masked, definition, offset) {
  return loopRanges(masked, definition).some(([start, end]) => offset >= start && offset <= end);
}

function functionBody(masked, definition) {
  return masked.slice(definition.bodyStart, definition.bodyEnd);
}

function isAggregate(definition, masked) {
  const body = functionBody(masked, definition);
  return /\b(?:for|while)\s*\(/.test(body) && /\bgetBitmapPixel(?:Channel|Luminance|Rgb)?\s*\(/.test(body);
}

function isPixelSampler(definition, masked, definitions, seen = new Set()) {
  if (seen.has(definition.name)) return false;
  seen.add(definition.name);
  if (/\bgetBitmapPixel(?:Channel|Luminance|Rgb)?\s*\(/.test(functionBody(masked, definition))) return true;
  return collectCalls(masked, masked, definition, definitions).some((call) => {
    const called = definitions.get(call.callee);
    return called !== undefined && isPixelSampler(called, masked, definitions, new Set(seen));
  });
}

function reachableFunctions(source, masked, root, definitions) {
  const reachable = [];
  const seen = new Set();
  const visit = (definition) => {
    if (seen.has(definition.name)) return;
    seen.add(definition.name);
    reachable.push(definition);
    for (const call of collectCalls(source, masked, definition, definitions)) {
      const called = definitions.get(call.callee);
      if (called !== undefined) visit(called);
    }
  };
  visit(root);
  return reachable;
}

function thresholdCount(masked, reachable) {
  return reachable.reduce(
    (count, definition) => count + (functionBody(masked, definition).match(/\bthrow\s+new\s+Error\b/g)?.length ?? 0),
    0,
  );
}

function regionEvidence(source, masked, reachable, definitions) {
  for (const aggregate of reachable) {
    if (!isAggregate(aggregate, masked)) continue;
    const spatialIndexes = aggregate.parameters
      .map((parameter, index) => (SPATIAL_PARAMETER.test(parameter) ? index : -1))
      .filter((index) => index >= 0);
    if (spatialIndexes.length === 0) continue;
    const sites = [];
    for (const caller of reachable) {
      for (const call of collectCalls(source, masked, caller, definitions)) {
        if (call.callee === aggregate.name) sites.push(call);
      }
    }
    const regions = new Set(
      sites.map((site) => spatialIndexes.map((index) => site.arguments[index] ?? '').join(' | ')),
    );
    if (regions.size < 2) continue;
    const first = sites[0];
    const previews = [...regions].slice(0, 3).join(' ; ');
    return {
      detail: `${aggregate.name} is thresholded across ${regions.size} distinct call-site regions (${previews})`,
      line: lineAt(source, first.offset),
      rank: 4,
    };
  }
  return null;
}

function namedPointEvidence(source, masked, root, definitions) {
  const visited = new Set();
  const walk = (definition, pathInsideLoop) => {
    const key = `${definition.name}:${pathInsideLoop ? 'loop' : 'direct'}`;
    if (visited.has(key)) return null;
    visited.add(key);
    for (const call of collectCalls(source, masked, definition, definitions)) {
      const looped = pathInsideLoop || isInsideLoop(masked, definition, call.offset);
      if (PIXEL_READER.test(call.callee) && !looped) {
        return {
          detail: `${call.callee} is thresholded at named coordinates (${call.arguments.slice(1, 3).join(', ')})`,
          line: lineAt(source, call.offset),
          rank: 5,
        };
      }
      const called = definitions.get(call.callee);
      if (called === undefined || isAggregate(called, masked)) continue;
      if (isPixelSampler(called, masked, definitions) && !looped) {
        return {
          detail: `${called.name} samples pixels from a named call site (${call.arguments.slice(0, 3).join(', ')})`,
          line: lineAt(source, call.offset),
          rank: 5,
        };
      }
      const nested = walk(called, looped);
      if (nested !== null) return nested;
    }
    return null;
  };
  return walk(root, false);
}

function boundsEvidence(source, masked, reachable) {
  for (const definition of reachable) {
    const match = SPATIAL_BOUNDS.exec(functionBody(masked, definition));
    if (match === null) continue;
    return {
      detail: `${match[0]} carries a thresholded spatial bound`,
      line: lineAt(source, definition.bodyStart + match.index),
      rank: 3,
    };
  }
  return null;
}

function neighbourhoodEvidence(source, masked, reachable) {
  for (const definition of reachable) {
    const match = SPATIAL_NEIGHBOUR.exec(functionBody(masked, definition));
    if (match === null) continue;
    return {
      detail: `${definition.name} thresholds spatial neighbourhood order via ${match[0]}`,
      line: lineAt(source, definition.bodyStart + match.index),
      rank: 2,
    };
  }
  return null;
}

function loopThresholdEvidence(source, masked, reachable, definitions) {
  for (const definition of reachable) {
    const ranges = loopRanges(masked, definition);
    for (const call of collectCalls(source, masked, definition, definitions)) {
      const called = definitions.get(call.callee);
      const samplesPixel =
        PIXEL_READER.test(call.callee) ||
        (called !== undefined && !isAggregate(called, masked) && isPixelSampler(called, masked, definitions));
      if (!samplesPixel) continue;
      const thresholdLoop = ranges.find(
        ([start, end]) =>
          call.offset >= start && call.offset <= end && /\bthrow\s+new\s+Error\b/.test(masked.slice(start, end + 1)),
      );
      if (thresholdLoop === undefined) continue;
      return {
        detail: `${call.callee} is checked by a throw threshold inside its sampling loop (${call.arguments
          .slice(PIXEL_READER.test(call.callee) ? 1 : 0, PIXEL_READER.test(call.callee) ? 3 : 2)
          .join(', ')})`,
        line: lineAt(source, call.offset),
        rank: 5,
      };
    }
  }
  return null;
}

function multipleSampleRegionEvidence(source, masked, reachable, definitions) {
  for (const sampler of definitions.values()) {
    if (isAggregate(sampler, masked) || !isPixelSampler(sampler, masked, definitions)) continue;
    const sites = [];
    for (const caller of reachable) {
      for (const call of collectCalls(source, masked, caller, definitions)) {
        if (call.callee === sampler.name) sites.push(call);
      }
    }
    const regions = new Set(sites.map((site) => site.arguments.slice(0, 2).join(' | ')));
    if (regions.size < 2) continue;
    return {
      detail: `${sampler.name} feeds thresholds from ${regions.size} distinct sample call sites (${[...regions]
        .slice(0, 3)
        .join(' ; ')})`,
      line: lineAt(source, sites[0].offset),
      rank: 4,
    };
  }
  return null;
}

function indexedExpectationEvidence(source, masked, reachable, definitions) {
  for (const definition of reachable) {
    const body = functionBody(masked, definition);
    if (!/\b(?:expected|original|reference|target)\w*\s*\[\s*(?:i|index|row|col|column)\b/i.test(body)) continue;
    const call = collectCalls(source, masked, definition, definitions).find((site) => {
      const called = definitions.get(site.callee);
      return PIXEL_READER.test(site.callee) || (called !== undefined && isPixelSampler(called, masked, definitions));
    });
    if (call === undefined) continue;
    return {
      detail: `${call.callee} is compared with a location-indexed expected value`,
      line: lineAt(source, call.offset),
      rank: 4,
    };
  }
  return null;
}

/** Classify one scene source and retain the exact evidence line used for the verdict. */
export function classifyAssertionSource(path, source) {
  const masked = maskTypeScript(source);
  const definitions = collectFunctions(masked);
  const root = definitions.get('assertRender');
  if (root === undefined || !/\bexport\s+function\s+assertRender\b/.test(masked.slice(0, root.start + 40))) {
    return { evidence: 'no exported assertRender function', line: 1, path, verdict: 'gap' };
  }
  const reachable = reachableFunctions(source, masked, root, definitions);
  const thresholds = thresholdCount(masked, reachable);
  if (thresholds === 0) {
    return {
      evidence: 'assertRender reaches no throw threshold',
      line: lineAt(source, root.start),
      path,
      verdict: 'gap',
    };
  }

  // More specific evidence wins. Region calls come first to make the call-site argument proof visible
  // instead of reducing effect-inner-shadow to the pixel read inside its averaging helper.
  const evidence = [
    regionEvidence(source, masked, reachable, definitions),
    namedPointEvidence(source, masked, root, definitions),
    loopThresholdEvidence(source, masked, reachable, definitions),
    multipleSampleRegionEvidence(source, masked, reachable, definitions),
    indexedExpectationEvidence(source, masked, reachable, definitions),
    boundsEvidence(source, masked, reachable),
    neighbourhoodEvidence(source, masked, reachable),
  ]
    .filter((item) => item !== null)
    .sort((a, b) => b.rank - a.rank)[0];
  if (evidence !== undefined) return { evidence: evidence.detail, line: evidence.line, path, verdict: 'able' };

  const aggregate = reachable.find((definition) => isAggregate(definition, masked));
  const detail =
    aggregate === undefined
      ? `${thresholds} throw threshold${thresholds === 1 ? '' : 's'} without a pixel-location dependency`
      : `${aggregate.name} supplies only rearrangement-invariant counts, averages, histograms, or coverage`;
  return { evidence: detail, line: lineAt(source, aggregate?.start ?? root.start), path, verdict: 'blind' };
}

/** Read and classify every TypeScript functional scene, preserving a stable row per source file. */
export function readAssertionSensitivityRows(root) {
  const directory = join(root, 'functional', 'scenes');
  return readdirSync(directory)
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => {
      const absolute = join(directory, file);
      return classifyAssertionSource(relative(root, absolute).replaceAll('\\', '/'), readFileSync(absolute, 'utf8'));
    });
}

/** Known-answer controls fail every mode, including baseline writes, before output can be trusted. */
export function assertSensitivityControls(rows) {
  const byPath = new Map(rows.map((row) => [row.path, row]));
  const failures = [];
  for (const [path, expected] of Object.entries(ASSERTION_SENSITIVITY_CONTROLS)) {
    const actual = byPath.get(path)?.verdict ?? 'missing';
    if (actual !== expected) failures.push(`${path}: expected ${expected}, got ${actual}`);
  }
  if (failures.length > 0) throw new Error(`Assertion-sensitivity control failure:\n${failures.join('\n')}`);
}

/** Markdown is the committed output: counts plus every identity and the evidence behind its verdict. */
export function formatAssertionSensitivityReport(rows) {
  const counts = new Map([
    ['able', 0],
    ['blind', 0],
    ['exempt', 0],
    ['gap', 0],
  ]);
  for (const row of rows) counts.set(row.verdict, (counts.get(row.verdict) ?? 0) + 1);
  const lines = [
    '# Functional Assertion Location-Sensitivity Census',
    '',
    '<!-- Generated by `npm run audit:assertions:baseline`; verify with `npm run audit:assertions:check`. -->',
    '',
    'Current-tree source census. Historical totals of 42 blind and 20 unasserted had no surviving',
    'instrument or case rule and are therefore unsupported and not comparable with this population.',
    '',
    '| verdict | scene sources |',
    '| --- | ---: |',
    `| able | ${counts.get('able')} |`,
    `| blind | ${counts.get('blind')} |`,
    `| gap | ${counts.get('gap')} |`,
    `| exempt | ${counts.get('exempt')} |`,
    `| **total** | **${rows.length}** |`,
    '',
    '`able` means at least one throw threshold depends on a named sample point, spatial bound or',
    'neighbourhood, or multiple distinct call-site regions. `blind` means its thresholds use only',
    'rearrangement-invariant whole-analysis aggregates. `gap` means no throw threshold is reachable from',
    '`assertRender`; `exempt` is reserved for an explicitly reviewed non-image contract.',
    '',
    '| source | verdict | evidence |',
    '| --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(`| \`${row.path}\` | ${row.verdict} | L${row.line}: ${row.evidence.replaceAll('|', '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Read the gated identity and verdict from each census row, ignoring human-facing evidence details. */
export function parseAssertionSensitivitySemantics(report) {
  const rows = [];
  for (const line of report.split('\n')) {
    const match = /^\| `([^`]+)` \| (able|blind|exempt|gap) \|/.exec(line);
    if (match !== null) rows.push({ path: match[1], verdict: match[2] });
  }
  return rows;
}

/** Gate committed census freshness on scene identity and verdict, not evidence wording or line movement. */
export function hasCurrentAssertionSensitivitySemantics(rows, committedReport) {
  const canonicalize = (items) =>
    items.map(({ path, verdict }) => ({ path, verdict })).sort((left, right) => left.path.localeCompare(right.path));
  return (
    JSON.stringify(canonicalize(parseAssertionSensitivitySemantics(committedReport))) ===
    JSON.stringify(canonicalize(rows))
  );
}

function outputPath(root) {
  return join(root, OUTPUT_PATH);
}

export function runAssertionSensitivity(root, argv) {
  const rows = readAssertionSensitivityRows(root);
  assertSensitivityControls(rows);
  const report = formatAssertionSensitivityReport(rows);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ controls: ASSERTION_SENSITIVITY_CONTROLS, rows }, null, 2));
    return 0;
  }
  if (argv.includes('--update')) {
    writeFileSync(outputPath(root), report);
    console.log(`Wrote ${OUTPUT_PATH} (${rows.length} scene sources).`);
    return 0;
  }
  if (argv.includes('--check')) {
    const committed = readFileSync(outputPath(root), 'utf8');
    if (!hasCurrentAssertionSensitivitySemantics(rows, committed)) {
      console.error(`${OUTPUT_PATH} has stale scene identities or verdicts; run npm run audit:assertions:baseline.`);
      return 1;
    }
    if (committed !== report) {
      console.log(
        `${OUTPUT_PATH} is semantically current; line locators or evidence details differ from the current tree.`,
      );
    }
    console.log(`${OUTPUT_PATH} semantic census is current (${rows.length} scene sources; controls passed).`);
    return 0;
  }
  console.log(report);
  return 0;
}

if (process.argv[1] !== undefined && /assertion-sensitivity\.(?:[cm]?js|ts)$/.test(process.argv[1])) {
  process.exitCode = runAssertionSensitivity(process.cwd(), process.argv.slice(2));
}
