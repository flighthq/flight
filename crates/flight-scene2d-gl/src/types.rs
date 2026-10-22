// flight-lint: allow-file(contract-vocabulary, file-structure) D17 GL renderer contracts carry thread-bound render-gl state, opaque host handles and backend-typed callbacks
//! The types scene2d-gl owns (TS `GlShapeMesh.ts`, `GlShapeRendererData.ts`,
//! `GlRichTextOverlay.ts`, and the concrete `GlColorAdjustmentMaterialFeature` contract whose
//! registry slot render-gl holds erased), plus the render-owned `ShapeRasterizer` callback, which
//! has no Rust home yet.

use std::sync::Arc;

use flight_entity::Ref;
use flight_host::CanvasRenderingContext2D;
use flight_image::ImageResource;
use flight_node::RendererDataFields;
use flight_render::RenderProxy2D;
use flight_render_gl::{GlColorAdjustmentData, GlRenderState, GlRenderStateRuntime};
use flight_shape::ShapeCommandToken;
use flight_surface::CanvasSurface;

/// One tessellated solid-fill region of a Shape, ready for the flat-color mesh path (TS
/// `GlShapeMesh`): interleaved xy `vertices`, triangle `indices`, a packed `0xRRGGBBAA` fill
/// `color`, and the region `alpha`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GlShapeMesh {
    pub vertices: Vec<f32>,
    pub indices: Vec<u16>,
    pub color: u32,
    pub alpha: f32,
}

/// NodeRenderer-private scratch for a Shape node on the GL backend (TS `GlShapeRendererData`). The
/// two halves are independent: `meshes` caches the tessellated form (`None` when some region has
/// none), and `surface`/`image` plus the `last_*` fields cache the rasterized form.
#[derive(Default)]
pub struct GlShapeRendererData {
    pub(crate) renderer_data: RendererDataFields,
    pub image: Option<Ref<ImageResource>>,
    pub last_content_id: i64,
    pub last_h: f32,
    pub last_pixel_ratio: f32,
    pub last_w: f32,
    pub mesh_version: i64,
    pub meshes: Option<Vec<GlShapeMesh>>,
    pub surface: Option<Ref<CanvasSurface>>,
}

/// The opt-in inline color-adjustment fold for the GL sprite/quad batch (TS
/// `GlColorAdjustmentMaterialFeature`). Registered as persistent per-state policy by
/// `register_gl_color_adjustment_material_feature` into render-gl's erased registry slot.
pub struct GlColorAdjustmentMaterialFeature {
    pub fragment_shader_chunk: &'static str,
    pub matrix_fragment_shader_chunk: &'static str,
    pub draw_shape_meshes: fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>, &[GlShapeMesh]),
    pub flush: fn(&mut GlRenderState, usize) -> bool,
    pub record: fn(&mut GlRenderStateRuntime, Option<&GlColorAdjustmentData>, usize),
}

/// Replays a shape's command stream into a 2D context, for a backend that cannot express every fill
/// as GPU geometry (TS `ShapeRasterizer`, owned by render). `state` is the backend's own render
/// state, passed through for registry-miss reporting only.
pub type ShapeRasterizer<S> =
    Arc<dyn Fn(&CanvasRenderingContext2D, &[ShapeCommandToken], &mut S) + Send + Sync>;

/// Resolves render-gl's erased color-adjustment slot to this package's concrete feature contract.
pub(crate) fn resolve_gl_color_adjustment_material_feature(
    state: &GlRenderState,
) -> Option<&'static GlColorAdjustmentMaterialFeature> {
    let slot = state.gl_registries.color_adjustment_feature.as_ref()?;
    return slot
        .downcast_ref::<&'static GlColorAdjustmentMaterialFeature>()
        .copied();
}

flight_node::impl_renderer_data!(GlShapeRendererData);
