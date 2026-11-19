//! Pins the borrow-erased WGPU pass bracket the generator emits: one exact table entry, its
//! signature-drift failures, the generated support's shape and validator order, and its C header,
//! HashLink, stats and reachability surface. Runtime behaviour is in
//! `src/render_pass_bracket_runtime_test.rs`.

#[path = "../render_pass_bracket.rs"]
mod render_pass_bracket;

use render_pass_bracket::{
    BORROW_ERASED_BRACKETS, BorrowErasedBracket, check_bracket_free_link, check_bracket_signature,
    normalize_signature,
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
    fn carries_identities_and_a_phase_never_a_borrow_or_a_native_pass() {
        let section = z_bracket_section();
        for banned in [
            "transmute",
            "WgpuRenderPass<'static>",
            "&'static mut",
            "catch_unwind",
            "wgpu::RenderPass",
            "static mut",
            "Box::leak",
            "OnceLock",
            "Mutex",
        ] {
            assert!(
                !section.contains(banned),
                "bracket support contains {banned}"
            );
        }
        // The only `'static` is the test-only validation trace's step names.
        assert!(
            !section.replace("&'static str", "").contains("'static"),
            "bracket support names a 'static borrow"
        );
        let handle = z_between(section, "pub struct FfiWgpuRenderPassHandle {", "\n}");
        let fields: Vec<_> = handle
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect();
        assert_eq!(
            fields,
            [
                "state: std::ptr::NonNull<flight_sdk::WgpuRenderState>,",
                "state_id: u64,",
                "index: usize,",
                "record_id: u64,",
                "phase: FfiWgpuRenderPassPhase,",
                "_thread_bound: std::marker::PhantomData<std::rc::Rc<()>>,",
            ]
        );
        assert_eq!(section.matches("Box::into_raw").count(), 1);
        assert_eq!(section.matches("Box::from_raw").count(), 1);
    }

    #[test]
    fn validates_state_identity_then_the_original_record_then_the_top() {
        let classify = z_between(
            z_bracket_section(),
            "unsafe fn ffi_classify_wgpu_render_pass(",
            "\n}",
        );
        let order = [
            "get_entity_id(state) != state_id",
            "get_wgpu_render_state_runtime(state)",
            "pass_stack.get(index)",
            "get_entity_id(record) == record_id",
            "index + 1 == pass_stack.len()",
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
    fn reaches_the_sdk_only_after_null_phase_and_relation_checks() {
        for name in z_bracket_symbols().into_iter().skip(1) {
            if name == "flight_free_wgpu_render_pass_handle" {
                continue;
            }
            let body = z_function(name);
            let null = body.find("pass.is_null()").unwrap();
            let phase = body.find("!= FfiWgpuRenderPassPhase::Open").unwrap();
            let relation = body.find("!= FfiWgpuRenderPassRelation::ExactTop").unwrap();
            let call = body
                .find("flight_sdk::render_wgpu")
                .or_else(|| body.find("ffi_end_exact_wgpu_render_pass(pass)"))
                .unwrap();
            assert!(
                null < phase && phase < relation && relation < call,
                "{name}:\n{body}"
            );
        }
    }

    #[test]
    fn writes_busy_around_each_sdk_call_and_restores_after_it_returns() {
        for consumer in BORROW_ERASED_BRACKETS[0].consumers {
            let body = z_function(consumer.ffi_name);
            let busy = body
                .find("(*pass).phase = FfiWgpuRenderPassPhase::Busy")
                .unwrap();
            let call = body
                .find(&format!("flight_sdk::{}(&mut ffi_pass", consumer.function))
                .unwrap();
            let open = body
                .find("(*pass).phase = FfiWgpuRenderPassPhase::Open")
                .unwrap();
            assert!(busy < call && call < open, "{body}");
            assert!(!body.contains("&mut *pass"), "{body}");
        }
        let end = z_between(
            z_bracket_section(),
            "unsafe fn ffi_end_exact_wgpu_render_pass(",
            "\n}",
        );
        let busy = end.find("FfiWgpuRenderPassPhase::Busy").unwrap();
        let call = end.find("end_wgpu_render_pass(").unwrap();
        let ended = end.find("FfiWgpuRenderPassPhase::Ended").unwrap();
        assert!(busy < call && call < ended, "{end}");
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
    fn documents_ownership_lifetime_alias_thread_reentry_and_tombstones() {
        let begin = z_header_comments("flight_begin_wgpu_render_pass(");
        for phrase in [
            "release it with flight_free_wgpu_render_pass_handle",
            "never the state",
            "stay alive at the same address",
            "no alias may read, mutate, submit, replace, destroy, move or free it",
            "serialized on one thread",
            "borrowed for this call only",
            "non-local jump or foreign exception",
            "a Rust panic aborts",
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
        ] {
            assert!(end.contains(phrase), "end: {phrase}");
        }
        let free = z_header_comments("flight_free_wgpu_render_pass_handle(");
        for phrase in [
            "NULL is a no-op",
            "is ended first",
            "a call on the same handle is running",
            "opened natively is still open above it",
            "second free or any later call is undefined behaviour",
        ] {
            assert!(free.contains(phrase), "free: {phrase}");
        }
        for consumer in BORROW_ERASED_BRACKETS[0].consumers {
            let comments = z_header_comments(&format!("{}(", consumer.ffi_name));
            for phrase in [
                "same-handle reentry",
                "separately retained state pointer is forbidden",
                "replaced",
                "natively on the same state",
            ] {
                assert!(comments.contains(phrase), "{}: {phrase}", consumer.ffi_name);
            }
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
