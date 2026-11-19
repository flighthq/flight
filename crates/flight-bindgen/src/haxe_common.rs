use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::ffi_surface::{
    FfiSignature, FfiSurface, FieldAccess, NativeNodeCarrier, contains_ffi_symbol,
    declaration_matches_ffi_surface, get_ffi_field_access, has_native_ffi_symbol,
    has_retained_callback_carrier, native_node_carrier, symbol_has_native_node,
};
use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case, to_pascal_case,
};

#[cfg(test)]
mod portable_module_tests {
    use super::*;

    #[test]
    fn node_handle_sources_are_nominal_typed_and_keep_raw_and_invalidating_setters_distinct() {
        for (package, target) in [
            ("flight._hl", NativeNodeTarget::Hl),
            ("flight._cpp", NativeNodeTarget::Cpp),
        ] {
            let node = flight_node_source(package, target);
            let array = flight_node_array_source(package, target);
            assert!(!node.contains("Dynamic"), "{node}");
            assert!(!array.contains("Dynamic"), "{array}");
            for typed in [
                format!("node:{package}.FlightNode"),
                format!("a:{package}.FlightNode"),
                format!("array:{package}.FlightNodeArray"),
            ] {
                assert!(node.contains(&typed) || array.contains(&typed), "{typed}");
            }
            for symbol in [
                "flight_node_equals",
                "flight_free_node",
                "flight_set_node_enabled_field",
                "flight_set_node_enabled",
                "flight_set_node3d_alpha_field",
                "flight_set_node3d_alpha",
                "flight_set_node2d_clip",
            ] {
                assert!(node.contains(symbol), "{package} lacks {symbol}");
            }
            for symbol in [
                "flight_node_array_create",
                "flight_node_array_get",
                "flight_node_array_push",
                "flight_free_node_array",
            ] {
                assert!(array.contains(symbol), "{package} lacks {symbol}");
            }
        }
    }

    #[test]
    fn facades_use_canonical_sdk_type_case() {
        for (module, ty) in [
            ("motionpath", "MotionPath"),
            ("movieclip", "MovieClip"),
            ("physics2d-abi", "Physics2DAbi"),
            ("physics3d-abi", "Physics3DAbi"),
            ("quadbatch", "QuadBatch"),
            ("scene2d", "Scene2D"),
            ("skeleton2d", "Skeleton2D"),
            ("textsegment", "TextSegment"),
            ("textureatlas", "TextureAtlas"),
        ] {
            let types = BTreeSet::from([ty.to_string()]);
            assert_eq!(crate_dir_to_module(&format!("flight-{module}"), &types), ty);
        }
        assert_eq!(
            crate_dir_to_module("flight-geometry", &BTreeSet::new()),
            "Geometry"
        );
    }
    // A correct getter, plus one function the fixture header lowers differently (a status bool).
    const POLICY_HEADER: &str = "float flight_get_audio_bus_gain(void * arg0);\n\
        bool flight_visit_audio_bus(void * arg0);\n\
        float flight_set_audio_bus_gain(void * arg0, void * arg1, void * arg2, float arg3);";
    const POLICY_HL: &str = "DEFINE_PRIM(_F32, flight_get_audio_bus_gain, _BYTES);\n\
        DEFINE_PRIM(_BOOL, flight_visit_audio_bus, _BYTES);\n\
        DEFINE_PRIM(_F32, flight_set_audio_bus_gain, _BYTES _BYTES _BYTES _F32);";

    fn policy_surface(header: &str, hl: &str) -> FfiSurface {
        return FfiSurface {
            c: crate::ffi_surface::parse_ffi_header(header),
            hl: crate::ffi_surface::parse_hl_primitives(hl),
            native_skips: BTreeSet::new(),
        };
    }

    fn policy_exports() -> Vec<CrateExports> {
        let function = |name: &str, ret: Option<&str>| ParsedFn {
            name: name.into(),
            source_name: Some(name.into()),
            params: vec![crate::parse::Param {
                name: "bus".into(),
                ty: "&AudioBus".into(),
            }],
            ret: ret.map(str::to_string),
        };
        return vec![CrateExports {
            dir_name: "flight-audio".into(),
            fns: vec![
                function("get_audio_bus_gain", Some("f32")),
                function("visit_audio_bus", None),
            ],
            structs: vec![ParsedStruct {
                name: "AudioBus".into(),
                fields: vec![crate::parse::StructField {
                    name: "gain".into(),
                    ty: "f32".into(),
                }],
            }],
            enums: vec![],
        }];
    }

    const POLICY_SKIPS: &[(&str, &str)] = &[("visit_audio_bus", "status bool around the visit")];
    const POLICY_NEVER: &[(&str, &str)] = &[("AudioBus.gain:set", "mixer SDK setter")];

