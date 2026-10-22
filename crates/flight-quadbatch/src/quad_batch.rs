//! QuadBatch construction, instance-buffer operations, signals and bounds (TS `quadBatch.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{Float32Array, Ref, allocate_entity};
use flight_geometry::{Rectangle, Vector2, copy_rectangle, create_rectangle};
use flight_materials::contract::{MaterialData, TintMaterialData};
use flight_node::{Node, NodeRef, invalidate_node_local_bounds};
use flight_scene2d::{Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime};
use flight_signals::{create_signal, emit_signal};
use flight_textureatlas::TextureAtlasRotation;

use crate::types::*;

const QUAD_MATRIX3X2_STRIDE: usize = 6;
const QUAD_VECTOR2_STRIDE: usize = 2;

/// The `u16` sentinel that marks a logically deleted instance.
pub const QUAD_BATCH_DELETED_ID: u16 = 0xffff;

/// Allocates an atlas-backed batch node (TS `createQuadBatch`).
// flight-lint: allow(conform-params) D23 B: authored options removed; kind assigns fields after create
pub fn create_quad_batch() -> Ref<QuadBatch> {
    let mut out: QuadBatch =
        create_node2d(QUAD_BATCH_KIND.to_string(), Some(create_quad_batch_runtime));
    initialize_quad_batch(&mut out);
    return flight_scene2d::publish_node2d(out);
}

/// Allocates the batch's instance data (TS `createQuadBatchData`).
// flight-lint: allow(conform-params) D23 B: authored options removed
pub fn create_quad_batch_data() -> QuadBatchData {
    let mut out: QuadBatchData = allocate_entity();
    initialize_quad_batch_data(&mut out);
    return out;
}

