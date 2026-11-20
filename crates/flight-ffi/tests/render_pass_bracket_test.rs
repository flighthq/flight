//! Pins the borrow-erased WGPU pass bracket the generator emits: one exact table entry, its
//! signature-drift failures, the generated support's shape and validator order, and its C header,
//! HashLink, stats and reachability surface. Runtime behaviour is in
//! `src/render_pass_bracket_runtime_test.rs`.

// The test checks the generator's table, checks and guard; its emitters run only in the build script.
#[allow(dead_code)]
#[path = "../render_pass_bracket.rs"]
mod render_pass_bracket;

use render_pass_bracket::{
    BORROW_ERASED_BRACKETS, BorrowErasedBracket, check_bracket_free_link, check_bracket_signature,
    guard_bracket_state_wrappers, normalize_signature,
};

const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
const HEADER: &str = include_str!(concat!(env!("OUT_DIR"), "/flight_ffi.h"));
const HL: &str = include_str!(concat!(env!("OUT_DIR"), "/flight_hl.c"));
const STATS: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_stats.txt"));
const GRAPH: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_reachability_graph.tsv"));

mod borrow_erased_brackets {
    use super::*;

    #[test]
    fn names_exactly_the_wgpu_pass_and_its_three_draw_consumers() {
        assert_eq!(BORROW_ERASED_BRACKETS.len(), 1);
        let bracket = &BORROW_ERASED_BRACKETS[0];
        assert_eq!(
            (bracket.crate_dir, bracket.begin, bracket.end),
            (
                "flight-render-wgpu",
                "begin_wgpu_render_pass",
                "end_wgpu_render_pass"
            )
        );
        assert_eq!(
            (bracket.state, bracket.borrowed, bracket.handle),
            (
                "WgpuRenderState",
                "WgpuRenderPass",
                "FfiWgpuRenderPassHandle"
            )
        );
        assert_eq!(
            (bracket.ffi_begin, bracket.ffi_end, bracket.ffi_free),
            (
                "flight_begin_wgpu_render_pass",
                "flight_end_wgpu_render_pass",
                "flight_free_wgpu_render_pass_handle"
            )
        );
        let consumers: Vec<_> = bracket
            .consumers
            .iter()
            .map(|consumer| (consumer.crate_dir, consumer.function, consumer.ffi_name))
            .collect();
        assert_eq!(
            consumers,
            [
                (
                    "flight-scene2d-wgpu",
                    "render_wgpu_scene2d",
                    "flight_render_wgpu_scene2d"
                ),
                (
                    "flight-scene3d-wgpu",
                    "render_wgpu_scene3d",
                    "flight_render_wgpu_scene3d"
                ),
                (
                    "flight-scene3d-wgpu",
                    "render_wgpu_environment_skybox",
                    "flight_render_wgpu_environment_skybox"
                ),
            ]
        );
    }

    #[test]
    fn reports_one_bracket_and_three_consumers_in_the_stats() {
        assert!(STATS.contains("FFI borrow-erased brackets: 1 brackets, 3 consumers\n"));
        let lines: Vec<_> = STATS
            .lines()
            .filter(|line| line.starts_with("  bracket: "))
            .collect();
        assert_eq!(lines.len(), 4, "{lines:?}");
        for name in z_bracket_symbols() {
            assert_eq!(
                lines.iter().filter(|line| line.contains(name)).count(),
                1,
                "{name}"
            );
        }
    }
}

mod check_bracket_free_link {
    use super::*;

    #[test]
    fn accepts_the_emitted_bracket() {
        assert_eq!(
            check_bracket_free_link(GENERATED, &BORROW_ERASED_BRACKETS[0]),
            Ok(())
        );
    }

    #[test]
    fn rejects_a_begin_whose_ownership_names_another_free() {
        let drifted = GENERATED.replacen(
            "owned-return|flight_free_wgpu_render_pass_handle|FfiWgpuRenderPassHandle",
            "owned-return|flight_free_other|FfiWgpuRenderPassHandle",
            1,
        );
        assert!(check_bracket_free_link(&drifted, &BORROW_ERASED_BRACKETS[0]).is_err());
        let relinked = BorrowErasedBracket {
            ffi_free: "flight_free_other",
            ..z_bracket_copy()
        };
        assert!(check_bracket_free_link(GENERATED, &relinked).is_err());
    }

