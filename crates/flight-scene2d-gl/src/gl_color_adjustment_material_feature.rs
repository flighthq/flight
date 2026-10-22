// flight-lint: allow-file(contract-vocabulary) D17 the color-adjustment fold drives glow native handles over thread-bound render-gl state

use std::sync::Arc;

use flight_entity::throw_error;
use flight_materials::{ColorScaleBias, MaterialData, TintMaterialData};
use flight_render::{RenderProxy2D, enable_color_adjustments};
use flight_render_gl::{
    GlColorAdjustmentData, GlColorAdjustmentResources, GlColorScaleBiasInstancedShader,
    GlRenderState, GlRenderStateRuntime, GlShapeMeshBinding, GlShapeMeshColorScaleBiasShader,
    GlUniformColorScaleBiasShader, create_gl_program,
};
use glow::{HasContext, NativeBuffer};

use crate::gl_quad_batch_writer::{
    QUAD_BATCH_VS, bind_gl_quad_batch_base_attributes, gl_f32_bytes, gl_u32_bytes,
    set_gl_quad_batch_world_and_texture, use_gl_quad_batch_program,
};
use crate::gl_shape_mesh::{draw_gl_shape_mesh_batch, ensure_gl_shape_mesh_program};
use crate::types::{GlColorAdjustmentMaterialFeature, GlShapeMesh};

macro_rules! gl_color_adjustment_fragment_chunk {
    () => {
        "
vec4 applyFlightColorAdjustment(vec4 color, vec4 multiplier, vec4 offset) {
  return clamp(color * multiplier + offset, vec4(0.0), vec4(1.0));
}
"
    };
}

macro_rules! gl_color_matrix_fragment_chunk {
    () => {
        "
vec4 applyFlightColorMatrix(
  vec4 color,
  vec4 row0,
  vec4 row1,
  vec4 row2,
  vec4 row3,
  vec4 offset
) {
  return clamp(vec4(dot(row0, color), dot(row1, color), dot(row2, color), dot(row3, color)) + offset,
    vec4(0.0), vec4(1.0));
}
"
    };
}

// Per-instance color-adjustment layout (8 floats = 32 bytes): 4 scale + 4 bias, at attribute
// locations 7 (a_colorScale) and 8 (a_colorBias). Used only when a batch carries varying tints.
const COLOR_SCALE_BIAS_FLOATS: usize = 8;
const COLOR_SCALE_BIAS_STRIDE: i32 = (COLOR_SCALE_BIAS_FLOATS * 4) as i32;
const COLOR_MATRIX_FLOATS: usize = 20;
const COLOR_MATRIX_STRIDE: i32 = (COLOR_MATRIX_FLOATS * 4) as i32;

// Color-adjustment fold modes for the active quad-batch writer. NONE keeps the lean base shader;
// UNIFORM binds one whole-batch tint; PER_INSTANCE packs a tint per instance. A batch starts at
// NONE, rises to UNIFORM on the first tint, and promotes — back-filling already-written instances
// with the prior value/identity — when tints diverge, so a tint only ever promotes a batch, never
// splits it.
const CT_MODE_NONE: u32 = 0;
const CT_MODE_UNIFORM: u32 = 1;
const CT_MODE_PACKED_TINT: u32 = 2;
const CT_MODE_PER_INSTANCE: u32 = 3;
const CT_MODE_MATRIX: u32 = 4;

// The backend's single color-adjustment shader chunk. The registered feature carries this source to
// every participating material compiler, so the color math has one implementation without making the
// lean base compilers statically import it.
const GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK: &str = gl_color_adjustment_fragment_chunk!();
const GL_COLOR_MATRIX_FRAGMENT_CHUNK: &str = gl_color_matrix_fragment_chunk!();

// Per-instance color-adjustment program: the base quad-batch vertex work plus two vec4 instance
// attributes (a_colorScale / a_colorBias) carried through to the fragment stage.
const CT_INSTANCED_VS: &str = "#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec4 a_uvOriginAxisU;
layout(location = 5) in vec2 a_uvAxisV;
layout(location = 6) in float a_alpha;
layout(location = 7) in vec4 a_colorScale;
layout(location = 8) in vec4 a_colorBias;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;
out vec4 v_colorScale;
out vec4 v_colorBias;

void main() {
  vec2 worldPos = vec2(
    a_matAB.x * a_corner.x + a_matCD.x * a_corner.y + a_matTXTY.x,
    a_matAB.y * a_corner.x + a_matCD.y * a_corner.y + a_matTXTY.y
  );
  vec3 clip = u_world * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_texCoord = a_uvOriginAxisU.xy + a_uvOriginAxisU.zw * a_corner.x + a_uvAxisV * a_corner.y;
  v_alpha = a_alpha;
  v_colorScale = a_colorScale;
  v_colorBias = a_colorBias;
}";

// The common varying-tint path: one normalized RGBA8 multiplier (4 bytes per instance), with no
// offset stream. It is widened to CT_INSTANCED_VS only if an affine transform with offsets appears.
const CT_PACKED_TINT_VS: &str = "#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec4 a_uvOriginAxisU;
layout(location = 5) in vec2 a_uvAxisV;
layout(location = 6) in float a_alpha;
layout(location = 7) in vec4 a_colorScale;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;
out vec4 v_colorScale;

void main() {
  vec2 worldPos = vec2(
    a_matAB.x * a_corner.x + a_matCD.x * a_corner.y + a_matTXTY.x,
    a_matAB.y * a_corner.x + a_matCD.y * a_corner.y + a_matTXTY.y
  );
  vec3 clip = u_world * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_texCoord = a_uvOriginAxisU.xy + a_uvOriginAxisU.zw * a_corner.x + a_uvAxisV * a_corner.y;
  v_alpha = a_alpha;
  v_colorScale = a_colorScale;
}";

const CT_PACKED_TINT_FS: &str = concat!(
    "#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_colorScale;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
",
    gl_color_adjustment_fragment_chunk!(),
    "
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, v_colorScale, vec4(0.0));
  fragColor = vec4(color.rgb * color.a, color.a);
}"
);

