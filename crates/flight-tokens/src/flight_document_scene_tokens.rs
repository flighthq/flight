// flight-lint: allow-file(f64) D1: token values are document (JavaScript Number) values
//! Explicit mode resolution of a scene's token table (TS `flightDocumentSceneTokens.ts`).

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use flight_entity::{Kind, Record, allocate_entity, get_record_value, set_record_value};
use flight_registry::{KindMap, with_kind_map_entry};
use flight_scene_document::contract::create_flight_document_refusal_explanation;
use flight_scene_document::{
    FlightDocumentRefusalExplanation, FlightDocumentRefusalReason, FlightDocumentScene,
    FlightDocumentToken, FlightDocumentTokenResolution, FlightDocumentTokenResolver,
    FlightDocumentTokenResolverRegistry, FlightDocumentValue,
};

use crate::flight_document_token_reference::{
    INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE, is_flight_document_token_reference,
    read_flight_document_token_reference_key, substitute_flight_document_token_value,
};

const DEFAULT_MODE: &str = "default";

struct TokenRow<'a> {
    index: usize,
    token: &'a FlightDocumentToken,
}

struct SceneTokenResolutionState<'a> {
    mode: &'a str,
    refusal: Option<FlightDocumentRefusalExplanation>,
    resolved: HashMap<String, FlightDocumentValue>,
    resolvers: Option<&'a FlightDocumentTokenResolverRegistry>,
    rows: HashMap<String, TokenRow<'a>>,
    visiting: HashSet<String>,
}

// One pass serves both exported seams so a refusal and a None can never disagree about the input.
struct SceneTokenReadResult {
    refusal: Option<FlightDocumentRefusalExplanation>,
    resolution: Option<FlightDocumentTokenResolution>,
}

/// Allocates the registry with the value kinds the SDK itself describes (TS
/// `createFlightDocumentTokenResolverRegistry`).
pub fn create_flight_document_token_resolver_registry() -> FlightDocumentTokenResolverRegistry {
    let mut out: FlightDocumentTokenResolverRegistry = allocate_entity();
    initialize_flight_document_token_resolver_registry(&mut out);
    return out;
}

/// Installs the built-in `Boolean`, `Color`, `Number` and `String` resolvers (TS
/// `initializeFlightDocumentTokenResolverRegistry`). A caller composes vendor kinds onto the table
/// with `with_kind_map_entry`; nothing is registered at module scope, so a caller that never asks
/// for the built-ins never pays for them.
pub fn initialize_flight_document_token_resolver_registry(
    out: &mut FlightDocumentTokenResolverRegistry,
) {
    let mut resolvers: KindMap<FlightDocumentTokenResolver> = KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
    resolvers = with_kind_map_entry(
        &resolvers,
        "Boolean".to_string(),
        Arc::new(resolve_boolean_token_value),
    );
    resolvers = with_kind_map_entry(
        &resolvers,
        "Color".to_string(),
        Arc::new(resolve_color_token_value),
    );
    resolvers = with_kind_map_entry(
        &resolvers,
        "Number".to_string(),
        Arc::new(resolve_number_token_value),
    );
    resolvers = with_kind_map_entry(
        &resolvers,
        "String".to_string(),
        Arc::new(resolve_string_token_value),
    );
    out.resolvers = resolvers;
}

/// The first refusal resolving `scene`'s tokens for `mode` would meet, or `None` when every token
/// resolves (TS `explainFlightDocumentSceneTokenResolution`).
pub fn explain_flight_document_scene_token_resolution(
    scene: &FlightDocumentScene,
    mode: &str,
    resolvers: Option<&FlightDocumentTokenResolverRegistry>,
) -> Option<FlightDocumentRefusalExplanation> {
    return read_scene_tokens(scene, mode, resolvers).refusal;
}

