use std::any::Any;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_entity::{EntityRuntimeSlot, Ref};

pub(crate) struct DerivedCache(Mutex<Option<Box<dyn Any + Send>>>);

impl DerivedCache {
    pub(crate) fn new() -> Self {
        return DerivedCache(Mutex::new(None));
    }

    pub(crate) fn get<T: 'static + Send + Clone>(&self) -> Option<T> {
        return self
            .0
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|b| b.downcast_ref::<T>())
            .cloned();
    }

    pub(crate) fn set<T: 'static + Send>(&self, value: T) {
        *self.0.lock().unwrap() = Some(Box::new(value));
    }

    pub(crate) fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}

impl Clone for DerivedCache {
    fn clone(&self) -> Self {
        return DerivedCache::new();
    }
}

impl std::fmt::Debug for DerivedCache {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return f.write_str("DerivedCache(..)");
    }
}

impl PartialEq for DerivedCache {
    fn eq(&self, _other: &Self) -> bool {
        return true;
    }
}

// Shape kind enums

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollisionShapeKind2D {
    Circle,
    Capsule,
    Aabb,
    Obb,
    Polygon,
    Segment,
    Point,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollisionShapeKind3D {
    Sphere,
    Aabb,
    Box,
    Capsule,
    Cylinder,
    Cone,
    Convex,
    TriangleMesh,
    Heightfield,
}

/// A registered 2D narrow-phase specialization.
pub type CollisionPairTest2D = Arc<
    dyn Fn(&CollisionShape2D, &CollisionShape2D, &mut CollisionManifold2D) -> bool + Send + Sync,
>;

/// A registered 3D narrow-phase specialization.
pub type CollisionPairTest3D = Arc<
    dyn Fn(&CollisionShape3D, &CollisionShape3D, &mut CollisionManifold3D) -> bool + Send + Sync,
>;

/// A registered 2D support mapping.
pub type CollisionSupport2D = Arc<dyn Fn(&CollisionShape2D, f32, f32, &mut [f32; 2]) + Send + Sync>;

/// A registered 3D support mapping.
pub type CollisionSupport3D =
    Arc<dyn Fn(&CollisionShape3D, f32, f32, f32, &mut [f32; 3]) + Send + Sync>;

/// A registered query for the supporting face of a 3D shape.
pub type CollisionFaceQuery3D =
    Arc<dyn Fn(&CollisionShape3D, f32, f32, f32, &mut Vec<f32>) -> usize + Send + Sync>;

/// An optional diagnostic invoked before generic 2D collision dispatch (D9 stored form).
pub type CollisionTestGuard2D = Arc<dyn Fn(&CollisionShape2D, &CollisionShape2D) + Send + Sync>;

/// An optional diagnostic invoked before generic 3D collision dispatch (D9 stored form).
pub type CollisionTestGuard3D = Arc<dyn Fn(&CollisionShape3D, &CollisionShape3D) + Send + Sync>;

/// Caller-owned 2D collision dispatch state. The maps are lookup-only; pair keys use a NUL
/// separator so prefix-related vendor kinds remain distinct.
#[derive(Clone, Default)]
pub struct CollisionRegistry2D {
    pub pair_tests: HashMap<String, CollisionPairTest2D>,
    pub supports: HashMap<String, CollisionSupport2D>,
    pub test_guard: Option<CollisionTestGuard2D>,
}

/// Caller-owned 3D collision dispatch state.
#[derive(Clone, Default)]
pub struct CollisionRegistry3D {
    pub pair_tests: HashMap<String, CollisionPairTest3D>,
    pub supports: HashMap<String, CollisionSupport3D>,
    pub face_queries: HashMap<String, CollisionFaceQuery3D>,
    pub test_guard: Option<CollisionTestGuard3D>,
}

// 2D shape structs

// flight-lint: allow(f64) measured 1e9 raycast: f32 aliases a center and origin two units apart and changes hit to miss
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionCircle2D {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionAabb2D {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionObb2D {
    pub x: f32,
    pub y: f32,
    pub half_w: f32,
    pub half_h: f32,
    pub rotation: f32,
}

// flight-lint: allow(f64) measured 1e15 SAT: f32 collapses a translated 10-unit square while f64 retains its 2-unit overlap
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionPolygon2D {
    pub points: Vec<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionCapsule2D {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub radius: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionSegment2D {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionPoint2D {
    pub x: f32,
    pub y: f32,
}

// 2D shape enum for polymorphic dispatch

#[derive(Debug, Clone, PartialEq)]
pub enum CollisionShape2D {
    Circle(CollisionCircle2D),
    Capsule(CollisionCapsule2D),
    Aabb(CollisionAabb2D),
    Obb(CollisionObb2D),
    Polygon(CollisionPolygon2D),
    Segment(CollisionSegment2D),
    Point(CollisionPoint2D),
}

// 3D shape structs

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionSphere3D {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub radius: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionAabb3D {
    pub min_x: f32,
    pub min_y: f32,
    pub min_z: f32,
    pub max_x: f32,
    pub max_y: f32,
    pub max_z: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionBox3D {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub half_x: f32,
    pub half_y: f32,
    pub half_z: f32,
    pub rotation_x: f32,
    pub rotation_y: f32,
    pub rotation_z: f32,
    pub rotation_w: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionCapsule3D {
    pub x0: f32,
    pub y0: f32,
    pub z0: f32,
    pub x1: f32,
    pub y1: f32,
    pub z1: f32,
    pub radius: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionCylinder3D {
    pub x0: f32,
    pub y0: f32,
    pub z0: f32,
    pub x1: f32,
    pub y1: f32,
    pub z1: f32,
    pub radius: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CollisionCone3D {
    pub x0: f32,
    pub y0: f32,
    pub z0: f32,
    pub x1: f32,
    pub y1: f32,
    pub z1: f32,
    pub radius: f32,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionConvex3D {
    pub points: Vec<f32>,
}

// 3D shape enum for polymorphic dispatch

#[derive(Debug, Clone, PartialEq)]
pub enum CollisionShape3D {
    Sphere(CollisionSphere3D),
    Aabb(CollisionAabb3D),
    Box(CollisionBox3D),
    Capsule(CollisionCapsule3D),
    Cylinder(CollisionCylinder3D),
    Cone(CollisionCone3D),
    Convex(CollisionConvex3D),
}

/// Every built-in descriptor a physics collider may own (TS `CollisionColliderShape3D`,
/// `Collision.ts:483-485`): a built-in convex shape or one of the two static concave descriptors.
/// The static shapes are entities whose private version/BVH caches must stay shared, so the
/// aggregate carries their canonical `Ref` handles and the source's identity and mutation
/// visibility rather than cloning buffers. The union itself is plain data: it is a mixed source
/// union and owns no entity runtime or uid.
#[derive(Clone)]
pub enum CollisionColliderShape3D {
    /// TS `CollisionBuiltInShape3D`: the existing convex support-family enum, by value.
    BuiltIn(CollisionShape3D),
    /// TS `CollisionTriangleMesh3D`, as the actual shared entity handle.
    TriangleMesh(Ref<CollisionTriangleMesh3D>),
    /// TS `CollisionHeightfield3D`, as the actual shared entity handle.
    Heightfield(Ref<CollisionHeightfield3D>),
}

// Manifold types

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionManifold2D {
    pub overlapping: bool,
    pub normal_x: f32,
    pub normal_y: f32,
    pub depth: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionManifold3D {
    pub overlapping: bool,
    pub normal_x: f32,
    pub normal_y: f32,
    pub normal_z: f32,
    pub depth: f32,
    runtime: EntityRuntimeSlot,
}

// Contact manifold types

pub const MAX_COLLISION_CONTACT_POINTS_2D: usize = 2;
pub const MAX_COLLISION_CONTACT_POINTS_3D: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
// flight-lint: allow(contract-vocabulary) D1 range declaration: 25-bit feature/triangle indices and versions stay below 2^53, exact in TS numbers
pub struct CollisionContactPoint2D {
    pub x: f32,
    pub y: f32,
    pub depth: f32,
    pub feature_id: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
// flight-lint: allow(contract-vocabulary) D1 range declaration: 25-bit feature/triangle indices and versions stay below 2^53, exact in TS numbers
pub struct CollisionContactPoint3D {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub depth: f32,
    pub feature_id: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CollisionContactManifold2D {
    pub overlapping: bool,
    pub normal_x: f32,
    pub normal_y: f32,
    pub depth: f32,
    pub point_count: usize,
    pub points: [CollisionContactPoint2D; MAX_COLLISION_CONTACT_POINTS_2D],
    runtime: EntityRuntimeSlot,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CollisionContactManifold3D {
    pub overlapping: bool,
    pub normal_x: f32,
    pub normal_y: f32,
    pub normal_z: f32,
    pub point_count: usize,
    pub points: [CollisionContactPoint3D; MAX_COLLISION_CONTACT_POINTS_3D],
    runtime: EntityRuntimeSlot,
}

// Raycast hit types

// flight-lint: allow(f64) measured 1e9 raycast hit position is lost by f32 and the rounded query changes hit to miss
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionRaycastHit2D {
    pub fraction: f64,
    pub x: f64,
    pub y: f64,
    pub normal_x: f64,
    pub normal_y: f64,
    runtime: EntityRuntimeSlot,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionRaycastHit3D {
    pub fraction: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub normal_x: f32,
    pub normal_y: f32,
    pub normal_z: f32,
    runtime: EntityRuntimeSlot,
}

// Time of impact types

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionTimeOfImpact2D {
    pub fraction: f32,
    pub x: f32,
    pub y: f32,
    pub normal_x: f32,
    pub normal_y: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionTimeOfImpact3D {
    pub fraction: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub normal_x: f32,
    pub normal_y: f32,
    pub normal_z: f32,
    runtime: EntityRuntimeSlot,
}

// GJK distance type

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CollisionDistance3D {
    pub distance: f32,
    pub direction_x: f32,
    pub direction_y: f32,
    pub direction_z: f32,
    pub point_a_x: f32,
    pub point_a_y: f32,
    pub point_a_z: f32,
    pub point_b_x: f32,
    pub point_b_y: f32,
    pub point_b_z: f32,
    pub overlapping: bool,
    runtime: EntityRuntimeSlot,
}

// Collision test status

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollisionTestStatus {
    DegenerateShape,
    NonConvexPolygon,
    Overlapping,
    Separated,
    UnsupportedShapeKind,
}

// Collision test explanation types

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CollisionTestExplanation2D {
    pub kind: Option<CollisionShapeKind2D>,
    pub overlapping: bool,
    pub shape_index: Option<usize>,
    pub status: CollisionTestStatus,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CollisionTestExplanation3D {
    pub kind: Option<CollisionShapeKind3D>,
    pub overlapping: bool,
    pub shape_index: Option<usize>,
    pub status: CollisionTestStatus,
}

// Triangle mesh and heightfield types

#[derive(Debug, Clone, PartialEq)]
// flight-lint: allow(contract-vocabulary) D1 range declaration: 25-bit feature/triangle indices and versions stay below 2^53, exact in TS numbers
pub struct CollisionTriangleMesh3D {
    pub points: Vec<f32>,
    pub indices: Vec<usize>,
    pub version: i64,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rotation_x: f32,
    pub rotation_y: f32,
    pub rotation_z: f32,
    pub rotation_w: f32,
    pub(crate) bvh_cache: DerivedCache,
    runtime: EntityRuntimeSlot,
}

#[derive(Debug, Clone, PartialEq)]
// flight-lint: allow(contract-vocabulary) D1 range declaration: 25-bit feature/triangle indices and versions stay below 2^53, exact in TS numbers
pub struct CollisionHeightfield3D {
    pub columns: usize,
    pub rows: usize,
    pub heights: Vec<f32>,
    pub cell_size_x: f32,
    pub cell_size_z: f32,
    pub version: i64,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rotation_x: f32,
    pub rotation_y: f32,
    pub rotation_z: f32,
    pub rotation_w: f32,
    pub(crate) bvh_cache: DerivedCache,
    runtime: EntityRuntimeSlot,
}

// flight-lint: allow(conform-extra) Rust accessor for the TS discriminated-union kind field; TS reads `shape.kind` directly
pub fn get_collision_shape2d_kind(shape: &CollisionShape2D) -> CollisionShapeKind2D {
    return match shape {
        CollisionShape2D::Circle(_) => CollisionShapeKind2D::Circle,
        CollisionShape2D::Capsule(_) => CollisionShapeKind2D::Capsule,
        CollisionShape2D::Aabb(_) => CollisionShapeKind2D::Aabb,
        CollisionShape2D::Obb(_) => CollisionShapeKind2D::Obb,
        CollisionShape2D::Polygon(_) => CollisionShapeKind2D::Polygon,
        CollisionShape2D::Segment(_) => CollisionShapeKind2D::Segment,
        CollisionShape2D::Point(_) => CollisionShapeKind2D::Point,
    };
}

pub(crate) fn get_collision_shape2d_kind_key(shape: &CollisionShape2D) -> &'static str {
    return match shape {
        CollisionShape2D::Circle(_) => "circle",
        CollisionShape2D::Capsule(_) => "capsule",
        CollisionShape2D::Aabb(_) => "aabb",
        CollisionShape2D::Obb(_) => "obb",
        CollisionShape2D::Polygon(_) => "polygon",
        CollisionShape2D::Segment(_) => "segment",
        CollisionShape2D::Point(_) => "point",
    };
}

// flight-lint: allow(conform-extra) Rust accessor for the TS discriminated-union kind field; TS reads `shape.kind` directly
pub fn get_collision_shape3d_kind(shape: &CollisionShape3D) -> CollisionShapeKind3D {
    return match shape {
        CollisionShape3D::Sphere(_) => CollisionShapeKind3D::Sphere,
        CollisionShape3D::Aabb(_) => CollisionShapeKind3D::Aabb,
        CollisionShape3D::Box(_) => CollisionShapeKind3D::Box,
        CollisionShape3D::Capsule(_) => CollisionShapeKind3D::Capsule,
        CollisionShape3D::Cylinder(_) => CollisionShapeKind3D::Cylinder,
        CollisionShape3D::Cone(_) => CollisionShapeKind3D::Cone,
        CollisionShape3D::Convex(_) => CollisionShapeKind3D::Convex,
    };
}

pub(crate) fn get_collision_shape3d_kind_key(shape: &CollisionShape3D) -> &'static str {
    return match shape {
        CollisionShape3D::Sphere(_) => "sphere",
        CollisionShape3D::Aabb(_) => "aabb",
        CollisionShape3D::Box(_) => "box",
        CollisionShape3D::Capsule(_) => "capsule",
        CollisionShape3D::Cylinder(_) => "cylinder",
        CollisionShape3D::Cone(_) => "cone",
        CollisionShape3D::Convex(_) => "convex",
    };
}

impl CollisionShape2D {
    pub fn kind(&self) -> CollisionShapeKind2D {
        return get_collision_shape2d_kind(self);
    }
}

impl CollisionShape3D {
    pub fn kind(&self) -> CollisionShapeKind3D {
        return get_collision_shape3d_kind(self);
    }
}

impl Default for CollisionContactManifold2D {
    fn default() -> Self {
        Self {
            overlapping: false,
            normal_x: 0.0,
            normal_y: 0.0,
            depth: 0.0,
            point_count: 0,
            points: [CollisionContactPoint2D::default(); MAX_COLLISION_CONTACT_POINTS_2D],
            runtime: EntityRuntimeSlot::default(),
        }
    }
}

impl Default for CollisionContactManifold3D {
    fn default() -> Self {
        Self {
            overlapping: false,
            normal_x: 0.0,
            normal_y: 0.0,
            normal_z: 0.0,
            point_count: 0,
            points: [CollisionContactPoint3D::default(); MAX_COLLISION_CONTACT_POINTS_3D],
            runtime: EntityRuntimeSlot::default(),
        }
    }
}

impl Default for CollisionTestExplanation2D {
    fn default() -> Self {
        Self {
            kind: None,
            overlapping: false,
            shape_index: None,
            status: CollisionTestStatus::Separated,
        }
    }
}

impl Default for CollisionTestExplanation3D {
    fn default() -> Self {
        Self {
            kind: None,
            overlapping: false,
            shape_index: None,
            status: CollisionTestStatus::Separated,
        }
    }
}

impl Default for CollisionTriangleMesh3D {
    fn default() -> Self {
        Self {
            points: Vec::new(),
            indices: Vec::new(),
            version: 0,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
            bvh_cache: DerivedCache::new(),
            runtime: EntityRuntimeSlot::default(),
        }
    }
}

impl Default for CollisionHeightfield3D {
    fn default() -> Self {
        Self {
            columns: 0,
            rows: 0,
            heights: Vec::new(),
            cell_size_x: 1.0,
            cell_size_z: 1.0,
            version: 0,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
            bvh_cache: DerivedCache::new(),
            runtime: EntityRuntimeSlot::default(),
        }
    }
}

flight_entity::impl_entity!(CollisionManifold2D);

flight_entity::impl_entity!(CollisionManifold3D);

flight_entity::impl_entity!(CollisionRaycastHit2D);

flight_entity::impl_entity!(CollisionRaycastHit3D);

flight_entity::impl_entity!(CollisionTimeOfImpact2D);

flight_entity::impl_entity!(CollisionTimeOfImpact3D);

flight_entity::impl_entity!(CollisionDistance3D);

flight_entity::impl_entity!(CollisionContactManifold2D);

flight_entity::impl_entity!(CollisionContactManifold3D);

flight_entity::impl_entity!(CollisionTriangleMesh3D);

flight_entity::impl_entity!(CollisionHeightfield3D);