    #[test]
    fn rejects_a_free_that_does_not_take_only_the_handle() {
        let drifted = GENERATED.replacen(
            "fn flight_free_wgpu_render_pass_handle(pass: *mut FfiWgpuRenderPassHandle) {",
            "fn flight_free_wgpu_render_pass_handle(pass: *mut FfiWgpuRenderPassHandle) -> bool {",
            1,
        );
        assert!(check_bracket_free_link(&drifted, &BORROW_ERASED_BRACKETS[0]).is_err());
    }
}

mod check_bracket_signature {
    use super::*;

    #[test]
    fn accepts_each_table_signature_as_written_across_lines() {
        let bracket = &BORROW_ERASED_BRACKETS[0];
        let source = vec![
            "pub fn begin_wgpu_render_pass<'a>(\n    state: &'a mut WgpuRenderState,\n    target: &WgpuRenderTarget,\n    clear: Option<&RenderTargetClear>,\n) -> WgpuRenderPass<'a> {".to_string(),
        ];
        assert_eq!(
            check_bracket_signature(&source, bracket.begin, bracket.begin_signature),
            Ok(())
        );
    }

    #[test]
    fn fails_generation_for_every_signature_drift() {
        let bracket = &BORROW_ERASED_BRACKETS[0];
        let consumers = bracket.consumers;
        let cases: Vec<(&str, &str, String)> = vec![
            (
                bracket.begin,
                bracket.begin_signature,
                bracket
                    .begin_signature
                    .replace("<'a>(state: &'a mut", "<'a>(state: &mut"),
            ),
            (
                bracket.begin,
                bracket.begin_signature,
                bracket
                    .begin_signature
                    .replace("&'a mut WgpuRenderState", "&'a mut GlRenderState"),
            ),
            (
                bracket.begin,
                bracket.begin_signature,
                bracket
                    .begin_signature
                    .replace("-> WgpuRenderPass<'a>", "-> Option<WgpuRenderPass<'a>>"),
            ),
            (
                bracket.begin,
                bracket.begin_signature,
                bracket.begin_signature.replace(
                    "clear: Option<&RenderTargetClear>",
                    "clear: &RenderTargetClear",
                ),
            ),
            (
                bracket.end,
                bracket.end_signature,
                bracket
                    .end_signature
                    .replace("pass: WgpuRenderPass<'_>", "pass: &mut WgpuRenderPass<'_>"),
            ),
            (
                bracket.end,
                bracket.end_signature,
                format!("{} -> bool", bracket.end_signature),
            ),
            (
                consumers[0].function,
                consumers[0].signature,
                consumers[0]
                    .signature
                    .replace("pass: &mut WgpuRenderPass<'_>", "pass: &WgpuRenderPass<'_>"),
            ),
            (
                consumers[0].function,
                consumers[0].signature,
                consumers[0].signature.replace(
                    "render_transform: Option<&Matrix>",
                    "render_transform: &Matrix",
                ),
            ),
            (
                consumers[1].function,
                consumers[1].signature,
                consumers[1].signature.replace(
                    "pass: &mut WgpuRenderPass<'_>",
                    "state: &mut WgpuRenderState",
                ),
            ),
            (
                consumers[1].function,
                consumers[1].signature,
                consumers[1].signature.replace(
                    "forward_lights: Option<&WgpuScene3DForwardLightList>",
                    "forward_lights: &WgpuScene3DForwardLightList",
                ),
            ),
            (
                consumers[2].function,
                consumers[2].signature,
                consumers[2].signature.replace(
                    "render_pass: &mut WgpuRenderPass<'_>",
                    "render_pass: WgpuRenderPass<'_>",
                ),
            ),
            (
                consumers[2].function,
                consumers[2].signature,
                format!("{} -> bool", consumers[2].signature),
            ),
        ];
        for (function, expected, drifted) in cases {
            assert_ne!(normalize_signature(&drifted), normalize_signature(expected));
            let error = check_bracket_signature(&[format!("{drifted} {{")], function, expected)
                .unwrap_err();
            assert!(error.contains("drifted"), "{error}");
        }
    }

