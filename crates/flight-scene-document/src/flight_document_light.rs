//! Open-kind document lights (Principal 68e645eb C2). The source reads an authored light as a plain
//! `{ kind, ...fields }` object and writes any Light by reflecting its own fields. Here the text
//! codec reads every light as a `FlightDocumentLightDescriptor` that keeps its kind and all of its
//! fields, writes the built-in lighting kinds through their source field names, and decodes the
//! recognized built-in descriptors into canonical lighting entities just before 3D materialization.
//! A custom kind passes through as the descriptor itself.

// flight-lint: allow-file(f64) D1: document light fields are JS Numbers; canonical f32 light fields promote from their shortest f32 decimal
// flight-lint: allow-file(contract-vocabulary) D16 open Light family handles retained by Ref<dyn Light>

use std::sync::{Arc, RwLock};

use flight_entity::{get_record_value, set_record_value};
use flight_geometry::{Vector3, create_vector3};
use flight_lighting::contract::{get_light_unit_string, parse_light_unit};
use flight_lighting::{
    AMBIENT_LIGHT_KIND, AREA_LIGHT_KIND, AmbientLight, AreaLight, DIRECTIONAL_LIGHT_KIND,
    DirectionalLight, HEMISPHERE_LIGHT_KIND, HemisphereLight, Light, LightRef, LightUnit,
    POINT_LIGHT_KIND, PointLight, SPOT_LIGHT_KIND, SpotLight, create_ambient_light,
    create_directional_light, create_hemisphere_light, create_point_light, create_spot_light,
};

use crate::types::*;

// The JS Number of a canonical f32 field: its shortest round-trip f32 decimal (Principal 68e645eb
// C3), so 0.4f32 is the document number 0.4.
pub(crate) fn canonical_number(value: f32) -> f64 {
    return format!("{value:e}").parse().unwrap_or(f64::from(value));
}

