use crate::support::*;
use flight_geometry::{create_transform3d, create_vector3};
use flight_lighting::contract::*;
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};
#[derive(Debug, Default)]
struct CustomLight {
    runtime: flight_entity::EntityRuntimeSlot,
    intensity: f32,
}
flight_entity::impl_entity!(CustomLight);
impl Light for CustomLight {
    fn kind(&self) -> &str {
        return "test.CustomLight";
    }
    fn colored_intensity(&self) -> Option<(u32, f32)> {
        return Some((0xabcdef, self.intensity));
    }
}
fn placed(descriptor: LightRef) -> Scene3DDocumentLight {
    return Scene3DDocumentLight {
        descriptor,
        name: None,
        node: None,
        transform: create_transform3d(),
    };
}
mod create_scene3d_lights_from_document {
    use super::*;
    #[test]
    fn accepts_and_ignores_an_open_custom_descriptor_without_mutating_its_original_entity() {
        let mut value: CustomLight = flight_entity::allocate_entity();
        value.intensity = 7.0;
        let original = Arc::new(RwLock::new(value));
        let mut doc = empty_document();
        doc.lights.push(placed(original.clone()));
        let lights = create_scene3d_lights_from_document(&doc);
        assert!(lights.ambient.is_none());
        assert!(lights.directional.is_none());
        assert!(lights.hemisphere.is_empty());
        assert!(lights.point.is_empty());
        assert!(lights.spot.is_empty());
        assert_eq!(original.read().unwrap().intensity, 7.0);
        let erased: LightRef = original.clone();
        assert!(Arc::ptr_eq(&doc.lights[0].descriptor, &erased));
    }
    #[test]
    fn returns_a_complete_empty_light_set_and_omits_unsupported_area_lights() {
        let mut doc = empty_document();
        let empty = create_scene3d_lights_from_document(&doc);
        assert!(empty.ambient.is_none());
        assert!(empty.directional.is_none());
        assert!(empty.hemisphere.is_empty());
        assert!(empty.point.is_empty());
        assert!(empty.spot.is_empty());
        doc.lights
            .push(placed(Arc::new(RwLock::new(create_area_light()))));
        let empty = create_scene3d_lights_from_document(&doc);
        assert!(empty.ambient.is_none());
        assert!(empty.directional.is_none());
        assert!(empty.hemisphere.is_empty());
        assert!(empty.point.is_empty());
        assert!(empty.spot.is_empty());
    }
    #[test]
    fn clones_each_representable_descriptor_and_first_single_slots_win() {
        let a = Arc::new(RwLock::new(create_ambient_light()));
        a.write().unwrap().intensity = 0.25;
        let d = Arc::new(RwLock::new(create_directional_light(None)));
        d.write().unwrap().intensity = 2.0;
        let h = Arc::new(RwLock::new(create_hemisphere_light()));
        h.write().unwrap().intensity = 0.5;
        let second_a = Arc::new(RwLock::new(create_ambient_light()));
        second_a.write().unwrap().intensity = 4.0;
        let second_d = Arc::new(RwLock::new(create_directional_light(None)));
        second_d.write().unwrap().intensity = 8.0;
        let mut doc = empty_document();
        doc.lights = vec![
            placed(a.clone()),
            placed(second_a),
            placed(d.clone()),
            placed(second_d),
            placed(h.clone()),
        ];
        let lights = create_scene3d_lights_from_document(&doc);
        assert_eq!(
            lights.ambient.as_ref().unwrap().read().unwrap().intensity,
            0.25
        );
        assert_eq!(
            lights
                .directional
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .intensity,
            2.0
        );
        assert_eq!(lights.hemisphere.len(), 1);
        assert!(!Arc::ptr_eq(lights.ambient.as_ref().unwrap(), &a));
        assert!(!Arc::ptr_eq(lights.directional.as_ref().unwrap(), &d));
        assert!(!Arc::ptr_eq(&lights.hemisphere[0], &h));
    }
    #[test]
    fn composes_scale_rotation_and_translation_without_mutating_document_lights() {
        let d = Arc::new(RwLock::new(create_directional_light(None)));
        d.write().unwrap().direction = create_vector3(0.0, 0.0, -1.0);
        let p = Arc::new(RwLock::new(create_point_light()));
        p.write().unwrap().position = create_vector3(1.0, 0.0, 0.0);
        let s = Arc::new(RwLock::new(create_spot_light(None)));
        s.write().unwrap().position = create_vector3(1.0, 0.0, 0.0);
        s.write().unwrap().direction = create_vector3(0.0, 0.0, -1.0);
        let mut doc = empty_document();
        doc.lights = vec![placed(d.clone()), placed(p.clone()), placed(s.clone())];
        for light in &mut doc.lights {
            light.transform.position = create_vector3(10.0, 20.0, 30.0);
            light.transform.rotation.y = std::f32::consts::FRAC_1_SQRT_2;
            light.transform.rotation.w = std::f32::consts::FRAC_1_SQRT_2;
            light.transform.scale = create_vector3(2.0, 3.0, 4.0);
        }
        let lights = create_scene3d_lights_from_document(&doc);
        let direction = &lights
            .directional
            .as_ref()
            .unwrap()
            .read()
            .unwrap()
            .direction;
        close(direction.x, -1.0);
        close(direction.y, 0.0);
        close(direction.z, 0.0);
        for position in [
            &lights.point[0].read().unwrap().position,
            &lights.spot[0].read().unwrap().position,
        ] {
            close(position.x, 10.0);
            close(position.y, 20.0);
            close(position.z, 28.0);
        }
        let spot = lights.spot[0].read().unwrap();
        close(spot.direction.x, -1.0);
        close(spot.direction.y, 0.0);
        close(spot.direction.z, 0.0);
        assert_eq!(d.read().unwrap().direction, create_vector3(0.0, 0.0, -1.0));
        assert_eq!(p.read().unwrap().position, create_vector3(1.0, 0.0, 0.0));
        assert_eq!(s.read().unwrap().position, create_vector3(1.0, 0.0, 0.0));
    }
}