    #[test]
    fn fails_generation_for_a_missing_or_duplicated_function() {
        let bracket = &BORROW_ERASED_BRACKETS[0];
        let error = check_bracket_signature(&[], bracket.end, bracket.end_signature).unwrap_err();
        assert!(error.contains("found 0"), "{error}");
        let twice = vec![
            bracket.end_signature.to_string(),
            bracket.end_signature.to_string(),
        ];
        let error =
            check_bracket_signature(&twice, bracket.end, bracket.end_signature).unwrap_err();
        assert!(error.contains("found 2"), "{error}");
        let prefixed =
            vec!["pub fn end_wgpu_render_pass_twice(pass: WgpuRenderPass<'_>)".to_string()];
        assert!(check_bracket_signature(&prefixed, bracket.end, bracket.end_signature).is_err());
    }
}

mod generated_bracket {
    use super::*;

    #[test]
    fn keeps_identities_in_a_token_registry_never_a_borrow_or_a_native_pass() {
        let section = z_bracket_section();
        for banned in [
            "transmute",
            "WgpuRenderPass<'static>",
            "&'static mut",
            "wgpu::RenderPass",
            "static mut",
            "Box::leak",
            "Box::into_raw",
            "Box::from_raw",
            "(*pass)",
            "OnceLock",
        ] {
            assert!(
                !section.contains(banned),
                "bracket support contains {banned}"
            );
        }
        // The only `'static` lifetimes are the test-only trace's step names and the guard of the
        // process-wide registry.
        assert!(
            !section
                .replace("&'static str", "")
                .replace("MutexGuard<'static, FfiWgpuRenderPassRegistry>", "")
                .contains("'static"),
            "bracket support names a 'static borrow"
        );
        let handle = z_between(section, "pub struct FfiWgpuRenderPassHandle {", "\n}");
        assert_eq!(handle.trim(), "_token_only: [u8; 0],");
        let entry = z_between(section, "struct FfiWgpuRenderPassEntry {", "\n}");
        let fields: Vec<_> = entry
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect();
        assert_eq!(
            fields,
            [
                "state: usize,",
                "state_id: u64,",
                "index: usize,",
                "record_id: u64,",
                "phase: FfiWgpuRenderPassPhase,",
            ]
        );
        assert_eq!(
            section
                .matches(
                    "static FFI_WGPU_RENDER_PASSES: std::sync::Mutex<FfiWgpuRenderPassRegistry>"
                )
                .count(),
            1
        );
        let begin = z_function("flight_begin_wgpu_render_pass");
        assert_eq!(
            begin
                .matches("return std::ptr::without_provenance_mut(token);")
                .count(),
            1
        );
        let register = z_between(section, "fn ffi_register_wgpu_render_pass(", "\n}");
        assert!(
            register.contains("issued.checked_mul(2)?.checked_add(1)?"),
            "{register}"
        );
        assert!(register.contains("registry.issued = issued;"), "{register}");
    }

    #[test]
    fn validates_state_identity_then_the_original_record_then_the_top() {
        let classify = z_between(
            z_bracket_section(),
            "unsafe fn ffi_classify_wgpu_render_pass(",
            "\n}",
        );
        let order = [
            "get_entity_id(state) != entry.state_id",
            "get_wgpu_render_state_runtime(state)",
            "pass_stack.get(entry.index)",
            "get_entity_id(record) == entry.record_id",
            "entry.index + 1 == pass_stack.len()",
        ];
        let positions: Vec<usize> = order
            .iter()
            .map(|step| {
                assert_eq!(classify.matches(step).count(), 1, "{step}");
                classify.find(step).unwrap()
            })
            .collect();
        assert!(
            positions.windows(2).all(|pair| pair[0] < pair[1]),
            "{classify}"
        );
        let state_check = &classify[positions[0]..positions[1]];
        assert!(state_check.contains("return FfiWgpuRenderPassRelation::Stale;"));
    }