    #[test]
    fn native_binding_policy_accepts_exactly_the_reviewed_tables() {
        let mut surface = policy_surface(POLICY_HEADER, POLICY_HL);
        let result = enforce_native_binding_policy(
            &policy_exports(),
            &mut surface,
            POLICY_SKIPS,
            POLICY_NEVER,
            &[],
        );
        assert_eq!(result, Ok(()));
        assert_eq!(
            surface.native_skips,
            BTreeSet::from(["flight_visit_audio_bus".to_string()])
        );
        assert!(has_native_ffi_function(
            "get_audio_bus_gain",
            Some(&surface)
        ));
        assert!(!has_native_ffi_function("visit_audio_bus", Some(&surface)));
        assert!(has_ffi_function("visit_audio_bus", Some(&surface)));
    }
    #[test]
    fn native_binding_policy_fails_when_c_and_hl_carriers_change() {
        let header = POLICY_HEADER.replace(
            "float flight_get_audio_bus_gain(void * arg0);",
            "double flight_get_audio_bus_gain(void * arg0, void * arg1);",
        );
        let hl = POLICY_HL.replace(
            "DEFINE_PRIM(_F32, flight_get_audio_bus_gain, _BYTES);",
            "DEFINE_PRIM(_F64, flight_get_audio_bus_gain, _BYTES _BYTES);",
        );
        let mut surface = policy_surface(&header, &hl);
        let errors = enforce_native_binding_policy(
            &policy_exports(),
            &mut surface,
            POLICY_SKIPS,
            POLICY_NEVER,
            &[],
        )
        .unwrap_err();
        assert!(
            errors.iter().any(|e| e
                .starts_with("unexpected native skip flight_get_audio_bus_gain: generic _hl+_cpp")),
            "{errors:?}"
        );
        assert!(surface.native_skips.is_empty());
    }
    #[test]
    fn native_binding_policy_fails_when_only_the_hl_carrier_changes() {
        let hl = POLICY_HL.replace(
            "DEFINE_PRIM(_F32, flight_get_audio_bus_gain, _BYTES);",
            "DEFINE_PRIM(_F64, flight_get_audio_bus_gain, _BYTES);",
        );
        let mut surface = policy_surface(POLICY_HEADER, &hl);
        let errors = enforce_native_binding_policy(
            &policy_exports(),
            &mut surface,
            POLICY_SKIPS,
            POLICY_NEVER,
            &[],
        )
        .unwrap_err();
        assert_eq!(
            errors,
            [
                "unexpected native skip flight_get_audio_bus_gain: generic _hl extern disagrees with flight-ffi",
                "unexpected never accessor AudioBus.gain:get: native symbol exists without accessor shape",
            ]
        );
    }
    #[test]
    fn native_binding_policy_fails_when_an_accessor_carrier_drifts_on_hashlink_only() {
        let hl = POLICY_HL.replace(
            "DEFINE_PRIM(_F32, flight_get_audio_bus_gain, _BYTES);",
            "DEFINE_PRIM(_F64, flight_get_audio_bus_gain, _BYTES);",
        );
        let mut surface = policy_surface(POLICY_HEADER, &hl);
        // Only the auto-generated field accessor remains: no module function shares its symbol.
        let mut exports = policy_exports();
        exports[0]
            .fns
            .retain(|func| func.name != "get_audio_bus_gain");
        let errors =
            enforce_native_binding_policy(&exports, &mut surface, POLICY_SKIPS, POLICY_NEVER, &[])
                .unwrap_err();
        assert_eq!(
            errors,
            [
                "unexpected never accessor AudioBus.gain:get: native symbol exists without accessor shape"
            ]
        );
        assert!(surface.native_skips.is_empty());
    }
    #[test]
    fn native_binding_policy_fails_when_a_reviewed_skip_stops_applying() {
        let header = POLICY_HEADER.replace(
            "bool flight_visit_audio_bus(void * arg0);",
            "void flight_visit_audio_bus(void * arg0);",
        );
        let hl = POLICY_HL.replace(
            "DEFINE_PRIM(_BOOL, flight_visit_audio_bus, _BYTES);",
            "DEFINE_PRIM(_VOID, flight_visit_audio_bus, _BYTES);",
        );
        let mut surface = policy_surface(&header, &hl);
        let errors = enforce_native_binding_policy(
            &policy_exports(),
            &mut surface,
            POLICY_SKIPS,
            POLICY_NEVER,
            &[],
        )
        .unwrap_err();
        assert_eq!(errors.len(), 1, "{errors:?}");
        assert!(errors[0].starts_with("reviewed native skip flight_visit_audio_bus no longer"));
    }
    #[test]
    fn native_binding_policy_fails_on_unexpected_or_stale_never_accessors() {
        let mut surface = policy_surface(POLICY_HEADER, POLICY_HL);
        let unexpected =
            enforce_native_binding_policy(&policy_exports(), &mut surface, POLICY_SKIPS, &[], &[])
                .unwrap_err();
        assert_eq!(
            unexpected,
            [
                "unexpected never accessor AudioBus.gain:set: native symbol exists without accessor shape"
            ]
        );
        let stale_header = POLICY_HEADER.replace(
            "float flight_set_audio_bus_gain(void * arg0, void * arg1, void * arg2, float arg3);",
            "float flight_set_audio_bus_gain(void * arg0, float arg1);",
        );
        let stale_hl = POLICY_HL.replace("_BYTES _BYTES _BYTES _F32", "_BYTES _F32");
        let mut surface = policy_surface(&stale_header, &stale_hl);
        let stale = enforce_native_binding_policy(
            &policy_exports(),
            &mut surface,
            POLICY_SKIPS,
            POLICY_NEVER,
            &[],
        )
        .unwrap_err();
        assert_eq!(
            stale,
            ["reviewed never accessor AudioBus.gain:set no longer applies; update the table"]
        );
    }
    // flight_watch_audio_bus as flight-ffi lowers a retained listener: (fn, ctx, release).
    const CARRIER_HEADER: &str = "void * flight_watch_audio_bus(void * arg0, void (*arg1)(void *, void *), void * arg2, void (*arg3)(void *));";
    const CARRIER_HL: &str =
        "DEFINE_PRIM(_BYTES, flight_watch_audio_bus, _BYTES _BYTES _BYTES _BYTES);";
    const CARRIER_SKIPS: &[(&str, &str)] = &[
        ("visit_audio_bus", "status bool around the visit"),
        ("watch_audio_bus", "retained listener carrier"),
    ];

    fn carrier_policy_exports() -> Vec<CrateExports> {
        let mut exports = policy_exports();
        exports[0].fns.push(ParsedFn {
            name: "watch_audio_bus".into(),
            source_name: Some("watch_audio_bus".into()),
            params: vec![
                crate::parse::Param {
                    name: "bus".into(),
                    ty: "&AudioBus".into(),
                },
                crate::parse::Param {
                    name: "listener".into(),
                    ty: "Arc<dyn Fn(&AudioBus) + Send + Sync>".into(),
                },
            ],
            ret: Some("AudioBusWatch".into()),
        });
        return exports;
    }

    fn carrier_policy_surface(carrier_header: &str, carrier_hl: &str) -> FfiSurface {
        return policy_surface(
            &format!("{POLICY_HEADER}\n{carrier_header}"),
            &format!("{POLICY_HL}\n{carrier_hl}"),
        );
    }

