// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_node::get_node_local_content_revision;
use flight_path::tessellate_path;
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, RenderRegistryTable, emit_render_registry_miss,
};
use flight_render_gl::{GlRenderState, GlShapeMesh};
use flight_shape::contract::{
    SHAPE_KIND, ShapeCommandToken, ShapeFillRegion, ShapeStrokeRegion, get_shape_fill_regions,
    get_shape_stroke_outline_regions, get_shape_stroke_regions,
};

use crate::gl_shape_commands::get_gl_shape_commands;
use crate::gl_shape_data::{create_gl_shape_data, destroy_gl_shape_data, get_gl_shape_data};
use crate::gl_shape_mesh::draw_gl_shape_meshes;

/// One fill or stroke region of the fill-before-stroke source list (TS
/// `ShapeFillRegion | ShapeStrokeRegion`).
enum GlShapeMeshRegion {
    Fill(ShapeFillRegion),
    Stroke(ShapeStrokeRegion),
}

// The GPU-only shape strategy: everything is tessellated, nothing is ever rasterized. A fill with no
// tessellated form does not draw; that reports the same ShapeRasterizer miss the hybrid reports when
// no rasterizer is registered: the shape needs raster and this state will not do it.
pub static GL_MESH_SHAPE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_gl_shape_data,
    destroy_data: Some(destroy_gl_shape_data),
    is_dirty: None,
    submit: submit_gl_mesh_shape,
};

// Draws the shape through the GPU mesh path alone, and reports whether it did. Returns false when any
// fill or stroke has no tessellated form — a gradient, a texture fill, or a closed stroke the active
// tessellator rejects — which is the signal draw_gl_shape uses to fall through to the raster strategy.
//
// Resolution-independent: the meshes are cached against the node's content revision and drawn crisp
// at any zoom, so nothing here allocates a canvas or depends on the pixel ratio.
pub fn draw_gl_mesh_shape(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
) -> bool {
    let source = render_proxy.source.read().unwrap();
    let Some(commands) = get_gl_shape_commands(&*source) else {
        return false;
    };
    let Some(renderer_data) = &render_proxy.renderer_data else {
        return false;
    };
    if commands.is_empty() {
        return false;
    }

    // Compact open outlines are the default. Explicitly enabling stroke-path tessellation adds hollow
    // closed rings and pathological-geometry rejection to this state only.
    let stroke_path_tessellator = state.registries.stroke_tessellator;
    let Some(regions) = resolve_gl_shape_mesh_regions(commands, stroke_path_tessellator.is_some())
    else {
        return false;
    };
    if regions.is_empty() {
        return false;
    }

    let version = i64::from(get_node_local_content_revision(&*source));
    let mut guard = renderer_data.write().unwrap();
    let Some(mesh_data) = get_gl_shape_data(&mut *guard) else {
        return false;
    };
    if mesh_data.mesh_version != version {
        let mut meshes = Vec::with_capacity(regions.len());
        let mut supported = true;
        for region in &regions {
            let (mesh, color, alpha) = match (region, stroke_path_tessellator) {
                (GlShapeMeshRegion::Stroke(stroke), Some(tessellator)) => (
                    tessellator(&stroke.path.read().unwrap(), &stroke.style, None),
                    stroke.color,
                    stroke.alpha,
                ),
                (GlShapeMeshRegion::Stroke(stroke), None) => (
                    Some(tessellate_path(&stroke.path.read().unwrap(), None)),
                    stroke.color,
                    stroke.alpha,
                ),
                (GlShapeMeshRegion::Fill(fill), _) => (
                    Some(tessellate_path(&fill.path.read().unwrap(), None)),
                    fill.color,
                    fill.alpha,
                ),
            };
            let Some(mesh) = mesh else {
                supported = false;
                break;
            };
            meshes.push(GlShapeMesh {
                vertices: mesh.vertices.iter().map(|value| *value as f32).collect(),
                indices: mesh.indices.iter().map(|value| *value as u16).collect(),
                color,
                alpha,
            });
        }
        mesh_data.meshes = if supported { Some(meshes) } else { None };
        mesh_data.mesh_version = version;
    }
    let Some(meshes) = mesh_data.meshes.clone() else {
        return false;
    };
    drop(guard);
    drop(source);

    draw_gl_shape_meshes(state, render_proxy, &meshes);
    return true;
}

// Resolves every solid fill and solid stroke into one fill-before-stroke source list. The default
// lane uses compact fillable open-stroke outlines; the opt-in ring lane retains styled centerlines
// for the heavier direct stroke tessellator.
fn resolve_gl_shape_mesh_regions(
    commands: &[ShapeCommandToken],
    stroke_path_tessellator_enabled: bool,
) -> Option<Vec<GlShapeMeshRegion>> {
    let fill_regions = get_shape_fill_regions(commands)?;
    let mut regions = fill_regions
        .into_iter()
        .map(GlShapeMeshRegion::Fill)
        .collect::<Vec<_>>();
    if stroke_path_tessellator_enabled {
        let stroke_regions = get_shape_stroke_regions(commands)?;
        regions.extend(stroke_regions.into_iter().map(GlShapeMeshRegion::Stroke));
    } else {
        let stroke_regions = get_shape_stroke_outline_regions(commands)?;
        regions.extend(stroke_regions.into_iter().map(GlShapeMeshRegion::Fill));
    }
    return if regions.is_empty() {
        None
    } else {
        Some(regions)
    };
}

fn submit_gl_mesh_shape(state: &mut GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) {
    if draw_gl_mesh_shape(state, render_proxy) {
        return;
    }
    emit_render_registry_miss(
        state,
        RenderRegistryTable::ShapeRasterizer,
        SHAPE_KIND.to_string(),
    );
}