const CT_INSTANCED_FS: &str = concat!(
    "#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_colorScale;
in vec4 v_colorBias;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
",
    gl_color_adjustment_fragment_chunk!(),
    "
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, v_colorScale, v_colorBias);
  fragColor = vec4(color.rgb * color.a, color.a);
}"
);

const CT_MATRIX_INSTANCED_VS: &str = "#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec4 a_uvOriginAxisU;
layout(location = 5) in vec2 a_uvAxisV;
layout(location = 6) in float a_alpha;
layout(location = 7) in vec4 a_ctRow0;
layout(location = 8) in vec4 a_ctRow1;
layout(location = 9) in vec4 a_ctRow2;
layout(location = 10) in vec4 a_ctRow3;
layout(location = 11) in vec4 a_colorBias;
uniform mat3 u_world;
out vec2 v_texCoord;
out float v_alpha;
out vec4 v_ctRow0;
out vec4 v_ctRow1;
out vec4 v_ctRow2;
out vec4 v_ctRow3;
out vec4 v_colorBias;
void main() {
  vec2 worldPos = vec2(
    a_matAB.x * a_corner.x + a_matCD.x * a_corner.y + a_matTXTY.x,
    a_matAB.y * a_corner.x + a_matCD.y * a_corner.y + a_matTXTY.y
  );
  vec3 clip = u_world * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_texCoord = a_uvOriginAxisU.xy + a_uvOriginAxisU.zw * a_corner.x + a_uvAxisV * a_corner.y;
  v_alpha = a_alpha;
  v_ctRow0 = a_ctRow0;
  v_ctRow1 = a_ctRow1;
  v_ctRow2 = a_ctRow2;
  v_ctRow3 = a_ctRow3;
  v_colorBias = a_colorBias;
}";

const CT_MATRIX_INSTANCED_FS: &str = concat!(
    "#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_ctRow0;
in vec4 v_ctRow1;
in vec4 v_ctRow2;
in vec4 v_ctRow3;
in vec4 v_colorBias;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
",
    gl_color_matrix_fragment_chunk!(),
    "
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorMatrix(color, v_ctRow0, v_ctRow1, v_ctRow2, v_ctRow3, v_colorBias);
  fragColor = vec4(color.rgb * color.a, color.a);
}"
);

// Whole-batch color-adjustment fragment shader (over the base vertex shader): one tint uploaded as
// u_colorScale/u_colorBias uniforms and shared by every instance.
const UNIFORM_CT_FS: &str = concat!(
    "#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
uniform vec4 u_colorScale;
uniform vec4 u_colorBias;
out vec4 fragColor;
",
    gl_color_adjustment_fragment_chunk!(),
    "
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, u_colorScale, u_colorBias);
  fragColor = vec4(color.rgb * color.a, color.a);
}"
);

// Mirrors the base flat-color mesh vertex shader: u_matrix is the shared projection · world
// transform draw_gl_shape_mesh_batch uploads, so a tinted mesh lands pixel-aligned with an untinted
// one.
const SHAPE_MESH_CT_VS: &str = "
attribute vec2 a_position;
uniform mat3 u_matrix;
void main() {
  vec3 p = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}
";

// The tint fragment shader. u_color arrives premultiplied, so the math un-premultiplies, applies
// normalized-linear scale/bias, clamps, and re-premultiplies — byte-for-byte with the quad-batch
// uniform/instanced color-adjustment shaders.
const SHAPE_MESH_CT_FS: &str = concat!(
    "
precision mediump float;
uniform vec4 u_color;
uniform vec4 u_colorScale;
uniform vec4 u_colorBias;
",
    gl_color_adjustment_fragment_chunk!(),
    "
void main() {
  vec4 color = u_color;
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, u_colorScale, u_colorBias);
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}
"
);

const SHAPE_MESH_MATRIX_FS: &str = concat!(
    "
precision mediump float;
uniform vec4 u_color;
uniform vec4 u_ctRow0;
uniform vec4 u_ctRow1;
uniform vec4 u_ctRow2;
uniform vec4 u_ctRow3;
uniform vec4 u_colorBias;
",
    gl_color_matrix_fragment_chunk!(),
    "
void main() {
  vec4 color = u_color;
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorMatrix(color, u_ctRow0, u_ctRow1, u_ctRow2, u_ctRow3, u_colorBias);
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}
"
);

static GL_COLOR_ADJUSTMENT_MATERIAL_FEATURE: GlColorAdjustmentMaterialFeature =
    GlColorAdjustmentMaterialFeature {
        fragment_shader_chunk: GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
        matrix_fragment_shader_chunk: GL_COLOR_MATRIX_FRAGMENT_CHUNK,
        draw_shape_meshes: draw_gl_shape_meshes_color_scale_bias,
        flush: flush_gl_color_adjustment_material_feature,
        record: record_gl_color_adjustment,
    };

fn bind_gl_quad_batch_writer_instanced_color_matrix(state: &GlRenderState) {
    let shader = ensure_gl_color_matrix_instanced_shader(state);
    use_gl_quad_batch_program(state, shader.program);
    set_gl_quad_batch_world_and_texture(
        state,
        shader.loc_world_matrix.as_ref(),
        shader.loc_texture.as_ref(),
        shader.loc_straight_texture_alpha.as_ref(),
    );
    bind_gl_quad_batch_base_attributes(state, shader.loc_corner);
    let gl = &state.gl;
    // SAFETY: the color buffer belongs to this context; attribute setup occurs on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, writer_color_scale_bias_buffer(state));
        for attribute in 0..5 {
            let location = 7 + attribute;
            gl.enable_vertex_attrib_array(location);
            gl.vertex_attrib_pointer_f32(
                location,
                4,
                glow::FLOAT,
                false,
                COLOR_MATRIX_STRIDE,
                attribute as i32 * 16,
            );
            gl.vertex_attrib_divisor(location, 1);
        }
    }
}

