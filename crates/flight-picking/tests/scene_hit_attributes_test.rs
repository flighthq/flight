use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{
    create_ray3d, create_vector2, create_vector3, create_vector4, set_ray3d, set_vector3,
};
use flight_materials::contract::{Material, Material3D, Material3DFields};
use flight_meshgeometry::{
    MeshAttributeIndices, MeshGeometryFromAttributesOptions, MeshGeometryOptions, MeshSubset,
    VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic, create_mesh_geometry,
    create_mesh_geometry_from_attributes, set_mesh_geometry_subsets,
};
use flight_node::contract::invalidate_node_local_transform;
use flight_picking::*;
use flight_scene3d::Mesh;

use crate::support::*;

#[derive(Default)]
struct TestMaterial {
    fields: Material3DFields,
}

flight_materials::impl_material3d!(TestMaterial);

fn attributed_hit() -> (Scene3DHit, Ref<Mesh>) {
    let mesh = mesh(geometry(create_mesh_geometry_from_attributes(
        MeshGeometryFromAttributesOptions {
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            normals: Some(vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0]),
            uvs: Some(vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]),
            indices: Some(MeshAttributeIndices::Values(vec![0, 1, 2])),
        },
    )));
    let mut hit = create_scene3d_hit();
    hit.node = Some(node(&mesh));
    hit.triangle_index = 0;
    hit.u = 0.25;
    hit.v = 0.25;
    hit.w = 0.5;
    hit.normal_z = 1.0;
    return (hit, mesh);
}

fn position_only_hit() -> Scene3DHit {
    let layout = VertexAttributeLayout {
        attributes: vec![VertexAttribute {
            byte_offset: 0,
            format: VertexFormat::Float32x3,
            semantic: VertexSemantic::Position,
        }],
        stride: 12,
    };
    let geometry = create_mesh_geometry(MeshGeometryOptions {
        vertices: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0].into(),
        layout: Arc::new(RwLock::new(layout)),
        indices: None,
        subsets: None,
        topology: None,
    });
    let mut hit = create_scene3d_hit();
    hit.node = Some(node(&mesh(crate::support::geometry(geometry))));
    hit.triangle_index = 0;
    hit.u = 1.0;
    hit.v = 0.0;
    hit.w = 0.0;
    return hit;
}

mod empty_scene3d_hit_attribute_queries {
    use super::*;

    #[test]
    fn returns_sentinels_without_changing_caller_owned_outputs() {
        let hit = create_scene3d_hit();
        let mut uv = create_vector2(7.0, 8.0);
        let mut normal = create_vector3(7.0, 8.0, 9.0);
        let mut tangent = create_vector4(1.0, 2.0, 3.0, 4.0);

        assert!(get_scene3d_hit_material(&hit).is_none());
        assert_eq!(get_scene3d_hit_subset_index(&hit), -1);
        assert!(!get_scene3d_hit_uv0(&mut uv, &hit));
        assert!(!get_scene3d_hit_vertex_normal(&mut normal, &hit));
        assert!(!get_scene3d_hit_vertex_tangent(&mut tangent, &hit));
        assert_eq!((uv.x, uv.y), (7.0, 8.0));
        assert_eq!((normal.x, normal.y, normal.z), (7.0, 8.0, 9.0));
        assert_eq!(
            (tangent.w, tangent.x, tangent.y, tangent.z),
            (4.0, 1.0, 2.0, 3.0)
        );
    }
}

mod get_scene3d_hit_material {
    use super::*;

    #[test]
    fn returns_the_subset_material_or_null_for_the_default_slot() {
        let (hit, mesh) = attributed_hit();
        let mut test_material: TestMaterial = flight_entity::allocate_entity();
        test_material.material_fields_mut().kind = "TestMaterial".to_string();
        let material: Ref<dyn Material3D> = Arc::new(RwLock::new(test_material));
        *mesh.read().unwrap().materials.write().unwrap() = vec![Some(material.clone())];
        let resolved = get_scene3d_hit_material(&hit);
        assert!(resolved.is_some_and(|resolved| Arc::ptr_eq(&resolved, &material)));
        mesh.read().unwrap().materials.write().unwrap()[0] = None;
        assert!(get_scene3d_hit_material(&hit).is_none());
    }
}

mod get_scene3d_hit_subset_index {
    use super::*;

