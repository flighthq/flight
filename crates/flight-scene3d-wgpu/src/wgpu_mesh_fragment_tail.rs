//! The one fragment tail every built-in mesh prelude returns through (TS `wgpuMeshFragmentTail.ts`):
//! a mesh fragment shader hands the blend unit premultiplied color. Every term that can change alpha
//! (the mask discard, material coverage, color adjustments and node alpha) must be folded in before
//! the premultiply. `flightMeshCoverage` keeps the premultiply from darkening a draw nothing is
//! compositing: only alphaMode 'blend' declares its alpha to be coverage.

/// The shared WGSL coverage and premultiplied-output helpers (TS `WGPU_MESH_FRAGMENT_TAIL`).
pub const WGPU_MESH_FRAGMENT_TAIL: &str = "
fn flightMeshCoverage(coverage : f32, objectAlpha : f32, alphaIsCoverage : f32) -> f32 {
  return mix(1.0, coverage, alphaIsCoverage) * objectAlpha;
}

fn flightPremultipliedOutput(color : vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}
";