// Binds the per-instance color-adjustment program and the a_colorScale/a_colorBias attribute stream
// from the batch's color-adjustment buffer, alongside the base instance attributes.
fn bind_gl_quad_batch_writer_instanced_color_scale_bias(state: &GlRenderState) {
    let shader = ensure_gl_color_scale_bias_instanced_shader(state);
    use_gl_quad_batch_program(state, shader.program);
    set_gl_quad_batch_world_and_texture(
        state,
        shader.loc_world_matrix.as_ref(),
        shader.loc_texture.as_ref(),
        shader.loc_straight_texture_alpha.as_ref(),
    );
    bind_gl_quad_batch_base_attributes(state, shader.loc_corner);

    let gl = &state.gl;
    // SAFETY: the color buffer belongs to this context; attribute setup occurs on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, writer_color_scale_bias_buffer(state));
        gl.enable_vertex_attrib_array(7);
        gl.vertex_attrib_pointer_f32(7, 4, glow::FLOAT, false, COLOR_SCALE_BIAS_STRIDE, 0);
        gl.vertex_attrib_divisor(7, 1);
        gl.enable_vertex_attrib_array(8);
        gl.vertex_attrib_pointer_f32(8, 4, glow::FLOAT, false, COLOR_SCALE_BIAS_STRIDE, 16);
        gl.vertex_attrib_divisor(8, 1);
    }
}

fn bind_gl_quad_batch_writer_packed_tint(state: &GlRenderState) {
    let shader = ensure_gl_color_tint_instanced_shader(state);
    use_gl_quad_batch_program(state, shader.program);
    set_gl_quad_batch_world_and_texture(
        state,
        shader.loc_world_matrix.as_ref(),
        shader.loc_texture.as_ref(),
        shader.loc_straight_texture_alpha.as_ref(),
    );
    bind_gl_quad_batch_base_attributes(state, shader.loc_corner);

    let gl = &state.gl;
    // SAFETY: the color buffer belongs to this context; attribute setup occurs on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, writer_color_scale_bias_buffer(state));
        gl.enable_vertex_attrib_array(7);
        gl.vertex_attrib_pointer_f32(7, 4, glow::UNSIGNED_BYTE, true, 4, 0);
        gl.vertex_attrib_divisor(7, 1);
    }
}

// Binds the whole-batch (uniform) color-adjustment program and uploads the shared tint. Base
// attributes come from the standard instance buffer; there is no per-instance tint data.
fn bind_gl_quad_batch_writer_uniform_color_scale_bias(
    state: &GlRenderState,
    color_scale_bias: &GlColorAdjustmentData,
) {
    let shader = ensure_gl_uniform_color_scale_bias_shader(state);
    use_gl_quad_batch_program(state, shader.program);
    set_gl_quad_batch_world_and_texture(
        state,
        shader.loc_world_matrix.as_ref(),
        shader.loc_texture.as_ref(),
        shader.loc_straight_texture_alpha.as_ref(),
    );

    let gl = &state.gl;
    // SAFETY: the uniform locations belong to the bound program on this GL thread.
    unsafe {
        gl.uniform_4_f32(
            shader.loc_color_scale.as_ref(),
            get_color_scale(color_scale_bias, 0),
            get_color_scale(color_scale_bias, 1),
            get_color_scale(color_scale_bias, 2),
            get_color_scale(color_scale_bias, 3),
        );
        gl.uniform_4_f32(
            shader.loc_color_bias.as_ref(),
            get_color_bias(color_scale_bias, 0),
            get_color_bias(color_scale_bias, 1),
            get_color_bias(color_scale_bias, 2),
            get_color_bias(color_scale_bias, 3),
        );
    }
    bind_gl_quad_batch_base_attributes(state, shader.loc_corner);
}

fn compile_color_adjustment_program(
    gl: &glow::Context,
    vertex: &str,
    fragment: &str,
    label: &str,
) -> glow::NativeProgram {
    return create_gl_program(gl, vertex, fragment, Some(label))
        .unwrap_or_else(|error| throw_error(&error));
}

// Draws the GPU-tessellated solid-fill meshes tinted by the node's color adjustment. A single mesh is
// one flat color and a shape shares one whole-node transform, so this is the uniform path: the
// scale/bias (or matrix rows) uploaded once, no per-vertex tint data. Reuses the base mesh draw driver
// and its shared vertex/index buffers — only the fragment program differs.
fn draw_gl_shape_meshes_color_scale_bias(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
    meshes: &[GlShapeMesh],
) {
    let color_matrix = render_proxy.color_matrix;
    let color_scale_bias = render_proxy
        .color_scale_bias
        .as_ref()
        .map(to_gl_color_scale_bias_data);
    let base = ensure_gl_shape_mesh_program(state);
    if color_matrix.is_none() && color_scale_bias.is_none() {
        draw_gl_shape_mesh_batch(state, render_proxy, meshes, &base, None);
        return;
    }
    let shader = if color_matrix.is_none() {
        ensure_gl_shape_mesh_color_scale_bias_shader(state)
    } else {
        ensure_gl_shape_mesh_color_matrix_shader(state)
    };
    let binding = GlShapeMeshBinding {
        program: shader.program,
        vertex_buffer: base.vertex_buffer,
        index_buffer: base.index_buffer,
        position_location: shader.position_location,
        matrix_location: shader.matrix_location.clone(),
        color_location: shader.color_location.clone(),
    };
    let upload = |bound: &GlRenderState| {
        let gl = &bound.gl;
        // SAFETY: the uniform locations belong to the bound tinted mesh program on this GL thread.
        unsafe {
            if let Some(matrix) = color_matrix {
                let locations = shader.color_matrix_locations.clone().unwrap_or_default();
                for row in 0..4 {
                    let source = row * 5;
                    gl.uniform_4_f32(
                        locations.get(row).and_then(|value| value.as_ref()),
                        matrix[source],
                        matrix[source + 1],
                        matrix[source + 2],
                        matrix[source + 3],
                    );
                }
                gl.uniform_4_f32(
                    locations.get(4).and_then(|value| value.as_ref()),
                    matrix[4],
                    matrix[9],
                    matrix[14],
                    matrix[19],
                );
                return;
            }
            let value = color_scale_bias.as_ref().unwrap();
            gl.uniform_4_f32(
                shader.color_scale_location.as_ref(),
                get_color_scale(value, 0),
                get_color_scale(value, 1),
                get_color_scale(value, 2),
                get_color_scale(value, 3),
            );
            gl.uniform_4_f32(
                shader.color_bias_location.as_ref(),
                get_color_bias(value, 0),
                get_color_bias(value, 1),
                get_color_bias(value, 2),
                get_color_bias(value, 3),
            );
        }
    };
    draw_gl_shape_mesh_batch(state, render_proxy, meshes, &binding, Some(&upload));
}

