//! 3D scene render-contract header types.
//!
//! The backend-agnostic data the `prepareSceneRender` pipeline (in
//! `flighthq-render` / `flighthq-scene`) hands to a backend `draw_scene` walk.
//! These are pure value types — no GPU handles, no scene-graph traversal — so
//! the scene renderers (`flighthq-scene-gl` / `flighthq-scene-wgpu`) import them
//! from the header instead of redefining local stand-ins.
//!
//! Ports `@flighthq/types`' `SceneLights`, `SceneLightBlock`, and
//! `SceneRenderProxy`. (`SceneRenderList` — the full `prepareSceneRender` output
//! — references the un-ported `Mesh` scene node and the arena `NodeId` model, so
//! it lives in the render/scene crate, not the header; the scene draw path does
//! not consume it as a value type.)

use crate::geometry::{Matrix3, Matrix4};
use crate::lighting::{AmbientLight, DirectionalLight};
use crate::mesh::MeshSubset;

/// The set of light DATA descriptors passed to one `draw_scene` call as a
/// draw-argument (lights are not scene members: `scene` = what exists,
/// `camera`/`lights` = what we render now). This proving slice carries at most
/// one directional + one ambient term; either may be `None` when absent.
/// `prepareSceneRender` resolves this into the packed [`SceneLightBlock`]
/// (sRGB->linear at pack time). The shape grows to `MAX_FORWARD_LIGHTS` punctual
/// lights (point/spot arrays) in later passes.
#[derive(Clone, Debug, Default)]
pub struct SceneLights {
    pub ambient: Option<AmbientLight>,
    pub directional: Option<DirectionalLight>,
}

/// The packed, GPU-ready lighting environment for one `draw_scene` call.
/// `prepareSceneRender` resolves the scene's light DATA descriptors into this
/// flat block once per frame; every mesh-material renderer then binds the same
/// block as the shared light uniform. Pure CPU-side data — no GPU handles — so it
/// is backend-agnostic; each backend uploads `data` into its own uniform/storage
/// buffer.
///
/// `data` is a tightly-packed float layout matching the shader's std140/std430
/// light block (radiance is linear, premultiplied:
/// `unpack_color_to_linear(color) * intensity`, packed at pack time so the shader
/// never sees sRGB). This proving slice carries exactly one directional + one
/// ambient term; `directional_count` is 0 or 1 and `ambient_count` is 0 or 1 so a
/// shader can branch on presence.
/// The layout grows to `MAX_FORWARD_LIGHTS` punctual lights behind feature
/// defines in later passes without changing this type's shape — only `data`'s
/// length and the counts.
///
/// `version` bumps whenever `data` or the counts change so a backend can skip
/// re-uploading an unchanged block across frames.
#[derive(Clone, Debug)]
pub struct SceneLightBlock {
    pub ambient_count: u32,
    pub data: Vec<f32>,
    pub directional_count: u32,
    pub version: u32,
}

// The proving-slice light block is a directional term `{ direction.xyz @0, _pad,
// radiance.rgb @4, _pad }` then an ambient term `{ radiance.rgb @8, _pad }` —
// twelve floats, all zeroed when no light is present.
impl Default for SceneLightBlock {
    fn default() -> Self {
        Self {
            ambient_count: 0,
            data: vec![0.0; 12],
            directional_count: 0,
            version: 0,
        }
    }
}

/// The per-draw resolved record `draw_scene` hands one mesh-material renderer for
/// a single mesh subset. `draw_scene` walks the scene, and for each mesh — for
/// each of its subsets paired with its resolved material — fills a
/// `SceneRenderProxy` and calls the registered renderer's `draw`. It is the 3D
/// analog of [`RenderProxy2D`](crate::render::RenderProxy2D): the resolved,
/// render-ready view of a node the backend draws from, with no scene-graph
/// traversal concern left in it.
///
/// `world_matrix` is the node's resolved world transform (model matrix);
/// `normal_matrix` is its inverse-transpose upper-3x3, precomputed by
/// `prepareSceneRender` for transforming normals/tangents (it differs from
/// `world_matrix` under non-uniform scale). `subset` is the index range within
/// the geometry's index buffer this draw covers; the geometry itself is passed to
/// `draw` separately (it carries the lazily-uploaded GPU buffers).
///
/// TS↔Rust divergence: the TS `SceneRenderProxy` also carries the resolved
/// `material: Readonly<Material>`. In Rust, `Material` is a trait object; the
/// draw path threads the bound material separately (`&dyn Material` / by kind),
/// mirroring how the 2D material registry binds a material per run rather than
/// storing it on the proxy. So the proxy here is the pure per-draw transform +
/// subset record.
///
/// The proxy is a reused scratch record owned by `draw_scene`, valid only for the
/// duration of the draw call it is passed to; a renderer must not retain it.
#[derive(Clone, Debug, Default)]
pub struct SceneRenderProxy {
    pub normal_matrix: Matrix3,
    pub subset: MeshSubset,
    pub world_matrix: Matrix4,
}

#[cfg(test)]
mod tests {
    use super::*;

    // SceneLightBlock

    #[test]
    fn scene_light_block_default_is_a_zeroed_twelve_float_block() {
        let block = SceneLightBlock::default();
        assert_eq!(block.data.len(), 12);
        assert!(block.data.iter().all(|&f| f == 0.0));
        assert_eq!(block.ambient_count, 0);
        assert_eq!(block.directional_count, 0);
        assert_eq!(block.version, 0);
    }

    // SceneLights

    #[test]
    fn scene_lights_default_has_no_lights() {
        let lights = SceneLights::default();
        assert!(lights.ambient.is_none());
        assert!(lights.directional.is_none());
    }

    // SceneRenderProxy

    #[test]
    fn scene_render_proxy_default_is_identity_with_an_empty_subset() {
        let proxy = SceneRenderProxy::default();
        assert_eq!(proxy.subset.index_count, 0);
        assert_eq!(proxy.subset.index_offset, 0);
        assert_eq!(proxy.world_matrix.m, Matrix4::default().m);
        assert_eq!(proxy.normal_matrix.m, Matrix3::default().m);
    }
}
