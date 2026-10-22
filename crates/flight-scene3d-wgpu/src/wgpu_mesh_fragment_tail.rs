pub const WGPU_MESH_FRAGMENT_TAIL: &str = "
fn flightMeshCoverage(coverage : f32, objectAlpha : f32, alphaIsCoverage : f32) -> f32 {
  return mix(1.0, coverage, alphaIsCoverage) * objectAlpha;
}

fn flightPremultipliedOutput(color : vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}
";
