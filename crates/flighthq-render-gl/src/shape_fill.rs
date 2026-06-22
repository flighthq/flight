//! GL shape fill — tessellated solid-fill bridge for vector `Shape` nodes.
//!
//! This is the GL analogue of `flighthq_render_wgpu::draw_wgpu_shape_fill`. Each
//! solid `beginFill … endFill` span is resolved into a
//! [`flighthq_types::ShapeFillRegion`] by the caller, tessellated here via
//! [`flighthq_path::tessellate_path`], uploaded into per-node GL vertex/index
//! buffers, and drawn with a dedicated solid-color program (a `vec2` position
//! attribute plus a 3×3 NDC matrix and a flat color uniform) — distinct from the
//! textured-quad bitmap program, which carries a texture sampler and UVs.
//!
//! The solid-fill program is compiled once and cached on the runtime, mirroring
//! `flighthq_filters_gl`'s fullscreen-program cache and render-wgpu's shape
//! pipeline cache. Meshes are cached per node id and rebuilt only when the
//! shape's `content_revision` changes, matching the wgpu shape mesh cache.
//!
//! Limitations (deferred, matching wgpu): solid single-color fills only.
//! Gradients, bitmap fills, and strokes are resolved to `None` upstream and are
//! not handled here yet.

use flighthq_path::tessellate_path;
use flighthq_types::{PathMesh, ShapeFillRegion};
use glow::HasContext;

use crate::render_state::{GlRenderState, bytemuck_f32, bytemuck_u32};
use crate::shader::{pack_gl_ndc_matrix, viewport_dimensions};

// Flatness tolerance for curve subdivision during fill tessellation (path units).
// Matches `flighthq_render_wgpu::shape_mesh::SHAPE_FILL_TOLERANCE`.
const SHAPE_FILL_TOLERANCE: f32 = 0.25;

/// Solid-fill vertex shader: a `vec2` position transformed by a 3×3 NDC matrix.
/// No texture coordinates — the fragment color is a flat uniform. Mirrors the
/// bitmap vertex shader's clip-space convention so fills and bitmaps align.
pub const SHAPE_FILL_VERTEX_SRC: &str = "#version 300 es
in vec2 a_fillPosition;
uniform mat3 u_fillMatrix;
void main() {
  vec3 pos = u_fillMatrix * vec3(a_fillPosition, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
}";

/// Solid-fill fragment shader: emits a flat premultiplied color so it composites
/// under the shared Normal `(one, one-minus-src-alpha)` blend. Mirrors the wgpu
/// solid-fill shader's premultiplied output.
pub const SHAPE_FILL_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
uniform vec4 u_fillColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_fillColor.rgb * u_fillColor.a, u_fillColor.a);
}";

/// A compiled, cached solid-fill program and its uniform/attribute locations.
#[derive(Clone, Debug)]
pub struct GlShapeFillProgram {
    pub program: glow::Program,
    pub loc_position: u32,
    pub loc_matrix: Option<glow::UniformLocation>,
    pub loc_color: Option<glow::UniformLocation>,
}

/// A GPU triangle mesh for one solid-color fill region of a vector shape.
#[derive(Debug)]
pub struct GlShapeFillMesh {
    pub vertex_buffer: glow::Buffer,
    pub index_buffer: glow::Buffer,
    pub index_count: u32,
    /// Packed `0xRRGGBBaa` fill color (alpha already folded with the region alpha).
    pub color: u32,
}