/// Allocates the inherited Node2D runtime with the batch's explicit-bounds callback installed (TS
/// `createQuadBatchRuntime`). Batch-specific fields are stored on the node's private runtime handle.
pub fn create_quad_batch_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(copy_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

/// Allocates the opt-in signal group (TS `createQuadBatchSignals`).
pub fn create_quad_batch_signals() -> Ref<QuadBatchSignals> {
    let mut out: QuadBatchSignals = allocate_entity();
    initialize_quad_batch_signals(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Initializes the batch-specific fields of a pre-allocated node (TS `initializeQuadBatch`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_quad_batch
pub fn initialize_quad_batch(out: &mut QuadBatch) {
    initialize_quad_batch_data(&mut out.data);
    out.quad_batch_runtime = Arc::new(RwLock::new(QuadBatchRuntime::default()));
    out.quad_batch_signals = None;
}

/// Initializes instance data with defaults (TS `initializeQuadBatchData`).
// flight-lint: allow(conform-params) D23 B: authored data options removed; initialize mirrors create
pub fn initialize_quad_batch_data(out: &mut QuadBatchData) {
    out.atlas = None;
    out.ids = Vec::new();
    out.instance_count = 0;
    out.material_data = None;
    out.transforms = Vec::new();
    out.transform_type = QuadTransformType::Vector2;
}

/// Initializes a signal group with three fresh signals (TS `initializeQuadBatchSignals`).
pub fn initialize_quad_batch_signals(out: &mut QuadBatchSignals) {
    out.on_cleared = create_signal();
    out.on_instance_appended = create_signal();
    out.on_instance_removed = create_signal();
}

/// Appends one translation-only instance, growing the typed-array lengths when required (TS
/// `appendQuadBatchInstance`). The fixed two-float write is intentional even for a matrix batch,
/// matching the source's documented vector-only append operation.
pub fn append_quad_batch_instance(target: &mut QuadBatch, id: u16, x: f32, y: f32) -> usize {
    let index = target.data.instance_count;
    resize_quad_batch(target, index + 1);
    target.data.ids[index] = id;
    let offset = index * QUAD_VECTOR2_STRIDE;
    target.data.transforms[offset] = x;
    target.data.transforms[offset + 1] = y;
    if let Some(signals) = get_quad_batch_signals(target) {
        emit_signal(&signals.read().unwrap().on_instance_appended, &index);
    }
    return index;
}

/// Clears the logical length without changing allocated buffer lengths (TS `clearQuadBatch`).
pub fn clear_quad_batch(target: &mut QuadBatch) {
    target.data.instance_count = 0;
    if let Some(signals) = get_quad_batch_signals(target) {
        emit_signal(&signals.read().unwrap().on_cleared, &());
    }
}

/// Creates a fresh node with shared atlas/material identities and independent instance buffers (TS
/// `cloneQuadBatch`).
pub fn clone_quad_batch(source: &QuadBatch) -> Ref<QuadBatch> {
    let batch = create_quad_batch();
    {
        let mut guard = batch.write().unwrap();
        guard.data.atlas = source.data.atlas.clone();
        guard.data.ids = source.data.ids.clone();
        guard.data.instance_count = source.data.instance_count;
        guard.data.material_data = source.data.material_data.clone();
        guard.data.transforms = source.data.transforms.clone();
        guard.data.transform_type = source.data.transform_type;
    }
    return batch;
}

/// Stably removes sentinel-id holes from the logical prefix without shrinking buffers (TS
/// `compactQuadBatch`).
pub fn compact_quad_batch(target: &mut QuadBatch) {
    let data = &mut target.data;
    if data.instance_count == 0 {
        return;
    }
    let stride = get_quad_batch_transform_stride(data.transform_type);
    let mut write = 0;
    for read in 0..data.instance_count {
        if data.ids.get(read).copied() == Some(QUAD_BATCH_DELETED_ID) {
            continue;
        }
        if write != read {
            if let Some(id) = data.ids.get(read).copied()
                && let Some(target_id) = data.ids.get_mut(write)
            {
                *target_id = id;
            }
            let destination = write * stride;
            let source = read * stride;
            for component in 0..stride {
                let value = data
                    .transforms
                    .get(source + component)
                    .copied()
                    .unwrap_or(f32::NAN);
                if let Some(target_value) = data.transforms.get_mut(destination + component) {
                    *target_value = value;
                }
            }
            if let Some(material_data) = &mut data.material_data {
                if material_data.len() <= write {
                    material_data.resize(write + 1, None);
                }
                material_data[write] = material_data.get(read).cloned().unwrap_or(None);
            }
        }
        write += 1;
    }
    data.instance_count = write;
}

/// Computes the union of valid instance quads without storing or invalidating it (TS
/// `computeQuadBatchLocalBoundsRectangle`).
pub fn compute_quad_batch_local_bounds_rectangle(out: &mut Rectangle, source: &QuadBatch) {
    let data = &source.data;
    let Some(atlas) = &data.atlas else {
        set_zero_rectangle(out);
        return;
    };
    if data.instance_count == 0 {
        set_zero_rectangle(out);
        return;
    }
    let atlas = atlas.read().unwrap();
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    match data.transform_type {
        QuadTransformType::Vector2 => {
            for index in 0..data.instance_count {
                let Some(region) = get_quad_region(&atlas.regions, &data.ids, index) else {
                    continue;
                };
                let region = region.read().unwrap();
                if region.width <= 0.0 || region.height <= 0.0 {
                    continue;
                }
                let offset = index * QUAD_VECTOR2_STRIDE;
                let Some((&x, &y)) = data
                    .transforms
                    .get(offset)
                    .zip(data.transforms.get(offset + 1))
                else {
                    continue;
                };
                let (width, height) =
                    logical_region_size(region.width, region.height, region.rotation);
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x + width);
                max_y = max_y.max(y + height);
            }
        }
        QuadTransformType::Matrix3x2 => {
            for index in 0..data.instance_count {
                let Some(region) = get_quad_region(&atlas.regions, &data.ids, index) else {
                    continue;
                };
                let region = region.read().unwrap();
                if region.width <= 0.0 || region.height <= 0.0 {
                    continue;
                }
                let offset = index * QUAD_MATRIX3X2_STRIDE;
                let Some(matrix) = data.transforms.get(offset..offset + QUAD_MATRIX3X2_STRIDE)
                else {
                    continue;
                };
                let (width, height) =
                    logical_region_size(region.width, region.height, region.rotation);
                let (quad_min_x, quad_min_y, quad_max_x, quad_max_y) =
                    transformed_quad_bounds(matrix, width, height);
                min_x = min_x.min(quad_min_x);
                min_y = min_y.min(quad_min_y);
                max_x = max_x.max(quad_max_x);
                max_y = max_y.max(quad_max_y);
            }
        }
    }
    if min_x == f32::INFINITY {
        set_zero_rectangle(out);
        return;
    }
    out.x = min_x;
    out.y = min_y;
    out.width = max_x - min_x;
    out.height = max_y - min_y;
}

fn copy_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let Some(source) = source.as_any().downcast_ref::<QuadBatch>() else {
        return;
    };
    let runtime = source.quad_batch_runtime.read().unwrap();
    if let Some(rectangle) = &runtime.local_bounds_rectangle {
        copy_rectangle(out, rectangle);
    }
}

fn cross_sign(ax: f32, ay: f32, bx: f32, by: f32, px: f32, py: f32) -> bool {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax) >= 0.0;
}

/// Creates and attaches the signal registry on first access (TS `enableQuadBatchSignals`).
pub fn enable_quad_batch_signals(target: &mut QuadBatch) -> Ref<QuadBatchSignals> {
    if let Some(signals) = &target.quad_batch_signals {
        return signals.clone();
    }
    let signals = create_quad_batch_signals();
    target.quad_batch_signals = Some(signals.clone());
    return signals;
}

/// Returns the common usable capacity of the id and transform buffers (TS
/// `getQuadBatchCapacity`).
pub fn get_quad_batch_capacity(source: &QuadBatch) -> usize {
    let stride = get_quad_batch_transform_stride(source.data.transform_type);
    return source
        .data
        .ids
        .len()
        .min(source.data.transforms.len() / stride);
}

/// Returns an instance id, or `-1` outside the logical prefix (TS `getQuadBatchInstanceId`).
pub fn get_quad_batch_instance_id(source: &QuadBatch, index: i32) -> i32 {
    if index < 0 || index as usize >= source.data.instance_count {
        return -1;
    }
    return source
        .data
        .ids
        .get(index as usize)
        .map(|id| *id as i32)
        .unwrap_or(-1);
}

/// Writes the translation of an instance to `out` (TS `getQuadBatchInstanceTransform`).
pub fn get_quad_batch_instance_transform(
    out: &mut Vector2,
    source: &QuadBatch,
    index: i32,
) -> bool {
    if index < 0 || index as usize >= source.data.instance_count {
        return false;
    }
    let index = index as usize;
    let offset = match source.data.transform_type {
        QuadTransformType::Vector2 => index * QUAD_VECTOR2_STRIDE,
        QuadTransformType::Matrix3x2 => index * QUAD_MATRIX3X2_STRIDE + 4,
    };
    let Some((&x, &y)) = source
        .data
        .transforms
        .get(offset)
        .zip(source.data.transforms.get(offset + 1))
    else {
        return false;
    };
    out.x = x;
    out.y = y;
    return true;
}

/// Returns the batch-specific runtime fields (TS `getQuadBatchRuntime`; the inherited tier is
/// `flight_scene2d::get_node2d_runtime`).
pub fn get_quad_batch_runtime(source: &QuadBatch) -> Ref<QuadBatchRuntime> {
    return source.quad_batch_runtime.clone();
}

/// Returns the attached signal group without allocating it (TS `getQuadBatchSignals`).
pub fn get_quad_batch_signals(source: &QuadBatch) -> Option<Ref<QuadBatchSignals>> {
    return source.quad_batch_signals.clone();
}

/// Returns the float stride of a transform layout (TS `getQuadBatchTransformStride`).
pub fn get_quad_batch_transform_stride(transform_type: QuadTransformType) -> usize {
    return match transform_type {
        QuadTransformType::Vector2 => QUAD_VECTOR2_STRIDE,
        QuadTransformType::Matrix3x2 => QUAD_MATRIX3X2_STRIDE,
    };
}

fn get_quad_region<'a>(
    regions: &'a [Ref<flight_textureatlas::TextureAtlasRegion>],
    ids: &[u16],
    index: usize,
) -> Option<&'a Ref<flight_textureatlas::TextureAtlasRegion>> {
    let id = *ids.get(index)? as usize;
    return regions.get(id);
}