    #[test]
    fn native_binding_policy_accepts_reviewed_retained_callback_carriers() {
        let mut surface = carrier_policy_surface(CARRIER_HEADER, CARRIER_HL);
        let result = enforce_native_binding_policy(
            &carrier_policy_exports(),
            &mut surface,
            CARRIER_SKIPS,
            POLICY_NEVER,
            &["watch_audio_bus"],
        );
        assert_eq!(result, Ok(()));
        assert!(surface.native_skips.contains("flight_watch_audio_bus"));
        assert!(!has_native_ffi_function("watch_audio_bus", Some(&surface)));
        assert!(has_ffi_function("watch_audio_bus", Some(&surface)));
    }
    #[test]
    fn native_binding_policy_fails_when_a_retained_callback_carrier_drifts() {
        // The release dropped on HashLink only, then on C as well: either way the wrapper still
        // disagrees with the generic extern, so only the carrier check notices.
        let hl_drift =
            CARRIER_HL.replace("_BYTES _BYTES _BYTES _BYTES", "_BYTES _BYTES _BYTES _I32");
        let c_drift = CARRIER_HEADER.replace("void (*arg3)(void *)", "void * arg3");
        for (header, hl) in [
            (CARRIER_HEADER, hl_drift.as_str()),
            (c_drift.as_str(), CARRIER_HL),
        ] {
            let mut surface = carrier_policy_surface(header, hl);
            let errors = enforce_native_binding_policy(
                &carrier_policy_exports(),
                &mut surface,
                CARRIER_SKIPS,
                POLICY_NEVER,
                &["watch_audio_bus"],
            )
            .unwrap_err();
            assert_eq!(
                errors,
                [
                    "retained-callback skip flight_watch_audio_bus no longer carries (fn, ctx, release) on C and HashLink; update the table"
                ]
            );
            assert!(surface.native_skips.is_empty());
        }
    }
    #[test]
    fn native_binding_policy_fails_when_a_carrier_skip_is_unreviewed_or_gone() {
        let mut surface = carrier_policy_surface(CARRIER_HEADER, CARRIER_HL);
        let unreviewed = enforce_native_binding_policy(
            &carrier_policy_exports(),
            &mut surface,
            CARRIER_SKIPS,
            POLICY_NEVER,
            &["visit_audio_bus", "watch_audio_bus"],
        )
        .unwrap_err();
        assert_eq!(
            unreviewed,
            [
                "retained-callback skip flight_visit_audio_bus no longer carries (fn, ctx, release) on C and HashLink; update the table"
            ]
        );
        let mut surface = carrier_policy_surface(CARRIER_HEADER, CARRIER_HL);
        let unlisted = enforce_native_binding_policy(
            &carrier_policy_exports(),
            &mut surface,
            CARRIER_SKIPS,
            POLICY_NEVER,
            &["watch_audio_bus", "watch_audio_mixer"],
        )
        .unwrap_err();
        assert_eq!(
            unlisted,
            [
                "retained-callback skip flight_watch_audio_mixer is not a reviewed native skip",
                "retained-callback skip flight_watch_audio_mixer no longer carries (fn, ctx, release) on C and HashLink; update the table",
            ]
        );
        let mut surface = policy_surface(POLICY_HEADER, POLICY_HL);
        let gone = enforce_native_binding_policy(
            &policy_exports(),
            &mut surface,
            CARRIER_SKIPS,
            POLICY_NEVER,
            &["watch_audio_bus"],
        )
        .unwrap_err();
        assert_eq!(
            gone,
            [
                "reviewed native skip flight_watch_audio_bus no longer disagrees (or is gone); update the table",
                "retained-callback skip flight_watch_audio_bus no longer carries (fn, ctx, release) on C and HashLink; update the table",
            ]
        );
    }
    #[test]
    fn reviewed_native_tables_are_exact_sorted_and_reasoned() {
        let skips: Vec<&str> = NATIVE_SKIPS.iter().map(|(name, _)| *name).collect();
        assert_eq!(
            skips,
            [
                "build_particle_color_curve",
                "collect_import_diagnostics",
                "connect_interaction_signal",
                "enable_audio_mixer_guards",
                "enable_bitmap_text_guards",
                "enable_camera_guards",
                "enable_collision_guards",
                "enable_easing_guards",
                "enable_flow_guards",
                "enable_geometry_pool_guards",
                "enable_movie_clip_guards",
                "enable_node_guards",
                "enable_physics2d_guards",
                "enable_scene2d_resource_failure_guards",
                "enable_snapshot_guards",
                "enable_socket_guards",
                "enable_text_bidi_guards",
                "enable_text_segment_guards",
                "enable_text_shaper_guards",
                "enable_texture_atlas_guards",
                "enable_tray_guards",
                "find_requirement_catalog_entries",
                "for_each_path_segment",
                "set_signal_timeout",
                "set_storage_items",
                "start_input_key_repeat_timer",
                "watch_geolocation_position",
                "watch_path",
            ]
        );
        let never: Vec<&str> = NATIVE_NEVER_ACCESSORS.iter().map(|(key, _)| *key).collect();
        assert_eq!(
            never,
            [
                "AnimationBlendTreeInput.weight:set",
                "AnimationLayer.weight:set",
                "AudioBus.gain:set",
                "AudioBus.muted:set",
                "AudioBus.pan:set",
                "AudioMixer.master_gain:set",
                "AudioMixer.master_muted:set",
                "Clock.scale:set",
                "MotionPath.distance:set",
                "TextureContainerLevel.byte_length:get",
                "VideoChannel.current_time:get",
                "VideoChannel.current_time:set",
                "VideoChannel.gain:set",
                "VideoChannel.muted:set",
                "VideoChannel.playback_rate:set",
            ]
        );
        for (name, reason) in NATIVE_SKIPS.iter().chain(NATIVE_NEVER_ACCESSORS) {
            assert!(!reason.trim().is_empty(), "{name} needs a reason");
        }
    }
    #[test]
    fn retained_callback_carrier_skips_are_exact_and_reasoned() {
        assert_eq!(
            RETAINED_CALLBACK_CARRIER_SKIPS,
            [
                "connect_interaction_signal",
                "enable_audio_mixer_guards",
                "enable_bitmap_text_guards",
                "enable_camera_guards",
                "enable_collision_guards",
                "enable_easing_guards",
                "enable_flow_guards",
                "enable_geometry_pool_guards",
                "enable_movie_clip_guards",
                "enable_node_guards",
                "enable_physics2d_guards",
                "enable_scene2d_resource_failure_guards",
                "enable_snapshot_guards",
                "enable_socket_guards",
                "enable_text_bidi_guards",
                "enable_text_segment_guards",
                "enable_text_shaper_guards",
                "enable_texture_atlas_guards",
                "enable_tray_guards",
                "set_signal_timeout",
                "start_input_key_repeat_timer",
                "watch_geolocation_position",
                "watch_path",
            ]
        );
        assert_eq!(RETAINED_CALLBACK_CARRIER_SKIPS.len(), 23);
        assert_eq!(
            RETAINED_CALLBACK_SKIP_REASON,
            "flight-ffi lowers the retained callback to a `(fn, ctx, release)` carrier; native binding awaits explicit bindgen callback/signal lowering"
        );
        assert_eq!(
            ROOTED_CONNECTION_SKIP_REASON,
            "flight-ffi lowers the retained slot to a `(fn, ctx, release)` carrier; deliberately unbound natively until a rooted connection abstraction is available"
        );
        for name in RETAINED_CALLBACK_CARRIER_SKIPS {
            let expected = if *name == "connect_interaction_signal" {
                ROOTED_CONNECTION_SKIP_REASON
            } else {
                RETAINED_CALLBACK_SKIP_REASON
            };
            let reasons: Vec<&str> = NATIVE_SKIPS
                .iter()
                .filter(|(skip, _)| skip == name)
                .map(|(_, reason)| *reason)
                .collect();
            assert_eq!(reasons, [expected], "{name}");
        }
        let carrier_reasoned = NATIVE_SKIPS
            .iter()
            .filter(|(_, reason)| reason.contains("(fn, ctx, release)"))
            .count();
        assert_eq!(carrier_reasoned, RETAINED_CALLBACK_CARRIER_SKIPS.len());
    }
    #[test]
    fn retained_callback_carrier_skips_are_exported_sdk_functions_with_retained_callbacks() {
        // Read from the scanned crates themselves: each carrier skip must still be a root-exported
        // function of exactly one scanned crate, and a reviewed skip takes a retained callback
        // (an `Arc<dyn Fn>`, spelled out or through a `pub type` alias) exactly when it is listed.
        let crates_dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let mut retained_aliases = BTreeSet::new();
        let mut owners: BTreeMap<String, Vec<(&str, ParsedFn)>> = BTreeMap::new();
        for dir_name in crate::parse::SCAN_CRATES {
            let src_dir = crates_dir.join(dir_name).join("src");
            for entry in fs::read_dir(&src_dir).unwrap() {
                let path = entry.unwrap().path();
                if path.extension().is_none_or(|ext| ext != "rs") {
                    continue;
                }
                for line in fs::read_to_string(&path).unwrap().lines() {
                    let Some(rest) = line.trim().strip_prefix("pub type ") else {
                        continue;
                    };
                    let Some((name, target)) = rest.split_once('=') else {
                        continue;
                    };
                    let target = target.trim().trim_start_matches("std::sync::");
                    if target.starts_with("Arc<dyn Fn") {
                        let name = name.split('<').next().unwrap().trim();
                        retained_aliases.insert(name.to_string());
                    }
                }
            }
            for func in crate::parse::collect_pub_fns(&src_dir) {
                owners
                    .entry(func.name.clone())
                    .or_default()
                    .push((dir_name, func));
            }
        }
        let takes_retained_callback = |func: &ParsedFn| {
            return func.params.iter().any(|param| {
                let ty: String = param.ty.split_whitespace().collect();
                let ty = ty.strip_prefix("Option<").unwrap_or(&ty);
                let base = ty.split('<').next().unwrap();
                return ty.starts_with("Arc<dynFn") || retained_aliases.contains(base);
            });
        };
        for (name, _) in NATIVE_SKIPS {
            let found = owners.get(*name).map(Vec::as_slice).unwrap_or_default();
            let crates: Vec<&str> = found.iter().map(|(dir_name, _)| *dir_name).collect();
            assert_eq!(found.len(), 1, "{name} is exported by {crates:?}");
            assert_eq!(
                takes_retained_callback(&found[0].1),
                RETAINED_CALLBACK_CARRIER_SKIPS.contains(name),
                "{name} in {crates:?}: {:?}",
                found[0].1.params
            );
        }
    }
}