/// Cached, uploaded meshes for one shape node, tagged with the source
/// `content_revision` so the cache is invalidated when geometry changes.
#[derive(Debug)]
pub struct GlShapeFillMeshCacheEntry {
    pub content_revision: u32,
    pub meshes: Vec<GlShapeFillMesh>,
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Frees the GL buffers owned by a per-node mesh cache entry.
pub fn destroy_gl_shape_fill_mesh_cache_entry(
    state: &GlRenderState,
    entry: GlShapeFillMeshCacheEntry,
) {
    unsafe {
        for mesh in entry.meshes {
            state.gl.delete_buffer(mesh.vertex_buffer);
            state.gl.delete_buffer(mesh.index_buffer);
        }
    }
}

/// Draws the solid fills of shape `node_id` using its tessellated mesh cache.
///
/// `regions` is the resolved solid-fill list for the node (from
/// `flighthq_shape::get_shape_fill_regions`), and `content_revision` is the
/// node's current geometry revision. When the cache is stale (or missing) the
/// regions are tessellated, uploaded, and cached before drawing. Each mesh is
/// drawn with the node's current 2D transform and alpha (read from
/// `render_state`) through the solid-fill program. Mirrors
/// `flighthq_render_wgpu::draw_wgpu_shape_fill`.
pub fn draw_gl_shape_fill(
    state: &mut GlRenderState,
    node_id: u64,
    regions: &[ShapeFillRegion],
    content_revision: u32,
) {
    ensure_gl_shape_fill_meshes(state, node_id, regions, content_revision);

    let program = get_gl_shape_fill_program(state);
    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let (vw, vh) = viewport_dimensions(state);

    let mut matrix = [0.0_f32; 9];
    pack_gl_ndc_matrix(
        &mut matrix,
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.tx,
        transform.ty,
        vw,
        vh,
    );

    if state.runtime.current_program != Some(program.program) {
        unsafe {
            state.gl.use_program(Some(program.program));
        }
        state.runtime.current_program = Some(program.program);
        // The fill program is not a bitmap program; clear the bitmap shader
        // location cache so the next bitmap draw rebinds its own attributes.
        state.runtime.shader_loc = None;
    }
    unsafe {
        state
            .gl
            .uniform_matrix_3_f32_slice(program.loc_matrix.as_ref(), false, &matrix);
    }

    let mesh_count = state
        .runtime
        .shape_fill_mesh_cache
        .get(&node_id)
        .map(|e| e.meshes.len())
        .unwrap_or(0);
    for i in 0..mesh_count {
        let (color, index_count, vertex_buffer, index_buffer) = {
            let entry = state
                .runtime
                .shape_fill_mesh_cache
                .get(&node_id)
                .expect("entry present after ensure");
            let mesh = &entry.meshes[i];
            (
                mesh.color,
                mesh.index_count,
                mesh.vertex_buffer,
                mesh.index_buffer,
            )
        };
        if index_count == 0 {
            continue;
        }
        let fill = pack_gl_shape_fill_color(color, alpha);
        unsafe {
            state.gl.uniform_4_f32(
                program.loc_color.as_ref(),
                fill[0],
                fill[1],
                fill[2],
                fill[3],
            );
            state
                .gl
                .bind_buffer(glow::ARRAY_BUFFER, Some(vertex_buffer));
            state
                .gl
                .enable_vertex_attrib_array(program.loc_position);
            state
                .gl
                .vertex_attrib_pointer_f32(program.loc_position, 2, glow::FLOAT, false, 8, 0);
            state
                .gl
                .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(index_buffer));
            state.gl.draw_elements(
                glow::TRIANGLES,
                index_count as i32,
                glow::UNSIGNED_INT,
                0,
            );
        }
    }
}

/// Folds a region's `[0,1]` alpha multiplier into the packed color's alpha byte.
/// Colors are `0xRRGGBBaa`; the RGB bytes pass through untouched. Mirrors
/// `flighthq_render_wgpu::shape_mesh::fold_region_color`. Pure CPU seam.
pub fn fold_gl_shape_fill_region_color(color: u32, alpha: f32) -> u32 {
    let base_a = (color & 0xff) as f32 / 255.0;
    let a = (base_a * alpha.clamp(0.0, 1.0) * 255.0).round() as u32;
    (color & 0xffff_ff00) | (a & 0xff)
}

