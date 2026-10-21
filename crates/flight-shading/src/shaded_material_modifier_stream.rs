//! `ShadedMaterial`'s `Material` base impl, which exposes its modifier stack through the
//! materials-owned `MaterialModifierStream` read view (len + kind_at only, per the Principal), so
//! scene3d reads the stack without a materials -> shading dependency and without a projection copy.

use flight_entity::Kind;
use flight_materials::{Material, MaterialFields, MaterialModifierStream};

use crate::shaded_material::ShadedMaterial;

// flight-lint: allow(sugar-delegates) trait boilerplate: the Material base plumbing with the modifier-stream override
impl Material for ShadedMaterial {
    fn as_any(&self) -> &dyn std::any::Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        return self;
    }

    fn material_fields(&self) -> &MaterialFields {
        return Material::material_fields(&**self);
    }

    fn material_fields_mut(&mut self) -> &mut MaterialFields {
        return Material::material_fields_mut(&mut **self);
    }

    // The material is its own stack view: no projection copy of `modifiers` is made.
    fn modifier_stream(&self) -> Option<&dyn MaterialModifierStream> {
        return Some(self);
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the materials-owned read view over `modifiers`
impl MaterialModifierStream for ShadedMaterial {
    fn kind_at(&self, index: usize) -> Option<Kind> {
        return self
            .modifiers
            .get(index)
            .map(|modifier| modifier.read().unwrap().modifier_fields().kind.clone());
    }

    fn len(&self) -> usize {
        return self.modifiers.len();
    }
}