/// AABB hit test at a point (TS `hitTestQuadBatchPoint`).
pub fn hit_test_quad_batch_point(source: &QuadBatch, point: &Vector2) -> i32 {
    return hit_test_quad_batch_point_xy(source, point.x, point.y);
}

/// Exact polygon hit test at a point (TS `hitTestQuadBatchPointExact`).
pub fn hit_test_quad_batch_point_exact(source: &QuadBatch, point: &Vector2) -> i32 {
    return hit_test_quad_batch_point_exact_xy(source, point.x, point.y);
}

/// Exact polygon hit test at coordinates (TS `hitTestQuadBatchPointExactXY`).
pub fn hit_test_quad_batch_point_exact_xy(source: &QuadBatch, x: f32, y: f32) -> i32 {
    let data = &source.data;
    let Some(atlas) = &data.atlas else {
        return -1;
    };
    if data.instance_count == 0 {
        return -1;
    }
    let atlas = atlas.read().unwrap();
    match data.transform_type {
        QuadTransformType::Vector2 => {
            for index in 0..data.instance_count {
                let Some(region) = get_quad_region(&atlas.regions, &data.ids, index) else {
                    continue;
                };
                let region = region.read().unwrap();
                let offset = index * QUAD_VECTOR2_STRIDE;
                let Some((&dx, &dy)) = data
                    .transforms
                    .get(offset)
                    .zip(data.transforms.get(offset + 1))
                else {
                    continue;
                };
                let (width, height) =
                    logical_region_size(region.width, region.height, region.rotation);
                if x >= dx && x < dx + width && y >= dy && y < dy + height {
                    return index as i32;
                }
            }
        }
        QuadTransformType::Matrix3x2 => {
            for index in 0..data.instance_count {
                let Some(region) = get_quad_region(&atlas.regions, &data.ids, index) else {
                    continue;
                };
                let region = region.read().unwrap();
                if region.width <= 0.0 || region.height <= 0.0 {
                    continue;
                }
                let offset = index * QUAD_MATRIX3X2_STRIDE;
                let Some(matrix) = data.transforms.get(offset..offset + QUAD_MATRIX3X2_STRIDE)
                else {
                    continue;
                };
                let (width, height) =
                    logical_region_size(region.width, region.height, region.rotation);
                let [x0, y0, x1, y1, x2, y2, x3, y3] =
                    transformed_quad_corners(matrix, width, height);
                if cross_sign(x0, y0, x1, y1, x, y)
                    && cross_sign(x1, y1, x2, y2, x, y)
                    && cross_sign(x2, y2, x3, y3, x, y)
                    && cross_sign(x3, y3, x0, y0, x, y)
                {
                    return index as i32;
                }
            }
        }
    }
    return -1;
}