/// Unpacks a `0xRRGGBBaa` color into four `[0,1]` floats `[r, g, b, a]`, folding
/// the node-level `node_alpha` into the alpha channel. Pure CPU seam — the
/// uniform packing the solid-fill fragment shader consumes.
pub fn pack_gl_shape_fill_color(color: u32, node_alpha: f32) -> [f32; 4] {
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0 * node_alpha.clamp(0.0, 1.0);
    [r, g, b, a]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Compiles and links the solid-fill program, resolving its attribute/uniform
// locations. Panics on compile/link failure (a build-time shader error).
fn compile_gl_shape_fill_program(gl: &glow::Context) -> GlShapeFillProgram {
    unsafe {
        let vs = compile_gl_shape_fill_shader(gl, glow::VERTEX_SHADER, SHAPE_FILL_VERTEX_SRC);
        let fs = compile_gl_shape_fill_shader(gl, glow::FRAGMENT_SHADER, SHAPE_FILL_FRAGMENT_SRC);
        let program = gl.create_program().expect("create_program");
        gl.attach_shader(program, vs);
        gl.attach_shader(program, fs);
        gl.link_program(program);
        if !gl.get_program_link_status(program) {
            panic!(
                "Shape-fill program link error: {}",
                gl.get_program_info_log(program)
            );
        }
        gl.delete_shader(vs);
        gl.delete_shader(fs);
        GlShapeFillProgram {
            program,
            loc_position: gl.get_attrib_location(program, "a_fillPosition").unwrap_or(0),
            loc_matrix: gl.get_uniform_location(program, "u_fillMatrix"),
            loc_color: gl.get_uniform_location(program, "u_fillColor"),
        }
    }
}

unsafe fn compile_gl_shape_fill_shader(
    gl: &glow::Context,
    shader_type: u32,
    src: &str,
) -> glow::Shader {
    unsafe {
        let shader = gl.create_shader(shader_type).expect("create_shader");
        gl.shader_source(shader, src);
        gl.compile_shader(shader);
        if !gl.get_shader_compile_status(shader) {
            panic!(
                "Shape-fill shader compile error: {}",
                gl.get_shader_info_log(shader)
            );
        }
        shader
    }
}

// Tessellates and uploads the node's fill regions if the cache is missing or its
// content revision is stale, freeing any prior meshes first.
fn ensure_gl_shape_fill_meshes(
    state: &mut GlRenderState,
    node_id: u64,
    regions: &[ShapeFillRegion],
    content_revision: u32,
) {
    let fresh = state
        .runtime
        .shape_fill_mesh_cache
        .get(&node_id)
        .map(|e| e.content_revision == content_revision)
        .unwrap_or(false);
    if fresh {
        return;
    }

    if let Some(old) = state.runtime.shape_fill_mesh_cache.remove(&node_id) {
        destroy_gl_shape_fill_mesh_cache_entry(state, old);
    }

    let mut meshes: Vec<GlShapeFillMesh> = Vec::new();
    for region in regions {
        let mut path_mesh = PathMesh::default();
        tessellate_path(&region.path, SHAPE_FILL_TOLERANCE, &mut path_mesh);
        if path_mesh.indices.is_empty() {
            continue;
        }
        let color = fold_gl_shape_fill_region_color(region.color, region.alpha);
        meshes.push(upload_gl_shape_fill_mesh(state, &path_mesh, color));
    }

    state.runtime.shape_fill_mesh_cache.insert(
        node_id,
        GlShapeFillMeshCacheEntry {
            content_revision,
            meshes,
        },
    );
}

// Returns the cached solid-fill program, compiling and caching it on first use.
fn get_gl_shape_fill_program(state: &mut GlRenderState) -> GlShapeFillProgram {
    if let Some(program) = &state.runtime.shape_fill_program {
        return program.clone();
    }
    let program = compile_gl_shape_fill_program(&state.gl);
    state.runtime.shape_fill_program = Some(program.clone());
    program
}

// Uploads one tessellated path mesh into fresh GL vertex/index buffers.
fn upload_gl_shape_fill_mesh(
    state: &GlRenderState,
    mesh: &PathMesh,
    color: u32,
) -> GlShapeFillMesh {
    unsafe {
        let vertex_buffer = state.gl.create_buffer().expect("create fill vertex buffer");
        state
            .gl
            .bind_buffer(glow::ARRAY_BUFFER, Some(vertex_buffer));
        state.gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            bytemuck_f32(&mesh.vertices),
            glow::STATIC_DRAW,
        );

        let index_buffer = state.gl.create_buffer().expect("create fill index buffer");
        state
            .gl
            .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(index_buffer));
        state.gl.buffer_data_u8_slice(
            glow::ELEMENT_ARRAY_BUFFER,
            bytemuck_u32(&mesh.indices),
            glow::STATIC_DRAW,
        );

        GlShapeFillMesh {
            vertex_buffer,
            index_buffer,
            index_count: mesh.indices.len() as u32,
            color,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // SHAPE_FILL_FRAGMENT_SRC

    #[test]
    fn shape_fill_fragment_src_declares_premultiplied_color_interface() {
        assert!(SHAPE_FILL_FRAGMENT_SRC.contains("#version 300 es"));
        assert!(SHAPE_FILL_FRAGMENT_SRC.contains("uniform vec4 u_fillColor"));
        assert!(SHAPE_FILL_FRAGMENT_SRC.contains("out vec4 fragColor"));
        // Premultiplied output: rgb scaled by alpha.
        assert!(SHAPE_FILL_FRAGMENT_SRC.contains("u_fillColor.rgb * u_fillColor.a"));
    }

    // SHAPE_FILL_VERTEX_SRC

    #[test]
    fn shape_fill_vertex_src_declares_position_attribute_and_matrix() {
        assert!(SHAPE_FILL_VERTEX_SRC.contains("#version 300 es"));
        assert!(SHAPE_FILL_VERTEX_SRC.contains("in vec2 a_fillPosition"));
        assert!(SHAPE_FILL_VERTEX_SRC.contains("uniform mat3 u_fillMatrix"));
        // No texture coordinates in the solid-fill path.
        assert!(!SHAPE_FILL_VERTEX_SRC.contains("a_texCoord"));
    }

    // fold_gl_shape_fill_region_color

    #[test]
    fn fold_gl_shape_fill_region_color_full_alpha_passes_through() {
        assert_eq!(fold_gl_shape_fill_region_color(0xff0000ff, 1.0), 0xff0000ff);
    }

    #[test]
    fn fold_gl_shape_fill_region_color_half_alpha_scales_alpha_byte() {
        // 0xaa alpha * 0.5 ≈ 0x55, RGB untouched.
        assert_eq!(fold_gl_shape_fill_region_color(0x102030aa, 0.5), 0x10203055);
    }

    // pack_gl_shape_fill_color

    #[test]
    fn pack_gl_shape_fill_color_unpacks_channels() {
        let c = pack_gl_shape_fill_color(0xff_80_00_ff, 1.0);
        assert!((c[0] - 1.0).abs() < 1e-6);
        assert!((c[1] - 128.0 / 255.0).abs() < 1e-6);
        assert!((c[2] - 0.0).abs() < 1e-6);
        assert!((c[3] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn pack_gl_shape_fill_color_folds_node_alpha() {
        // Opaque red at half node alpha -> alpha 0.5, rgb untouched.
        let c = pack_gl_shape_fill_color(0xff0000ff, 0.5);
        assert!((c[0] - 1.0).abs() < 1e-6);
        assert!((c[3] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn pack_gl_shape_fill_color_clamps_node_alpha() {
        let c = pack_gl_shape_fill_color(0x000000ff, 4.0);
        assert!((c[3] - 1.0).abs() < 1e-6);
    }
}
