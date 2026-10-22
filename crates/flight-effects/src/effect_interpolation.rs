use std::collections::HashSet;
use std::sync::Arc;

use flight_color::lerp_color;

use crate::contract::{
    Effect, EffectFieldRole, EffectFieldRoles, EffectKindFieldRoles, EffectRef, EffectValue,
};

enum InterpolatedEffectValue {
    Ignore,
    Write(Option<EffectValue>),
}

pub const EFFECT_FIELD_ROLES: &[EffectKindFieldRoles] = &[
    EffectKindFieldRoles {
        kind: "BevelEffect",
        fields: &[
            ("highlightColor", EffectFieldRole::PackedColor),
            ("shadowColor", EffectFieldRole::PackedColor),
        ],
    },
    EffectKindFieldRoles {
        kind: "ConvolutionEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "DropShadowEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "InnerGlowEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "InnerShadowEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "OuterGlowEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "OutlineEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "ScreenSpaceFogEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "VignetteEffect",
        fields: &[("color", EffectFieldRole::PackedColor)],
    },
    EffectKindFieldRoles {
        kind: "VolumetricLightEffect",
        fields: &[("lightColor", EffectFieldRole::PackedColor)],
    },
];

pub fn can_lerp_effects(a: &EffectRef, b: &EffectRef) -> bool {
    return a.read().unwrap().effect_fields().kind == b.read().unwrap().effect_fields().kind;
}

// flight-lint: allow(hashmap-iteration) The set only deduplicates structural field names;
// assignment order is unobservable because fields have no setters or callbacks.
fn collect_keys(a: &dyn Effect, b: &dyn Effect) -> HashSet<String> {
    let mut keys = HashSet::new();
    keys.extend(
        a.effect_field_names()
            .iter()
            .map(|value| (*value).to_string()),
    );
    keys.extend(
        b.effect_field_names()
            .iter()
            .map(|value| (*value).to_string()),
    );
    keys.extend(a.effect_fields().extra_fields.keys().cloned());
    keys.extend(b.effect_fields().extra_fields.keys().cloned());
    return keys;
}

fn interpolate_value(
    a: Option<EffectValue>,
    b: Option<EffectValue>,
    t: f32,
    packed_color: bool,
) -> InterpolatedEffectValue {
    return match (a, b) {
        (Some(EffectValue::Number(a)), Some(EffectValue::Number(b))) => {
            InterpolatedEffectValue::Write(Some(EffectValue::Number(a + (b - a) * t)))
        }
        (Some(EffectValue::Color(a)), Some(EffectValue::Color(b))) if packed_color => {
            InterpolatedEffectValue::Write(Some(EffectValue::Color(lerp_color(a, b, t))))
        }
        (Some(EffectValue::Color(a)), Some(EffectValue::Color(b))) => {
            let value = if t <= 0.0 {
                a
            } else if t >= 1.0 {
                b
            } else {
                (a as f32 + (b as f32 - a as f32) * t).round() as u32
            };
            InterpolatedEffectValue::Write(Some(EffectValue::Color(value)))
        }
        (Some(EffectValue::Boolean(a)), Some(EffectValue::Boolean(b))) => {
            InterpolatedEffectValue::Write(Some(EffectValue::Boolean(if t < 0.5 { a } else { b })))
        }
        (Some(EffectValue::Text(a)), Some(EffectValue::Text(b))) => {
            InterpolatedEffectValue::Write(Some(EffectValue::Text(if t < 0.5 { a } else { b })))
        }
        (Some(EffectValue::ImageChannel(a)), Some(EffectValue::ImageChannel(b))) => {
            InterpolatedEffectValue::Write(Some(EffectValue::ImageChannel(if t < 0.5 {
                a
            } else {
                b
            })))
        }
        (a, b)
            if a.as_ref().is_some_and(is_interpolated_value)
                || b.as_ref().is_some_and(is_interpolated_value) =>
        {
            InterpolatedEffectValue::Write(if t < 0.5 { a } else { b })
        }
        _ => InterpolatedEffectValue::Ignore,
    };
}

fn is_interpolated_value(value: &EffectValue) -> bool {
    return matches!(
        value,
        EffectValue::Boolean(_)
            | EffectValue::Color(_)
            | EffectValue::ImageChannel(_)
            | EffectValue::Number(_)
            | EffectValue::Text(_)
    );
}

fn is_packed_color(roles: &EffectFieldRoles, kind: &str, key: &str) -> bool {
    return roles
        .iter()
        .find(|entry| entry.kind == kind)
        .is_some_and(|entry| {
            entry
                .fields
                .iter()
                .any(|(field, role)| *field == key && *role == EffectFieldRole::PackedColor)
        });
}

// flight-lint: allow(hashmap-iteration) Every unique field is written once and field writes have
// no callback or ordering side effect.
pub fn lerp_effect(
    a: &EffectRef,
    b: &EffectRef,
    t: f32,
    out: &EffectRef,
    roles: Option<&EffectFieldRoles>,
) -> bool {
    let a_kind = a.read().unwrap().effect_fields().kind.clone();
    if a_kind != b.read().unwrap().effect_fields().kind {
        return false;
    }
    let tc = t.clamp(0.0, 1.0);
    if Arc::ptr_eq(a, b) {
        return true;
    }
    if Arc::ptr_eq(a, out) {
        let mut a_guard = a.write().unwrap();
        let b_guard = b.read().unwrap();
        lerp_locked(
            &mut *a_guard,
            &*b_guard,
            tc,
            &a_kind,
            roles.unwrap_or(EFFECT_FIELD_ROLES),
        );
        return true;
    }
    if Arc::ptr_eq(b, out) {
        let a_guard = a.read().unwrap();
        let mut b_guard = b.write().unwrap();
        let mut keys = collect_keys(&*a_guard, &*b_guard);
        for key in keys.drain() {
            let value = interpolate_value(
                a_guard.get_effect_field(&key),
                b_guard.get_effect_field(&key),
                tc,
                is_packed_color(roles.unwrap_or(EFFECT_FIELD_ROLES), &a_kind, &key),
            );
            if let InterpolatedEffectValue::Write(value) = value {
                write_value(&mut *b_guard, &key, value);
            }
        }
        return true;
    }
    let a_guard = a.read().unwrap();
    let b_guard = b.read().unwrap();
    let mut out_guard = out.write().unwrap();
    let mut keys = collect_keys(&*a_guard, &*b_guard);
    for key in keys.drain() {
        let value = interpolate_value(
            a_guard.get_effect_field(&key),
            b_guard.get_effect_field(&key),
            tc,
            is_packed_color(roles.unwrap_or(EFFECT_FIELD_ROLES), &a_kind, &key),
        );
        if let InterpolatedEffectValue::Write(value) = value {
            write_value(&mut *out_guard, &key, value);
        }
    }
    return true;
}

// flight-lint: allow(hashmap-iteration) Every unique field is written once and field writes have
// no callback or ordering side effect.
fn lerp_locked(a: &mut dyn Effect, b: &dyn Effect, t: f32, kind: &str, roles: &EffectFieldRoles) {
    let mut keys = collect_keys(a, b);
    for key in keys.drain() {
        let value = interpolate_value(
            a.get_effect_field(&key),
            b.get_effect_field(&key),
            t,
            is_packed_color(roles, kind, &key),
        );
        if let InterpolatedEffectValue::Write(value) = value {
            write_value(a, &key, value);
        }
    }
}

fn write_value(out: &mut dyn Effect, key: &str, value: Option<EffectValue>) {
    if let Some(value) = value {
        out.set_effect_field(key, value);
    } else {
        out.clear_effect_field(key);
    }
}