/// AABB hit test at coordinates (TS `hitTestQuadBatchPointXY`).
pub fn hit_test_quad_batch_point_xy(source: &QuadBatch, x: f32, y: f32) -> i32 {
    let data = &source.data;
    let Some(atlas) = &data.atlas else {
        return -1;
    };
    if data.instance_count == 0 {
        return -1;
    }
    let atlas = atlas.read().unwrap();
    match data.transform_type {
        QuadTransformType::Vector2 => {
            for index in 0..data.instance_count {
                let Some(region) = get_quad_region(&atlas.regions, &data.ids, index) else {
                    continue;
                };
                let region = region.read().unwrap();
                let offset = index * QUAD_VECTOR2_STRIDE;
                let Some((&dx, &dy)) = data
                    .transforms
                    .get(offset)
                    .zip(data.transforms.get(offset + 1))
                else {
                    continue;
                };
                let (width, height) =
                    logical_region_size(region.width, region.height, region.rotation);
                if x >= dx && x < dx + width && y >= dy && y < dy + height {
                    return index as i32;
                }
            }
        }
        QuadTransformType::Matrix3x2 => {
            for index in 0..data.instance_count {
                let Some(region) = get_quad_region(&atlas.regions, &data.ids, index) else {
                    continue;
                };
                let region = region.read().unwrap();
                if region.width <= 0.0 || region.height <= 0.0 {
                    continue;
                }
                let offset = index * QUAD_MATRIX3X2_STRIDE;
                let Some(matrix) = data.transforms.get(offset..offset + QUAD_MATRIX3X2_STRIDE)
                else {
                    continue;
                };
                let (width, height) =
                    logical_region_size(region.width, region.height, region.rotation);
                let (min_x, min_y, max_x, max_y) = transformed_quad_bounds(matrix, width, height);
                if x >= min_x && x < max_x && y >= min_y && y < max_y {
                    return index as i32;
                }
            }
        }
    }
    return -1;
}

