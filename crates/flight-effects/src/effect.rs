// flight-lint: allow-file(contract-vocabulary, enum-payload-named, file-structure, sugar-delegates) D16 open Effect entity-family reflection uses erased heterogeneous values and trait plumbing that are not transpiled as ordinary contract methods
use std::any::Any;
use std::collections::HashMap;

use flight_bitmap::ImageChannel;
use flight_entity::{EntityRuntimeSlot, Kind, Ref};
use flight_texture::Texture2D;

/// A dynamically observable effect field, used by the open effect family's normalization and
/// interpolation helpers. Concrete intents retain strongly typed public fields.
#[derive(Clone, Debug, PartialEq)]
pub enum CustomShaderUniformValue {
    Number(f32),
    NumberList(Vec<f32>),
}

#[derive(Clone, Debug)]
pub enum EffectValue {
    Boolean(bool),
    Color(u32),
    ColorList(Vec<u32>),
    ImageChannel(ImageChannel),
    Number(f32),
    NumberList(Vec<f32>),
    Text(String),
    Texture2D(Option<Ref<Texture2D>>),
    Uniforms(HashMap<String, CustomShaderUniformValue>),
}

/// The fields shared by every effect intent. `extra_fields` preserves the structural openness of
/// TS `Effect`: vendor kinds and callers may attach fields which the SDK did not predeclare.
#[derive(Clone, Debug, Default)]
pub struct EffectFields {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub extra_fields: HashMap<String, EffectValue>,
}

/// Open base contract for backend-neutral render effects.
pub trait Effect: flight_entity::Entity + Any + Send + Sync {
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
    fn effect_fields(&self) -> &EffectFields;
    fn effect_fields_mut(&mut self) -> &mut EffectFields;
    fn effect_field_names(&self) -> &'static [&'static str];
    fn clear_effect_field(&mut self, key: &str) -> bool;
    fn get_effect_field(&self, key: &str) -> Option<EffectValue>;
    fn set_effect_field(&mut self, key: &str, value: EffectValue) -> bool;
}

pub type EffectRef = Ref<dyn Effect>;

pub fn initialize_effect<T: Effect + ?Sized>(out: &mut T, kind: &str) {
    out.effect_fields_mut().kind = kind.to_string();
}

pub trait EffectProperty {
    fn clear_effect_property(&mut self) -> bool;
    fn get_effect_property(&self) -> Option<EffectValue>;
    fn set_effect_property(&mut self, value: EffectValue) -> bool;
}

flight_entity::impl_entity!(EffectFields);

impl PartialEq for EffectValue {
    fn eq(&self, other: &Self) -> bool {
        return match (self, other) {
            (Self::Boolean(a), Self::Boolean(b)) => a == b,
            (Self::Color(a), Self::Color(b)) => a == b,
            (Self::ColorList(a), Self::ColorList(b)) => a == b,
            (Self::ImageChannel(a), Self::ImageChannel(b)) => a == b,
            (Self::Number(a), Self::Number(b)) => a == b,
            (Self::NumberList(a), Self::NumberList(b)) => a == b,
            (Self::Text(a), Self::Text(b)) => a == b,
            (Self::Texture2D(None), Self::Texture2D(None)) => true,
            (Self::Texture2D(Some(a)), Self::Texture2D(Some(b))) => std::sync::Arc::ptr_eq(a, b),
            (Self::Uniforms(a), Self::Uniforms(b)) => a == b,
            _ => false,
        };
    }
}

impl EffectProperty for Option<f32> {
    fn clear_effect_property(&mut self) -> bool {
        *self = None;
        true
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return self.map(EffectValue::Number);
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Number(value) = value else {
            return false;
        };
        *self = Some(value);
        return true;
    }
}

impl EffectProperty for Option<bool> {
    fn clear_effect_property(&mut self) -> bool {
        *self = None;
        true
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return self.map(EffectValue::Boolean);
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Boolean(value) = value else {
            return false;
        };
        *self = Some(value);
        return true;
    }
}

impl EffectProperty for Option<u32> {
    fn clear_effect_property(&mut self) -> bool {
        *self = None;
        true
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return self.map(EffectValue::Color);
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Color(value) = value else {
            return false;
        };
        *self = Some(value);
        return true;
    }
}

impl EffectProperty for Option<String> {
    fn clear_effect_property(&mut self) -> bool {
        *self = None;
        true
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return self.as_ref().map(|value| EffectValue::Text(value.clone()));
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Text(value) = value else {
            return false;
        };
        *self = Some(value);
        return true;
    }
}

impl EffectProperty for f32 {
    fn clear_effect_property(&mut self) -> bool {
        false
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return Some(EffectValue::Number(*self));
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Number(value) = value else {
            return false;
        };
        *self = value;
        return true;
    }
}