    #[test]
    fn claims_the_handle_and_its_state_under_one_lock_and_settles_them_on_drop() {
        let section = z_bracket_section();
        let start = z_between(section, "fn ffi_start_locked_wgpu_render_pass_call(", "\n}");
        let order = [
            "registry: &mut FfiWgpuRenderPassRegistry",
            "entry.phase != FfiWgpuRenderPassPhase::Open",
            "registry.claimed.insert(entry.state)",
            "live.phase = FfiWgpuRenderPassPhase::Busy;",
        ];
        let positions: Vec<usize> = order
            .iter()
            .map(|step| {
                start
                    .find(step)
                    .unwrap_or_else(|| panic!("{step}\n{start}"))
            })
            .collect();
        assert!(
            positions.windows(2).all(|pair| pair[0] < pair[1]),
            "{start}"
        );
        assert!(!start.contains("ffi_wgpu_render_passes()"), "{start}");
        let call = z_between(section, "fn ffi_start_wgpu_render_pass_call(", "\n}");
        assert!(
            call.contains(
                "ffi_start_locked_wgpu_render_pass_call(&mut ffi_wgpu_render_passes(), pass.addr())"
            ),
            "{call}"
        );
        let release = z_between(section, "fn ffi_start_wgpu_render_pass_release(", "\n}");
        let order = [
            "let mut registry = ffi_wgpu_render_passes();",
            "FfiWgpuRenderPassPhase::Ended | FfiWgpuRenderPassPhase::Stale",
            "registry.entries.remove(&token);",
            "return ffi_start_locked_wgpu_render_pass_call(&mut registry, token);",
        ];
        let positions: Vec<usize> = order
            .iter()
            .map(|step| {
                release
                    .find(step)
                    .unwrap_or_else(|| panic!("{step}\n{release}"))
            })
            .collect();
        assert!(
            positions.windows(2).all(|pair| pair[0] < pair[1]),
            "{release}"
        );
        assert_eq!(
            release.matches("ffi_wgpu_render_passes()").count(),
            1,
            "{release}"
        );
        assert!(!release.contains("Busy"), "{release}");
        let free = z_function("flight_free_wgpu_render_pass_handle");
        let decided = free
            .find("let started = ffi_start_wgpu_render_pass_release(pass);")
            .unwrap();
        let hook = free.find("run_wgpu_render_pass_hook(\"free\");").unwrap();
        let dropped = free.find("drop(call);").unwrap();
        let removed = free
            .find("ffi_wgpu_render_passes().entries.remove(&token);")
            .unwrap();
        assert!(
            decided < hook && hook < dropped && dropped < removed,
            "{free}"
        );
        assert_eq!(
            free.matches("ffi_wgpu_render_passes()").count(),
            1,
            "{free}"
        );
        let settle = z_between(section, "impl Drop for FfiWgpuRenderPassCall {", "\n}\n");
        assert_eq!(
            settle.matches("ffi_wgpu_render_passes()").count(),
            1,
            "{settle}"
        );
        let settled = settle.find("entry.phase = self.settle;").unwrap();
        let bracket = settle
            .find("registry.open.remove(&self.entry.state);")
            .unwrap();
        let unclaimed = settle
            .find("registry.claimed.remove(&self.entry.state);")
            .unwrap();
        assert!(settled < bracket && bracket < unclaimed, "{settle}");
        let reclaimed = z_between(
            section,
            "unsafe fn ffi_settle_wgpu_render_state_bracket(",
            "\n}",
        );
        assert_eq!(
            reclaimed.matches("ffi_wgpu_render_passes()").count(),
            1,
            "{reclaimed}"
        );
        let release = z_between(section, "impl Drop for FfiWgpuRenderStateClaim {", "\n}\n");
        assert!(release.contains("claimed.remove(&self.0)"), "{release}");
        assert!(section.contains(
            "FFI_WGPU_RENDER_PASSES.lock().unwrap_or_else(std::sync::PoisonError::into_inner)"
        ));
    }