    #[test]
    fn resolves_the_subset_owning_the_hit_triangle() {
        let (mut hit, mesh) = attributed_hit();
        set_mesh_geometry_subsets(
            &mut mesh.read().unwrap().geometry.write().unwrap(),
            &[MeshSubset {
                index_count: 3,
                index_offset: 0,
            }],
        );
        assert_eq!(get_scene3d_hit_subset_index(&hit), 0);
        hit.triangle_index = 2;
        assert_eq!(get_scene3d_hit_subset_index(&hit), -1);
    }
}

mod get_scene3d_hit_uv0 {
    use super::*;

    #[test]
    fn barycentrically_interpolates_the_current_triangle_uv() {
        let (hit, _mesh) = attributed_hit();
        let mut out = create_vector2(0.0, 0.0);
        assert!(get_scene3d_hit_uv0(&mut out, &hit));
        close(out.x, 0.25, 2);
        close(out.y, 0.5, 2);
    }

    #[test]
    fn leaves_out_unchanged_when_uv0_is_absent() {
        let hit = position_only_hit();
        let mut out = create_vector2(7.0, 8.0);
        assert!(!get_scene3d_hit_uv0(&mut out, &hit));
        assert_eq!((out.x, out.y), (7.0, 8.0));
    }
}

mod get_scene3d_hit_vertex_normal {
    use super::*;

    #[test]
    fn uses_inverse_transpose_under_non_uniform_scale() {
        let (hit, mesh) = attributed_hit();
        {
            let mesh = mesh.read().unwrap();
            let mut geometry = mesh.geometry.write().unwrap();
            for vertex in 0..3 {
                geometry.vertices[vertex * 12 + 3] = 1.0;
                geometry.vertices[vertex * 12 + 4] = 1.0;
                geometry.vertices[vertex * 12 + 5] = 0.0;
            }
        }
        set_vector3(&mut mesh.write().unwrap().scale, 2.0, 1.0, 1.0);
        invalidate_node_local_transform(&node(&mesh));
        let mut out = create_vector3(0.0, 0.0, 0.0);
        assert!(get_scene3d_hit_vertex_normal(&mut out, &hit));
        let inverse_length = 1.0 / 1.25f32.sqrt();
        close(out.x, 0.5 * inverse_length, 2);
        close(out.y, inverse_length, 2);
        close(out.z, 0.0, 2);
    }

    #[test]
    fn leaves_out_unchanged_when_normals_are_absent() {
        let mut out = create_vector3(7.0, 8.0, 9.0);
        assert!(!get_scene3d_hit_vertex_normal(
            &mut out,
            &position_only_hit()
        ));
        assert_eq!((out.x, out.y, out.z), (7.0, 8.0, 9.0));
    }
}

mod get_scene3d_hit_vertex_tangent {
    use super::*;

    #[test]
    fn transforms_tangent_and_flips_handedness_under_mirroring() {
        let (hit, mesh) = attributed_hit();
        set_vector3(&mut mesh.write().unwrap().scale, -1.0, 1.0, 1.0);
        invalidate_node_local_transform(&node(&mesh));
        let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_scene3d_hit_vertex_tangent(&mut out, &hit));
        close(out.x, -1.0, 2);
        close(out.y, 0.0, 2);
        close(out.z, 0.0, 2);
        assert_eq!(out.w, -1.0);
    }

    #[test]
    fn leaves_out_unchanged_when_tangents_are_absent() {
        let mut out = create_vector4(1.0, 2.0, 3.0, 4.0);
        assert!(!get_scene3d_hit_vertex_tangent(
            &mut out,
            &position_only_hit()
        ));
        assert_eq!((out.w, out.x, out.y, out.z), (4.0, 1.0, 2.0, 3.0));
    }
}

mod is_scene3d_hit_front_facing {
    use super::*;

    #[test]
    fn compares_the_world_ray_direction_with_the_geometric_face_normal() {
        let (hit, _mesh) = attributed_hit();
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_ray3d(
            &mut ray,
            &create_vector3(0.0, 0.0, 1.0),
            &create_vector3(0.0, 0.0, -2.0),
        );
        assert!(is_scene3d_hit_front_facing(&hit, &ray));
        ray.direction.z = 2.0;
        assert!(!is_scene3d_hit_front_facing(&hit, &ray));
    }

    #[test]
    fn treats_a_perpendicular_ray_as_front_facing() {
        let (hit, _mesh) = attributed_hit();
        let ray = create_ray3d(0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        assert!(is_scene3d_hit_front_facing(&hit, &ray));
    }
}