fn ensure_gl_color_adjustment_resources(state: &GlRenderState) -> GlColorAdjustmentResources {
    let gl = &state.gl;

    let scale_bias_program = compile_color_adjustment_program(
        gl,
        CT_INSTANCED_VS,
        CT_INSTANCED_FS,
        "Sprite-batch color adjustment (per-instance)",
    );
    let matrix_program = compile_color_adjustment_program(
        gl,
        CT_MATRIX_INSTANCED_VS,
        CT_MATRIX_INSTANCED_FS,
        "Sprite-batch color matrix",
    );
    let tint_program = compile_color_adjustment_program(
        gl,
        CT_PACKED_TINT_VS,
        CT_PACKED_TINT_FS,
        "Sprite-batch tint (RGBA8)",
    );
    let uniform_program = compile_color_adjustment_program(
        gl,
        QUAD_BATCH_VS,
        UNIFORM_CT_FS,
        "Sprite-batch color adjustment (uniform)",
    );

    // SAFETY: uniform queries occur on the GL thread for programs created by this context.
    let resources = unsafe {
        GlColorAdjustmentResources {
            scale_bias_instanced_shader: instanced_shader(gl, scale_bias_program),
            matrix_instanced_shader: instanced_shader(gl, matrix_program),
            tint_instanced_shader: instanced_shader(gl, tint_program),
            uniform_scale_bias_shader: GlUniformColorScaleBiasShader {
                program: uniform_program,
                loc_corner: 0,
                loc_world_matrix: gl.get_uniform_location(uniform_program, "u_world"),
                loc_texture: gl.get_uniform_location(uniform_program, "u_texture"),
                loc_straight_texture_alpha: gl
                    .get_uniform_location(uniform_program, "u_straightTextureAlpha"),
                loc_color_scale: gl.get_uniform_location(uniform_program, "u_colorScale"),
                loc_color_bias: gl.get_uniform_location(uniform_program, "u_colorBias"),
            },
        }
    };
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .color_adjustment_resources = Some(resources.clone());
    return resources;
}

fn ensure_gl_color_matrix_instanced_shader(
    state: &GlRenderState,
) -> GlColorScaleBiasInstancedShader {
    if let Some(resources) = &state
        .context_state
        .runtime_state
        .borrow()
        .color_adjustment_resources
    {
        return resources.matrix_instanced_shader.clone();
    }
    return ensure_gl_color_adjustment_resources(state).matrix_instanced_shader;
}

fn ensure_gl_color_scale_bias_instanced_shader(
    state: &GlRenderState,
) -> GlColorScaleBiasInstancedShader {
    if let Some(resources) = &state
        .context_state
        .runtime_state
        .borrow()
        .color_adjustment_resources
    {
        return resources.scale_bias_instanced_shader.clone();
    }
    return ensure_gl_color_adjustment_resources(state).scale_bias_instanced_shader;
}

fn ensure_gl_color_tint_instanced_shader(state: &GlRenderState) -> GlColorScaleBiasInstancedShader {
    if let Some(resources) = &state
        .context_state
        .runtime_state
        .borrow()
        .color_adjustment_resources
    {
        return resources.tint_instanced_shader.clone();
    }
    return ensure_gl_color_adjustment_resources(state).tint_instanced_shader;
}

fn ensure_gl_shape_mesh_color_matrix_shader(
    state: &GlRenderState,
) -> GlShapeMeshColorScaleBiasShader {
    if let Some(shader) = state
        .context_state
        .runtime_state
        .borrow()
        .shape_mesh_resources
        .as_ref()
        .and_then(|resources| resources.color_matrix_shader.clone())
    {
        return shader;
    }
    let gl = &state.gl;
    let program = compile_color_adjustment_program(
        gl,
        SHAPE_MESH_CT_VS,
        SHAPE_MESH_MATRIX_FS,
        "Shape-mesh color matrix",
    );
    // SAFETY: location queries occur on the GL thread for a program created by this context.
    let shader = unsafe {
        GlShapeMeshColorScaleBiasShader {
            program,
            position_location: gl.get_attrib_location(program, "a_position").unwrap_or(0),
            matrix_location: gl.get_uniform_location(program, "u_matrix"),
            color_location: gl.get_uniform_location(program, "u_color"),
            color_scale_location: None,
            color_bias_location: None,
            color_matrix_locations: Some(vec![
                gl.get_uniform_location(program, "u_ctRow0"),
                gl.get_uniform_location(program, "u_ctRow1"),
                gl.get_uniform_location(program, "u_ctRow2"),
                gl.get_uniform_location(program, "u_ctRow3"),
                gl.get_uniform_location(program, "u_colorBias"),
            ]),
        }
    };
    if let Some(resources) = state
        .context_state
        .runtime_state
        .borrow_mut()
        .shape_mesh_resources
        .as_mut()
    {
        resources.color_matrix_shader = Some(shader.clone());
    }
    return shader;
}

fn ensure_gl_shape_mesh_color_scale_bias_shader(
    state: &GlRenderState,
) -> GlShapeMeshColorScaleBiasShader {
    if let Some(shader) = state
        .context_state
        .runtime_state
        .borrow()
        .shape_mesh_resources
        .as_ref()
        .and_then(|resources| resources.color_scale_bias_shader.clone())
    {
        return shader;
    }

    let gl = &state.gl;
    let program = compile_color_adjustment_program(
        gl,
        SHAPE_MESH_CT_VS,
        SHAPE_MESH_CT_FS,
        "Shape-mesh color adjustment",
    );
    // SAFETY: location queries occur on the GL thread for a program created by this context.
    let shader = unsafe {
        GlShapeMeshColorScaleBiasShader {
            program,
            position_location: gl.get_attrib_location(program, "a_position").unwrap_or(0),
            matrix_location: gl.get_uniform_location(program, "u_matrix"),
            color_location: gl.get_uniform_location(program, "u_color"),
            color_scale_location: gl.get_uniform_location(program, "u_colorScale"),
            color_bias_location: gl.get_uniform_location(program, "u_colorBias"),
            color_matrix_locations: None,
        }
    };
    if let Some(resources) = state
        .context_state
        .runtime_state
        .borrow_mut()
        .shape_mesh_resources
        .as_mut()
    {
        resources.color_scale_bias_shader = Some(shader.clone());
    }
    return shader;
}