    #[test]
    fn contains_every_sdk_call_in_a_panic_boundary() {
        for consumer in BORROW_ERASED_BRACKETS[0].consumers {
            let body = z_function(consumer.ffi_name);
            let boundary = body.find("std::panic::catch_unwind(").unwrap();
            let call = body
                .find(&format!("flight_sdk::{}(&mut ffi_pass", consumer.function))
                .unwrap();
            assert!(boundary < call, "{body}");
            assert_eq!(body.matches("catch_unwind").count(), 1, "{body}");
            assert!(body.ends_with("return drawn.is_ok();"), "{body}");
        }
        let begin = z_function("flight_begin_wgpu_render_pass");
        let boundary = begin.find("std::panic::catch_unwind(").unwrap();
        let call = begin
            .find("render_wgpu::contract::begin_wgpu_render_pass(")
            .unwrap();
        assert!(boundary < call, "{begin}");
        let end = z_between(
            z_bracket_section(),
            "unsafe fn ffi_end_exact_wgpu_render_pass(",
            "\n}",
        );
        let stale = end
            .find("call.settle = FfiWgpuRenderPassPhase::Stale;")
            .unwrap();
        let boundary = end.find("std::panic::catch_unwind(").unwrap();
        let call = end
            .find("render_wgpu::contract::end_wgpu_render_pass(")
            .unwrap();
        let ended = end
            .find("call.settle = FfiWgpuRenderPassPhase::Ended;")
            .unwrap();
        assert!(stale < boundary && boundary < call && call < ended, "{end}");
    }

    #[test]
    fn reaches_the_sdk_only_after_null_claim_and_relation_checks() {
        for name in z_bracket_symbols().into_iter().skip(1) {
            let body = z_function(name);
            let null = body.find("pass.is_null()").unwrap();
            let claim = body
                .find("ffi_start_wgpu_render_pass_call(pass)")
                .or_else(|| body.find("ffi_start_wgpu_render_pass_release(pass)"))
                .unwrap();
            let relation = body
                .find("ffi_classify_wgpu_render_pass(&call.entry)")
                .unwrap();
            let call = body
                .find("std::panic::catch_unwind(")
                .or_else(|| body.find("ffi_end_exact_wgpu_render_pass(&mut call)"))
                .unwrap();
            assert!(
                null < claim && claim < relation && relation < call,
                "{name}:\n{body}"
            );
        }
        let begin = z_function("flight_begin_wgpu_render_pass");
        let claim = begin
            .find("ffi_claim_wgpu_render_state(state, false)")
            .unwrap();
        let settle = begin.find("ffi_settle_wgpu_render_state_bracket(").unwrap();
        let native = begin.find("get_wgpu_active_render_pass(").unwrap();
        let call = begin.find("std::panic::catch_unwind(").unwrap();
        assert!(
            claim < settle && settle < native && native < call,
            "{begin}"
        );
    }

    #[test]
    fn lowers_no_other_function_through_the_pass_handle() {
        let mut takes_handle = Vec::new();
        for (start, _) in GENERATED.match_indices("pub unsafe extern \"C\" fn ") {
            let rest = &GENERATED[start..];
            let signature = &rest[..rest.find('{').unwrap()];
            if signature.contains("FfiWgpuRenderPassHandle") {
                let name =
                    &signature["pub unsafe extern \"C\" fn ".len()..signature.find('(').unwrap()];
                takes_handle.push(name);
            }
        }
        takes_handle.sort();
        let mut expected = z_bracket_symbols();
        expected.sort();
        assert_eq!(takes_handle, expected);
    }
}

mod guard_bracket_state_wrappers {
    use super::*;

