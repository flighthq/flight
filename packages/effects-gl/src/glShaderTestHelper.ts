// Test-only support for evaluating the arithmetic inside the fragment shader an effect actually ships.
//
// ★ WHY A TEXT ASSERTION IS NOT THE SAME CLAIM. A whole class of effect defect — which edge a row is
// counted from, which way a gradient runs, where a band sits — lives entirely inside a shader string,
// and jsdom compiles no GLSL. `expect(src).toContain('1.0 - v_texCoord.y')` passes for a shader that
// also contains a second, contradictory reading, and fails for a correct shader written another way; it
// is a claim about a spelling. Substituting values into the shipped expression and evaluating it is a
// claim about behaviour, made against the exact text handed to the compiler.
//
// ★ WHAT IT CANNOT DO, so a pass is never read as "the shader is correct". It evaluates ONE extracted
// SCALAR expression over the arithmetic subset GLSL shares with JavaScript. Vector types, swizzles,
// texture reads, and control flow are outside that subset, and an expression using them throws here
// rather than quietly returning a number — an unevaluatable expression is a failed test, not a pass.
// The `%` operator is deliberately absent: GLSL has no integer-modulo on floats and WGSL's `%` follows
// the sign of its left operand, so a JavaScript `%` would silently model the wrong language.

/**
 * Evaluates a scalar GLSL expression with each named input bound to a number.
 *
 * Every identifier in the expression must be either bound by the caller or a scalar builtin; anything
 * else throws, so a renamed uniform surfaces as a failure rather than as a value computed from a
 * partially substituted expression.
 */
export function evaluateGlslScalarExpression(expression: string, bindings: Readonly<Record<string, number>>): number {
  let text = expression;
  // Longest name first: a shorter binding that is a substring of a longer one would otherwise be
  // substituted inside it and leave a fragment of the longer name behind.
  for (const name of Object.keys(bindings).sort((left, right) => right.length - left.length)) {
    text = text.split(name).join(`(${bindings[name]!})`);
  }
  for (const token of text.match(/[A-Za-z_][\w.]*/g) ?? []) {
    if (!GLSL_SCALAR_BUILTINS.has(token)) {
      throw new Error(`evaluateGlslScalarExpression: no binding for '${token}' in: ${expression}`);
    }
  }
  const value: unknown = new Function(`${GLSL_SCALAR_PRELUDE} return (${text});`)();
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`evaluateGlslScalarExpression: '${expression}' did not evaluate to a finite number`);
  }
  return value;
}

/**
 * Pulls one capture group out of a shader source.
 *
 * Throws when the pattern does not match, because a silently-unmatched anchor is the failure mode that
 * lets a test measure nothing and report success — the same shape as a string replacement that matched
 * no line. A test asserting on an expression it never found must fail loudly.
 */
export function extractGlslExpression(source: string, pattern: Readonly<RegExp>): string {
  const match = pattern.exec(source);
  if (match === null || match[1] === undefined) {
    throw new Error(`extractGlslExpression: ${String(pattern)} matched no expression in the shader source`);
  }
  return match[1].trim();
}

const GLSL_SCALAR_BUILTINS = new Set([
  'abs',
  'ceil',
  'clamp',
  'cos',
  'exp',
  'floor',
  'fract',
  'log',
  'max',
  'min',
  'mix',
  'pow',
  'sign',
  'sin',
  'smoothstep',
  'sqrt',
  'step',
  'tan',
]);

const GLSL_SCALAR_PRELUDE = [
  '"use strict";',
  'const {abs, ceil, cos, exp, floor, log, max, min, pow, sign, sin, sqrt, tan} = Math;',
  'const clamp = (x, lo, hi) => min(max(x, lo), hi);',
  'const fract = (x) => x - floor(x);',
  'const mix = (a, b, t) => a + (b - a) * t;',
  'const step = (edge, x) => (x < edge ? 0 : 1);',
  'const smoothstep = (lo, hi, x) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };',
].join(' ');