fn decode_built_in_descriptor(descriptor: &FlightDocumentLightDescriptor) -> Option<LightRef> {
    let fields = &descriptor.fields;
    return match descriptor.kind.as_str() {
        AMBIENT_LIGHT_KIND => {
            let mut light = create_ambient_light();
            take_unsigned(fields, "color", &mut light.color);
            take_boolean(fields, "enabled", &mut light.enabled);
            take_number(fields, "intensity", &mut light.intensity);
            take_unit(fields, &mut light.intensity_unit);
            Some(Arc::new(RwLock::new(light)))
        }
        DIRECTIONAL_LIGHT_KIND => {
            let mut light = create_directional_light(None);
            take_unsigned(fields, "cascadeCount", &mut light.cascade_count);
            if let Some(FlightDocumentValue::Array(splits)) =
                get_record_value(fields, "cascadeSplits")
            {
                light.cascade_splits = splits
                    .iter()
                    .map(|split| match split {
                        FlightDocumentValue::Number(split) => *split as f32,
                        _ => f32::NAN,
                    })
                    .collect();
            }
            take_boolean(fields, "castsShadow", &mut light.casts_shadow);
            take_unsigned(fields, "color", &mut light.color);
            take_vector3(fields, "direction", &mut light.direction);
            take_boolean(fields, "enabled", &mut light.enabled);
            take_number(fields, "intensity", &mut light.intensity);
            take_unit(fields, &mut light.intensity_unit);
            take_number(fields, "normalBias", &mut light.normal_bias);
            take_number(fields, "pcfRadius", &mut light.pcf_radius);
            take_number(fields, "shadowBias", &mut light.shadow_bias);
            take_number(fields, "shadowFar", &mut light.shadow_far);
            take_unsigned(fields, "shadowMapSize", &mut light.shadow_map_size);
            take_number(fields, "shadowNear", &mut light.shadow_near);
            take_number(fields, "shadowStrength", &mut light.shadow_strength);
            Some(Arc::new(RwLock::new(light)))
        }
        HEMISPHERE_LIGHT_KIND => {
            let mut light = create_hemisphere_light();
            take_boolean(fields, "enabled", &mut light.enabled);
            take_unsigned(fields, "groundColor", &mut light.ground_color);
            take_number(fields, "intensity", &mut light.intensity);
            take_unit(fields, &mut light.intensity_unit);
            take_unsigned(fields, "skyColor", &mut light.sky_color);
            Some(Arc::new(RwLock::new(light)))
        }
        POINT_LIGHT_KIND => {
            let mut light = create_point_light();
            take_boolean(fields, "castsShadow", &mut light.casts_shadow);
            take_unsigned(fields, "color", &mut light.color);
            take_number(fields, "decay", &mut light.decay);
            take_boolean(fields, "enabled", &mut light.enabled);
            take_number(fields, "intensity", &mut light.intensity);
            take_unit(fields, &mut light.intensity_unit);
            take_signed(fields, "layerMask", &mut light.layer_mask);
            take_number(fields, "normalBias", &mut light.normal_bias);
            take_number(fields, "pcfRadius", &mut light.pcf_radius);
            take_vector3(fields, "position", &mut light.position);
            take_number(fields, "priority", &mut light.priority);
            take_number(fields, "range", &mut light.range);
            take_number(fields, "shadowBias", &mut light.shadow_bias);
            take_number(fields, "shadowFar", &mut light.shadow_far);
            take_unsigned(fields, "shadowMapSize", &mut light.shadow_map_size);
            take_number(fields, "shadowNear", &mut light.shadow_near);
            take_number(fields, "shadowStrength", &mut light.shadow_strength);
            Some(Arc::new(RwLock::new(light)))
        }
        SPOT_LIGHT_KIND => {
            let mut light = create_spot_light(None);
            take_boolean(fields, "castsShadow", &mut light.casts_shadow);
            take_unsigned(fields, "color", &mut light.color);
            take_number(fields, "decay", &mut light.decay);
            take_vector3(fields, "direction", &mut light.direction);
            take_boolean(fields, "enabled", &mut light.enabled);
            take_number(fields, "innerConeCos", &mut light.inner_cone_cos);
            take_number(fields, "intensity", &mut light.intensity);
            take_unit(fields, &mut light.intensity_unit);
            take_signed(fields, "layerMask", &mut light.layer_mask);
            take_number(fields, "normalBias", &mut light.normal_bias);
            take_number(fields, "outerConeCos", &mut light.outer_cone_cos);
            take_number(fields, "pcfRadius", &mut light.pcf_radius);
            take_vector3(fields, "position", &mut light.position);
            take_number(fields, "priority", &mut light.priority);
            take_number(fields, "range", &mut light.range);
            take_number(fields, "shadowBias", &mut light.shadow_bias);
            take_number(fields, "shadowFar", &mut light.shadow_far);
            take_unsigned(fields, "shadowMapSize", &mut light.shadow_map_size);
            take_number(fields, "shadowNear", &mut light.shadow_near);
            take_number(fields, "shadowStrength", &mut light.shadow_strength);
            take_number(fields, "spotBlend", &mut light.spot_blend);
            Some(Arc::new(RwLock::new(light)))
        }
        // Scene3D lights carry no area slot, so an area descriptor passes through like a custom kind.
        AREA_LIGHT_KIND => None,
        _ => None,
    };
}

// Decodes a recognized built-in descriptor into its canonical lighting entity, starting from the
// lighting defaults; any other light (a canonical entity, or a custom kind) passes through as the
// same handle. The raw descriptor is never modified.
pub(crate) fn decode_flight_document_light(light: &LightRef) -> LightRef {
    let decoded: Option<LightRef> = {
        let guard = light.read().unwrap();
        let any: &dyn std::any::Any = &*guard;
        any.downcast_ref::<FlightDocumentLightDescriptor>()
            .and_then(|descriptor| {
                return decode_built_in_descriptor(descriptor);
            })
    };
    return decoded.unwrap_or_else(|| light.clone());
}

