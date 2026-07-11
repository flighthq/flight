// Box-blur radius/sigma recipe math. Substrate-agnostic: every backend derives identical box-blur
// pass radii from the same sigma so the GL, WGPU, and CPU spreads match.
//
// Copied verbatim from filters-math during the filters→effects migration — effects is the
// canonical home for the spatial-effect blur math (effect-adjustment-architecture.md, migration
// step 4). filters-math keeps its copy until the filters* packages retire; the duplicate is
// deliberate for the duration (mirrors the Phase 1 colorMatrixMath port).

/**
 * Returns the box-blur radius for pass `pass` of `passes`, using two adjacent
 * odd box widths so the combined variance tracks a Gaussian of standard
 * deviation `sigma`. The lower passes use the smaller width and the remaining
 * passes use the next odd width up; this avoids the overshoot that repeating a
 * single rounded radius `passes` times accumulates. Radii are non-decreasing in
 * `pass`. Use this for backends that can vary the radius per pass (such as the
 * Gl separable passes); `computeBoxBlurRadius` covers backends that apply one
 * uniform radius across every pass.
 */
export function computeBoxBlurPassRadius(sigma: number, passes: number, pass: number): number {
  if (sigma <= 0) return 0;
  const lowerWidth = computeBoxBlurLowerWidth(sigma, passes);
  const lowerCount = computeBoxBlurLowerPassCount(sigma, passes, lowerWidth);
  const width = pass < lowerCount ? lowerWidth : lowerWidth + 2;
  return Math.max(0, (width - 1) / 2);
}

/**
 * Converts sigma to the single box-blur radius whose repeated application
 * (`passes` times) has the same variance as a Gaussian with standard deviation
 * `sigma`. Use this for backends that apply one uniform radius across every
 * pass; for backends that can vary the radius per pass, `computeBoxBlurPassRadius`
 * tracks `sigma` more closely.
 */
export function computeBoxBlurRadius(sigma: number, passes: number): number {
  if (sigma <= 0) return 0;
  return Math.max(0, Math.round((-1 + Math.sqrt(1 + (12 * sigma * sigma) / passes)) / 2));
}

/**
 * Converts a box-blur radius to the approximate Gaussian sigma that a single-pass box blur of
 * that radius corresponds to. Inverse of the `computeBoxBlurRadius` uniform-pass formula:
 * sigma = sqrt(passes * (2*radius + 1)^2 / 12). Useful for the reverse mapping (e.g. to feed a
 * sigma-based backend from a Flash `blurX` value).
 */
export function computeGaussianSigmaForBlurRadius(radius: number, passes: number): number {
  if (radius <= 0 || passes <= 0) return 0;
  const width = 2 * radius + 1;
  return Math.sqrt((passes * width * width) / 12);
}

// Largest odd box width whose `passes`-fold variance stays at or below a Gaussian
// of standard deviation `sigma`. Odd keeps the radius (width - 1) / 2 integral.
function computeBoxBlurLowerWidth(sigma: number, passes: number): number {
  let width = Math.floor(Math.sqrt((12 * sigma * sigma) / passes + 1));
  if (width % 2 === 0) width -= 1;
  return width;
}

// Number of passes that use `lowerWidth`; the remaining passes use the next odd
// width up so the combined variance tracks sigma. Derived from
// m·(wl² - 1)/12 + (passes - m)·(wu² - 1)/12 = σ², with wu = wl + 2.
function computeBoxBlurLowerPassCount(sigma: number, passes: number, lowerWidth: number): number {
  return Math.round(
    (12 * sigma * sigma - passes * (lowerWidth * lowerWidth + 4 * lowerWidth + 3)) / (-4 * lowerWidth - 4),
  );
}
