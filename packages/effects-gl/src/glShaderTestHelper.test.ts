import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

describe('evaluateGlslScalarExpression', () => {
  it('substitutes every binding and evaluates the arithmetic', () => {
    expect(
      evaluateGlslScalarExpression('abs((1.0 - v_texCoord.y) - u_center)', { u_center: 0.25, 'v_texCoord.y': 0.75 }),
    ).toBeCloseTo(0, 10);
  });

  // The instrument must be able to tell the two readings apart, or every test built on it is vacuous.
  it('gives a different answer for the two vertical origins', () => {
    const bindings = { u_center: 0.25, 'v_texCoord.y': 0.75 };

    expect(evaluateGlslScalarExpression('abs(v_texCoord.y - u_center)', bindings)).toBeCloseTo(0.5, 10);
  });

  // A shorter binding that is a substring of a longer one must not be substituted inside it.
  it('binds the longest name first', () => {
    expect(evaluateGlslScalarExpression('u_scale + u_scaleFactor', { u_scale: 2, u_scaleFactor: 30 })).toBe(32);
  });

  it('resolves the scalar builtins', () => {
    expect(evaluateGlslScalarExpression('clamp(mix(0.0, 4.0, t), 0.0, 1.0)', { t: 0.125 })).toBeCloseTo(0.5, 10);
  });

  // ★ AN UNBOUND NAME MUST THROW, NOT EVALUATE. A uniform renamed out from under a test would otherwise
  // leave an identifier in the expression, and `new Function` would fail somewhere less legible or —
  // worse for a name that happens to resolve — return a number computed from the wrong thing.
  it('throws on an identifier it was given no binding for', () => {
    expect(() => evaluateGlslScalarExpression('u_center * u_density', { u_center: 1 })).toThrow('no binding for');
  });

  it('throws rather than modelling an operator GLSL and JavaScript disagree about', () => {
    expect(() => evaluateGlslScalarExpression('texture(u_texture0, uv).r', { uv: 0 })).toThrow('no binding for');
  });
});

describe('extractGlslExpression', () => {
  it('returns the captured expression', () => {
    expect(extractGlslExpression('float d = abs(x - 1.0);', /float d = ([^;]+);/)).toBe('abs(x - 1.0)');
  });

  // ★ THE UNMATCHED ANCHOR IS THE POINT. A test whose pattern silently missed would assert on nothing
  // and report success — the shape where a string replacement matches no line and the run measures the
  // unmodified file.
  it('throws when the pattern matches nothing', () => {
    expect(() => extractGlslExpression('float d = 1.0;', /float e = ([^;]+);/)).toThrow('matched no expression');
  });
});