// Reviewed HashLink/hxcpp module-function skips: flight-ffi hand-lowers these wrappers, so their
// generic native externs would bind the wrong ABI. JS/ESM still exports each one.
pub const NATIVE_SKIPS: &[(&str, &str)] = &[
    (
        "build_particle_color_curve",
        "flight-ffi returns the `&mut Vec<f32>` output as an owned pointer and drops the out parameter",
    ),
    (
        "collect_import_diagnostics",
        "flight-ffi wraps the callback in a `bool` completion status; the generic extern returns Void",
    ),
    ("connect_interaction_signal", ROOTED_CONNECTION_SKIP_REASON),
    ("enable_audio_mixer_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_bitmap_text_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_camera_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_collision_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_easing_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_flow_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_geometry_pool_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_movie_clip_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_node_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_physics2d_guards", RETAINED_CALLBACK_SKIP_REASON),
    (
        "enable_scene2d_resource_failure_guards",
        RETAINED_CALLBACK_SKIP_REASON,
    ),
    ("enable_snapshot_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_socket_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_text_bidi_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_text_segment_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_text_shaper_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_texture_atlas_guards", RETAINED_CALLBACK_SKIP_REASON),
    ("enable_tray_guards", RETAINED_CALLBACK_SKIP_REASON),
    (
        "find_requirement_catalog_entries",
        "the cross-crate `flight_requirement::RequirementFacet` enum crosses as `uint32_t`, not an opaque handle",
    ),
    (
        "for_each_path_segment",
        "flight-ffi flattens PathSegment into scalar callback arguments and returns a `bool` status",
    ),
    ("set_signal_timeout", RETAINED_CALLBACK_SKIP_REASON),
    (
        "set_storage_items",
        "flight-ffi lowers the `&[(&str, &str)]` record to parallel key/value string arrays plus one length",
    ),
    (
        "start_input_key_repeat_timer",
        RETAINED_CALLBACK_SKIP_REASON,
    ),
    ("watch_geolocation_position", RETAINED_CALLBACK_SKIP_REASON),
    ("watch_path", RETAINED_CALLBACK_SKIP_REASON),
];

// Reviewed accessor directions bound as `never`: a symbol with the accessor's name exists but is an
// SDK function without `T get(handle)` / `T set(handle, T)` shape.
pub const NATIVE_NEVER_ACCESSORS: &[(&str, &str)] = &[
    (
        "AnimationBlendTreeInput.weight:set",
        "C (void *tree, size_t index, float) -> bool: an indexed SDK setter, not an accessor",
    ),
    (
        "AnimationLayer.weight:set",
        "C (void *player, size_t index, float) -> bool: an indexed SDK setter, not an accessor",
    ),
    (
        "AudioBus.gain:set",
        "C (mixer capability, guard state, bus, float) -> float: an SDK setter through the host mixer",
    ),
    (
        "AudioBus.muted:set",
        "C (mixer capability, guard state, bus, bool) -> bool: an SDK setter through the host mixer",
    ),
    (
        "AudioBus.pan:set",
        "C (mixer capability, guard state, bus, float) -> float: an SDK setter through the host mixer",
    ),
    (
        "AudioMixer.master_gain:set",
        "C (mixer capability, mixer, float) -> float: an SDK setter through the host mixer",
    ),
    (
        "AudioMixer.master_muted:set",
        "C (mixer capability, mixer, bool) -> bool: an SDK setter through the host mixer",
    ),
    (
        "Clock.scale:set",
        "C (void *clock, double) -> void: the SDK setter returns nothing, an accessor returns the value",
    ),
    (
        "MotionPath.distance:set",
        "C (void *path, double) -> void: the SDK setter returns nothing, an accessor returns the value",
    ),
    (
        "TextureContainerLevel.byte_length:get",
        "C (uint32_t format, size_t width, size_t height) -> int64_t: a size computation, not a getter",
    ),
    (
        "VideoChannel.current_time:get",
        "C (video capability, channel) -> float: an SDK query through the host video capability",
    ),
    (
        "VideoChannel.current_time:set",
        "C (video capability, channel, float) -> float: an SDK setter through the host video capability",
    ),
    (
        "VideoChannel.gain:set",
        "C (video capability, channel, float) -> float: an SDK setter through the host video capability",
    ),
    (
        "VideoChannel.muted:set",
        "C (video capability, channel, bool) -> bool: an SDK setter through the host video capability",
    ),
    (
        "VideoChannel.playback_rate:set",
        "C (video capability, channel, float) -> float: an SDK setter through the host video capability",
    ),
];

// Reviewed native skips whose flight-ffi wrapper lowers a retained `Arc<dyn Fn>` callback to the
// `(fn, ctx, release)` carrier. The generic native lowering has no release parameter, so each
// stays JS/ESM-only until bindgen lowers callbacks and signal slots explicitly; none is bound
// through a `Dynamic` carrier meanwhile.
pub const RETAINED_CALLBACK_CARRIER_SKIPS: &[&str] = &[
    "connect_interaction_signal",
    "enable_audio_mixer_guards",
    "enable_bitmap_text_guards",
    "enable_camera_guards",
    "enable_collision_guards",
    "enable_easing_guards",
    "enable_flow_guards",
    "enable_geometry_pool_guards",
    "enable_movie_clip_guards",
    "enable_node_guards",
    "enable_physics2d_guards",
    "enable_scene2d_resource_failure_guards",
    "enable_snapshot_guards",
    "enable_socket_guards",
    "enable_text_bidi_guards",
    "enable_text_segment_guards",
    "enable_text_shaper_guards",
    "enable_texture_atlas_guards",
    "enable_tray_guards",
    "set_signal_timeout",
    "start_input_key_repeat_timer",
    "watch_geolocation_position",
    "watch_path",
];

const RETAINED_CALLBACK_SKIP_REASON: &str = "flight-ffi lowers the retained callback to a `(fn, ctx, release)` carrier; native binding awaits explicit bindgen callback/signal lowering";

const ROOTED_CONNECTION_SKIP_REASON: &str = "flight-ffi lowers the retained slot to a `(fn, ctx, release)` carrier; deliberately unbound natively until a rooted connection abstraction is available";

pub struct TypeMethod<'a> {
    pub func: &'a ParsedFn,
    pub module: String,
}

pub const FLIGHT_NODE_TYPE: &str = "FlightNode";

pub const FLIGHT_NODE_ARRAY_TYPE: &str = "FlightNodeArray";

pub const FLIGHT_NODE_POINTER_ARRAY_TYPE: &str = "FlightNodePointerArray";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeNodeParameter {
    pub carrier: NativeNodeCarrier,
    pub optional: bool,
    pub includes_len: bool,
}

#[derive(Clone, Copy)]
pub enum NativeNodeTarget {
    Hl,
    Cpp,
}

pub fn build_struct_map<'a>(
    crate_exports: &'a [CrateExports],
) -> BTreeMap<String, &'a ParsedStruct> {
    let mut map = BTreeMap::new();
    for crate_export in crate_exports {
        for s in &crate_export.structs {
            map.entry(s.name.clone()).or_insert(s);
        }
    }
    map
}

pub fn build_type_methods<'a>(
    crate_exports: &'a [CrateExports],
    known_types: &BTreeSet<String>,
) -> BTreeMap<String, Vec<TypeMethod<'a>>> {
    let mut map: BTreeMap<String, Vec<TypeMethod<'a>>> = BTreeMap::new();
    for crate_export in crate_exports {
        let module = crate_dir_to_module(&crate_export.dir_name, known_types);
        for func in &crate_export.fns {
            if let Some(ty) =
                match_function_to_type(&func.name, &func.params, &func.ret, known_types)
            {
                map.entry(ty).or_default().push(TypeMethod {
                    func,
                    module: module.clone(),
                });
            }
        }
    }
    map
}

