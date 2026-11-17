// Emit native artifacts from the exact Rust C ABI surface, including generated accessors/frees.
// This belongs with flight-ffi, rather than a downstream Haxe-signature approximation.
use std::collections::BTreeMap;
use std::fmt::Write;
use std::path::Path;
use syn::{FnArg, Item, ReturnType, Type};

struct Carrier {
    c: String,
    hl: &'static str,
    signature: &'static str,
}

fn carrier(ty: &Type) -> Carrier {
    match ty {
        Type::Ptr(pointer) => {
            if let Type::Ptr(inner) = &*pointer.elem {
                let is_void = matches!(&*inner.elem, Type::Path(p) if p.path.segments.last().is_some_and(|s| s.ident == "c_void"));
                assert!(is_void, "unsupported pointer-to-pointer ABI");
                let inner_const = if inner.const_token.is_some() {
                    "const "
                } else {
                    ""
                };
                let pointer_const = if pointer.const_token.is_some() {
                    " const"
                } else {
                    ""
                };
                return Carrier {
                    c: format!("{inner_const}void *{pointer_const} *"),
                    hl: "vbyte *",
                    signature: "_BYTES",
                };
            }
            let is_char = matches!(&*pointer.elem, Type::Path(p) if p.path.segments.last().is_some_and(|s| s.ident == "c_char"));
            let c = if is_char {
                if pointer.const_token.is_some() {
                    "const char *"
                } else {
                    "char *"
                }
            } else {
                // Expose SDK pointers as opaque C carriers, matching the generated Haxe handles.
                "void *"
            };
            Carrier {
                c: c.into(),
                hl: "vbyte *",
                signature: "_BYTES",
            }
        }
        Type::BareFn(_) => Carrier {
            c: "void *".into(),
            hl: "vbyte *",
            signature: "_BYTES",
        },
        Type::Path(p) => {
            let last = p.path.segments.last().unwrap();
            if last.ident == "Option" {
                let syn::PathArguments::AngleBracketed(args) = &last.arguments else {
                    panic!("Option ABI");
                };
                let Some(syn::GenericArgument::Type(Type::BareFn(_))) = args.args.first() else {
                    panic!("unsupported Option ABI");
                };
                return Carrier {
                    c: "void *".into(),
                    hl: "vbyte *",
                    signature: "_BYTES",
                };
            }
            let (c, hl, signature) = match last.ident.to_string().as_str() {
                "f32" => ("float", "float", "_F32"),
                "f64" => ("double", "double", "_F64"),
                "bool" => ("bool", "bool", "_BOOL"),
                "i8" => ("int8_t", "int", "_I32"),
                "u8" => ("uint8_t", "int", "_I32"),
                "i16" => ("int16_t", "int", "_I32"),
                "u16" => ("uint16_t", "int", "_I32"),
                "i32" => ("int32_t", "int", "_I32"),
                "u32" => ("uint32_t", "int", "_I32"),
                "i64" => ("int64_t", "int64", "_I64"),
                "u64" => ("uint64_t", "int64", "_I64"),
                "isize" => ("intptr_t", "int", "_I32"),
                "usize" => ("size_t", "int", "_I32"),
                _ => panic!("unsupported ABI carrier {}", last.ident),
            };
            Carrier {
                c: c.into(),
                hl,
                signature,
            }
        }
        _ => panic!("unsupported generated ABI type"),
    }
}

fn validate_vec_result_helpers(file: &syn::File) {
    let mut groups: BTreeMap<String, u8> = BTreeMap::new();
    for item in &file.items {
        let Item::Fn(function) = item else {
            continue;
        };
        let name = function.sig.ident.to_string();
        for (suffix, bit) in [("_result_len", 1), ("_result_get", 2), ("_result_free", 4)] {
            if let Some(root) = name.strip_suffix(suffix) {
                *groups.entry(root.to_string()).or_default() |= bit;
            }
        }
    }
    for (root, helpers) in groups {
        assert_eq!(
            helpers, 7,
            "incomplete Vec result helper set for {root}: mask {helpers}"
        );
    }
}

fn type_fingerprint(ty: &Type) -> String {
    match ty {
        Type::Path(path) => path
            .path
            .segments
            .iter()
            .map(|segment| {
                let mut value = segment.ident.to_string();
                if let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments {
                    let types: Vec<_> = arguments
                        .args
                        .iter()
                        .filter_map(|argument| match argument {
                            syn::GenericArgument::Type(ty) => Some(type_fingerprint(ty)),
                            _ => None,
                        })
                        .collect();
                    value.push('<');
                    value.push_str(&types.join(","));
                    value.push('>');
                }
                value
            })
            .collect::<Vec<_>>()
            .join("::"),
        Type::TraitObject(object) => {
            let bounds: Vec<_> = object
                .bounds
                .iter()
                .filter_map(|bound| match bound {
                    syn::TypeParamBound::Trait(trait_bound) => Some(
                        trait_bound
                            .path
                            .segments
                            .iter()
                            .map(|segment| segment.ident.to_string())
                            .collect::<Vec<_>>()
                            .join("::"),
                    ),
                    _ => None,
                })
                .collect();
            format!("dyn {}", bounds.join("+"))
        }
        Type::Ptr(pointer) => format!(
            "*{} {}",
            if pointer.mutability.is_some() {
                "mut"
            } else {
                "const"
            },
            type_fingerprint(&pointer.elem)
        ),
        _ => panic!("unsupported generated handle type"),
    }
}

