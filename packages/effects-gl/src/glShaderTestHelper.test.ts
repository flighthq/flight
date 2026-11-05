// Generated from crates/flight-effects-gl/tests/gl_shader_test_helper_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { evaluateGlslScalarExpression, extractGlslExpression } from '@flighthq/effects-gl/contract';
import { describe, expect, it } from 'vitest';

function assertClose(actual: number, expected: number, tsBound: number): void {
  const roundoff = 4.0 * Math.pow(2, -23) * Math.max(Math.abs(expected), 1.0);
  const bound = Math.max(tsBound, roundoff);
  expect(Math.abs(actual - expected) <= bound, `expected ${actual} to be within ${bound} of ${expected}`).toBe(true);
}

function bindings(entries: Readonly<Array<readonly [string, number]>>): Record<string, number> {
  let record = {};
  for (const [key, value] of entries) {
    record[String(key)] = value;
  }
  return record;
}

describe('evaluateGlslScalarExpression', () => {
  it('substitutes every binding and evaluates the arithmetic', () => {
    const value = evaluateGlslScalarExpression(
      'abs((1.0 - v_texCoord.y) - u_center)',
      bindings([
        ['u_center', 0.25],
        ['v_texCoord.y', 0.75],
      ]),
    );
    assertClose(value, 0.0, 0.5e-10);
  });
  it('gives a different answer for the two vertical origins', () => {
    const value = evaluateGlslScalarExpression(
      'abs(v_texCoord.y - u_center)',
      bindings([
        ['u_center', 0.25],
        ['v_texCoord.y', 0.75],
      ]),
    );
    assertClose(value, 0.5, 0.5e-10);
  });
  it('binds the longest name first', () => {
    const value = evaluateGlslScalarExpression(
      'u_scale + u_scaleFactor',
      bindings([
        ['u_scale', 2.0],
        ['u_scaleFactor', 30.0],
      ]),
    );
    expect(value).toEqual(32.0);
  });
  it('resolves the scalar builtins', () => {
    const value = evaluateGlslScalarExpression('clamp(mix(0.0, 4.0, t), 0.0, 1.0)', bindings([['t', 0.125]]));
    assertClose(value, 0.5, 0.5e-10);
  });
  it('throws on an identifier it was given no binding for', () => {
    expect(() => {
      evaluateGlslScalarExpression('u_center * u_density', bindings([['u_center', 1.0]]));
    }).toThrow('no binding for');
  });
  it('throws rather than modelling an operator glsl and javascript disagree about', () => {
    expect(() => {
      evaluateGlslScalarExpression('texture(u_texture0, uv).r', bindings([['uv', 0.0]]));
    }).toThrow('no binding for');
  });
});

describe('extractGlslExpression', () => {
  it('returns the captured expression', () => {
    const pattern = new RegExp('float d = ([^;]+);', '');
    expect(extractGlslExpression('float d = abs(x - 1.0);', pattern)).toEqual('abs(x - 1.0)');
  });
  it('throws when the pattern matches nothing', () => {
    expect(() => {
      const pattern = new RegExp('float e = ([^;]+);', '');
      extractGlslExpression('float d = 1.0;', pattern);
    }).toThrow('matched no expression');
  });
});