// The source field entries of a light, excluding `kind`, or `None` for a concrete light type the
// document cannot reflect.
pub(crate) fn get_flight_document_light_fields(light: &dyn Light) -> Option<FlightDocumentFields> {
    let any: &dyn std::any::Any = light;
    if let Some(descriptor) = any.downcast_ref::<FlightDocumentLightDescriptor>() {
        return Some(descriptor.fields.clone());
    }
    let mut out = FlightDocumentFields::default();
    if let Some(light) = any.downcast_ref::<AmbientLight>() {
        put_color(&mut out, "color", light.color);
        put_boolean(&mut out, "enabled", light.enabled);
        put_number(&mut out, "intensity", light.intensity);
        put_unit(&mut out, light.intensity_unit);
        return Some(out);
    }
    if let Some(light) = any.downcast_ref::<DirectionalLight>() {
        put_integer(&mut out, "cascadeCount", f64::from(light.cascade_count));
        let splits = light
            .cascade_splits
            .iter()
            .map(|split| FlightDocumentValue::Number(canonical_number(*split)));
        set_record_value(
            &mut out,
            "cascadeSplits".to_string(),
            FlightDocumentValue::Array(splits.collect()),
        );
        put_boolean(&mut out, "castsShadow", light.casts_shadow);
        put_color(&mut out, "color", light.color);
        put_vector3(&mut out, "direction", &light.direction);
        put_boolean(&mut out, "enabled", light.enabled);
        put_number(&mut out, "intensity", light.intensity);
        put_unit(&mut out, light.intensity_unit);
        put_number(&mut out, "normalBias", light.normal_bias);
        put_number(&mut out, "pcfRadius", light.pcf_radius);
        put_number(&mut out, "shadowBias", light.shadow_bias);
        put_number(&mut out, "shadowFar", light.shadow_far);
        put_integer(&mut out, "shadowMapSize", f64::from(light.shadow_map_size));
        put_number(&mut out, "shadowNear", light.shadow_near);
        put_number(&mut out, "shadowStrength", light.shadow_strength);
        return Some(out);
    }
    if let Some(light) = any.downcast_ref::<HemisphereLight>() {
        put_boolean(&mut out, "enabled", light.enabled);
        put_color(&mut out, "groundColor", light.ground_color);
        put_number(&mut out, "intensity", light.intensity);
        put_unit(&mut out, light.intensity_unit);
        put_color(&mut out, "skyColor", light.sky_color);
        return Some(out);
    }
    if let Some(light) = any.downcast_ref::<PointLight>() {
        put_boolean(&mut out, "castsShadow", light.casts_shadow);
        put_color(&mut out, "color", light.color);
        put_number(&mut out, "decay", light.decay);
        put_boolean(&mut out, "enabled", light.enabled);
        put_number(&mut out, "intensity", light.intensity);
        put_unit(&mut out, light.intensity_unit);
        put_integer(&mut out, "layerMask", f64::from(light.layer_mask));
        put_number(&mut out, "normalBias", light.normal_bias);
        put_number(&mut out, "pcfRadius", light.pcf_radius);
        put_vector3(&mut out, "position", &light.position);
        put_number(&mut out, "priority", light.priority);
        put_number(&mut out, "range", light.range);
        put_number(&mut out, "shadowBias", light.shadow_bias);
        put_number(&mut out, "shadowFar", light.shadow_far);
        put_integer(&mut out, "shadowMapSize", f64::from(light.shadow_map_size));
        put_number(&mut out, "shadowNear", light.shadow_near);
        put_number(&mut out, "shadowStrength", light.shadow_strength);
        return Some(out);
    }
    if let Some(light) = any.downcast_ref::<SpotLight>() {
        put_boolean(&mut out, "castsShadow", light.casts_shadow);
        put_color(&mut out, "color", light.color);
        put_number(&mut out, "decay", light.decay);
        put_vector3(&mut out, "direction", &light.direction);
        put_boolean(&mut out, "enabled", light.enabled);
        put_number(&mut out, "innerConeCos", light.inner_cone_cos);
        put_number(&mut out, "intensity", light.intensity);
        put_unit(&mut out, light.intensity_unit);
        put_integer(&mut out, "layerMask", f64::from(light.layer_mask));
        put_number(&mut out, "normalBias", light.normal_bias);
        put_number(&mut out, "outerConeCos", light.outer_cone_cos);
        put_number(&mut out, "pcfRadius", light.pcf_radius);
        put_vector3(&mut out, "position", &light.position);
        put_number(&mut out, "priority", light.priority);
        put_number(&mut out, "range", light.range);
        put_number(&mut out, "shadowBias", light.shadow_bias);
        put_number(&mut out, "shadowFar", light.shadow_far);
        put_integer(&mut out, "shadowMapSize", f64::from(light.shadow_map_size));
        put_number(&mut out, "shadowNear", light.shadow_near);
        put_number(&mut out, "shadowStrength", light.shadow_strength);
        put_number(&mut out, "spotBlend", light.spot_blend);
        return Some(out);
    }
    if let Some(light) = any.downcast_ref::<AreaLight>() {
        put_boolean(&mut out, "castsShadow", light.casts_shadow);
        put_color(&mut out, "color", light.color);
        put_number(&mut out, "decay", light.decay);
        put_vector3(&mut out, "direction", &light.direction);
        put_boolean(&mut out, "enabled", light.enabled);
        put_number(&mut out, "intensity", light.intensity);
        put_unit(&mut out, light.intensity_unit);
        put_number(&mut out, "normalBias", light.normal_bias);
        put_number(&mut out, "pcfRadius", light.pcf_radius);
        put_vector3(&mut out, "position", &light.position);
        put_number(&mut out, "range", light.range);
        put_vector3(&mut out, "right", &light.right);
        put_number(&mut out, "shadowBias", light.shadow_bias);
        put_number(&mut out, "shadowFar", light.shadow_far);
        put_integer(&mut out, "shadowMapSize", f64::from(light.shadow_map_size));
        put_number(&mut out, "shadowNear", light.shadow_near);
        put_number(&mut out, "shadowStrength", light.shadow_strength);
        put_vector3(&mut out, "up", &light.up);
        return Some(out);
    }
    return None;
}