fn ensure_gl_uniform_color_scale_bias_shader(
    state: &GlRenderState,
) -> GlUniformColorScaleBiasShader {
    if let Some(resources) = &state
        .context_state
        .runtime_state
        .borrow()
        .color_adjustment_resources
    {
        return resources.uniform_scale_bias_shader.clone();
    }
    return ensure_gl_color_adjustment_resources(state).uniform_scale_bias_shader;
}

fn ensure_writer_color_scale_bias_buffer(state: &GlRenderState) -> NativeBuffer {
    let mut context = state.context_state.runtime_state.borrow_mut();
    let resources = context.quad_batch_resources.as_mut().unwrap_or_else(|| {
        throw_error("flushGlColorAdjustmentMaterialFeature: no quad-batch resources")
    });
    if let Some(buffer) = resources.writer_color_scale_bias_buffer {
        return buffer;
    }
    // SAFETY: allocation occurs on the owning GL thread.
    let buffer = unsafe { state.gl.create_buffer() }.unwrap_or_else(|error| {
        throw_error(&format!("flushGlColorAdjustmentMaterialFeature: {error}"))
    });
    resources.writer_color_scale_bias_buffer = Some(buffer);
    return buffer;
}

// Value equality for the whole-batch uniform check: compares all eight scale/bias channels (a tint
// and an equal scale record match) or the twenty matrix floats, so a distinct-but-equal tint keeps
// the batch on the cheaper uniform path.
fn equals_recorded_color_scale_bias(
    a: Option<&GlColorAdjustmentData>,
    b: Option<&GlColorAdjustmentData>,
) -> bool {
    let (a, b) = match (a, b) {
        (None, None) => return true,
        (Some(a), Some(b)) => (a, b),
        _ => return false,
    };
    if let (GlColorAdjustmentData::ColorMatrix(a), GlColorAdjustmentData::ColorMatrix(b)) = (a, b) {
        return a == b;
    }
    if is_color_matrix_data(Some(a)) || is_color_matrix_data(Some(b)) {
        return false;
    }
    for channel in 0..4 {
        if get_color_scale(a, channel) != get_color_scale(b, channel)
            || get_color_bias(a, channel) != get_color_bias(b, channel)
        {
            return false;
        }
    }
    return true;
}

// Uploads the active batch's per-instance color-adjustment buffer, selects the fold program
// (uniform or per-instance), and binds it. Returns true when it drew a folded batch; false when the
// batch carried no tint, so flush_gl_quad_batch_writer runs the lean material path instead. Resets
// the fold mode for the next batch.
fn flush_gl_color_adjustment_material_feature(state: &mut GlRenderState, count: usize) -> bool {
    let (ct_mode, uniform_color_scale_bias) = {
        let mut runtime = state.gl_runtime.borrow_mut();
        let ct_mode = runtime
            .quad_batch_writer_color_scale_bias_mode
            .unwrap_or(CT_MODE_NONE);
        if ct_mode == CT_MODE_NONE {
            return false;
        }
        let uniform = runtime.quad_batch_writer_uniform_color_scale_bias.take();
        runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_NONE);
        (ct_mode, uniform)
    };

    if ct_mode == CT_MODE_PACKED_TINT {
        let runtime = state.gl_runtime.borrow();
        let data = runtime
            .quad_batch_writer_color_tint_data
            .as_deref()
            .unwrap_or(&[]);
        upload_color_buffer(state, gl_u32_bytes(&data[..count.min(data.len())]));
        drop(runtime);
        bind_gl_quad_batch_writer_packed_tint(state);
        return true;
    }

    if ct_mode == CT_MODE_MATRIX {
        upload_color_matrix_buffer(state, count);
        bind_gl_quad_batch_writer_instanced_color_matrix(state);
        return true;
    }

    if ct_mode == CT_MODE_PER_INSTANCE {
        // Reallocate to exactly what is drawn: the color-adjustment data array grows lazily as tints
        // are recorded, so a fixed subData offset could outrun a stale buffer.
        let runtime = state.gl_runtime.borrow();
        let data = runtime
            .quad_batch_writer_color_scale_bias_data
            .as_deref()
            .unwrap_or(&[]);
        let end = (count * COLOR_SCALE_BIAS_FLOATS).min(data.len());
        upload_color_buffer(state, gl_f32_bytes(&data[..end]));
        drop(runtime);
        bind_gl_quad_batch_writer_instanced_color_scale_bias(state);
        return true;
    }

    let uniform = uniform_color_scale_bias.unwrap_or_else(|| {
        throw_error("flushGlColorAdjustmentMaterialFeature: uniform batch has no recorded tint")
    });
    if is_color_matrix_data(Some(&uniform)) {
        {
            let mut runtime = state.gl_runtime.borrow_mut();
            promote_gl_quad_batch_writer_color_scale_bias_to_matrix(
                &mut runtime,
                count,
                Some(&uniform),
            );
            runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_NONE);
        }
        upload_color_matrix_buffer(state, count);
        bind_gl_quad_batch_writer_instanced_color_matrix(state);
    } else {
        bind_gl_quad_batch_writer_uniform_color_scale_bias(state, &uniform);
    }
    return true;
}

fn get_color_bias(value: &GlColorAdjustmentData, channel: usize) -> f32 {
    return match value {
        GlColorAdjustmentData::TintMaterialData(_) => 0.0,
        GlColorAdjustmentData::ColorScaleBias(values) => values[4 + channel],
        GlColorAdjustmentData::ColorMatrix(matrix) => matrix[channel * 5 + 4],
    };
}