/// Visits the logical prefix in order with a borrowed stride-length transform view (TS
/// `iterateQuadBatchInstances`).
pub fn iterate_quad_batch_instances(
    source: &QuadBatch,
    visitor: &mut dyn FnMut(usize, u16, &[f32]),
) {
    let data = &source.data;
    let stride = get_quad_batch_transform_stride(data.transform_type);
    for index in 0..data.instance_count {
        let Some(id) = data.ids.get(index).copied() else {
            continue;
        };
        let offset = index * stride;
        let Some(transform) = data.transforms.get(offset..offset + stride) else {
            continue;
        };
        visitor(index, id, transform);
    }
}

fn logical_region_size(width: f32, height: f32, rotation: TextureAtlasRotation) -> (f32, f32) {
    if rotation == TextureAtlasRotation::None {
        return (width, height);
    }
    return (height, width);
}

/// Swap-removes one logical instance and emits its former last index, or `-1` when no swap was
/// needed (TS `removeQuadBatchInstance`).
pub fn remove_quad_batch_instance(target: &mut QuadBatch, index: i32) {
    if index < 0 {
        return;
    }
    let index = index as usize;
    let data = &mut target.data;
    let Some(last) = data.instance_count.checked_sub(1) else {
        return;
    };
    if index > last {
        return;
    }
    let swap_source = if index < last { last as i32 } else { -1 };
    if index < last {
        if let Some(id) = data.ids.get(last).copied()
            && let Some(target_id) = data.ids.get_mut(index)
        {
            *target_id = id;
        }
        let stride = get_quad_batch_transform_stride(data.transform_type);
        let destination = index * stride;
        let source = last * stride;
        for component in 0..stride {
            let value = data
                .transforms
                .get(source + component)
                .copied()
                .unwrap_or(f32::NAN);
            if let Some(target_value) = data.transforms.get_mut(destination + component) {
                *target_value = value;
            }
        }
        if let Some(material_data) = &mut data.material_data {
            if material_data.len() <= index {
                material_data.resize(index + 1, None);
            }
            material_data[index] = material_data.get(last).cloned().unwrap_or(None);
        }
    }
    data.instance_count = last;
    if let Some(signals) = get_quad_batch_signals(target) {
        emit_signal(
            &signals.read().unwrap().on_instance_removed,
            &(index, swap_source),
        );
    }
}

