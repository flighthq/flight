use crate::{
    INSTANCED_MESH_KIND, Mesh, MeshMaterials, Node3D, Node3DFields, create_node3d, publish_node3d,
};
use flight_entity::{EntityRuntimeSlot, Kind, Ref, Unknown, allocate_entity};
use flight_geometry::{
    Aabb, Matrix4, copy_matrix4, create_aabb, create_matrix4, set_aabb, transform_aabb_by_matrix4,
    union_aabb,
};
use flight_meshgeometry::contract::{MeshGeometry, ensure_mesh_geometry_bounds};
use flight_node::NodeRef;
use flight_signals::{Signal, create_signal, emit_signal};
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, RwLock};

#[derive(Default)]
pub struct InstancedMesh {
    mesh: Mesh,
    state: InstancedMeshRuntime,
    pub instance_colors: Option<Box<[u32]>>,
    pub instance_count: i32,
    pub instance_matrices: Vec<Ref<Matrix4>>,
    pub version: u32,
}
#[derive(Default)]
pub struct InstancedMeshRuntime {
    pub cull: InstancedMeshCullRuntime,
    pub signals: InstancedMeshSignalsRuntime,
}
#[derive(Default)]
pub struct InstancedMeshCullRuntime {
    pub instance_local_bounds: Option<Aabb>,
    pub instance_local_bounds_version: Option<u32>,
}
#[derive(Default)]
pub struct InstancedMeshSignalsRuntime {
    pub instanced_mesh_signals: Option<Ref<InstancedMeshSignals>>,
}
pub struct InstancedMeshSignals {
    runtime: EntityRuntimeSlot,
    pub on_cleared: Signal<()>,
    pub on_instance_appended: Signal<i32>,
    pub on_instance_removed: Signal<InstancedMeshInstanceRemoved>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InstancedMeshInstanceRemoved {
    pub index: i32,
    pub swap_source: i32,
}
pub type InstancedMeshVisitor = Arc<dyn Fn(i32, &Ref<Matrix4>) + Send + Sync>;

pub fn create_instanced_mesh(
    geometry: Ref<MeshGeometry>,
    materials: MeshMaterials,
    capacity: Option<usize>,
    kind: Option<Kind>,
) -> Ref<InstancedMesh> {
    let cap = capacity.unwrap_or(16);
    let mut node: InstancedMesh = create_node3d(
        Some(kind.unwrap_or_else(|| INSTANCED_MESH_KIND.to_string())),
        None,
    );
    node.geometry = geometry;
    node.materials = materials;
    node.instance_count = 0;
    node.instance_colors = None;
    node.version = 0;
    node.instance_matrices = (0..cap)
        .map(|_| Arc::new(RwLock::new(create_matrix4())))
        .collect();
    return publish_node3d(node);
}
pub fn create_instanced_mesh_signals() -> Ref<InstancedMeshSignals> {
    let mut out: InstancedMeshSignals = allocate_entity();
    initialize_instanced_mesh_signals(&mut out);
    return Arc::new(RwLock::new(out));
}
pub fn initialize_instanced_mesh_signals(out: &mut InstancedMeshSignals) {
    out.on_cleared = create_signal();
    out.on_instance_appended = create_signal();
    out.on_instance_removed = create_signal();
}
pub fn append_instanced_mesh_instance(target: &Ref<InstancedMesh>, matrix: &Matrix4) -> i32 {
    let index = target.read().unwrap().instance_count;
    set_instanced_mesh_instance_count(target, index + 1);
    {
        let mut t = target.write().unwrap();
        copy_matrix4(
            &mut t.instance_matrices[index as usize].write().unwrap(),
            matrix,
        );
        t.version = t.version.wrapping_add(1);
    }
    let signals = target
        .read()
        .unwrap()
        .state
        .signals
        .instanced_mesh_signals
        .clone();
    if let Some(s) = signals {
        let signal = s.read().unwrap().on_instance_appended.clone();
        emit_signal(&signal, &index);
    }
    return index;
}
pub fn clear_instanced_mesh(target: &Ref<InstancedMesh>) {
    let signals = {
        let mut t = target.write().unwrap();
        t.instance_count = 0;
        t.version = t.version.wrapping_add(1);
        t.state.signals.instanced_mesh_signals.clone()
    };
    if let Some(s) = signals {
        let signal = s.read().unwrap().on_cleared.clone();
        emit_signal(&signal, &());
    }
}
pub fn clone_instanced_mesh(source: &InstancedMesh) -> Ref<InstancedMesh> {
    let cloned = create_instanced_mesh(
        source.geometry.clone(),
        Arc::new(RwLock::new(source.materials.read().unwrap().clone())),
        Some(source.instance_matrices.len()),
        Some(source.kind.clone()),
    );
    {
        let mut c = cloned.write().unwrap();
        for i in 0..source.instance_count {
            copy_matrix4(
                &mut c.instance_matrices[i as usize].write().unwrap(),
                &source.instance_matrices[i as usize].read().unwrap(),
            );
        }
        c.instance_count = source.instance_count;
        c.instance_colors = source.instance_colors.clone();
    }
    return cloned;
}
pub fn compute_instanced_mesh_local_bounds_aabb(out: &mut Aabb, source: &InstancedMesh) {
    let bounds = ensure_mesh_geometry_bounds(&mut source.geometry.write().unwrap()).cloned();
    let Some(bounds) = bounds.filter(|_| source.instance_count != 0) else {
        set_aabb(
            out,
            f32::INFINITY,
            f32::INFINITY,
            f32::INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
        );
        return;
    };
    let mut scratch = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    for i in 0..source.instance_count {
        transform_aabb_by_matrix4(
            &mut scratch,
            &bounds,
            &source.instance_matrices[i as usize].read().unwrap(),
        );
        if i == 0 {
            flight_geometry::copy_aabb(out, &scratch);
        } else {
            let old = out.clone();
            union_aabb(out, &old, &scratch);
        }
    }
}
pub fn enable_instanced_mesh_signals(target: &Ref<InstancedMesh>) -> Ref<InstancedMeshSignals> {
    let mut t = target.write().unwrap();
    return t
        .state
        .signals
        .instanced_mesh_signals
        .get_or_insert_with(create_instanced_mesh_signals)
        .clone();
}
pub fn get_instanced_mesh_capacity(source: &InstancedMesh) -> usize {
    return source.instance_matrices.len();
}
// flight-lint: allow(f64) D1 all packed 32-bit RGBA colors and the distinct negative sentinel must remain exact JS numbers
pub fn get_instanced_mesh_instance_color(source: &InstancedMesh, index: i32) -> f64 {
    if index < 0 || index >= source.instance_count {
        return -1.0;
    }
    return source
        .instance_colors
        .as_ref()
        .map(|c| c[index as usize] as f64)
        .unwrap_or(4294967295.0);
}
pub fn get_instanced_mesh_instance_matrix(
    out: &mut Matrix4,
    source: &InstancedMesh,
    index: i32,
) -> bool {
    if index < 0 || index >= source.instance_count {
        return false;
    }
    copy_matrix4(
        out,
        &source.instance_matrices[index as usize].read().unwrap(),
    );
    return true;
}
pub fn get_instanced_mesh_signals(source: &InstancedMesh) -> Option<Ref<InstancedMeshSignals>> {
    return source.state.signals.instanced_mesh_signals.clone();
}
pub fn invalidate_instanced_mesh(target: &Ref<InstancedMesh>) {
    let mut t = target.write().unwrap();
    t.version = t.version.wrapping_add(1);
}
pub fn is_instanced_mesh(source: &Unknown) -> bool {
    let Some(value) = source else {
        return false;
    };
    let Some(node) = value.downcast_ref::<NodeRef>() else {
        return false;
    };
    let n = node.read().unwrap();
    return crate::scene_node::as_node3d(&*n).is_some_and(|n| n.as_instanced_mesh().is_some());
}
pub fn iterate_instanced_mesh_instances(
    source: &Ref<InstancedMesh>,
    visitor: InstancedMeshVisitor,
) {
    let mut i = 0;
    loop {
        let matrix = {
            let s = source.read().unwrap();
            if i >= s.instance_count {
                return;
            }
            s.instance_matrices[i as usize].clone()
        };
        visitor(i, &matrix);
        i += 1;
    }
}
pub fn remove_instanced_mesh_instance(target: &Ref<InstancedMesh>, index: i32) {
    let (signals, event) = {
        let mut t = target.write().unwrap();
        let last = t.instance_count - 1;
        if index < 0 || index > last {
            return;
        }
        let swap_source = if index < last { last } else { -1 };
        if index < last {
            let matrix = t.instance_matrices[last as usize].read().unwrap().clone();
            copy_matrix4(
                &mut t.instance_matrices[index as usize].write().unwrap(),
                &matrix,
            );
            if let Some(c) = &mut t.instance_colors {
                c[index as usize] = c[last as usize];
            }
        }
        t.instance_count = last;
        t.version = t.version.wrapping_add(1);
        (
            t.state.signals.instanced_mesh_signals.clone(),
            InstancedMeshInstanceRemoved { index, swap_source },
        )
    };
    if let Some(s) = signals {
        let signal = s.read().unwrap().on_instance_removed.clone();
        emit_signal(&signal, &event);
    }
}
pub fn reserve_instanced_mesh(target: &Ref<InstancedMesh>, capacity: i32) {
    reserve_instances(&mut target.write().unwrap(), capacity);
}
fn reserve_instances(target: &mut InstancedMesh, capacity: i32) {
    if capacity <= target.instance_matrices.len() as i32 {
        return;
    }
    let new_capacity = (capacity as usize).max(target.instance_matrices.len() * 2);
    while target.instance_matrices.len() < new_capacity {
        target
            .instance_matrices
            .push(Arc::new(RwLock::new(create_matrix4())));
    }
    if let Some(colors) = &target.instance_colors {
        let mut resized = vec![0xffff_ffff; new_capacity].into_boxed_slice();
        resized[..colors.len()].copy_from_slice(colors);
        target.instance_colors = Some(resized);
    }
}
pub fn set_instanced_mesh_instance_color(target: &Ref<InstancedMesh>, index: i32, color: u32) {
    let mut t = target.write().unwrap();
    if index < 0 || index >= t.instance_count {
        return;
    }
    if t.instance_colors.is_none() {
        t.instance_colors = Some(vec![0xffff_ffff; t.instance_matrices.len()].into_boxed_slice());
    }
    t.instance_colors.as_mut().unwrap()[index as usize] = color;
    t.version = t.version.wrapping_add(1);
}
pub fn set_instanced_mesh_instance_count(target: &Ref<InstancedMesh>, count: i32) {
    let mut t = target.write().unwrap();
    reserve_instances(&mut t, count);
    t.instance_count = count;
    t.version = t.version.wrapping_add(1);
}
pub fn set_instanced_mesh_instance_matrix(
    target: &Ref<InstancedMesh>,
    index: i32,
    matrix: &Matrix4,
) {
    let mut t = target.write().unwrap();
    if index < 0 || index >= t.instance_count {
        return;
    }
    copy_matrix4(
        &mut t.instance_matrices[index as usize].write().unwrap(),
        matrix,
    );
    t.version = t.version.wrapping_add(1);
}
pub fn set_instanced_mesh_instance_matrix_range(
    target: &Ref<InstancedMesh>,
    start_index: i32,
    count: i32,
    source: &flight_entity::Float32Array,
) {
    let mut t = target.write().unwrap();
    if start_index < 0
        || count <= 0
        || start_index as i64 + count as i64 > t.instance_count as i64
        || source.len() < count as usize * 16
    {
        return;
    }
    for i in 0..count as usize {
        t.instance_matrices[start_index as usize + i]
            .write()
            .unwrap()
            .m
            .copy_from_slice(&source[i * 16..i * 16 + 16]);
    }
    t.version = t.version.wrapping_add(1);
}

impl Default for InstancedMeshSignals {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            on_cleared: create_signal(),
            on_instance_appended: create_signal(),
            on_instance_removed: create_signal(),
        };
    }
}
// flight-lint: allow(sugar-delegates) D16 structural fields are the actual inherited Mesh and Node3D storage
impl Node3D for InstancedMesh {
    fn as_instanced_mesh(&self) -> Option<&InstancedMesh> {
        return Some(self);
    }
    fn as_mesh(&self) -> Option<&Mesh> {
        return Some(&self.mesh);
    }
    fn as_mesh_mut(&mut self) -> Option<&mut Mesh> {
        return Some(&mut self.mesh);
    }
    fn node3d_fields(&self) -> &Node3DFields {
        return self.mesh.node3d_fields();
    }
    fn node3d_fields_mut(&mut self) -> &mut Node3DFields {
        return self.mesh.node3d_fields_mut();
    }
}
// flight-lint: allow(sugar-delegates) D16 flat inherited Mesh fields
impl Deref for InstancedMesh {
    type Target = Mesh;
    fn deref(&self) -> &Mesh {
        return &self.mesh;
    }
}
// flight-lint: allow(sugar-delegates) D16 flat inherited Mesh fields
impl DerefMut for InstancedMesh {
    fn deref_mut(&mut self) -> &mut Mesh {
        return &mut self.mesh;
    }
}
crate::impl_node3d!(InstancedMesh, custom_node3d);
flight_entity::impl_entity!(InstancedMeshSignals);

// flight-lint: allow(sugar-delegates) D16 kind-owned runtime tier access exposes the actual private composed cull and signals state to consumers
impl InstancedMesh {
    #[doc(hidden)]
    pub fn instanced_mesh_runtime(&self) -> &InstancedMeshRuntime {
        return &self.state;
    }
    #[doc(hidden)]
    pub fn instanced_mesh_runtime_mut(&mut self) -> &mut InstancedMeshRuntime {
        return &mut self.state;
    }
}
