//! 2D material field group initialization (TS `hasMaterial.ts`).

use flight_entity::Ref;
use flight_materials::contract::{Material2D, MaterialData};

use crate::types::*;

/// Options for `init_material_trait` (TS `Partial<HasMaterial>`).
// flight-lint: allow(contract-vocabulary) D16 open material family: the shared handles are Ref<dyn Material2D>/Ref<dyn MaterialData>, preserving derived-kind identity
#[derive(Clone, Default)]
pub struct HasMaterialOptions {
    pub material: Option<Ref<dyn Material2D>>,
    pub material_data: Option<Ref<dyn MaterialData>>,
}

/// Applies the material defaults and any supplied overrides (TS `initMaterialTrait`). Both handles
/// keep the shared identity of the supplied material/data.
pub fn init_material_trait(target: &mut HasMaterial, obj: Option<&HasMaterialOptions>) {
    target.material = obj.and_then(|obj| obj.material.clone());
    target.material_data = obj.and_then(|obj| obj.material_data.clone());
}