    #[test]
    fn claims_the_state_first_in_every_other_wrapper_that_takes_it() {
        let outside = &GENERATED[..GENERATED.find("// borrow-erased brackets\n").unwrap()];
        let mut guarded = Vec::new();
        let lines: Vec<&str> = outside.lines().collect();
        for (at, line) in lines.iter().enumerate() {
            let Some(signature) = line.strip_prefix("pub unsafe extern \"C\" fn ") else {
                continue;
            };
            if !signature.contains("flight_sdk::WgpuRenderState,")
                && !signature.contains("flight_sdk::WgpuRenderState)")
            {
                continue;
            }
            if !signature.contains(": *mut flight_sdk::WgpuRenderState")
                && !signature.contains(": *const flight_sdk::WgpuRenderState")
            {
                continue;
            }
            let state = signature
                .split_once('(')
                .unwrap()
                .1
                .split(", ")
                .find(|parameter| parameter.contains("flight_sdk::WgpuRenderState"))
                .unwrap()
                .split_once(':')
                .unwrap()
                .0;
            assert!(
                lines[at + 1].starts_with(&format!(
                    "    let Some(_bracket_state_claim) = ffi_claim_wgpu_render_state({state}, true) else {{"
                )),
                "{line}\n{}",
                lines[at + 1]
            );
            guarded.push(&signature[..signature.find('(').unwrap()]);
        }
        guarded.sort();
        let mut reported: Vec<&str> = STATS
            .lines()
            .filter_map(|line| line.strip_prefix("  bracket state claim: "))
            .collect();
        reported.sort();
        assert_eq!(guarded, reported);
        assert_eq!(reported.len(), 163);
        assert!(reported.contains(&"flight_destroy_wgpu_scene_2d_render"));
        assert!(reported.contains(&"flight_prepare_wgpu_scene_2d_render"));
    }

    #[test]
    fn returns_each_wrapper_failure_value_and_leaves_other_wrappers_alone() {
        let generated = "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn a(state: *mut flight_sdk::WgpuRenderState) -> bool {\n}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn b(x: i32, state: *const flight_sdk::WgpuRenderState) {\n}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn c(state: *mut flight_sdk::WgpuRenderState) -> *mut u8 {\n}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn d(state: *mut flight_sdk::WgpuRenderState) -> *const u8 {\n}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn e(state: *mut flight_sdk::WgpuRenderState) -> f32 {\n}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn f(state: *mut flight_sdk::WgpuRenderStateRuntime) -> bool {\n}\n";
        let (guarded, names) = guard_bracket_state_wrappers(generated, &BORROW_ERASED_BRACKETS[0]);
        assert_eq!(names, ["a", "b", "c", "d", "e"]);
        for (name, failure) in [
            ("a", "return false;"),
            ("b", "return;"),
            ("c", "return std::ptr::null_mut();"),
            ("d", "return std::ptr::null();"),
            ("e", "return Default::default();"),
        ] {
            let body = z_between(&guarded, &format!("fn {name}("), "\n}");
            assert!(
                body.contains(&format!(
                    "ffi_claim_wgpu_render_state(state, true) else {{ {failure} }};"
                )),
                "{name}: {body}"
            );
        }
        assert!(!z_between(&guarded, "fn f(", "\n}").contains("ffi_claim"));
        assert_eq!(guarded.matches("#[doc = \"flight-ffi contract|").count(), 5);
    }
}

mod header {
    use super::*;

    #[test]
    fn declares_the_typed_opaque_handle_and_the_exact_prototypes() {
        assert!(
            HEADER.contains(
                "typedef struct FlightWgpuRenderPassHandle FlightWgpuRenderPassHandle;\n"
            )
        );
        for prototype in [
            "FlightWgpuRenderPassHandle * flight_begin_wgpu_render_pass(void * arg0, void * arg1, void * arg2);",
            "bool flight_end_wgpu_render_pass(FlightWgpuRenderPassHandle * arg0);",
            "void flight_free_wgpu_render_pass_handle(FlightWgpuRenderPassHandle * arg0);",
            "bool flight_render_wgpu_scene2d(FlightWgpuRenderPassHandle * arg0, void * arg1, const FlightNode * arg2, void * arg3);",
            "bool flight_render_wgpu_scene3d(FlightWgpuRenderPassHandle * arg0, const FlightNode * arg1, void * arg2, void * arg3, void * arg4);",
            "bool flight_render_wgpu_environment_skybox(FlightWgpuRenderPassHandle * arg0, void * arg1, void * arg2, double arg3);",
        ] {
            assert_eq!(HEADER.matches(prototype).count(), 1, "{prototype}");
        }
        let typed: Vec<_> = HEADER
            .lines()
            .filter(|line| line.contains("FlightWgpuRenderPassHandle *"))
            .collect();
        assert_eq!(typed.len(), 6, "{typed:?}");
        assert!(!HEADER.contains("wgpu::"));
    }