/// Ensures both typed-array lengths support at least `capacity` instances (TS `reserveQuadBatch`).
pub fn reserve_quad_batch(target: &mut QuadBatch, capacity: usize) {
    if get_quad_batch_capacity(target) >= capacity {
        return;
    }
    if target.data.ids.len() < capacity {
        target.data.ids.resize(capacity, 0);
    }
    let transform_length = capacity * get_quad_batch_transform_stride(target.data.transform_type);
    if target.data.transforms.len() < transform_length {
        target.data.transforms.resize(transform_length, 0.0);
    }
}

/// Changes the logical instance count, doubling common capacity when growth requires allocation
/// (TS `resizeQuadBatch`).
pub fn resize_quad_batch(target: &mut QuadBatch, instance_count: usize) {
    let old_instance_count = target.data.instance_count;
    target.data.instance_count = instance_count;
    if old_instance_count >= instance_count {
        return;
    }
    let capacity = get_quad_batch_capacity(target);
    if capacity < instance_count {
        reserve_quad_batch(target, instance_count.max(capacity * 2));
    }
}

/// Writes one translation-only instance inside the logical prefix (TS `setQuadBatchInstance`).
pub fn set_quad_batch_instance(target: &mut QuadBatch, index: i32, id: u16, x: f32, y: f32) {
    if index < 0 || index as usize >= target.data.instance_count {
        return;
    }
    let index = index as usize;
    let Some(target_id) = target.data.ids.get_mut(index) else {
        return;
    };
    *target_id = id;
    let offset = index * QUAD_VECTOR2_STRIDE;
    if let Some(target_x) = target.data.transforms.get_mut(offset) {
        *target_x = x;
    }
    if let Some(target_y) = target.data.transforms.get_mut(offset + 1) {
        *target_y = y;
    }
}

/// Writes one full affine instance inside the logical prefix (TS
/// `setQuadBatchInstanceMatrix`).
pub fn set_quad_batch_instance_matrix(
    target: &mut QuadBatch,
    index: i32,
    id: u16,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
) {
    if index < 0 || index as usize >= target.data.instance_count {
        return;
    }
    let index = index as usize;
    let Some(target_id) = target.data.ids.get_mut(index) else {
        return;
    };
    *target_id = id;
    let offset = index * QUAD_MATRIX3X2_STRIDE;
    let Some(matrix) = target
        .data
        .transforms
        .get_mut(offset..offset + QUAD_MATRIX3X2_STRIDE)
    else {
        return;
    };
    matrix.copy_from_slice(&[a, b, c, d, tx, ty]);
}

/// Copies a contiguous transform range into the logical prefix (TS
/// `setQuadBatchInstanceRange`).
pub fn set_quad_batch_instance_range(
    target: &mut QuadBatch,
    start_index: i32,
    count: i32,
    source: &Float32Array,
) {
    if start_index < 0 || count <= 0 {
        return;
    }
    let start_index = start_index as usize;
    let count = count as usize;
    let Some(end_index) = start_index.checked_add(count) else {
        return;
    };
    if end_index > target.data.instance_count {
        return;
    }
    let stride = get_quad_batch_transform_stride(target.data.transform_type);
    let destination = start_index * stride;
    let length = count * stride;
    for component in 0..length {
        let value = source.get(component).copied().unwrap_or(f32::NAN);
        if let Some(target_value) = target.data.transforms.get_mut(destination + component) {
            *target_value = value;
        }
    }
}

/// Lazily allocates per-instance material data and stores a packed tint (TS
/// `setQuadBatchInstanceTint`).
pub fn set_quad_batch_instance_tint(target: &mut QuadBatch, index: i32, rgba: u32) {
    if index < 0 || index as usize >= target.data.instance_count {
        return;
    }
    let index = index as usize;
    let material_data = target
        .data
        .material_data
        .get_or_insert_with(|| vec![None; target.data.instance_count]);
    if material_data.len() <= index {
        material_data.resize(index + 1, None);
    }
    let mut tint: TintMaterialData = allocate_entity();
    tint.tint = rgba;
    let tint: Ref<dyn MaterialData> = Arc::new(RwLock::new(tint));
    material_data[index] = Some(tint);
}