fn get_color_scale(value: &GlColorAdjustmentData, channel: usize) -> f32 {
    return match value {
        GlColorAdjustmentData::TintMaterialData(tint) => {
            ((tint >> (24 - channel * 8)) & 0xff) as f32 / 255.0
        }
        GlColorAdjustmentData::ColorScaleBias(values) => values[channel],
        GlColorAdjustmentData::ColorMatrix(matrix) => matrix[channel * 6],
    };
}

/// A per-instance material-data entry read as a color adjustment (TS casts the entry to
/// `ColorScaleBias | TintMaterialData | number[]`). Only a tint record carries one natively.
pub(crate) fn get_gl_material_data_color_adjustment(
    material_data: &dyn MaterialData,
) -> Option<GlColorAdjustmentData> {
    return material_data
        .as_any()
        .downcast_ref::<TintMaterialData>()
        .map(|tint| GlColorAdjustmentData::TintMaterialData(tint.tint));
}

/// The effective color adjustment of a render proxy (TS `colorMatrix ?? colorScaleBias`).
pub(crate) fn get_gl_render_proxy_color_adjustment(
    render_proxy: &RenderProxy2D<GlRenderState>,
) -> Option<GlColorAdjustmentData> {
    if let Some(matrix) = render_proxy.color_matrix {
        return Some(GlColorAdjustmentData::ColorMatrix(matrix));
    }
    return render_proxy
        .color_scale_bias
        .as_ref()
        .map(to_gl_color_scale_bias_data);
}

fn get_packed_tint(value: Option<&GlColorAdjustmentData>) -> Option<u32> {
    let Some(value) = value else {
        return Some(0xffffffff);
    };
    let scale_bias = match value {
        GlColorAdjustmentData::TintMaterialData(tint) => return Some(*tint),
        GlColorAdjustmentData::ColorMatrix(_) => return None,
        GlColorAdjustmentData::ColorScaleBias(values) => values,
    };
    let [
        red_scale,
        green_scale,
        blue_scale,
        alpha_scale,
        red_bias,
        green_bias,
        blue_bias,
        alpha_bias,
    ] = *scale_bias;
    if red_bias != 0.0
        || green_bias != 0.0
        || blue_bias != 0.0
        || alpha_bias != 0.0
        || red_scale < 0.0
        || red_scale > 1.0
        || green_scale < 0.0
        || green_scale > 1.0
        || blue_scale < 0.0
        || blue_scale > 1.0
        || alpha_scale < 0.0
        || alpha_scale > 1.0
    {
        return None;
    }
    return Some(
        ((red_scale * 255.0).round() as u32) << 24
            | ((green_scale * 255.0).round() as u32) << 16
            | ((blue_scale * 255.0).round() as u32) << 8
            | (alpha_scale * 255.0).round() as u32,
    );
}

/// SAFETY: callers query uniform locations on the GL thread for a program this context created.
unsafe fn instanced_shader(
    gl: &glow::Context,
    program: glow::NativeProgram,
) -> GlColorScaleBiasInstancedShader {
    // SAFETY: forwarded from the caller's GL-thread contract.
    unsafe {
        return GlColorScaleBiasInstancedShader {
            program,
            loc_corner: 0,
            loc_world_matrix: gl.get_uniform_location(program, "u_world"),
            loc_texture: gl.get_uniform_location(program, "u_texture"),
            loc_straight_texture_alpha: gl.get_uniform_location(program, "u_straightTextureAlpha"),
        };
    }
}

fn is_color_matrix_data(value: Option<&GlColorAdjustmentData>) -> bool {
    return matches!(value, Some(GlColorAdjustmentData::ColorMatrix(_)));
}

fn promote_gl_color_scale_bias_to_matrix(
    runtime: &mut GlRenderStateRuntime,
    instance_count: usize,
) {
    let affine = runtime
        .quad_batch_writer_color_scale_bias_data
        .clone()
        .unwrap_or_default();
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_MATRIX);
    for index in 0..instance_count {
        let base = index * COLOR_SCALE_BIAS_FLOATS;
        write_gl_affine_values_as_color_matrix(runtime, &affine, base, index);
    }
}

fn promote_gl_packed_tint_to_color_matrix(
    runtime: &mut GlRenderStateRuntime,
    instance_count: usize,
) {
    let packed = runtime
        .quad_batch_writer_color_tint_data
        .clone()
        .unwrap_or_default();
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_MATRIX);
    for index in 0..instance_count {
        write_gl_native_packed_tint_as_color_matrix(
            runtime,
            packed.get(index).copied().unwrap_or(0),
            index,
        );
    }
}

fn promote_gl_packed_tint_to_color_scale_bias(
    runtime: &mut GlRenderStateRuntime,
    instance_count: usize,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PER_INSTANCE);
    let packed = runtime
        .quad_batch_writer_color_tint_data
        .clone()
        .unwrap_or_default();
    for index in 0..instance_count {
        write_gl_native_packed_tint_as_color_scale_bias(
            runtime,
            packed.get(index).copied().unwrap_or(0),
            index,
        );
    }
}

fn promote_gl_quad_batch_writer_color_scale_bias_to_matrix(
    runtime: &mut GlRenderStateRuntime,
    instance_count: usize,
    fill: Option<&GlColorAdjustmentData>,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_MATRIX);
    for index in 0..instance_count {
        write_gl_color_matrix_instance(runtime, fill, index);
    }
}

fn promote_gl_quad_batch_writer_color_scale_bias_to_packed_tint(
    runtime: &mut GlRenderStateRuntime,
    instance_count: usize,
    fill: Option<&GlColorAdjustmentData>,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PACKED_TINT);
    let packed = get_packed_tint(fill).unwrap_or(0xffffffff);
    for index in 0..instance_count {
        write_gl_packed_tint_instance(runtime, packed, index);
    }
}

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instance_count) with `fill` (a prior uniform value, or None → identity), so promotion never
// changes the appearance of instances written before the divergence.
fn promote_gl_quad_batch_writer_color_scale_bias_to_per_instance(
    runtime: &mut GlRenderStateRuntime,
    instance_count: usize,
    fill: Option<&GlColorAdjustmentData>,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PER_INSTANCE);
    for index in 0..instance_count {
        write_gl_color_scale_bias_instance(runtime, fill, index);
    }
}