impl EffectProperty for String {
    fn clear_effect_property(&mut self) -> bool {
        false
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return Some(EffectValue::Text(self.clone()));
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Text(value) = value else {
            return false;
        };
        *self = value;
        return true;
    }
}

impl EffectProperty for Vec<f32> {
    fn clear_effect_property(&mut self) -> bool {
        false
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return Some(EffectValue::NumberList(self.clone()));
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::NumberList(value) = value else {
            return false;
        };
        *self = value;
        return true;
    }
}

impl EffectProperty for Vec<u32> {
    fn clear_effect_property(&mut self) -> bool {
        false
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return Some(EffectValue::ColorList(self.clone()));
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::ColorList(value) = value else {
            return false;
        };
        *self = value;
        return true;
    }
}

impl EffectProperty for Option<ImageChannel> {
    fn clear_effect_property(&mut self) -> bool {
        *self = None;
        true
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return self.map(EffectValue::ImageChannel);
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let value = match value {
            EffectValue::ImageChannel(value) => value,
            EffectValue::Number(0.0) => ImageChannel::Red,
            EffectValue::Number(1.0) => ImageChannel::Green,
            EffectValue::Number(2.0) => ImageChannel::Blue,
            EffectValue::Number(3.0) => ImageChannel::Alpha,
            _ => return false,
        };
        *self = Some(value);
        return true;
    }
}

impl EffectProperty for Option<Ref<Texture2D>> {
    fn clear_effect_property(&mut self) -> bool {
        false
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return Some(EffectValue::Texture2D(self.clone()));
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Texture2D(value) = value else {
            return false;
        };
        *self = value;
        return true;
    }
}

impl EffectProperty for Option<HashMap<String, CustomShaderUniformValue>> {
    fn clear_effect_property(&mut self) -> bool {
        *self = None;
        true
    }
    fn get_effect_property(&self) -> Option<EffectValue> {
        return self
            .as_ref()
            .map(|value| EffectValue::Uniforms(value.clone()));
    }

    fn set_effect_property(&mut self, value: EffectValue) -> bool {
        let EffectValue::Uniforms(value) = value else {
            return false;
        };
        *self = Some(value);
        return true;
    }
}

/// Implements the open effect/entity plumbing for a concrete intent with private `fields`.
#[macro_export]
macro_rules! impl_effect {
    ($t:ty $(, $key:literal => $field:ident)* $(,)?) => {
        impl ::std::ops::Deref for $t {
            type Target = $crate::contract::EffectFields;

            fn deref(&self) -> &$crate::contract::EffectFields {
                return &self.fields;
            }
        }

        impl ::std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut $crate::contract::EffectFields {
                return &mut self.fields;
            }
        }

        impl ::flight_entity::Entity for $t {
            fn entity_runtime(&self) -> &::flight_entity::EntityRuntimeSlot {
                return ::flight_entity::Entity::entity_runtime(&self.fields);
            }

            fn entity_runtime_mut(&mut self) -> &mut ::flight_entity::EntityRuntimeSlot {
                return ::flight_entity::Entity::entity_runtime_mut(&mut self.fields);
            }
        }

        impl $crate::contract::Effect for $t {
            fn as_any(&self) -> &dyn ::std::any::Any {
                return self;
            }

            fn as_any_mut(&mut self) -> &mut dyn ::std::any::Any {
                return self;
            }

            fn effect_fields(&self) -> &$crate::contract::EffectFields {
                return &self.fields;
            }

            fn effect_fields_mut(&mut self) -> &mut $crate::contract::EffectFields {
                return &mut self.fields;
            }

            fn effect_field_names(&self) -> &'static [&'static str] {
                return &[$($key),*];
            }

            fn clear_effect_field(&mut self, key: &str) -> bool {
                use $crate::contract::EffectProperty;
                match key {
                    $($key => self.$field.clear_effect_property(),)*
                    _ => self.fields.extra_fields.remove(key).is_some(),
                }
            }

            fn get_effect_field(&self, key: &str) -> Option<$crate::contract::EffectValue> {
                use $crate::contract::EffectProperty;
                match key {
                    $($key => self.$field.get_effect_property(),)*
                    _ => self.fields.extra_fields.get(key).cloned(),
                }
            }

            fn set_effect_field(&mut self, key: &str, value: $crate::contract::EffectValue) -> bool {
                use $crate::contract::EffectProperty;
                match key {
                    $($key => self.$field.set_effect_property(value),)*
                    _ => {
                        self.fields.extra_fields.insert(key.to_string(), value);
                        true
                    }
                }
            }
        }
    };
}