/// Copies explicit local bounds into the batch runtime and invalidates the Node bounds cache (TS
/// `setQuadBatchLocalBoundsRectangle`).
pub fn set_quad_batch_local_bounds_rectangle(target: &Ref<QuadBatch>, rect: &Rectangle) {
    let runtime = {
        let target = target.read().unwrap();
        get_quad_batch_runtime(&target)
    };
    {
        let mut runtime = runtime.write().unwrap();
        let local = runtime
            .local_bounds_rectangle
            .get_or_insert_with(|| create_rectangle(0.0, 0.0, 0.0, 0.0));
        copy_rectangle(local, rect);
    }
    let node: NodeRef = target.clone();
    invalidate_node_local_bounds(&node);
}

/// Re-strides the transform buffer while preserving its typed-array allocation semantics (TS
/// `setQuadBatchTransformType`).
pub fn set_quad_batch_transform_type(target: &mut QuadBatch, new_type: QuadTransformType) {
    let data = &mut target.data;
    if data.transform_type == new_type {
        return;
    }
    let count = data.instance_count;
    match new_type {
        QuadTransformType::Matrix3x2 => {
            let capacity = (data.transforms.len() / QUAD_VECTOR2_STRIDE).max(count);
            let mut transforms = vec![0.0; capacity * QUAD_MATRIX3X2_STRIDE];
            for index in (0..count).rev() {
                let source = index * QUAD_VECTOR2_STRIDE;
                let destination = index * QUAD_MATRIX3X2_STRIDE;
                let x = data.transforms.get(source).copied().unwrap_or(f32::NAN);
                let y = data.transforms.get(source + 1).copied().unwrap_or(f32::NAN);
                transforms[destination..destination + QUAD_MATRIX3X2_STRIDE]
                    .copy_from_slice(&[1.0, 0.0, 0.0, 1.0, x, y]);
            }
            data.transforms = transforms;
        }
        QuadTransformType::Vector2 => {
            for index in 0..count {
                let source = index * QUAD_MATRIX3X2_STRIDE;
                let destination = index * QUAD_VECTOR2_STRIDE;
                let x = data.transforms.get(source + 4).copied().unwrap_or(f32::NAN);
                let y = data.transforms.get(source + 5).copied().unwrap_or(f32::NAN);
                if let Some(target_x) = data.transforms.get_mut(destination) {
                    *target_x = x;
                }
                if let Some(target_y) = data.transforms.get_mut(destination + 1) {
                    *target_y = y;
                }
            }
        }
    }
    data.transform_type = new_type;
}

fn set_zero_rectangle(out: &mut Rectangle) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
}

fn transformed_quad_bounds(matrix: &[f32], width: f32, height: f32) -> (f32, f32, f32, f32) {
    let [x0, y0, x1, y1, x2, y2, x3, y3] = transformed_quad_corners(matrix, width, height);
    return (
        x0.min(x1).min(x2).min(x3),
        y0.min(y1).min(y2).min(y3),
        x0.max(x1).max(x2).max(x3),
        y0.max(y1).max(y2).max(y3),
    );
}

fn transformed_quad_corners(matrix: &[f32], width: f32, height: f32) -> [f32; 8] {
    let a = matrix[0];
    let b = matrix[1];
    let c = matrix[2];
    let d = matrix[3];
    let tx = matrix[4];
    let ty = matrix[5];
    return [
        tx,
        ty,
        a * width + tx,
        b * width + ty,
        a * width + c * height + tx,
        b * width + d * height + ty,
        c * height + tx,
        d * height + ty,
    ];
}
