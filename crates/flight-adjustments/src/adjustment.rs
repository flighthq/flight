use std::fmt;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Kind};

/// TS `ColorTransformFunction`: an rgb→rgb remap on normalized color, writing into `out`.
pub type ColorTransformFunction = Arc<dyn Fn(&mut [f32; 3], f32, f32, f32) + Send + Sync>;

/// The fields every adjustment shares (TS `Adjustment` plus the tier members `colorMatrix` of
/// `ColorMatrixAdjustment` and `transform` of `ColorLutAdjustment`). A kind struct composes this as a
/// private `fields` member and dereferences to it, so `adjustment.kind` and `adjustment.color_matrix`
/// read exactly like TS. Dispatch is structural: a present `color_matrix` makes an adjustment
/// matrix-tier, a present `transform` makes it LUT-tier, independent of `kind`.
#[derive(Clone, Default)]
pub struct AdjustmentFields {
    runtime: EntityRuntimeSlot,
    /// Open registry key: the canonical PascalCase type name; third parties use a vendor prefix.
    pub kind: Kind,
    // flight-lint: allow(conform-array) user-approved: fixed 4x5 color matrix buffer → Float32Array (D0 exception)
    pub color_matrix: Option<[f32; 20]>,
    pub transform: Option<ColorTransformFunction>,
}

/// Any adjustment (TS `Adjustment`, an open base contract). Concrete kinds implement it with
/// `flight_adjustments::impl_adjustment!`; heterogeneous stacks are `Vec<Ref<dyn Adjustment>>`.
pub trait Adjustment: flight_entity::Entity + Send + Sync {
    fn adjustment_fields(&self) -> &AdjustmentFields;
    fn adjustment_fields_mut(&mut self) -> &mut AdjustmentFields;
    /// Appends this adjustment's content as TS `JSON.stringify` would see it: `kind`, then
    /// `colorMatrix` when present, then every public kind field in declaration order, omitting unset
    /// optional fields and the `transform` function. Evaluated at cache-key time, so it always
    /// reflects the current field values.
    fn write_adjustment_signature(&self, out: &mut String);
}

/// A value that can appear in an adjustment's cache signature, serialized as TS `JSON.stringify`
/// would serialize it. Implemented for the field types kind structs use; custom kinds may implement
/// it for their own field types.
pub trait AdjustmentSignatureValue {
    fn write_adjustment_signature_value(&self, out: &mut String);

    /// Writes `,"key":value`, or nothing when the value is absent (an unset optional field).
    fn write_adjustment_signature_entry(&self, key: &str, out: &mut String) {
        out.push_str(",\"");
        out.push_str(key);
        out.push_str("\":");
        self.write_adjustment_signature_value(out);
    }
}

pub fn initialize_adjustment<T: Adjustment>(out: &mut T, kind: &str) {
    out.adjustment_fields_mut().kind = kind.to_string();
}

/// Implements `Adjustment`, `Entity` and `Deref`/`DerefMut<Target = AdjustmentFields>` for a kind
/// struct with a private `fields: AdjustmentFields` member. List every public kind field as
/// `"jsonKey" => field_name`, in declaration order, so the cache signature observes all of them.
#[macro_export]
macro_rules! impl_adjustment {
    ($t:ty $(, $key:literal => $field:ident)* $(,)?) => {
        impl ::std::ops::Deref for $t {
            type Target = $crate::contract::AdjustmentFields;

            fn deref(&self) -> &$crate::contract::AdjustmentFields {
                return &self.fields;
            }
        }

        impl ::std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut $crate::contract::AdjustmentFields {
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

        impl $crate::contract::Adjustment for $t {
            fn adjustment_fields(&self) -> &$crate::contract::AdjustmentFields {
                return &self.fields;
            }

            fn adjustment_fields_mut(&mut self) -> &mut $crate::contract::AdjustmentFields {
                return &mut self.fields;
            }

            fn write_adjustment_signature(&self, out: &mut String) {
                use $crate::contract::AdjustmentSignatureValue;
                out.push_str("{\"kind\":");
                self.fields.kind.write_adjustment_signature_value(out);
                self.fields.color_matrix.write_adjustment_signature_entry("colorMatrix", out);
                $( self.$field.write_adjustment_signature_entry($key, out); )*
                out.push('}');
            }
        }
    };
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of a number); runtime infrastructure, not sugar
impl AdjustmentSignatureValue for f32 {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        if !self.is_finite() {
            out.push_str("null");
        } else if *self == 0.0 {
            out.push('0');
        } else {
            out.push_str(&self.to_string());
        }
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of a number); runtime infrastructure, not sugar
impl AdjustmentSignatureValue for u32 {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        out.push_str(&self.to_string());
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of a boolean); runtime infrastructure, not sugar
impl AdjustmentSignatureValue for bool {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        out.push_str(if *self { "true" } else { "false" });
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of a string, with JSON escaping); runtime infrastructure, not sugar
impl AdjustmentSignatureValue for String {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        out.push('"');
        for c in self.chars() {
            match c {
                '"' => out.push_str("\\\""),
                '\\' => out.push_str("\\\\"),
                '\n' => out.push_str("\\n"),
                '\r' => out.push_str("\\r"),
                '\t' => out.push_str("\\t"),
                c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                c => out.push(c),
            }
        }
        out.push('"');
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of a numeric array); runtime infrastructure, not sugar
impl<const N: usize> AdjustmentSignatureValue for [f32; N] {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        out.push('[');
        for (i, v) in self.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            v.write_adjustment_signature_value(out);
        }
        out.push(']');
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify omits undefined fields); runtime infrastructure, not sugar
impl<T: AdjustmentSignatureValue> AdjustmentSignatureValue for Option<T> {
    fn write_adjustment_signature_entry(&self, key: &str, out: &mut String) {
        if let Some(value) = self {
            value.write_adjustment_signature_entry(key, out);
        }
    }

    fn write_adjustment_signature_value(&self, out: &mut String) {
        match self {
            Some(value) => value.write_adjustment_signature_value(out),
            None => out.push_str("null"),
        }
    }
}

impl fmt::Debug for AdjustmentFields {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("AdjustmentFields")
            .field("kind", &self.kind)
            .field("color_matrix", &self.color_matrix)
            .field("transform", &self.transform.as_ref().map(|_| "<fn>"))
            .finish();
    }
}

flight_entity::impl_entity!(AdjustmentFields);
