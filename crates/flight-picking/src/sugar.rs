//! Rust convenience methods for the public picking lane (D18): each delegates to its free function.

// flight-lint: allow-file(contract-vocabulary) D16 receiver plumbing retains the original open Node and Material EntityRefs

use flight_camera::Camera3D;
use flight_entity::Ref;
use flight_geometry::{Ray3D, Vector2, Vector3, Vector4};
use flight_materials::Material3D;
use flight_node::NodeRef;
use flight_node::contract::NodeRevisionState;

use crate::pick_scene3d::{
    pick_scene3d, pick_scene3d_all, pick_scene3d_all_with_ray3d, pick_scene3d_with_ray3d,
};
use crate::scene_hit_attributes::*;
use crate::types::{Scene3DHit, Scene3DPickOptions};

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_camera::{
        Camera3DOptions, PerspectiveProjectionOptions, Projection, create_camera_3d,
        create_perspective_projection, set_camera_3d_view_matrix4_from_look_at,
    };
    use flight_geometry::{
        create_ray3d, create_vector2, create_vector3, create_vector4, set_vector3,
    };
    use flight_meshgeometry::{
        MeshGeometryFromAttributesOptions, MeshSubset, create_box_mesh_geometry,
        create_mesh_geometry_from_attributes, set_mesh_geometry_subsets,
    };
    use flight_node::contract::invalidate_node_local_transform;
    use flight_node::{NodeRef, add_node_child};
    use flight_scene3d::{Node3DFields, create_mesh, create_node3d};

    use super::*;
    use crate::pick_scene3d::create_scene3d_hit;

    fn revisions() -> NodeRevisionState {
        return NodeRevisionState {
            world_transform_revision: 0,
        };
    }

    // Two boxes on the -Z axis; the nearer one is scaled so normals and tangents are non-trivial.
    fn scene() -> NodeRef {
        let scene: NodeRef = Arc::new(RwLock::new(create_node3d::<Node3DFields>(None, None)));
        let far = create_mesh(
            Arc::new(RwLock::new(create_box_mesh_geometry(
                Some(2.0),
                Some(2.0),
                Some(2.0),
            ))),
            Arc::new(RwLock::new(Vec::new())),
            None,
            None,
        );
        let mut geometry =
            create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
                positions: vec![-1.0, -1.0, 0.0, 1.0, -1.0, 0.0, 0.0, 1.0, 0.0],
                normals: None,
                uvs: Some(vec![0.0, 0.0, 1.0, 0.0, 0.5, 1.0]),
                indices: None,
            });
        set_mesh_geometry_subsets(
            &mut geometry,
            &[MeshSubset {
                index_count: 3,
                index_offset: 0,
            }],
        );
        let near = create_mesh(
            Arc::new(RwLock::new(geometry)),
            Arc::new(RwLock::new(vec![None])),
            None,
            None,
        );
        {
            let mut near = near.write().unwrap();
            set_vector3(&mut near.position, 0.0, 0.0, 2.0);
            set_vector3(&mut near.scale, -2.0, 1.0, 1.0);
        }
        let near_node: NodeRef = near.clone();
        invalidate_node_local_transform(&near_node);
        let far_node: NodeRef = far;
        add_node_child(&scene, &far_node);
        add_node_child(&scene, &near_node);
        return scene;
    }

    #[test]
    fn hit_attribute_methods_match_their_free_functions() {
        let scene = scene();
        let ray = create_ray3d(0.1, 0.1, 5.0, 0.0, 0.0, -1.0);
        let mut hit = create_scene3d_hit();
        assert!(pick_scene3d_with_ray3d(
            &mut hit,
            &scene,
            &ray,
            None,
            &mut revisions()
        ));

        assert_eq!(hit.subset_index(), get_scene3d_hit_subset_index(&hit));
        assert_eq!(
            hit.material().is_none(),
            get_scene3d_hit_material(&hit).is_none()
        );
        assert_eq!(
            hit.is_front_facing(&ray),
            is_scene3d_hit_front_facing(&hit, &ray)
        );

        let mut method_uv = create_vector2(7.0, 8.0);
        let mut free_uv = create_vector2(7.0, 8.0);
        assert_eq!(
            hit.uv0(&mut method_uv),
            get_scene3d_hit_uv0(&mut free_uv, &hit)
        );
        assert_eq!((method_uv.x, method_uv.y), (free_uv.x, free_uv.y));

        let mut method_normal = create_vector3(7.0, 8.0, 9.0);
        let mut free_normal = create_vector3(7.0, 8.0, 9.0);
        assert_eq!(
            hit.vertex_normal(&mut method_normal, &mut revisions()),
            get_scene3d_hit_vertex_normal(&mut free_normal, &hit, &mut revisions())
        );
        assert_eq!(
            (method_normal.x, method_normal.y, method_normal.z),
            (free_normal.x, free_normal.y, free_normal.z)
        );

        let mut method_tangent = create_vector4(1.0, 2.0, 3.0, 4.0);
        let mut free_tangent = create_vector4(1.0, 2.0, 3.0, 4.0);
        assert_eq!(
            hit.vertex_tangent(&mut method_tangent, &mut revisions()),
            get_scene3d_hit_vertex_tangent(&mut free_tangent, &hit, &mut revisions())
        );
        assert_eq!(
            (
                method_tangent.x,
                method_tangent.y,
                method_tangent.z,
                method_tangent.w
            ),
            (
                free_tangent.x,
                free_tangent.y,
                free_tangent.z,
                free_tangent.w
            )
        );
    }

    #[test]
    fn scene_pick_methods_match_their_free_functions() {
        let scene = scene();
        let mut camera = create_camera_3d(&Camera3DOptions {
            far: 100.0,
            near: 0.1,
            near_clip_plane: None,
            projection: Projection::Perspective(create_perspective_projection(
                &PerspectiveProjectionOptions {
                    aspect: Some(1.0),
                    fov_y: std::f32::consts::FRAC_PI_2,
                },
            )),
        });
        set_camera_3d_view_matrix4_from_look_at(
            &mut camera,
            &create_vector3(0.0, 0.0, 5.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        let ray = create_ray3d(0.1, 0.1, 5.0, 0.0, 0.0, -1.0);
        let options = Scene3DPickOptions {
            cull_backfaces: Some(true),
            max_distance: None,
            predicate: None,
        };
        let signature = |hit: &Scene3DHit| {
            return (
                hit.triangle_index,
                hit.distance,
                hit.point_x,
                hit.point_y,
                hit.point_z,
            );
        };

        let mut method_hit = create_scene3d_hit();
        let mut free_hit = create_scene3d_hit();
        assert_eq!(
            scene.pick(
                &mut method_hit,
                &camera,
                0.0,
                0.0,
                Some(&options),
                &mut revisions()
            ),
            pick_scene3d(
                &mut free_hit,
                &scene,
                &camera,
                0.0,
                0.0,
                Some(&options),
                &mut revisions()
            )
        );
        assert_eq!(signature(&method_hit), signature(&free_hit));
        assert!(Arc::ptr_eq(
            method_hit.node.as_ref().unwrap(),
            free_hit.node.as_ref().unwrap()
        ));

        let mut method_ray_hit = create_scene3d_hit();
        let mut free_ray_hit = create_scene3d_hit();
        assert_eq!(
            scene.pick_with_ray3d(&mut method_ray_hit, &ray, None, &mut revisions()),
            pick_scene3d_with_ray3d(&mut free_ray_hit, &scene, &ray, None, &mut revisions())
        );
        assert_eq!(signature(&method_ray_hit), signature(&free_ray_hit));

        let mut method_all = Vec::new();
        let mut free_all = Vec::new();
        scene.pick_all(&mut method_all, &camera, 0.0, 0.0, None, &mut revisions());
        pick_scene3d_all(
            &mut free_all,
            &scene,
            &camera,
            0.0,
            0.0,
            None,
            &mut revisions(),
        );
        assert_eq!(
            method_all.iter().map(signature).collect::<Vec<_>>(),
            free_all.iter().map(signature).collect::<Vec<_>>()
        );

        let mut method_ray_all = Vec::new();
        let mut free_ray_all = Vec::new();
        scene.pick_all_with_ray3d(&mut method_ray_all, &ray, Some(&options), &mut revisions());
        pick_scene3d_all_with_ray3d(
            &mut free_ray_all,
            &scene,
            &ray,
            Some(&options),
            &mut revisions(),
        );
        assert!(!free_ray_all.is_empty());
        assert_eq!(
            method_ray_all.iter().map(signature).collect::<Vec<_>>(),
            free_ray_all.iter().map(signature).collect::<Vec<_>>()
        );
    }
}

/// Scene pick receivers on a scene root node (D18): each delegates to its free function.
pub trait Scene3DPickMethods {
    fn pick(
        &self,
        out: &mut Scene3DHit,
        camera: &Camera3D,
        screen_x: f32,
        screen_y: f32,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    ) -> bool;
    fn pick_all(
        &self,
        out_array: &mut Vec<Scene3DHit>,
        camera: &Camera3D,
        screen_x: f32,
        screen_y: f32,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    );
    fn pick_all_with_ray3d(
        &self,
        out_array: &mut Vec<Scene3DHit>,
        ray: &Ray3D,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    );
    fn pick_with_ray3d(
        &self,
        out: &mut Scene3DHit,
        ray: &Ray3D,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    ) -> bool;
}

impl Scene3DHit {
    pub fn is_front_facing(&self, ray: &Ray3D) -> bool {
        return is_scene3d_hit_front_facing(self, ray);
    }

    pub fn material(&self) -> Option<Ref<dyn Material3D>> {
        return get_scene3d_hit_material(self);
    }

    pub fn subset_index(&self) -> i32 {
        return get_scene3d_hit_subset_index(self);
    }

    pub fn uv0(&self, out: &mut Vector2) -> bool {
        return get_scene3d_hit_uv0(out, self);
    }

    pub fn vertex_normal(&self, out: &mut Vector3, revisions: &mut NodeRevisionState) -> bool {
        return get_scene3d_hit_vertex_normal(out, self, revisions);
    }

    pub fn vertex_tangent(&self, out: &mut Vector4, revisions: &mut NodeRevisionState) -> bool {
        return get_scene3d_hit_vertex_tangent(out, self, revisions);
    }
}

impl Scene3DPickMethods for NodeRef {
    fn pick(
        &self,
        out: &mut Scene3DHit,
        camera: &Camera3D,
        screen_x: f32,
        screen_y: f32,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    ) -> bool {
        return pick_scene3d(out, self, camera, screen_x, screen_y, options, revisions);
    }

    fn pick_all(
        &self,
        out_array: &mut Vec<Scene3DHit>,
        camera: &Camera3D,
        screen_x: f32,
        screen_y: f32,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    ) {
        pick_scene3d_all(
            out_array, self, camera, screen_x, screen_y, options, revisions,
        );
    }

    fn pick_all_with_ray3d(
        &self,
        out_array: &mut Vec<Scene3DHit>,
        ray: &Ray3D,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    ) {
        pick_scene3d_all_with_ray3d(out_array, self, ray, options, revisions);
    }

    fn pick_with_ray3d(
        &self,
        out: &mut Scene3DHit,
        ray: &Ray3D,
        options: Option<&Scene3DPickOptions>,
        revisions: &mut NodeRevisionState,
    ) -> bool {
        return pick_scene3d_with_ray3d(out, self, ray, options, revisions);
    }
}
