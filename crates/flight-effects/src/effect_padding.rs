// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use std::sync::Arc;

use flight_entity::{Kind, UnknownValue};
use flight_registry::{KindMap, with_kind_map_entry, without_kind_map_entry};
use flight_render::{
    EffectPadding, EffectPaddingResolver, RenderRegistryTable, RenderState,
    emit_render_registry_miss,
};

use crate::contract::{Effect, EffectPaddingStatus, EffectRef};

#[derive(Clone, Debug, PartialEq)]
pub struct EffectPaddingExplanation {
    pub missing_kinds: Vec<Kind>,
    pub padding: EffectPadding,
    pub status: EffectPaddingStatus,
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_effect_padding<S: RenderState>(
    out: &mut EffectPadding,
    state: &mut S,
    effects: &[EffectRef],
) {
    write_effect_padding(out, state, effects, None, true);
}

fn empty_resolver_map() -> KindMap<EffectPaddingResolver> {
    return KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn explain_effect_padding<S: RenderState>(
    out: &mut EffectPaddingExplanation,
    state: &mut S,
    effects: &[EffectRef],
) {
    out.missing_kinds.clear();
    write_effect_padding(
        &mut out.padding,
        state,
        effects,
        Some(&mut out.missing_kinds),
        false,
    );
    out.status = if out.missing_kinds.is_empty() {
        EffectPaddingStatus::Complete
    } else {
        EffectPaddingStatus::MissingResolver
    };
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_directional_effect_padding(
    out: &mut EffectPadding,
    blur_x: f32,
    blur_y: f32,
    offset_x: f32,
    offset_y: f32,
) {
    get_gaussian_effect_padding(out, blur_x, blur_y);
    let dx = if offset_x.abs() < 1e-10 {
        0.0
    } else {
        offset_x
    };
    let dy = if offset_y.abs() < 1e-10 {
        0.0
    } else {
        offset_y
    };
    out.bottom = (out.bottom + dy.max(0.0)).ceil();
    out.left = (out.left + (-dx).max(0.0)).ceil();
    out.right = (out.right + dx.max(0.0)).ceil();
    out.top = (out.top + (-dy).max(0.0)).ceil();
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_gaussian_effect_padding(out: &mut EffectPadding, blur_x: f32, blur_y: f32) {
    let horizontal = (blur_x.max(0.0) * 3.0).ceil();
    let vertical = (blur_y.max(0.0) * 3.0).ceil();
    out.bottom = vertical;
    out.left = horizontal;
    out.right = horizontal;
    out.top = vertical;
}

pub fn register_effect_padding_resolver<S: RenderState>(
    state: &mut S,
    kind: &str,
    resolver: Option<EffectPaddingResolver>,
) {
    let registries = state.render_registries_mut();
    if let Some(resolver) = resolver {
        let table = registries
            .effect_padding_resolvers
            .as_deref()
            .cloned()
            .unwrap_or_else(empty_resolver_map);
        registries.effect_padding_resolvers = Some(Arc::new(with_kind_map_entry(
            &table,
            kind.to_string(),
            resolver,
        )));
    } else if let Some(table) = registries.effect_padding_resolvers.as_deref() {
        registries.effect_padding_resolvers =
            Some(Arc::new(without_kind_map_entry(table, kind.to_string())));
    }
}

pub(crate) fn resolve_typed_effect_padding<T: Effect + 'static>(
    value: &UnknownValue,
    get_padding: fn(&mut EffectPadding, &T),
) -> EffectPadding {
    let Some(effect) = value.downcast_ref::<EffectRef>() else {
        return zero_effect_padding();
    };
    let guard = effect.read().unwrap();
    let Some(effect) = guard.as_any().downcast_ref::<T>() else {
        return zero_effect_padding();
    };
    let mut out = zero_effect_padding();
    get_padding(&mut out, effect);
    return out;
}

fn sanitize_padding(value: f32) -> f32 {
    return if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    };
}

fn write_effect_padding<S: RenderState>(
    out: &mut EffectPadding,
    state: &mut S,
    effects: &[EffectRef],
    mut missing_kinds: Option<&mut Vec<Kind>>,
    emit_misses: bool,
) {
    let mut bottom = 0.0;
    let mut left = 0.0;
    let mut right = 0.0;
    let mut top = 0.0;
    for (index, effect) in effects.iter().enumerate() {
        let kind = effect.read().unwrap().effect_fields().kind.clone();
        let resolver = state
            .render_registries()
            .effect_padding_resolvers
            .as_ref()
            .and_then(|table| table.entries.get(&kind))
            .copied();
        let Some(resolver) = resolver else {
            let earlier = effects[..index]
                .iter()
                .any(|candidate| candidate.read().unwrap().effect_fields().kind == kind);
            if !earlier {
                if let Some(kinds) = missing_kinds.as_deref_mut() {
                    kinds.push(kind.clone());
                }
                if emit_misses {
                    emit_render_registry_miss(
                        state,
                        RenderRegistryTable::EffectPaddingResolver,
                        kind,
                    );
                }
            }
            continue;
        };
        let value: UnknownValue = Arc::new(effect.clone());
        let padding = resolver(&value);
        bottom += sanitize_padding(padding.bottom);
        left += sanitize_padding(padding.left);
        right += sanitize_padding(padding.right);
        top += sanitize_padding(padding.top);
    }
    out.bottom = bottom;
    out.left = left;
    out.right = right;
    out.top = top;
}

pub(crate) fn zero_effect_padding() -> EffectPadding {
    return EffectPadding {
        bottom: 0.0,
        left: 0.0,
        right: 0.0,
        top: 0.0,
    };
}

impl Default for EffectPaddingExplanation {
    fn default() -> Self {
        return Self {
            missing_kinds: Vec::new(),
            padding: zero_effect_padding(),
            status: EffectPaddingStatus::Complete,
        };
    }
}
