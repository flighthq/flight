//! Local stand-ins for the 3D scene-render header contract.
//!
//! The TS package depends on `SceneLights`, `SceneLightBlock`, `SceneRenderProxy`,
//! and the `prepareSceneRender` / `SceneRenderList` pipeline from
//! `@flighthq/types` and `@flighthq/render`. None of these are ported to the Rust
//! `flighthq-types` / `flighthq-render` crates yet, so scene-gl cannot reach a
//! real scene-render contract. The hard parallel-safety rule forbids adding the
//! missing headers here (they belong in `flighthq-types`).
//!
//! // TODO(align): delete this module and import these from `flighthq-types` /
//! `flighthq-render` once the 3D scene-render contract is ported. These local
//! mirrors carry the exact field layout the TS types use so the swap is
//! mechanical.

pub use flighthq_types::camera::Camera;

/// The packed per-frame light block, std140-laid-out to mirror
/// `SceneLightBlock.data`: a directional term `{ direction.xyz @0, _pad, radiance.rgb
/// @4, _pad }` then an ambient term `{ radiance.rgb @8, _pad }`. Radiance is
/// already linear and premultiplied by intensity at pack time.
#[derive(Clone, Debug)]
pub struct SceneLightBlock {
    pub ambient_count: u32,
    pub data: Vec<f32>,
    pub directional_count: u32,
    pub version: u32,
}

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

/// A contiguous draw range within a geometry's index buffer, addressing one
/// material binding. Mirrors `flighthq_types::MeshSubset`; kept local only so the
/// proxy can reference it without pulling the full mesh contract through the stub.
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
pub struct SceneRenderSubset {
    pub index_count: u32,
    pub index_offset: u32,
}

/// The reused per-draw proxy a renderer's `draw` reads. Owned by `draw_gl_scene`,
/// valid only for the duration of the draw call it is passed to. Mirrors the TS
/// `SceneRenderProxy` (minus the `material`, which the Rust draw path threads as a
/// separate `&dyn MeshMaterial`).
#[derive(Clone, Debug, Default)]
pub struct SceneRenderProxy {
    pub normal_matrix: [f32; 9],
    pub subset: SceneRenderSubset,
    pub world_matrix: [f32; 16],
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_light_block_default_is_a_zeroed_twelve_float_block() {
        let block = SceneLightBlock::default();
        assert_eq!(block.data.len(), 12);
        assert_eq!(block.ambient_count, 0);
        assert_eq!(block.directional_count, 0);
    }
}