fn put_boolean(out: &mut FlightDocumentFields, name: &str, value: bool) {
    set_record_value(out, name.to_string(), FlightDocumentValue::Boolean(value));
}

fn put_color(out: &mut FlightDocumentFields, name: &str, value: u32) {
    put_integer(out, name, f64::from(value));
}

fn put_integer(out: &mut FlightDocumentFields, name: &str, value: f64) {
    set_record_value(out, name.to_string(), FlightDocumentValue::Number(value));
}

fn put_number(out: &mut FlightDocumentFields, name: &str, value: f32) {
    set_record_value(
        out,
        name.to_string(),
        FlightDocumentValue::Number(canonical_number(value)),
    );
}

fn put_unit(out: &mut FlightDocumentFields, value: LightUnit) {
    set_record_value(
        out,
        "intensityUnit".to_string(),
        FlightDocumentValue::String(get_light_unit_string(value).to_string()),
    );
}

fn put_vector3(out: &mut FlightDocumentFields, name: &str, value: &Vector3) {
    let mut vector = FlightDocumentFields::default();
    put_number(&mut vector, "x", value.x);
    put_number(&mut vector, "y", value.y);
    put_number(&mut vector, "z", value.z);
    set_record_value(out, name.to_string(), FlightDocumentValue::Fields(vector));
}

fn take_boolean(fields: &FlightDocumentFields, name: &str, out: &mut bool) {
    if let Some(FlightDocumentValue::Boolean(value)) = get_record_value(fields, name) {
        *out = *value;
    }
}

fn take_number(fields: &FlightDocumentFields, name: &str, out: &mut f32) {
    if let Some(FlightDocumentValue::Number(value)) = get_record_value(fields, name) {
        *out = *value as f32;
    }
}

fn take_signed(fields: &FlightDocumentFields, name: &str, out: &mut i32) {
    if let Some(FlightDocumentValue::Number(value)) = get_record_value(fields, name) {
        *out = to_int32(*value);
    }
}

fn take_unit(fields: &FlightDocumentFields, out: &mut LightUnit) {
    if let Some(FlightDocumentValue::String(unit)) = get_record_value(fields, "intensityUnit")
        && let Some(unit) = parse_light_unit(unit)
    {
        *out = unit;
    }
}

fn take_unsigned(fields: &FlightDocumentFields, name: &str, out: &mut u32) {
    if let Some(FlightDocumentValue::Number(value)) = get_record_value(fields, name) {
        *out = to_uint32(*value);
    }
}

fn take_vector3(fields: &FlightDocumentFields, name: &str, out: &mut Vector3) {
    let Some(FlightDocumentValue::Fields(vector)) = get_record_value(fields, name) else {
        return;
    };
    let component = |axis: &str, fallback: f32| -> f32 {
        return match get_record_value(vector, axis) {
            Some(FlightDocumentValue::Number(value)) => *value as f32,
            _ => fallback,
        };
    };
    let next = create_vector3(
        component("x", out.x),
        component("y", out.y),
        component("z", out.z),
    );
    *out = next;
}

// JS ToInt32: NaN and the infinities are 0; otherwise truncate toward zero, modulo 2^32, signed.
pub(crate) fn to_int32(value: f64) -> i32 {
    return to_uint32(value) as i32;
}

// JS ToUint32 (Principal 68e645eb C3): NaN and the infinities are 0; otherwise truncate toward zero,
// modulo 2^32.
pub(crate) fn to_uint32(value: f64) -> u32 {
    if !value.is_finite() {
        return 0;
    }
    let modulus = 4_294_967_296.0;
    let wrapped = value.trunc() % modulus;
    let positive = if wrapped < 0.0 {
        wrapped + modulus
    } else {
        wrapped
    };
    return positive as u32;
}