pub fn collect_opaque_types(func: &ParsedFn, types: &mut BTreeSet<String>) {
    for param in &func.params {
        if let Some(kind) = classify_param(&param.ty) {
            match kind {
                ParamKind::RefConst(ty)
                | ParamKind::RefMut(ty)
                | ParamKind::OptionRefConst(ty)
                | ParamKind::OptionRefMut(ty) => {
                    if !ty.contains('(') && !ty.contains('[') {
                        types.insert(ty);
                    }
                }
                _ => {}
            }
        }
    }
    if let Some(ref ret) = func.ret {
        if let Some(ReturnKind::Struct(ty)) = classify_return(ret) {
            if !ty.contains('(') && !ty.contains('[') {
                types.insert(ty);
            }
        }
    }
}

pub fn crate_dir_to_module(dir_name: &str, known_types: &BTreeSet<String>) -> String {
    let stripped = dir_name.strip_prefix("flight-").unwrap_or(dir_name);
    let candidate = to_pascal_case(stripped);
    // Haxe modules are files. A facade and type differing only in case overwrite one
    // another on Windows and default macOS filesystems. Reuse the SDK type spelling
    // so dispatch emits one module containing both its typedef and free functions.
    known_types
        .iter()
        .find(|name| name.eq_ignore_ascii_case(&candidate))
        .cloned()
        .unwrap_or(candidate)
}

pub fn derive_method_name(fn_name: &str, type_name: &str) -> Option<String> {
    let type_lower = type_name.to_lowercase();
    let suffix = format!("_{type_lower}");

    if fn_name.ends_with(&suffix) {
        let prefix = &fn_name[..fn_name.len() - suffix.len()];
        if prefix.is_empty() {
            return None;
        }
        return Some(to_camel_case(prefix));
    }

    let mid = format!("_{type_lower}_");
    if let Some(pos) = fn_name.find(&mid) {
        let before = &fn_name[..pos];
        let after = &fn_name[pos + mid.len()..];
        let combined = if before.is_empty() {
            after.to_string()
        } else if after.is_empty() {
            before.to_string()
        } else {
            format!("{before}_{after}")
        };
        if combined.is_empty() {
            return None;
        }
        return Some(to_camel_case(&combined));
    }

    None
}

// Checks the native (HashLink/hxcpp) binding policy against the reviewed tables and, only when
// the actual surface matches them exactly, records the native skips on `surface`. A function is a
// native skip when its generic extern on either native backend disagrees with the wrapper
// flight-ffi generated; an accessor direction is `never` when a symbol with the accessor's name
// exists without accessor shape. Any difference from the tables, added or removed, is an error:
// a carrier change must never silently delete a binding. JS/ESM is unaffected by both. Each
// reviewed retained-callback skip must also be a reviewed skip whose C and HashLink signatures
// still carry the `(fn, ctx, release)` triple, so a stale or reshaped carrier fails generation.
pub fn enforce_native_binding_policy(
    exports: &[CrateExports],
    surface: &mut FfiSurface,
    expected_skips: &[(&str, &str)],
    expected_never_accessors: &[(&str, &str)],
    expected_carrier_skips: &[&str],
) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();

    let mut actual_skips: BTreeMap<String, Vec<&str>> = BTreeMap::new();
    for crate_export in exports {
        for func in &crate_export.fns {
            if !contains_ffi_symbol(surface, &format!("flight_{}", func.name)) {
                continue;
            }
            for (backend, declaration) in [
                ("_hl", crate::haxe_hl::emit_function(func, Some(surface))),
                ("_cpp", crate::haxe_cpp::emit_function(func, Some(surface))),
            ] {
                let agrees = declaration.as_deref().is_none_or(|text| {
                    return declaration_matches_ffi_surface(surface, backend, text);
                });
                if !agrees {
                    actual_skips
                        .entry(func.name.clone())
                        .or_default()
                        .push(backend);
                }
            }
        }
    }
    let expected: BTreeSet<&str> = expected_skips.iter().map(|(name, _)| *name).collect();
    for (name, backends) in &actual_skips {
        if !expected.contains(name.as_str()) {
            errors.push(format!(
                "unexpected native skip flight_{name}: generic {} extern disagrees with flight-ffi",
                backends.join("+")
            ));
        }
    }
    for name in &expected {
        if !actual_skips.contains_key(*name) {
            errors.push(format!(
                "reviewed native skip flight_{name} no longer disagrees (or is gone); update the table"
            ));
        }
    }
    for name in expected_carrier_skips {
        if !expected.contains(name) {
            errors.push(format!(
                "retained-callback skip flight_{name} is not a reviewed native skip"
            ));
        }
        if !has_retained_callback_carrier(surface, &format!("flight_{name}")) {
            errors.push(format!(
                "retained-callback skip flight_{name} no longer carries (fn, ctx, release) on C and HashLink; update the table"
            ));
        }
    }

    let mut actual_never = BTreeSet::new();
    for crate_export in exports {
        for parsed in &crate_export.structs {
            let snake = to_snake_case(&parsed.name);
            for field in &parsed.fields {
                let getter = format!("flight_get_{snake}_{}", field.name);
                let setter = format!("flight_set_{snake}_{}", field.name);
                if symbol_has_native_node(surface, &getter)
                    || symbol_has_native_node(surface, &setter)
                {
                    continue;
                }
                let access = get_ffi_field_access(surface, &getter, &setter, &field.ty);
                if contains_ffi_symbol(surface, &getter) && !access.get {
                    actual_never.insert(format!("{}.{}:get", parsed.name, field.name));
                }
                if contains_ffi_symbol(surface, &setter) && !access.set {
                    actual_never.insert(format!("{}.{}:set", parsed.name, field.name));
                }
            }
        }
    }
    let expected_never: BTreeSet<String> = expected_never_accessors
        .iter()
        .map(|(key, _)| key.to_string())
        .collect();
    for key in actual_never.difference(&expected_never) {
        errors.push(format!(
            "unexpected never accessor {key}: native symbol exists without accessor shape"
        ));
    }
    for key in expected_never.difference(&actual_never) {
        errors.push(format!(
            "reviewed never accessor {key} no longer applies; update the table"
        ));
    }

    if !errors.is_empty() {
        return Err(errors);
    }
    surface.native_skips = actual_skips
        .keys()
        .map(|name| format!("flight_{name}"))
        .collect();
    return Ok(());
}

// `public var name(get, set):T;` with `never` for a direction that has no binding.
pub fn field_property_declaration(haxe_name: &str, haxe_ty: &str, access: FieldAccess) -> String {
    let get = if access.get { "get" } else { "never" };
    let set = if access.set { "set" } else { "never" };
    return format!("public var {haxe_name}({get}, {set}):{haxe_ty};");
}

pub fn find_self_param(func: &ParsedFn, ty: &str) -> Option<usize> {
    for (i, param) in func.params.iter().enumerate() {
        if let Some(kind) = classify_param(&param.ty) {
            match &kind {
                ParamKind::RefConst(t)
                | ParamKind::RefMut(t)
                | ParamKind::OptionRefConst(t)
                | ParamKind::OptionRefMut(t)
                    if t == ty =>
                {
                    return Some(i);
                }
                _ => {}
            }
        }
    }
    None
}

