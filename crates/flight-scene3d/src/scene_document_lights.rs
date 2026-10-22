use crate::Scene3DDocument;
use flight_geometry::{Transform3D, Vector3, rotate_vector3_by_quaternion};
use flight_lighting::{
    AMBIENT_LIGHT_KIND, AmbientLight, DIRECTIONAL_LIGHT_KIND, DirectionalLight,
    HEMISPHERE_LIGHT_KIND, HemisphereLight, POINT_LIGHT_KIND, PointLight, SPOT_LIGHT_KIND,
    Scene3DLights, SpotLight, clone_ambient_light, clone_directional_light, clone_hemisphere_light,
    clone_point_light, clone_spot_light, create_scene_3d_lights,
};
use std::any::Any;
use std::sync::{Arc, RwLock};

pub fn create_scene3d_lights_from_document(document: &Scene3DDocument) -> Scene3DLights {
    let mut ambient = None;
    let mut directional = None;
    let mut hemisphere = Vec::new();
    let mut point = Vec::new();
    let mut spot = Vec::new();
    for source in &document.lights {
        let descriptor = source.descriptor.read().unwrap();
        let any: &dyn Any = &*descriptor;
        match descriptor.kind() {
            AMBIENT_LIGHT_KIND => {
                if ambient.is_none() {
                    if let Some(d) = any.downcast_ref::<AmbientLight>() {
                        ambient = Some(Arc::new(RwLock::new(clone_ambient_light(d))));
                    }
                }
            }
            DIRECTIONAL_LIGHT_KIND => {
                if directional.is_none() {
                    if let Some(d) = any.downcast_ref::<DirectionalLight>() {
                        let mut light = clone_directional_light(d);
                        let old = light.direction.clone();
                        rotate_vector3_by_quaternion(
                            &mut light.direction,
                            &old,
                            &source.transform.rotation,
                        );
                        directional = Some(Arc::new(RwLock::new(light)));
                    }
                }
            }
            HEMISPHERE_LIGHT_KIND => {
                if let Some(d) = any.downcast_ref::<HemisphereLight>() {
                    hemisphere.push(Arc::new(RwLock::new(clone_hemisphere_light(d))));
                }
            }
            POINT_LIGHT_KIND => {
                if let Some(d) = any.downcast_ref::<PointLight>() {
                    let mut light = clone_point_light(d);
                    transform_document_light_position(&mut light.position, &source.transform);
                    point.push(Arc::new(RwLock::new(light)));
                }
            }
            SPOT_LIGHT_KIND => {
                if let Some(d) = any.downcast_ref::<SpotLight>() {
                    let mut light = clone_spot_light(d);
                    transform_document_light_position(&mut light.position, &source.transform);
                    let old = light.direction.clone();
                    rotate_vector3_by_quaternion(
                        &mut light.direction,
                        &old,
                        &source.transform.rotation,
                    );
                    spot.push(Arc::new(RwLock::new(light)));
                }
            }
            _ => {}
        }
    }
    let mut out = create_scene_3d_lights();
    out.ambient = ambient;
    out.directional = directional;
    out.hemisphere = hemisphere;
    out.point = point;
    out.spot = spot;
    return out;
}
fn transform_document_light_position(out: &mut Vector3, transform: &Transform3D) {
    out.x *= transform.scale.x;
    out.y *= transform.scale.y;
    out.z *= transform.scale.z;
    let old = out.clone();
    rotate_vector3_by_quaternion(out, &old, &transform.rotation);
    out.x += transform.position.x;
    out.y += transform.position.y;
    out.z += transform.position.z;
}