fn read_scene_tokens(
    scene: &FlightDocumentScene,
    mode: &str,
    resolvers: Option<&FlightDocumentTokenResolverRegistry>,
) -> SceneTokenReadResult {
    let tokens = match scene {
        FlightDocumentScene::Scene2D(entry) => &entry.tokens,
        FlightDocumentScene::Scene3D(entry) => &entry.tokens,
    };
    let mut rows = HashMap::new();
    for (index, token) in tokens.iter().enumerate() {
        // A later row with the same key replaces the earlier one, as the source's Map.set.
        rows.insert(token.key.clone(), TokenRow { index, token });
    }
    let state = RefCell::new(SceneTokenResolutionState {
        mode,
        refusal: None,
        resolved: HashMap::new(),
        resolvers,
        rows,
        visiting: HashSet::new(),
    });
    let mut values: Record<FlightDocumentValue> = Record::default();
    for token in tokens {
        let Some(resolved) = resolve_token_key(&token.key, &state, "") else {
            return SceneTokenReadResult {
                refusal: state.into_inner().refusal,
                resolution: None,
            };
        };
        set_record_value(&mut values, token.key.clone(), resolved);
    }
    return SceneTokenReadResult {
        refusal: None,
        resolution: Some(FlightDocumentTokenResolution {
            mode: mode.to_string(),
            values,
        }),
    };
}

// Records the FIRST refusal only (the source's `??=`) and returns the invalid sentinel.
fn refuse(
    state: &RefCell<SceneTokenResolutionState>,
    reason: FlightDocumentRefusalReason,
    path: &str,
    token_key: Option<&str>,
    mode: Option<&str>,
    kind: Option<&Kind>,
) -> Option<FlightDocumentValue> {
    let mut current = state.borrow_mut();
    if current.refusal.is_none() {
        let mut out = create_flight_document_refusal_explanation();
        out.kind = kind.cloned();
        out.mode = mode.map(str::to_string);
        out.path = path.to_string();
        out.reason = reason;
        out.token_key = token_key.map(str::to_string);
        current.refusal = Some(out);
    }
    return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
}

// A whole-value reference is an ALIAS: it names another token of the same semantic type, so the
// kinds must agree. A reference nested inside a composite value is an ordinary value substitution
// and carries no such claim: the field it fills is not the token's own type.
fn resolve_alias(
    authored: &FlightDocumentValue,
    token: &FlightDocumentToken,
    path: &str,
    state: &RefCell<SceneTokenResolutionState>,
) -> Option<FlightDocumentValue> {
    let FlightDocumentValue::String(text) = authored else {
        return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
    };
    let Some(target) = read_flight_document_token_reference_key(text) else {
        return refuse(
            state,
            FlightDocumentRefusalReason::TokenReferenceInvalid,
            path,
            Some(&token.key),
            None,
            Some(&token.kind),
        );
    };
    let mismatch = {
        let current = state.borrow();
        current
            .rows
            .get(&target)
            .filter(|row| row.token.kind != token.kind)
            .map(|row| (row.index, row.token.kind.clone()))
    };
    if let Some((index, kind)) = mismatch {
        let kind_path = format!("tokens[{}].kind", index);
        return refuse(
            state,
            FlightDocumentRefusalReason::TokenKindMismatch,
            &kind_path,
            Some(&target),
            None,
            Some(&kind),
        );
    }
    return resolve_token_key(&target, state, path);
}

fn resolve_boolean_token_value(
    value: &FlightDocumentValue,
    _token: &FlightDocumentToken,
) -> Option<FlightDocumentValue> {
    return match value {
        FlightDocumentValue::Boolean(_) => Some(value.clone()),
        _ => None,
    };
}

// Packed sRGB RGBA, matching the SDK-wide colour convention: one unsigned 32-bit integer, never a
// float and never a separate alpha.
fn resolve_color_token_value(
    value: &FlightDocumentValue,
    _token: &FlightDocumentToken,
) -> Option<FlightDocumentValue> {
    return match value {
        FlightDocumentValue::Number(number)
            if number.fract() == 0.0 && *number >= 0.0 && *number <= 4_294_967_295.0 =>
        {
            Some(value.clone())
        }
        _ => None,
    };
}

