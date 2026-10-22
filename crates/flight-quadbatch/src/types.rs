//! QuadBatch declarations (TS `QuadBatch.ts`, `QuadBatchSignals.ts`, `QuadTransformType.ts`).

// flight-lint: allow-file(contract-vocabulary) D16 canonical MaterialData is an open entity family retained through Ref<dyn MaterialData>

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::Rectangle;
use flight_materials::contract::MaterialData;
use flight_scene2d::Node2DFields;
use flight_signals::Signal;
use flight_textureatlas::TextureAtlas;

/// The node kind of an atlas-backed quad batch (TS `QuadBatchKind`).
pub const QUAD_BATCH_KIND: &str = "QuadBatch";

/// The per-instance transform layout (TS `QuadTransformType`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum QuadTransformType {
    Matrix3x2,
    #[default]
    Vector2,
}

/// An atlas-backed multi-quad 2D node (TS `QuadBatch`). The one entity runtime and uid live in
/// the composed `Node2DFields`; the kind runtime below is private mutable state, not another entity.
pub struct QuadBatch {
    pub(crate) node: Node2DFields,
    pub data: QuadBatchData,
    pub(crate) quad_batch_runtime: Ref<QuadBatchRuntime>,
    pub(crate) quad_batch_signals: Option<Ref<QuadBatchSignals>>,
}

/// Instance buffers and shared resources of a batch (TS `QuadBatchData`). Vector lengths preserve
/// typed-array allocation lengths, while `instance_count` is the independent logical length.
pub struct QuadBatchData {
    runtime: EntityRuntimeSlot,
    pub atlas: Option<Ref<TextureAtlas>>,
    pub ids: Vec<u16>,
    pub instance_count: usize,
    pub material_data: Option<Vec<Option<Ref<dyn MaterialData>>>>,
    pub transforms: Vec<f32>,
    pub transform_type: QuadTransformType,
}

/// Batch-specific mutable runtime fields (TS `QuadBatchRuntime` past the inherited Node2D tier).
#[derive(Clone, Debug, Default)]
pub struct QuadBatchRuntime {
    pub instance_velocities: Option<Vec<f32>>,
    pub local_bounds_rectangle: Option<Rectangle>,
}

/// The opt-in batch signal registry (TS `QuadBatchSignals`).
pub struct QuadBatchSignals {
    runtime: EntityRuntimeSlot,
    pub on_cleared: Signal<()>,
    pub on_instance_appended: Signal<usize>,
    pub on_instance_removed: Signal<(usize, i32)>,
}

impl Default for QuadBatch {
    fn default() -> Self {
        return Self {
            node: Node2DFields::default(),
            data: QuadBatchData::default(),
            quad_batch_runtime: Ref::default(),
            quad_batch_signals: None,
        };
    }
}

impl Default for QuadBatchData {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            atlas: None,
            ids: Vec::new(),
            instance_count: 0,
            material_data: None,
            transforms: Vec::new(),
            transform_type: QuadTransformType::Vector2,
        };
    }
}

impl Default for QuadBatchSignals {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            on_cleared: Signal::default(),
            on_instance_appended: Signal::default(),
            on_instance_removed: Signal::default(),
        };
    }
}

flight_scene2d::impl_node2d!(QuadBatch);
flight_entity::impl_entity!(QuadBatchData);
flight_entity::impl_entity!(QuadBatchSignals);
