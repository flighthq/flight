use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Vector3, create_vector3};
use flight_texture::Texture;

use crate::contract::{
    MODIFIER_SLOT_VERTEX, ModifierFields, VertexDisplaceModifierSource, initialize_modifier,
};

pub const VERTEX_DISPLACE_MODIFIER_KIND: &str = "VertexDisplaceModifier";

#[derive(Clone, Debug)]
pub struct VertexDisplaceModifier {
    fields: ModifierFields,
    pub source: VertexDisplaceModifierSource,
    pub amplitude: f32,
    pub axis: Option<Vector3>,
    pub map: Option<Ref<Texture>>,
    pub frequency: f32,
    pub speed: f32,
    pub direction: Vector3,
}

#[derive(Clone, Debug)]
pub struct VertexDisplaceModifierOptions {
    pub source: VertexDisplaceModifierSource,
    pub amplitude: f32,
    pub axis: Option<Vector3>,
    pub map: Option<Ref<Texture>>,
    pub frequency: Option<f32>,
    pub speed: Option<f32>,
    pub direction: Option<Vector3>,
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored modifier fields after construction
pub fn create_vertex_displace_modifier() -> VertexDisplaceModifier {
    let mut out: VertexDisplaceModifier = allocate_entity();
    initialize_vertex_displace_modifier(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_vertex_displace_modifier(out: &mut VertexDisplaceModifier) {
    initialize_modifier(
        out,
        VERTEX_DISPLACE_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_VERTEX.to_string(),
    );
    out.source = VertexDisplaceModifierSource::Sine;
    out.amplitude = 0.0;
    out.axis = None;
    out.map = None;
    out.frequency = 1.0;
    out.speed = 1.0;
    out.direction = create_vector3(1.0, 0.0, 0.0);
    return;
}

impl Default for VertexDisplaceModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            source: VertexDisplaceModifierSource::Sine,
            amplitude: 0.0,
            axis: None,
            map: None,
            frequency: 1.0,
            speed: 1.0,
            direction: create_vector3(1.0, 0.0, 0.0),
        };
    }
}

crate::impl_modifier!(VertexDisplaceModifier, |value: &VertexDisplaceModifier| {
    let mut signature = match value.source {
        VertexDisplaceModifierSource::HeightMap => "h".to_string(),
        VertexDisplaceModifierSource::Sine => "s".to_string(),
    };
    if value.axis.is_some() {
        signature.push('a');
    }
    return signature;
});