/// Every token of `scene` fully dereferenced for `mode` (falling back to `default` per token), or
/// `None` wherever the explain seam reports a refusal (TS `resolveFlightDocumentSceneTokens`).
/// Without a resolver registry every kind is refused.
pub fn resolve_flight_document_scene_tokens(
    scene: &FlightDocumentScene,
    mode: &str,
    resolvers: Option<&FlightDocumentTokenResolverRegistry>,
) -> Option<FlightDocumentTokenResolution> {
    return read_scene_tokens(scene, mode, resolvers).resolution;
}

fn resolve_number_token_value(
    value: &FlightDocumentValue,
    _token: &FlightDocumentToken,
) -> Option<FlightDocumentValue> {
    return match value {
        FlightDocumentValue::Number(number) if number.is_finite() => Some(value.clone()),
        _ => None,
    };
}

fn resolve_string_token_value(
    value: &FlightDocumentValue,
    _token: &FlightDocumentToken,
) -> Option<FlightDocumentValue> {
    return match value {
        FlightDocumentValue::String(_) => Some(value.clone()),
        _ => None,
    };
}

// Resolves one token to its concrete value for the requested mode, following an alias chain
// through the same mode. Memoized so a diamond of aliases costs one resolution per token, and
// guarded by a visiting set so a cycle is named instead of recursing until the stack ends. No
// borrow of `state` is held across a recursive call.
fn resolve_token_key(
    key: &str,
    state: &RefCell<SceneTokenResolutionState>,
    referenced_from: &str,
) -> Option<FlightDocumentValue> {
    let (index, token, resolver, mode, authored) = {
        let current = state.borrow();
        if let Some(memo) = current.resolved.get(key) {
            return Some(memo.clone());
        }
        let Some(row) = current.rows.get(key) else {
            drop(current);
            return refuse(
                state,
                FlightDocumentRefusalReason::TokenUnresolved,
                referenced_from,
                Some(key),
                None,
                None,
            );
        };
        let (index, token) = (row.index, row.token);
        let path = format!("tokens[{}]", index);
        if current.visiting.contains(key) {
            drop(current);
            return refuse(
                state,
                FlightDocumentRefusalReason::TokenReferenceCycle,
                &path,
                Some(key),
                None,
                Some(&token.kind),
            );
        }
        let resolver = current
            .resolvers
            .and_then(|registry| registry.resolvers.entries.get(&token.kind).cloned());
        let Some(resolver) = resolver else {
            drop(current);
            let kind_path = format!("{}.kind", path);
            return refuse(
                state,
                FlightDocumentRefusalReason::TokenResolverUnregistered,
                &kind_path,
                Some(key),
                None,
                Some(&token.kind),
            );
        };
        let mode = if get_record_value(&token.values, current.mode).is_some() {
            current.mode.to_string()
        } else {
            DEFAULT_MODE.to_string()
        };
        let Some(authored) = get_record_value(&token.values, &mode) else {
            let requested = current.mode.to_string();
            drop(current);
            return refuse(
                state,
                FlightDocumentRefusalReason::TokenModeUnresolved,
                &path,
                Some(key),
                Some(&requested),
                Some(&token.kind),
            );
        };
        (index, token, resolver, mode, authored)
    };
    let mode_path = format!("tokens[{}].{}", index, mode);
    state.borrow_mut().visiting.insert(key.to_string());
    let substituted = if is_flight_document_token_reference(authored) {
        resolve_alias(authored, token, &mode_path, state)
    } else {
        substitute_flight_document_token_value(
            authored,
            &mode_path,
            &mut |reference: &str, at: &str| resolve_token_key(reference, state, at),
            &mut |at: &str| {
                refuse(
                    state,
                    FlightDocumentRefusalReason::TokenReferenceInvalid,
                    at,
                    None,
                    None,
                    None,
                );
            },
        )
    };
    state.borrow_mut().visiting.remove(key);
    let substituted = substituted?;
    let Some(value) = resolver(&substituted, token) else {
        return refuse(
            state,
            FlightDocumentRefusalReason::TokenValueInvalid,
            &mode_path,
            Some(key),
            Some(&mode),
            Some(&token.kind),
        );
    };
    state
        .borrow_mut()
        .resolved
        .insert(key.to_string(), value.clone());
    return Some(value);
}