// Folds instance `instance_index`'s effective color adjustment into the active batch. See the
// fold-mode constants for the promotion rules. `color_scale_bias` is None for an untinted instance.
fn record_gl_color_adjustment(
    runtime: &mut GlRenderStateRuntime,
    color_scale_bias: Option<&GlColorAdjustmentData>,
    instance_index: usize,
) {
    let mode = runtime
        .quad_batch_writer_color_scale_bias_mode
        .unwrap_or(CT_MODE_NONE);
    let tint = color_scale_bias;

    if mode == CT_MODE_MATRIX {
        write_gl_color_matrix_instance(runtime, tint, instance_index);
        return;
    }

    if mode == CT_MODE_NONE {
        let Some(tint) = tint else {
            return;
        };
        if instance_index == 0 {
            runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_UNIFORM);
            runtime.quad_batch_writer_uniform_color_scale_bias = Some(*tint);
            return;
        }
        if is_color_matrix_data(Some(tint)) {
            promote_gl_quad_batch_writer_color_scale_bias_to_matrix(runtime, instance_index, None);
            write_gl_color_matrix_instance(runtime, Some(tint), instance_index);
            return;
        }
        if let Some(packed) = get_packed_tint(Some(tint)) {
            promote_gl_quad_batch_writer_color_scale_bias_to_packed_tint(
                runtime,
                instance_index,
                None,
            );
            write_gl_packed_tint_instance(runtime, packed, instance_index);
        } else {
            promote_gl_quad_batch_writer_color_scale_bias_to_per_instance(
                runtime,
                instance_index,
                None,
            );
            write_gl_color_scale_bias_instance(runtime, Some(tint), instance_index);
        }
        return;
    }

    if mode == CT_MODE_UNIFORM {
        let uniform = runtime.quad_batch_writer_uniform_color_scale_bias;
        if equals_recorded_color_scale_bias(tint, uniform.as_ref()) {
            return;
        }
        if is_color_matrix_data(tint) || is_color_matrix_data(uniform.as_ref()) {
            promote_gl_quad_batch_writer_color_scale_bias_to_matrix(
                runtime,
                instance_index,
                uniform.as_ref(),
            );
            write_gl_color_matrix_instance(runtime, tint, instance_index);
            return;
        }
        let packed_tint = get_packed_tint(tint);
        if get_packed_tint(uniform.as_ref()).is_some()
            && let Some(packed_tint) = packed_tint
        {
            promote_gl_quad_batch_writer_color_scale_bias_to_packed_tint(
                runtime,
                instance_index,
                uniform.as_ref(),
            );
            write_gl_packed_tint_instance(runtime, packed_tint, instance_index);
        } else {
            promote_gl_quad_batch_writer_color_scale_bias_to_per_instance(
                runtime,
                instance_index,
                uniform.as_ref(),
            );
            write_gl_color_scale_bias_instance(runtime, tint, instance_index);
        }
        return;
    }

    if mode == CT_MODE_PACKED_TINT {
        if is_color_matrix_data(tint) {
            promote_gl_packed_tint_to_color_matrix(runtime, instance_index);
            write_gl_color_matrix_instance(runtime, tint, instance_index);
            return;
        }
        if let Some(packed_tint) = get_packed_tint(tint) {
            write_gl_packed_tint_instance(runtime, packed_tint, instance_index);
        } else {
            promote_gl_packed_tint_to_color_scale_bias(runtime, instance_index);
            write_gl_color_scale_bias_instance(runtime, tint, instance_index);
        }
        return;
    }

    if is_color_matrix_data(tint) {
        promote_gl_color_scale_bias_to_matrix(runtime, instance_index);
        write_gl_color_matrix_instance(runtime, tint, instance_index);
        return;
    }
    write_gl_color_scale_bias_instance(runtime, tint, instance_index);
}

// Enables the opt-in color-adjustment accumulator and inline fold on a GL render state: the
// fused-color-matrix stage the sprite/quad batch draws through, so a color adjustment folds into the
// batch as data — a whole-batch uniform tint or per-instance attributes, chosen by data cardinality —
// without ever splitting the batch. Idempotent; safe to call per state.
pub fn register_gl_color_adjustment_material_feature(state: &mut GlRenderState) {
    enable_color_adjustments(state);
    let installed = crate::types::resolve_gl_color_adjustment_material_feature(state)
        .is_some_and(|feature| std::ptr::eq(feature, &GL_COLOR_ADJUSTMENT_MATERIAL_FEATURE));
    if !installed {
        let feature: &'static GlColorAdjustmentMaterialFeature =
            &GL_COLOR_ADJUSTMENT_MATERIAL_FEATURE;
        state.gl_registries.color_adjustment_feature = Some(Arc::new(feature));
    }
    let mut runtime = state.gl_runtime.borrow_mut();
    if runtime.quad_batch_writer_color_scale_bias_mode.is_none() {
        runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_NONE);
    }
}

fn rgba_to_native_byte_word(rgba: u32) -> u32 {
    return ((rgba >> 24) & 0xff)
        | (((rgba >> 16) & 0xff) << 8)
        | (((rgba >> 8) & 0xff) << 16)
        | ((rgba & 0xff) << 24);
}

pub(crate) fn to_gl_color_scale_bias_data(value: &ColorScaleBias) -> GlColorAdjustmentData {
    return GlColorAdjustmentData::ColorScaleBias([
        value.red_scale,
        value.green_scale,
        value.blue_scale,
        value.alpha_scale,
        value.red_bias,
        value.green_bias,
        value.blue_bias,
        value.alpha_bias,
    ]);
}

fn upload_color_buffer(state: &GlRenderState, bytes: &[u8]) {
    let buffer = ensure_writer_color_scale_bias_buffer(state);
    // SAFETY: the buffer belongs to this context; the upload occurs on the GL thread.
    unsafe {
        state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
        state
            .gl
            .buffer_data_u8_slice(glow::ARRAY_BUFFER, bytes, glow::DYNAMIC_DRAW);
    }
}

fn upload_color_matrix_buffer(state: &GlRenderState, count: usize) {
    let runtime = state.gl_runtime.borrow();
    let data = runtime
        .quad_batch_writer_color_matrix_data
        .as_deref()
        .unwrap_or(&[]);
    let end = (count * COLOR_MATRIX_FLOATS).min(data.len());
    upload_color_buffer(state, gl_f32_bytes(&data[..end]));
}