pub fn flight_node_array_source(package: &str, target: NativeNodeTarget) -> String {
    let raw = match target {
        NativeNodeTarget::Hl => "hl.Bytes",
        NativeNodeTarget::Cpp => "cpp.Star<FlightNodeArrayNative>",
    };
    let node = format!("{package}.{FLIGHT_NODE_TYPE}");
    let array = format!("{package}.{FLIGHT_NODE_ARRAY_TYPE}");
    let mut output = String::new();
    writeln!(output, "package {package};\n").unwrap();
    if matches!(target, NativeNodeTarget::Cpp) {
        writeln!(
            output,
            "@:unreflective\n@:native(\"FlightNodeArray\")\nprivate extern class FlightNodeArrayNative {{}}\n"
        )
        .unwrap();
    }
    writeln!(
        output,
        "private extern class {FLIGHT_NODE_ARRAY_TYPE}_Ffi {{"
    )
    .unwrap();
    for (method, symbol, params, ret) in [
        (
            "create",
            "flight_node_array_create",
            String::new(),
            array.clone(),
        ),
        (
            "length",
            "flight_node_array_len",
            format!("array:{array}"),
            "Int".to_string(),
        ),
        (
            "get",
            "flight_node_array_get",
            format!("array:{array}, index:Int"),
            node.clone(),
        ),
        (
            "push",
            "flight_node_array_push",
            format!("array:{array}, node:{node}"),
            "Bool".to_string(),
        ),
        (
            "clear",
            "flight_node_array_clear",
            format!("array:{array}"),
            "Void".to_string(),
        ),
        (
            "free",
            "flight_free_node_array",
            format!("array:{array}"),
            "Void".to_string(),
        ),
    ] {
        writeln!(output, "\t{}", node_native_attribute(target, symbol)).unwrap();
        writeln!(output, "\tstatic function {method}({params}):{ret};").unwrap();
    }
    writeln!(output, "}}\n").unwrap();
    writeln!(output, "abstract {FLIGHT_NODE_ARRAY_TYPE}({raw}) {{").unwrap();
    writeln!(output, "\tpublic static inline function create():{FLIGHT_NODE_ARRAY_TYPE} return {FLIGHT_NODE_ARRAY_TYPE}_Ffi.create();").unwrap();
    writeln!(output, "\tpublic var length(get, never):Int;").unwrap();
    writeln!(
        output,
        "\tinline function get_length():Int return {FLIGHT_NODE_ARRAY_TYPE}_Ffi.length(cast this);"
    )
    .unwrap();
    writeln!(output, "\tpublic inline function get(index:Int):Null<{FLIGHT_NODE_TYPE}> return {FLIGHT_NODE_ARRAY_TYPE}_Ffi.get(cast this, index);").unwrap();
    writeln!(output, "\tpublic inline function push(node:{FLIGHT_NODE_TYPE}):Bool return {FLIGHT_NODE_ARRAY_TYPE}_Ffi.push(cast this, node);").unwrap();
    writeln!(
        output,
        "\tpublic inline function clear():Void {FLIGHT_NODE_ARRAY_TYPE}_Ffi.clear(cast this);"
    )
    .unwrap();
    writeln!(
        output,
        "\tpublic inline function free():Void {FLIGHT_NODE_ARRAY_TYPE}_Ffi.free(cast this);"
    )
    .unwrap();
    writeln!(output, "}}").unwrap();
    return output;
}

