// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The GPU-only shape strategy (TS `wgpuMeshShapeRenderer.ts`): every fill and stroke is
//! tessellated, nothing is rasterized, and this module never references the canvas replay. A fill
//! with no tessellated form does not draw and reports the same ShapeRasterizer miss the hybrid
//! reports when no rasterizer is registered. Mirrors scene2d-gl's mesh shape renderer.

use flight_node::{Node, get_node_local_content_revision};
use flight_path::{PathMesh, tessellate_path};
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, RenderRegistryTable, RenderState,
    emit_render_registry_miss,
};
use flight_render_wgpu::{WgpuRenderState, WgpuShapeMesh, get_wgpu_render_state_runtime};
use flight_shape::contract::SHAPE_KIND;
use flight_shape::{
    ShapeCommandToken, ShapeFillRegion, ShapeStrokeRegion, get_shape_fill_regions,
    get_shape_stroke_outline_regions, get_shape_stroke_regions,
};

use crate::wgpu_shape_data::{
    create_wgpu_shape_data, destroy_wgpu_shape_data, get_wgpu_shape_data,
};
use crate::wgpu_shape_mesh::draw_wgpu_shape_meshes;

/// The GPU-only shape strategy (TS `wgpuMeshShapeRenderer`): registering it instead of
/// `WGPU_SHAPE_RENDERER` leaves the canvas replay out entirely and needs no shape commands.
pub static WGPU_MESH_SHAPE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_wgpu_shape_data,
    destroy_data: Some(destroy_wgpu_shape_data),
    is_dirty: None,
    submit: submit_wgpu_mesh_shape,
};

// One solid region, fill or stroke, in fill-before-stroke order.
enum WgpuShapeMeshRegion {
    Fill(ShapeFillRegion),
    Stroke(ShapeStrokeRegion),
}

/// Draws the shape through the GPU mesh path alone and reports whether it did (TS
/// `drawWgpuMeshShape`). `false` when any fill or stroke has no tessellated form — a gradient, a
/// texture fill, or a closed stroke the active tessellator rejects — the signal the hybrid uses to
/// fall through to the raster strategy.
pub fn draw_wgpu_mesh_shape(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) -> bool {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return false;
    }

    let (regions, version) = {
        let source = render_proxy.source.read().unwrap();
        let Some(commands) = get_wgpu_shape_commands(&*source) else {
            return false;
        };
        if commands.is_empty() || render_proxy.renderer_data.is_none() {
            return false;
        }
        // Compact open outlines are the default. Explicitly enabling stroke-path tessellation adds
        // hollow closed rings and pathological-geometry rejection to this state only.
        let stroke_path_tessellator = state.render_registries().stroke_tessellator;
        let regions = resolve_wgpu_shape_mesh_regions(commands, stroke_path_tessellator.is_some());
        (regions, get_node_local_content_revision(&*source))
    };
    let Some(regions) = regions else {
        return false;
    };
    if regions.is_empty() {
        return false;
    }
    let stroke_path_tessellator = state.render_registries().stroke_tessellator;

    let renderer_data = render_proxy.renderer_data.clone().unwrap();
    let mut guard = renderer_data.write().unwrap();
    let Some(mesh_data) = get_wgpu_shape_data(&mut *guard) else {
        return false;
    };

    if mesh_data.mesh_version != version as i64 {
        let mut meshes: Vec<WgpuShapeMesh> = Vec::new();
        let mut supported = true;
        for region in &regions {
            let (mesh, color, alpha) = match region {
                WgpuShapeMeshRegion::Stroke(region) if stroke_path_tessellator.is_some() => (
                    stroke_path_tessellator.unwrap()(
                        &region.path.read().unwrap(),
                        &region.style,
                        None,
                    ),
                    region.color,
                    region.alpha,
                ),
                WgpuShapeMeshRegion::Stroke(region) => (
                    Some(tessellate_path(&region.path.read().unwrap(), None)),
                    region.color,
                    region.alpha,
                ),
                WgpuShapeMeshRegion::Fill(region) => (
                    Some(tessellate_path(&region.path.read().unwrap(), None)),
                    region.color,
                    region.alpha,
                ),
            };
            let Some(mesh) = mesh else {
                supported = false;
                break;
            };
            meshes.push(to_wgpu_shape_mesh(&mesh, color, alpha));
        }
        mesh_data.meshes = if supported { Some(meshes) } else { None };
        mesh_data.mesh_version = version as i64;
    }
    let Some(meshes) = mesh_data.meshes.clone() else {
        return false;
    };

    draw_wgpu_shape_meshes(state, render_proxy, &meshes, &mut mesh_data.mesh_buffers);
    return true;
}

// The command stream of a Shape, a MorphShape (a distinct kind sharing Shape's renderers) or a
// Scale9Shape (whose unmappable fallback draws through the shape renderer); `None` otherwise.
pub(crate) fn get_wgpu_shape_commands(source: &dyn Node) -> Option<&[ShapeCommandToken]> {
    if let Some(shape) = source.as_any().downcast_ref::<flight_shape::Shape>() {
        return Some(&shape.data.commands);
    }
    if let Some(shape) = source.as_any().downcast_ref::<flight_shape::MorphShape>() {
        return Some(&shape.data.commands);
    }
    if let Some(shape) = source.as_any().downcast_ref::<flight_shape::Scale9Shape>() {
        return Some(&shape.data.commands);
    }
    return None;
}

// Resolves every solid fill and solid stroke into one fill-before-stroke source list. The default
// lane uses compact fillable open-stroke outlines; the opt-in ring lane retains styled centerlines
// for the heavier direct stroke tessellator.
fn resolve_wgpu_shape_mesh_regions(
    commands: &[ShapeCommandToken],
    stroke_path_tessellator_enabled: bool,
) -> Option<Vec<WgpuShapeMeshRegion>> {
    let fill_regions = get_shape_fill_regions(commands)?;
    let mut regions: Vec<WgpuShapeMeshRegion> = fill_regions
        .into_iter()
        .map(WgpuShapeMeshRegion::Fill)
        .collect();
    if stroke_path_tessellator_enabled {
        let stroke_regions = get_shape_stroke_regions(commands)?;
        regions.extend(stroke_regions.into_iter().map(WgpuShapeMeshRegion::Stroke));
    } else {
        let stroke_regions = get_shape_stroke_outline_regions(commands)?;
        regions.extend(stroke_regions.into_iter().map(WgpuShapeMeshRegion::Fill));
    }
    return Some(regions);
}

// The mesh strategy's submit: a shape that needs raster reports the ShapeRasterizer miss.
fn submit_wgpu_mesh_shape(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    if draw_wgpu_mesh_shape(state, render_proxy) {
        return;
    }
    emit_render_registry_miss(
        state,
        RenderRegistryTable::ShapeRasterizer,
        SHAPE_KIND.to_string(),
    );
}

// TS `new Float32Array(mesh.vertices)` / `new Uint16Array(mesh.indices)`: narrowing copies.
fn to_wgpu_shape_mesh(mesh: &PathMesh, color: u32, alpha: f32) -> WgpuShapeMesh {
    return WgpuShapeMesh {
        vertices: mesh.vertices.iter().map(|value| *value as f32).collect(),
        indices: mesh.indices.iter().map(|value| *value as u16).collect(),
        color,
        alpha,
    };
}
