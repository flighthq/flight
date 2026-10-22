use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb3D, CollisionBox3D, CollisionCapsule3D, CollisionColliderShape3D, CollisionCone3D,
    CollisionConvex3D, CollisionCylinder3D, CollisionRegistry3D, CollisionShape3D,
    CollisionSphere3D, create_collision_heightfield3d, create_collision_triangle_mesh3d,
    register_built_in_collision_face_queries3d, register_built_in_collision_pair_tests3d,
    register_built_in_collision_supports3d,
};
use flight_physics3d::contract::{
    PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND, PHYSICS_3D_CONE_TWIST_JOINT_KIND,
    PHYSICS_3D_DISTANCE_JOINT_KIND, PHYSICS_3D_FIXED_JOINT_KIND,
    PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND, PHYSICS_3D_HINGE_JOINT_KIND, PHYSICS_3D_SLIDER_JOINT_KIND,
};
use flight_physics3d::*;

// TS `createPhysics3DCollider(shape, material?)`: the canonical create, then the authored material.
pub fn physics3d_collider(
    local: &CollisionColliderShape3D,
    material: Option<&Physics3DMaterial>,
) -> Physics3DColliderRef {
    let out = create_physics_3d_collider(local);
    if let Some(material) = material {
        out.write().unwrap().material = *material;
    }
    return out;
}

// The registry the TS suite fills with `registerBuiltInCollision*3D()`, as explicit state (D5).
pub fn registered_registry() -> CollisionRegistry3D {
    let mut registry = CollisionRegistry3D {
        face_queries: HashMap::new(),
        pair_tests: HashMap::new(),
        supports: HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports3d(&mut registry);
    register_built_in_collision_pair_tests3d(&mut registry);
    register_built_in_collision_face_queries3d(&mut registry);
    return registry;
}

// TS `createRigidBody3D(type)`: the canonical create, then the authored type.
pub fn rigid_body3d(body_type: Physics3DBodyType) -> RigidBody3DRef {
    let out = create_rigid_body_3d();
    out.write().unwrap().body_type = body_type;
    return out;
}

// TS `createPhysics3D*Joint({ bodyA, bodyB })` for every built-in kind, erased to the open family.
pub fn joint(kind: &str, body_a: i32, body_b: i32) -> Physics3DJointRef {
    let out: Physics3DJointRef = match kind {
        PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND => create_physics_3d_ball_and_socket_joint(),
        PHYSICS_3D_DISTANCE_JOINT_KIND => create_physics_3d_distance_joint(),
        PHYSICS_3D_FIXED_JOINT_KIND => create_physics_3d_fixed_joint(),
        PHYSICS_3D_HINGE_JOINT_KIND => create_physics_3d_hinge_joint(),
        PHYSICS_3D_SLIDER_JOINT_KIND => create_physics_3d_slider_joint(),
        PHYSICS_3D_CONE_TWIST_JOINT_KIND => create_physics_3d_cone_twist_joint(),
        _ => create_physics_3d_generic_6_dof_joint(),
    };
    {
        let mut out = out.write().unwrap();
        let fields = out.fields_mut();
        fields.body_a = body_a;
        fields.body_b = body_b;
    }
    return out;
}

// TS `createPhysics3DDistanceJoint({ bodyA, bodyB, length })`.
pub fn distance_joint(body_a: i32, body_b: i32, length: f32) -> Physics3DJointRef {
    let out = create_physics_3d_distance_joint();
    {
        let mut out = out.write().unwrap();
        out.body_a = body_a;
        out.body_b = body_b;
        out.length = length;
    }
    return out;
}

// The seven built-in joint kinds, in wire order, joining bodies 10 and 20.
pub fn joints() -> Vec<(&'static str, Physics3DJointRef)> {
    return vec![
        (
            "ball-and-socket",
            joint(PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND, 10, 20),
        ),
        ("distance", distance_joint(10, 20, 1.0)),
        ("fixed", joint(PHYSICS_3D_FIXED_JOINT_KIND, 10, 20)),
        ("hinge", joint(PHYSICS_3D_HINGE_JOINT_KIND, 10, 20)),
        ("slider", joint(PHYSICS_3D_SLIDER_JOINT_KIND, 10, 20)),
        (
            "cone-twist",
            joint(PHYSICS_3D_CONE_TWIST_JOINT_KIND, 10, 20),
        ),
        (
            "generic-6dof",
            joint(PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND, 10, 20),
        ),
    ];
}

pub fn aabb(
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
) -> CollisionColliderShape3D {
    return CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x,
        min_y,
        min_z,
        max_x,
        max_y,
        max_z,
    }));
}

pub fn unit_aabb() -> CollisionColliderShape3D {
    return aabb(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
}

pub fn unit_aabb_shape() -> CollisionShape3D {
    return CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.5,
        min_y: -0.5,
        min_z: -0.5,
        max_x: 0.5,
        max_y: 0.5,
        max_z: 0.5,
    });
}

// Every built-in collider shape, in wire order, with the given box half extents, triangle-mesh
// version and heightfield version.
pub fn collider_shapes(
    half: (f32, f32, f32),
    mesh_version: i64,
    heightfield_version: i64,
) -> Vec<(&'static str, CollisionColliderShape3D)> {
    let built_in = CollisionColliderShape3D::BuiltIn;
    let mut mesh = create_collision_triangle_mesh3d();
    mesh.version = mesh_version;
    mesh.points = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
    mesh.indices = vec![0, 1, 2];
    let mut heightfield = create_collision_heightfield3d();
    heightfield.columns = 2;
    heightfield.rows = 2;
    heightfield.version = heightfield_version;
    heightfield.heights = vec![0.0, 0.0, 0.0, 0.0];
    return vec![
        (
            "sphere",
            built_in(CollisionShape3D::Sphere(CollisionSphere3D {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                radius: 1.0,
            })),
        ),
        ("aabb", unit_aabb()),
        (
            "box",
            built_in(CollisionShape3D::Box(CollisionBox3D {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                half_x: half.0,
                half_y: half.1,
                half_z: half.2,
                rotation_x: 0.0,
                rotation_y: 0.0,
                rotation_z: 0.0,
                rotation_w: 1.0,
            })),
        ),
        (
            "capsule",
            built_in(CollisionShape3D::Capsule(CollisionCapsule3D {
                x0: 0.0,
                y0: -1.0,
                z0: 0.0,
                x1: 0.0,
                y1: 1.0,
                z1: 0.0,
                radius: 0.5,
            })),
        ),
        (
            "cylinder",
            built_in(CollisionShape3D::Cylinder(CollisionCylinder3D {
                x0: 0.0,
                y0: -1.0,
                z0: 0.0,
                x1: 0.0,
                y1: 1.0,
                z1: 0.0,
                radius: 0.5,
            })),
        ),
        // TS apex (0, 1, 0), base (0, -1, 0): flight-collision keeps the base in `0`, the apex in `1`.
        (
            "cone",
            built_in(CollisionShape3D::Cone(CollisionCone3D {
                x0: 0.0,
                y0: -1.0,
                z0: 0.0,
                x1: 0.0,
                y1: 1.0,
                z1: 0.0,
                radius: 1.0,
            })),
        ),
        (
            "convex",
            built_in(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            })),
        ),
        (
            "triangle mesh",
            CollisionColliderShape3D::TriangleMesh(Arc::new(RwLock::new(mesh))),
        ),
        (
            "heightfield",
            CollisionColliderShape3D::Heightfield(Arc::new(RwLock::new(heightfield))),
        ),
    ];
}