pub fn flight_node_source(package: &str, target: NativeNodeTarget) -> String {
    let handle = format!("{package}.{FLIGHT_NODE_TYPE}");
    let raw = match target {
        NativeNodeTarget::Hl => "hl.Bytes",
        NativeNodeTarget::Cpp => "cpp.Star<cpp.Void>",
    };
    let storage = match target {
        NativeNodeTarget::Hl => raw,
        NativeNodeTarget::Cpp => "cpp.Star<FlightNodeNative>",
    };
    let string_input = match target {
        NativeNodeTarget::Hl => "hl.Bytes",
        NativeNodeTarget::Cpp => "cpp.ConstCharStar",
    };
    let owned_string_ptr = match target {
        NativeNodeTarget::Hl => "hl.Bytes",
        NativeNodeTarget::Cpp => "cpp.RawPointer<cpp.Char>",
    };
    let fields = [
        ("enabled", "node_enabled", "Bool", "node_enabled_field"),
        ("node2dAlpha", "node2d_alpha", "Single", "node2d_alpha"),
        ("node2dPivotX", "node2d_pivot_x", "Float", "node2d_pivot_x"),
        ("node2dPivotY", "node2d_pivot_y", "Float", "node2d_pivot_y"),
        (
            "node2dRotation",
            "node2d_rotation",
            "Float",
            "node2d_rotation",
        ),
        ("node2dScaleX", "node2d_scale_x", "Float", "node2d_scale_x"),
        ("node2dScaleY", "node2d_scale_y", "Float", "node2d_scale_y"),
        ("node2dSkewX", "node2d_skew_x", "Float", "node2d_skew_x"),
        ("node2dSkewY", "node2d_skew_y", "Float", "node2d_skew_y"),
        ("node2dVisible", "node2d_visible", "Bool", "node2d_visible"),
        ("node2dX", "node2d_x", "Float", "node2d_x"),
        ("node2dY", "node2d_y", "Float", "node2d_y"),
        (
            "node3dAlpha",
            "node3d_alpha",
            "Single",
            "node3d_alpha_field",
        ),
        ("node3dVisible", "node3d_visible", "Bool", "node3d_visible"),
        (
            "node3dPositionX",
            "node3d_position_x",
            "Float",
            "node3d_position_x",
        ),
        (
            "node3dPositionY",
            "node3d_position_y",
            "Float",
            "node3d_position_y",
        ),
        (
            "node3dPositionZ",
            "node3d_position_z",
            "Float",
            "node3d_position_z",
        ),
        (
            "node3dRotationX",
            "node3d_rotation_x",
            "Float",
            "node3d_rotation_x",
        ),
        (
            "node3dRotationY",
            "node3d_rotation_y",
            "Float",
            "node3d_rotation_y",
        ),
        (
            "node3dRotationZ",
            "node3d_rotation_z",
            "Float",
            "node3d_rotation_z",
        ),
        (
            "node3dRotationW",
            "node3d_rotation_w",
            "Float",
            "node3d_rotation_w",
        ),
        ("node3dScaleX", "node3d_scale_x", "Float", "node3d_scale_x"),
        ("node3dScaleY", "node3d_scale_y", "Float", "node3d_scale_y"),
        ("node3dScaleZ", "node3d_scale_z", "Float", "node3d_scale_z"),
    ];

    let mut output = String::new();
    writeln!(output, "package {package};\n").unwrap();
    if matches!(target, NativeNodeTarget::Cpp) {
        writeln!(
            output,
            "@:unreflective\n@:native(\"FlightNode\")\nprivate extern class FlightNodeNative {{}}\n"
        )
        .unwrap();
    }
    writeln!(output, "private extern class {FLIGHT_NODE_TYPE}_Ffi {{").unwrap();
    for (method, symbol, params, ret) in [
        (
            "equals",
            "flight_node_equals",
            format!("a:{handle}, b:{handle}"),
            "Bool".to_string(),
        ),
        (
            "free",
            "flight_free_node",
            format!("node:{handle}"),
            "Void".to_string(),
        ),
    ] {
        writeln!(output, "\t{}", node_native_attribute(target, symbol)).unwrap();
        writeln!(output, "\tstatic function {method}({params}):{ret};").unwrap();
    }
    for (method, symbol, value_ty) in [
        (
            "set_enabled_invalidating",
            "flight_set_node_enabled",
            "Bool",
        ),
        (
            "set_node3dAlpha_invalidating",
            "flight_set_node3d_alpha",
            "Single",
        ),
        ("set_node2dClip_invalidating", "flight_set_node2d_clip", raw),
    ] {
        writeln!(output, "\t{}", node_native_attribute(target, symbol)).unwrap();
        writeln!(
            output,
            "\tstatic function {method}(node:{handle}, value:{value_ty}):Bool;"
        )
        .unwrap();
    }
    for (property, getter, ty, setter) in fields {
        writeln!(
            output,
            "\t{}\n\tstatic function get_{property}(node:{handle}):{ty};",
            node_native_attribute(target, &format!("flight_get_{getter}"))
        )
        .unwrap();
        writeln!(
            output,
            "\t{}\n\tstatic function set_{property}(node:{handle}, value:{ty}):Bool;",
            node_native_attribute(target, &format!("flight_set_{setter}"))
        )
        .unwrap();
    }
    for property in ["kind", "name"] {
        writeln!(
            output,
            "\t{}\n\tstatic function get_{property}(node:{handle}):{owned_string_ptr};",
            node_native_attribute(target, &format!("flight_get_node_{property}"))
        )
        .unwrap();
        writeln!(
            output,
            "\t{}\n\tstatic function set_{property}(node:{handle}, value:{string_input}):Bool;",
            node_native_attribute(target, &format!("flight_set_node_{property}"))
        )
        .unwrap();
    }
    writeln!(
        output,
        "\t{}\n\tstatic function freeString(value:{owned_string_ptr}):Void;",
        node_native_attribute(target, "flight_free_string")
    )
    .unwrap();
    writeln!(
        output,
        "\t{}\n\tstatic function get_node2dBlendMode(node:{handle}):Int;",
        node_native_attribute(target, "flight_get_node2d_blend_mode")
    )
    .unwrap();
    writeln!(
        output,
        "\t{}\n\tstatic function set_node2dBlendMode(node:{handle}, value:Int, present:Bool):Bool;",
        node_native_attribute(target, "flight_set_node2d_blend_mode")
    )
    .unwrap();
    writeln!(
        output,
        "\t{}\n\tstatic function get_node2dClip(node:{handle}):{raw};",
        node_native_attribute(target, "flight_get_node2d_clip")
    )
    .unwrap();
    for property in ["node2dMaterial", "node2dMaterialData"] {
        let suffix = to_snake_case(property);
        writeln!(
            output,
            "\t{}\n\tstatic function get_{property}(node:{handle}):{raw};",
            node_native_attribute(target, &format!("flight_get_{suffix}"))
        )
        .unwrap();
        writeln!(
            output,
            "\t{}\n\tstatic function set_{property}(node:{handle}, value:{raw}):Bool;",
            node_native_attribute(target, &format!("flight_set_{suffix}"))
        )
        .unwrap();
    }
    writeln!(output, "}}\n").unwrap();
    writeln!(output, "abstract {FLIGHT_NODE_TYPE}({storage}) {{").unwrap();
    writeln!(output, "\tpublic static inline function same(a:Null<{FLIGHT_NODE_TYPE}>, b:Null<{FLIGHT_NODE_TYPE}>):Bool return {FLIGHT_NODE_TYPE}_Ffi.equals(cast a, cast b);").unwrap();
    writeln!(output, "\tpublic static inline function freeNullable(node:Null<{FLIGHT_NODE_TYPE}>):Void {FLIGHT_NODE_TYPE}_Ffi.free(cast node);").unwrap();
    writeln!(output, "\tpublic inline function equals(other:{FLIGHT_NODE_TYPE}):Bool return {FLIGHT_NODE_TYPE}_Ffi.equals(cast this, other);").unwrap();
    writeln!(
        output,
        "\tpublic inline function free():Void {FLIGHT_NODE_TYPE}_Ffi.free(cast this);\n"
    )
    .unwrap();
    for (property, _, ty, _) in fields {
        writeln!(output, "\tpublic var {property}(get, set):{ty};").unwrap();
        writeln!(output, "\tinline function get_{property}():{ty} return {FLIGHT_NODE_TYPE}_Ffi.get_{property}(cast this);").unwrap();
        writeln!(output, "\tinline function set_{property}(value:{ty}):{ty} {{ {FLIGHT_NODE_TYPE}_Ffi.set_{property}(cast this, value); return value; }}\n").unwrap();
    }
    for property in ["kind", "name"] {
        writeln!(output, "\tpublic var {property}(get, set):Null<String>;").unwrap();
        match target {
            NativeNodeTarget::Hl => {
                writeln!(output, "\tinline function get_{property}():Null<String> {{ var raw = {FLIGHT_NODE_TYPE}_Ffi.get_{property}(cast this); if (raw == null) return null; var value = @:privateAccess String.fromUTF8(raw); {FLIGHT_NODE_TYPE}_Ffi.freeString(raw); return value; }}").unwrap();
                writeln!(output, "\tinline function set_{property}(value:Null<String>):Null<String> {{ var raw:hl.Bytes = null; if (value != null) {{ var encoded = haxe.io.Bytes.ofString(value); raw = new hl.Bytes(encoded.length + 1); raw.blit(0, encoded.getData(), 0, encoded.length); raw.setUI8(encoded.length, 0); }} {FLIGHT_NODE_TYPE}_Ffi.set_{property}(cast this, raw); return value; }}\n").unwrap();
            }
            NativeNodeTarget::Cpp => {
                writeln!(output, "\tinline function get_{property}():Null<String> {{ var raw = {FLIGHT_NODE_TYPE}_Ffi.get_{property}(cast this); if (raw == null) return null; var value:String = (cast raw : cpp.ConstCharStar); {FLIGHT_NODE_TYPE}_Ffi.freeString(raw); return value; }}").unwrap();
                writeln!(output, "\tinline function set_{property}(value:Null<String>):Null<String> {{ {FLIGHT_NODE_TYPE}_Ffi.set_{property}(cast this, cast value); return value; }}\n").unwrap();
            }
        }
    }
    writeln!(output, "\tpublic var node2dBlendMode(get, never):Int;").unwrap();
    writeln!(output, "\tinline function get_node2dBlendMode():Int return {FLIGHT_NODE_TYPE}_Ffi.get_node2dBlendMode(cast this);").unwrap();
    writeln!(output, "\tpublic inline function setNode2dBlendMode(value:Int, present:Bool):Bool return {FLIGHT_NODE_TYPE}_Ffi.set_node2dBlendMode(cast this, value, present);\n").unwrap();
    writeln!(output, "\tpublic var node2dClip(get, never):{raw};").unwrap();
    writeln!(output, "\tinline function get_node2dClip():{raw} return {FLIGHT_NODE_TYPE}_Ffi.get_node2dClip(cast this);\n").unwrap();
    for property in ["node2dMaterial", "node2dMaterialData"] {
        writeln!(output, "\tpublic var {property}(get, set):{raw};").unwrap();
        writeln!(output, "\tinline function get_{property}():{raw} return {FLIGHT_NODE_TYPE}_Ffi.get_{property}(cast this);").unwrap();
        writeln!(output, "\tinline function set_{property}(value:{raw}):{raw} {{ {FLIGHT_NODE_TYPE}_Ffi.set_{property}(cast this, value); return value; }}\n").unwrap();
    }
    writeln!(output, "\tpublic inline function setEnabledField(value:Bool):Bool return {FLIGHT_NODE_TYPE}_Ffi.set_enabled(cast this, value);").unwrap();
    writeln!(output, "\tpublic inline function setNode3dAlphaField(value:Single):Bool return {FLIGHT_NODE_TYPE}_Ffi.set_node3dAlpha(cast this, value);").unwrap();
    writeln!(output, "\tpublic inline function setEnabled(value:Bool):Bool return {FLIGHT_NODE_TYPE}_Ffi.set_enabled_invalidating(cast this, value);").unwrap();
    writeln!(output, "\tpublic inline function setNode3dAlpha(value:Single):Bool return {FLIGHT_NODE_TYPE}_Ffi.set_node3dAlpha_invalidating(cast this, value);").unwrap();
    writeln!(output, "\tpublic inline function setNode2dClip(value:{raw}):Bool return {FLIGHT_NODE_TYPE}_Ffi.set_node2dClip_invalidating(cast this, value);").unwrap();
    writeln!(output, "}}").unwrap();
    return output;
}

pub fn function_has_native_node(func: &ParsedFn, surface: Option<&FfiSurface>) -> bool {
    return surface
        .is_some_and(|surface| symbol_has_native_node(surface, &format!("flight_{}", func.name)));
}