fn write_gl_affine_values_as_color_matrix(
    runtime: &mut GlRenderStateRuntime,
    affine: &[f32],
    affine_offset: usize,
    instance_index: usize,
) {
    write_gl_color_matrix_instance(runtime, None, instance_index);
    let out = runtime
        .quad_batch_writer_color_matrix_data
        .as_mut()
        .unwrap();
    let offset = instance_index * COLOR_MATRIX_FLOATS;
    for channel in 0..4 {
        out[offset + channel * 4 + channel] =
            affine.get(affine_offset + channel).copied().unwrap_or(0.0);
        out[offset + 16 + channel] = affine
            .get(affine_offset + 4 + channel)
            .copied()
            .unwrap_or(0.0);
    }
}

fn write_gl_color_matrix_instance(
    runtime: &mut GlRenderStateRuntime,
    adjustment: Option<&GlColorAdjustmentData>,
    instance_index: usize,
) {
    let offset = instance_index * COLOR_MATRIX_FLOATS;
    let data = runtime
        .quad_batch_writer_color_matrix_data
        .get_or_insert_with(|| vec![0.0; COLOR_MATRIX_FLOATS * 256]);
    if offset + COLOR_MATRIX_FLOATS > data.len() {
        let new_size = (offset + COLOR_MATRIX_FLOATS).max(data.len() * 2);
        data.resize(new_size, 0.0);
    }
    match adjustment {
        None => write_identity_color_matrix(data, offset),
        Some(GlColorAdjustmentData::ColorMatrix(matrix)) => {
            for row in 0..4 {
                let source = row * 5;
                let target = offset + row * 4;
                data[target] = matrix[source];
                data[target + 1] = matrix[source + 1];
                data[target + 2] = matrix[source + 2];
                data[target + 3] = matrix[source + 3];
                data[offset + 16 + row] = matrix[source + 4];
            }
        }
        Some(adjustment) => {
            write_identity_color_matrix(data, offset);
            for channel in 0..4 {
                data[offset + channel * 4 + channel] = get_color_scale(adjustment, channel);
                data[offset + 16 + channel] = get_color_bias(adjustment, channel);
            }
        }
    }
}

// Writes one instance's eight color scale/bias floats at its slot in the batch data, growing the
// array as needed. Bias is already normalized-linear and is copied verbatim. None writes identity.
fn write_gl_color_scale_bias_instance(
    runtime: &mut GlRenderStateRuntime,
    color_scale_bias: Option<&GlColorAdjustmentData>,
    instance_index: usize,
) {
    let offset = instance_index * COLOR_SCALE_BIAS_FLOATS;
    let data = runtime
        .quad_batch_writer_color_scale_bias_data
        .get_or_insert_with(|| vec![0.0; COLOR_SCALE_BIAS_FLOATS * 256]);
    if offset + COLOR_SCALE_BIAS_FLOATS > data.len() {
        let new_size = (offset + COLOR_SCALE_BIAS_FLOATS).max(data.len() * 2);
        data.resize(new_size, 0.0);
    }
    match color_scale_bias {
        Some(value) => {
            for channel in 0..4 {
                data[offset + channel] = get_color_scale(value, channel);
                data[offset + 4 + channel] = get_color_bias(value, channel);
            }
        }
        None => {
            data[offset..offset + 4].fill(1.0);
            data[offset + 4..offset + 8].fill(0.0);
        }
    }
}

fn write_gl_native_packed_tint_as_color_matrix(
    runtime: &mut GlRenderStateRuntime,
    native_word: u32,
    instance_index: usize,
) {
    write_gl_color_matrix_instance(runtime, None, instance_index);
    let out = runtime
        .quad_batch_writer_color_matrix_data
        .as_mut()
        .unwrap();
    let offset = instance_index * COLOR_MATRIX_FLOATS;
    out[offset] = (native_word & 0xff) as f32 / 255.0;
    out[offset + 5] = ((native_word >> 8) & 0xff) as f32 / 255.0;
    out[offset + 10] = ((native_word >> 16) & 0xff) as f32 / 255.0;
    out[offset + 15] = ((native_word >> 24) & 0xff) as f32 / 255.0;
}

fn write_gl_native_packed_tint_as_color_scale_bias(
    runtime: &mut GlRenderStateRuntime,
    native_word: u32,
    instance_index: usize,
) {
    let offset = instance_index * COLOR_SCALE_BIAS_FLOATS;
    write_gl_color_scale_bias_instance(runtime, None, instance_index);
    let data = runtime
        .quad_batch_writer_color_scale_bias_data
        .as_mut()
        .unwrap();
    data[offset] = (native_word & 0xff) as f32 / 255.0;
    data[offset + 1] = ((native_word >> 8) & 0xff) as f32 / 255.0;
    data[offset + 2] = ((native_word >> 16) & 0xff) as f32 / 255.0;
    data[offset + 3] = ((native_word >> 24) & 0xff) as f32 / 255.0;
}

fn write_gl_packed_tint_instance(
    runtime: &mut GlRenderStateRuntime,
    rgba: u32,
    instance_index: usize,
) {
    let data = runtime
        .quad_batch_writer_color_tint_data
        .get_or_insert_with(|| vec![0; 256]);
    if instance_index >= data.len() {
        let new_size = (instance_index + 1).max(data.len() * 2);
        data.resize(new_size, 0);
    }
    data[instance_index] = rgba_to_native_byte_word(rgba);
}

fn write_identity_color_matrix(out: &mut [f32], offset: usize) {
    out[offset..offset + COLOR_MATRIX_FLOATS].fill(0.0);
    out[offset] = 1.0;
    out[offset + 5] = 1.0;
    out[offset + 10] = 1.0;
    out[offset + 15] = 1.0;
}

fn writer_color_scale_bias_buffer(state: &GlRenderState) -> Option<NativeBuffer> {
    return state
        .context_state
        .runtime_state
        .borrow()
        .quad_batch_resources
        .as_ref()
        .and_then(|resources| resources.writer_color_scale_bias_buffer);
}