fn pointer_pointee(ty: &Type) -> Option<&Type> {
    pointer_type(ty).map(|pointer| &*pointer.elem)
}

fn pointer_type(ty: &Type) -> Option<&syn::TypePtr> {
    match ty {
        Type::Ptr(pointer) => Some(pointer),
        _ => None,
    }
}

fn function_param(function: &syn::ItemFn, index: usize) -> &Type {
    let Some(FnArg::Typed(parameter)) = function.sig.inputs.iter().nth(index) else {
        panic!("missing generated FFI parameter {index}");
    };
    &parameter.ty
}

fn function_return(function: &syn::ItemFn) -> Option<&Type> {
    match &function.sig.output {
        ReturnType::Default => None,
        ReturnType::Type(_, ty) => Some(ty),
    }
}

fn validate_vec_ref_handles(file: &syn::File) {
    let functions: BTreeMap<_, _> = file
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Fn(function) => Some((function.sig.ident.to_string(), function)),
            _ => None,
        })
        .collect();
    let expected = [
        (
            "app_window",
            "FfiVecRefHandle<flight_sdk::AppWindow>",
            "flight_get_app_loop_windows",
        ),
        (
            "audio_channel",
            "FfiVecRefHandle<flight_sdk::AudioChannel>",
            "flight_get_audio_mixer_active_channels",
        ),
        (
            "dyn_modifier",
            "FfiVecRefHandle<dyn flight_sdk::Modifier>",
            "flight_order_modifier_stack",
        ),
        (
            "flow_state",
            "FfiVecRefHandle<flight_sdk::FlowState>",
            "flight_get_flow_stack_visible_states",
        ),
        (
            "texture",
            "FfiVecRefHandle<flight_sdk::Texture>",
            "flight_get_scene3d_resource_textures",
        ),
        (
            "texture_atlas_region",
            "FfiVecRefHandle<flight_sdk::TextureAtlasRegion>",
            "flight_get_texture_atlas_region_sequence",
        ),
        (
            "tray_icon",
            "FfiVecRefHandle<flight_sdk::TrayIcon>",
            "flight_get_tray_icons",
        ),
    ];
    let expected_types: BTreeMap<_, _> = expected
        .iter()
        .map(|(slug, ty, _)| ((*ty).to_string(), *slug))
        .collect();

    for (slug, expected_type, wrapper_name) in expected {
        let root = format!("flight_vec_ref_{slug}");
        let create = functions
            .get(&format!("{root}_create"))
            .unwrap_or_else(|| panic!("missing {root}_create"));
        let len = functions
            .get(&format!("{root}_len"))
            .unwrap_or_else(|| panic!("missing {root}_len"));
        let get = functions
            .get(&format!("{root}_get"))
            .unwrap_or_else(|| panic!("missing {root}_get"));
        let free = functions
            .get(&format!("{root}_free"))
            .unwrap_or_else(|| panic!("missing {root}_free"));
        let wrapper = functions
            .get(wrapper_name)
            .unwrap_or_else(|| panic!("missing {wrapper_name}"));

        assert!(
            create.sig.inputs.is_empty(),
            "{root}_create must require no existing handle"
        );
        let created_pointer = function_return(create)
            .and_then(pointer_type)
            .unwrap_or_else(|| panic!("{root}_create must return an exact handle pointer"));
        assert!(
            created_pointer.mutability.is_some(),
            "{root}_create must return an owned mutable handle"
        );
        let created_type = type_fingerprint(&created_pointer.elem);
        assert_eq!(created_type, expected_type, "wrong {root} handle type");
        for (name, function) in [("len", len), ("get", get), ("free", free)] {
            let parameter = pointer_type(function_param(function, 0))
                .unwrap_or_else(|| panic!("{root}_{name} must accept a handle pointer"));
            let parameter_type = type_fingerprint(&parameter.elem);
            assert_eq!(
                parameter_type, expected_type,
                "{root}_{name} accepts a different handle type"
            );
            assert_eq!(
                parameter.mutability.is_some(),
                name == "free",
                "{root}_{name} has the wrong handle mutability"
            );
        }
        assert_eq!(len.sig.inputs.len(), 1, "{root}_len ABI changed");
        assert_eq!(
            function_return(len).map(type_fingerprint).as_deref(),
            Some("usize"),
            "{root}_len must return usize"
        );
        assert_eq!(get.sig.inputs.len(), 2, "{root}_get ABI changed");
        assert_eq!(
            type_fingerprint(function_param(get, 1)),
            "usize",
            "{root}_get must accept a usize index"
        );
        assert_eq!(
            function_return(get)
                .and_then(pointer_pointee)
                .map(type_fingerprint)
                .as_deref(),
            Some("std::ffi::c_void"),
            "{root}_get must return an opaque Ref pointer"
        );
        assert_eq!(free.sig.inputs.len(), 1, "{root}_free ABI changed");
        assert!(
            function_return(free).is_none(),
            "{root}_free must not return a value"
        );
        assert!(
            wrapper.sig.inputs.iter().any(|argument| {
                let FnArg::Typed(parameter) = argument else {
                    return false;
                };
                pointer_type(&parameter.ty).is_some_and(|pointer| {
                    pointer.mutability.is_some() && type_fingerprint(&pointer.elem) == expected_type
                })
            }),
            "{wrapper_name} is not callable with {root}_create's exact handle type"
        );
    }

    for (name, function) in &functions {
        if !name.starts_with("flight_") {
            continue;
        }
        for argument in &function.sig.inputs {
            let FnArg::Typed(parameter) = argument else {
                continue;
            };
            let Some(handle_type) = pointer_pointee(&parameter.ty).map(type_fingerprint) else {
                continue;
            };
            if handle_type.starts_with("FfiVecRefHandle<") {
                assert!(
                    expected_types.contains_key(&handle_type),
                    "{name} accepts a Vec<Ref<_>> handle with no exact constructor: {handle_type}"
                );
            }
        }
    }
}