pub fn has_ffi_function(fn_name: &str, ffi_surface: Option<&FfiSurface>) -> bool {
    return match ffi_surface {
        None => true,
        Some(surface) => contains_ffi_symbol(surface, &format!("flight_{fn_name}")),
    };
}

// Native (HashLink/hxcpp) presence: the symbol exists and is not a reviewed native skip.
pub fn has_native_ffi_function(fn_name: &str, ffi_surface: Option<&FfiSurface>) -> bool {
    return match ffi_surface {
        None => true,
        Some(surface) => has_native_ffi_symbol(surface, &format!("flight_{fn_name}")),
    };
}

fn match_function_to_type(
    fn_name: &str,
    params: &[crate::parse::Param],
    ret: &Option<String>,
    known_types: &BTreeSet<String>,
) -> Option<String> {
    let type_lower_in_name = |ty: &str| -> bool {
        let tl = ty.to_lowercase();
        let suffix = format!("_{tl}");
        let mid = format!("_{tl}_");
        fn_name.ends_with(&suffix) || fn_name.contains(&mid)
    };

    for param in params {
        if let Some(kind) = classify_param(&param.ty) {
            let ty_name = match &kind {
                ParamKind::RefConst(ty)
                | ParamKind::RefMut(ty)
                | ParamKind::OptionRefConst(ty)
                | ParamKind::OptionRefMut(ty) => ty,
                _ => continue,
            };
            if known_types.contains(ty_name)
                && type_lower_in_name(ty_name)
                && derive_method_name(fn_name, ty_name).is_some()
            {
                return Some(ty_name.clone());
            }
        }
    }
    if let Some(ret_ty) = ret {
        if let Some(ReturnKind::Struct(ty_name)) = classify_return(ret_ty) {
            if known_types.contains(&ty_name)
                && fn_name.starts_with("create_")
                && type_lower_in_name(&ty_name)
                && derive_method_name(fn_name, &ty_name).is_some()
            {
                return Some(ty_name);
            }
        }
    }
    None
}

pub fn native_node_function_return(signature: Option<&FfiSignature>) -> Option<String> {
    let signature =
        signature.filter(|signature| crate::ffi_surface::signature_has_native_node(signature))?;
    let ty = match signature.ret.as_str() {
        "void" => "Void",
        "bool" => "Bool",
        "float" => "Single",
        "double" => "Float",
        "int8_t" | "uint8_t" | "int16_t" | "uint16_t" | "int32_t" | "uint32_t" | "size_t" => "Int",
        "int64_t" | "uint64_t" => "haxe.Int64",
        _ => return None,
    };
    return Some(ty.to_string());
}

pub fn native_node_parameter(
    signature: Option<&FfiSignature>,
    c_index: &mut usize,
    kind: &ParamKind,
    rust_ty: &str,
) -> Option<NativeNodeParameter> {
    let carrier = signature
        .and_then(|signature| signature.params.get(*c_index))
        .and_then(|param| native_node_carrier(param));
    if let Some(carrier) = carrier {
        let includes_len = carrier == NativeNodeCarrier::NodePointerArray;
        *c_index += if includes_len { 2 } else { 1 };
        return Some(NativeNodeParameter {
            carrier,
            optional: rust_ty.trim().starts_with("Option<"),
            includes_len,
        });
    }
    *c_index += native_parameter_width(kind);
    return None;
}

pub fn native_node_return(
    signature: Option<&FfiSignature>,
    rust_ret: Option<&str>,
) -> Option<(NativeNodeCarrier, bool)> {
    let carrier = signature.and_then(|signature| native_node_carrier(&signature.ret))?;
    let optional = rust_ret.is_some_and(|ty| ty.trim().starts_with("Option<"));
    return Some((carrier, optional));
}

pub fn native_node_type(package: &str, carrier: NativeNodeCarrier, optional: bool) -> String {
    let name = match carrier {
        NativeNodeCarrier::Node => FLIGHT_NODE_TYPE,
        NativeNodeCarrier::NodeArray => FLIGHT_NODE_ARRAY_TYPE,
        NativeNodeCarrier::NodePointerArray => FLIGHT_NODE_POINTER_ARRAY_TYPE,
    };
    let ty = format!("{package}.{name}");
    return if optional { format!("Null<{ty}>") } else { ty };
}

fn native_parameter_width(kind: &ParamKind) -> usize {
    return match kind {
        ParamKind::SliceConst(_)
        | ParamKind::SliceMut(_)
        | ParamKind::OptionSliceConst(_)
        | ParamKind::OptionSliceMut(_)
        | ParamKind::BoxSlice(_)
        | ParamKind::Closure
        | ParamKind::OptionClosure => 2,
        _ => 1,
    };
}

pub fn native_signature_for<'a>(
    surface: Option<&'a FfiSurface>,
    func: &ParsedFn,
) -> Option<&'a FfiSignature> {
    return surface?.c.get(&format!("flight_{}", func.name));
}

fn node_native_attribute(target: NativeNodeTarget, symbol: &str) -> String {
    return match target {
        NativeNodeTarget::Hl => format!("@:hlNative(\"flight\", \"{symbol}\")"),
        NativeNodeTarget::Cpp => format!("@:native(\"{symbol}\")"),
    };
}

// Which directions of a struct field may bind to a native accessor; with no FFI surface every
// parsed field is assumed to have both.
pub fn resolve_ffi_field_access(
    type_name: &str,
    field: &crate::parse::StructField,
    ffi_surface: Option<&FfiSurface>,
) -> FieldAccess {
    let Some(surface) = ffi_surface else {
        return FieldAccess {
            get: true,
            set: true,
        };
    };
    let snake = to_snake_case(type_name);
    return get_ffi_field_access(
        surface,
        &format!("flight_get_{snake}_{}", field.name),
        &format!("flight_set_{snake}_{}", field.name),
        &field.ty,
    );
}

pub fn scalar_to_haxe(ty: &str) -> &str {
    match ty {
        "f32" => "Single",
        "f64" => "Float",
        "bool" => "Bool",
        "i8" | "i16" | "i32" | "isize" => "Int",
        "u8" | "u16" | "u32" | "usize" => "Int",
        "i64" | "u64" => "haxe.Int64",
        _ => "Dynamic",
    }
}

pub fn to_snake_case(s: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = s.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c.is_uppercase() && i > 0 && !chars[i - 1].is_uppercase() && chars[i - 1] != '_' {
            out.push('_');
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}

/// The out-parameter storage types (HashLink, hxcpp) of a tuple element, or `None` when the
/// element has no exact-width type on both native targets. Every backend declines a tuple with
/// such an element, so the HL, C++ and JavaScript surfaces stay identical.
pub fn tuple_element_storage(ty: &str) -> Option<(&'static str, &'static str)> {
    return match ty {
        "f32" => Some(("Single", "cpp.Float32")),
        "f64" => Some(("Float", "cpp.Float64")),
        "i32" => Some(("Int", "cpp.Int32")),
        "u32" => Some(("Int", "cpp.UInt32")),
        "u8" => Some(("hl.UI8", "cpp.UInt8")),
        "u16" => Some(("hl.UI16", "cpp.UInt16")),
        "bool" => Some(("Bool", "Bool")),
        _ => None,
    };
}

/// The Haxe value a scalar tuple return becomes: an anonymous structure whose `_0`, `_1`, ...
/// fields mirror Rust's `.0`, `.1`, ... and the native ABI's `out_0`, `out_1`, ... parameters.
pub fn tuple_struct_type(elements: &[String], scalar: fn(&str) -> &str) -> String {
    let fields: Vec<String> = elements
        .iter()
        .enumerate()
        .map(|(index, element)| format!("_{index}:{}", scalar(element)))
        .collect();
    return format!("{{ {} }}", fields.join(", "));
}

pub fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    fs::write(path, content).unwrap();
}
