pub const GL_MESH_FRAGMENT_TAIL_UNIFORMS: &str = "uniform float u_objectAlpha;\n\
uniform float u_alphaIsCoverage;";

pub const GL_MESH_FRAGMENT_TAIL: &str = "  fragColor.a = mix(1.0, fragColor.a, u_alphaIsCoverage) * u_objectAlpha;\n\
  fragColor.rgb *= fragColor.a;";