    #[test]
    fn documents_ownership_lifetime_alias_thread_reentry_panics_and_tombstones() {
        let begin = z_header_comments("flight_begin_wgpu_render_pass(");
        for phrase in [
            "release it with flight_free_wgpu_render_pass_handle",
            "registry token, never a pointer to memory",
            "never the state",
            "stay alive at the same address",
            "nothing may read, mutate, submit, replace, destroy, move or free it",
            "Calls may come from any thread",
            "returns its failure value at once instead of waiting",
            "borrowed for this call only",
            "non-local jump or foreign exception",
            "A Rust panic inside the SDK begin is contained and returns NULL",
            "Caller owns the return value; call flight_free_wgpu_render_pass_handle when done.",
        ] {
            assert!(begin.contains(phrase), "begin: {phrase}");
        }
        let end = z_header_comments("flight_end_wgpu_render_pass(");
        for phrase in [
            "ended tombstone",
            "exactly one flight_free_wgpu_render_pass_handle",
            "marks the handle stale and is never ended",
            "opened natively above this one",
            "the handle becomes stale",
        ] {
            assert!(end.contains(phrase), "end: {phrase}");
        }
        let free = z_header_comments("flight_free_wgpu_render_pass_handle(");
        for phrase in [
            "NULL, an unknown or already released handle, or a pointer that is not a pass handle is a no-op",
            "never reissued and never dereferenced",
            "is ended first",
            "another call holds its state",
            "opened natively is still open above it",
            "the handle is still released",
        ] {
            assert!(free.contains(phrase), "free: {phrase}");
        }
        for consumer in BORROW_ERASED_BRACKETS[0].consumers {
            let comments = z_header_comments(&format!("{}(", consumer.ffi_name));
            for phrase in [
                "another call holds the handle's state",
                "a call on the same handle from inside a draw",
                "replaced",
                "natively on the same state",
                "the pass stays open",
            ] {
                assert!(comments.contains(phrase), "{}: {phrase}", consumer.ffi_name);
            }
        }
        for name in [
            "flight_destroy_wgpu_scene_2d_render(",
            "flight_prepare_wgpu_scene_2d_render(",
        ] {
            let comments = z_header_comments(name);
            assert!(
                comments.contains("an open render pass handle borrows state"),
                "{name}: {comments}"
            );
        }
    }
}

mod native_bindings {
    use super::*;

    #[test]
    fn exposes_each_bracket_symbol_once_through_hashlink() {
        for (name, signature) in [
            (
                "flight_begin_wgpu_render_pass",
                "DEFINE_PRIM(_BYTES, flight_begin_wgpu_render_pass, _BYTES _BYTES _BYTES);",
            ),
            (
                "flight_end_wgpu_render_pass",
                "DEFINE_PRIM(_BOOL, flight_end_wgpu_render_pass, _BYTES);",
            ),
            (
                "flight_free_wgpu_render_pass_handle",
                "DEFINE_PRIM(_VOID, flight_free_wgpu_render_pass_handle, _BYTES);",
            ),
            (
                "flight_render_wgpu_scene2d",
                "DEFINE_PRIM(_BOOL, flight_render_wgpu_scene2d, _BYTES _BYTES _BYTES _BYTES);",
            ),
            (
                "flight_render_wgpu_scene3d",
                "DEFINE_PRIM(_BOOL, flight_render_wgpu_scene3d, _BYTES _BYTES _BYTES _BYTES _BYTES);",
            ),
            (
                "flight_render_wgpu_environment_skybox",
                "DEFINE_PRIM(_BOOL, flight_render_wgpu_environment_skybox, _BYTES _BYTES _BYTES _F64);",
            ),
        ] {
            assert_eq!(HL.matches(signature).count(), 1, "{name}");
            assert_eq!(
                HL.matches(&format!("HL_NAME({name})(")).count(),
                1,
                "{name}"
            );
        }
    }
}