pub fn emit(source: &str, out: &Path) {
    let file = syn::parse_file(source).expect("generated FFI Rust must parse");
    validate_vec_result_helpers(&file);
    validate_vec_ref_handles(&file);
    let mut header = String::from(
        "/* Generated by flight-ffi. Opaque pointers preserve ABI without exposing Rust layouts. */\n#ifndef FLIGHT_FFI_H\n#define FLIGHT_FFI_H\n#include <stdbool.h>\n#include <stdint.h>\n#include <stddef.h>\n#ifdef __cplusplus\nextern \"C\" {\n#endif\n",
    );
    let mut shim = String::from(
        "/* Generated by flight-ffi for the HashLink native ABI. */\n#define HL_NAME(n) flight_hl_##n\n#include <hl.h>\n#include \"flight_ffi.h\"\n",
    );
    for item in file.items {
        let Item::Fn(function) = item else {
            continue;
        };
        if function
            .sig
            .abi
            .as_ref()
            .and_then(|a| a.name.as_ref())
            .is_none_or(|n| n.value() != "C")
        {
            continue;
        }
        let name = function.sig.ident.to_string();
        if !name.starts_with("flight_") {
            continue;
        }
        let result = match &function.sig.output {
            ReturnType::Default => None,
            ReturnType::Type(_, ty) => Some(carrier(ty)),
        };
        let mut c_params = Vec::new();
        let mut hl_params = Vec::new();
        let mut call_args = Vec::new();
        let mut signatures = Vec::new();
        for (index, argument) in function.sig.inputs.iter().enumerate() {
            let FnArg::Typed(parameter) = argument else {
                panic!("C ABI receiver");
            };
            let ty = carrier(&parameter.ty);
            let arg = format!("arg{index}");
            c_params.push(format!("{} {arg}", ty.c));
            hl_params.push(format!("{} {arg}", ty.hl));
            call_args.push(format!("({}){arg}", ty.c));
            signatures.push(ty.signature);
        }
        let ret = result.as_ref().map(|r| r.c.as_str()).unwrap_or("void");
        let hl_ret = result.as_ref().map(|r| r.hl).unwrap_or("void");
        let ret_signature = result.as_ref().map(|r| r.signature).unwrap_or("_VOID");
        let c_params = if c_params.is_empty() {
            "void".into()
        } else {
            c_params.join(", ")
        };
        let hl_params = if hl_params.is_empty() {
            "void".into()
        } else {
            hl_params.join(", ")
        };
        writeln!(header, "{ret} {name}({c_params});").unwrap();
        let call = format!("{name}({})", call_args.join(", "));
        let body = if result.is_some() {
            format!("return ({hl_ret}){call};")
        } else {
            format!("{call};")
        };
        writeln!(
            shim,
            "HL_PRIM {hl_ret} HL_NAME({name})({hl_params}) {{ {body} }}"
        )
        .unwrap();
        let signature = if signatures.is_empty() {
            "_NO_ARG".into()
        } else {
            signatures.join(" ")
        };
        writeln!(shim, "DEFINE_PRIM({ret_signature}, {name}, {signature});").unwrap();
    }
    header.push_str("#ifdef __cplusplus\n}\n#endif\n#endif\n");
    std::fs::write(out.join("flight_ffi.h"), header).unwrap();
    std::fs::write(out.join("flight_hl.c"), shim).unwrap();
}