mod reachability {
    use super::*;

    #[test]
    fn records_begin_as_the_handle_producer_and_the_rest_as_its_consumers() {
        let handle = "Box<FfiWgpuRenderPassHandle>";
        let producers: Vec<_> = GRAPH
            .lines()
            .filter(|line| line.starts_with("produce|") && line.ends_with(&format!("|{handle}")))
            .collect();
        assert_eq!(
            producers,
            [format!("produce|flight_begin_wgpu_render_pass|{handle}")]
        );
        let mut consumers: Vec<_> = GRAPH
            .lines()
            .filter(|line| line.starts_with("consume|") && line.ends_with(&format!("|{handle}")))
            .map(|line| line.split('|').nth(1).unwrap())
            .collect();
        consumers.sort();
        let mut expected: Vec<_> = z_bracket_symbols().into_iter().skip(1).collect();
        expected.sort();
        assert_eq!(consumers, expected);
        for optional in [
            "optional|flight_begin_wgpu_render_pass|*const flight_sdk::RenderTargetClear",
            "optional|flight_render_wgpu_scene2d|Box<flight_sdk::Matrix>",
        ] {
            assert!(GRAPH.lines().any(|line| line == optional), "{optional}");
        }
    }
}

// The begin, end and free, then each consumer wrapper, in table order.
fn z_bracket_symbols() -> Vec<&'static str> {
    let bracket = &BORROW_ERASED_BRACKETS[0];
    let mut names = vec![bracket.ffi_begin, bracket.ffi_end, bracket.ffi_free];
    names.extend(bracket.consumers.iter().map(|consumer| consumer.ffi_name));
    return names;
}

fn z_bracket_copy() -> BorrowErasedBracket {
    let bracket = &BORROW_ERASED_BRACKETS[0];
    return BorrowErasedBracket {
        crate_dir: bracket.crate_dir,
        begin: bracket.begin,
        begin_signature: bracket.begin_signature,
        end: bracket.end,
        end_signature: bracket.end_signature,
        state: bracket.state,
        borrowed: bracket.borrowed,
        handle: bracket.handle,
        ffi_begin: bracket.ffi_begin,
        ffi_end: bracket.ffi_end,
        ffi_free: bracket.ffi_free,
        consumers: bracket.consumers,
    };
}

// The generated bracket section, from its marker to the next generated section.
fn z_bracket_section() -> &'static str {
    return z_between(
        GENERATED,
        "// borrow-erased brackets\n",
        "\n// Exact, tagged handle families",
    );
}

fn z_between<'a>(text: &'a str, start: &str, end: &str) -> &'a str {
    let from = text
        .find(start)
        .unwrap_or_else(|| panic!("missing {start}"))
        + start.len();
    let to = text[from..]
        .find(end)
        .unwrap_or_else(|| panic!("missing {end}"))
        + from;
    return &text[from..to];
}

// One generated wrapper's body.
fn z_function(name: &str) -> &'static str {
    return z_between(
        z_bracket_section(),
        &format!("pub unsafe extern \"C\" fn {name}("),
        "\n}\n",
    );
}

// The comment lines immediately above a header prototype.
fn z_header_comments(prototype: &str) -> String {
    let lines: Vec<&str> = HEADER.lines().collect();
    let at = lines
        .iter()
        .position(|line| line.contains(prototype))
        .unwrap();
    let mut comments = Vec::new();
    for line in lines[..at].iter().rev() {
        if !line.starts_with("/*") {
            break;
        }
        comments.push(*line);
    }
    return comments.join("\n");
}
