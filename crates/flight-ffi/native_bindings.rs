// Emit native artifacts from the exact Rust C ABI surface, including generated accessors/frees.
// This belongs with flight-ffi, rather than a downstream Haxe-signature approximation.
use std::collections::BTreeMap;
use std::fmt::Write;
use std::path::Path;
use syn::visit::Visit;
use syn::{Expr, ExprCall, ExprMethodCall, FnArg, Item, ReturnType, Type};

struct Carrier {
    c: String,
    hl: &'static str,
    signature: &'static str,
}

const OWNERSHIP_DOC_PREFIX: &str = "flight-ffi ownership|";
const CONTRACT_DOC_PREFIX: &str = "flight-ffi contract|";
const HASHLINK_FLOAT_PACK_THRESHOLD: usize = 6;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum OwnershipKind {
    OwnedReturn,
    OwnedCallback,
    OwnedOutput,
    Borrowed,
}

#[derive(Debug)]
struct Ownership {
    kind: OwnershipKind,
    free: Option<String>,
    owned_type: Option<String>,
    anchor: Option<String>,
}

fn function_ownership(function: &syn::ItemFn) -> Option<Ownership> {
    let mut ownership = None;
    for attribute in &function.attrs {
        if !attribute.path().is_ident("doc") {
            continue;
        }
        let syn::Meta::NameValue(meta) = &attribute.meta else {
            continue;
        };
        let Expr::Lit(literal) = &meta.value else {
            continue;
        };
        let syn::Lit::Str(value) = &literal.lit else {
            continue;
        };
        let value = value.value();
        let Some(payload) = value.strip_prefix(OWNERSHIP_DOC_PREFIX) else {
            continue;
        };
        assert!(
            ownership.is_none(),
            "duplicate ownership metadata on {}",
            function.sig.ident
        );
        let fields: Vec<_> = payload.split('|').collect();
        let parsed = match fields.as_slice() {
            ["owned-return", free, owned_type] => Ownership {
                kind: OwnershipKind::OwnedReturn,
                free: Some((*free).to_string()),
                owned_type: Some((*owned_type).to_string()),
                anchor: None,
            },
            ["owned-callback", free, owned_type] => Ownership {
                kind: OwnershipKind::OwnedCallback,
                free: Some((*free).to_string()),
                owned_type: Some((*owned_type).to_string()),
                anchor: None,
            },
            ["owned-output", free, owned_type] => Ownership {
                kind: OwnershipKind::OwnedOutput,
                free: Some((*free).to_string()),
                owned_type: Some((*owned_type).to_string()),
                anchor: None,
            },
            ["borrowed", anchor] => Ownership {
                kind: OwnershipKind::Borrowed,
                free: None,
                owned_type: None,
                anchor: Some((*anchor).to_string()),
            },
            _ => panic!(
                "malformed ownership metadata on {}: {value}",
                function.sig.ident
            ),
        };
        ownership = Some(parsed);
    }
    ownership
}

#[derive(Default)]
struct RawOwnerVisitor {
    allocations: usize,
}

impl<'ast> Visit<'ast> for RawOwnerVisitor {
    fn visit_expr_call(&mut self, call: &'ast ExprCall) {
        if let Expr::Path(path) = &*call.func {
            if path
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == "into_raw")
            {
                self.allocations += 1;
            }
        }
        syn::visit::visit_expr_call(self, call);
    }

    fn visit_expr_method_call(&mut self, call: &'ast ExprMethodCall) {
        if call.method == "into_raw" {
            self.allocations += 1;
        }
        syn::visit::visit_expr_method_call(self, call);
    }
}

// A callback parameter's C function-pointer type, `ret (*)(params)`; `name` places the declarator
// (`ret (*name)(params)`). HashLink still carries it as bytes and casts at the call.
fn bare_fn_c_type(function: &syn::TypeBareFn, name: &str, typed_scalar_pointers: bool) -> String {
    let inputs: Vec<String> = function
        .inputs
        .iter()
        .map(|input| {
            if typed_scalar_pointers {
                scalar_pointer_c_type(&input.ty).unwrap_or_else(|| carrier(&input.ty).c)
            } else {
                carrier(&input.ty).c
            }
        })
        .collect();
    let output = match &function.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, ty) => carrier(ty).c,
    };
    let inputs = if inputs.is_empty() {
        "void".to_string()
    } else {
        inputs.join(", ")
    };
    return format!("{output} (*{name})({inputs})");
}

// A callback parameter: a bare `extern "C" fn`, or an `Option` of one, which C sees as the same
// function-pointer type where NULL is `None` (Rust guarantees the null-pointer optimization).
fn callback_parameter(ty: &Type) -> Option<&syn::TypeBareFn> {
    match ty {
        Type::BareFn(function) => Some(function),
        Type::Path(path) => {
            let last = path.path.segments.last()?;
            if last.ident != "Option" {
                return None;
            }
            let syn::PathArguments::AngleBracketed(args) = &last.arguments else {
                return None;
            };
            match args.args.first() {
                Some(syn::GenericArgument::Type(Type::BareFn(function))) => Some(function),
                _ => None,
            }
        }
        _ => None,
    }
}

fn carrier(ty: &Type) -> Carrier {
    match ty {
        Type::Ptr(pointer) => {
            if let Type::Ptr(inner) = &*pointer.elem {
                let pointee = match &*inner.elem {
                    Type::Path(p) => p.path.segments.last().map(|s| s.ident.to_string()),
                    _ => None,
                };
                // `c_char` pointees are arrays of borrowed C strings (`&[&str]` parameters).
                let pointee = match pointee.as_deref() {
                    Some("c_void") => "void",
                    Some("c_char") => "char",
                    Some("FlightNode") => "FlightNode",
                    _ => panic!("unsupported pointer-to-pointer ABI"),
                };
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
                    c: format!("{inner_const}{pointee} *{pointer_const} *"),
                    hl: "vbyte *",
                    signature: "_BYTES",
                };
            }
            let is_shape_bounds_vtable = matches!(
                &*pointer.elem,
                Type::Path(p)
                    if p.path.segments.last().is_some_and(|segment| {
                        segment.ident == "FfiShapeBoundsContextVTable"
                    })
            );
            let opaque_name = match &*pointer.elem {
                Type::Path(path) => path.path.segments.last().and_then(|segment| {
                    matches!(
                        segment.ident.to_string().as_str(),
                        "FlightNode" | "FlightNodeArray"
                    )
                    .then(|| segment.ident.to_string())
                }),
                _ => None,
            };
            let is_char = matches!(&*pointer.elem, Type::Path(p) if p.path.segments.last().is_some_and(|s| s.ident == "c_char"));
            // The borrow-erased pass handle is the one opaque SDK carrier C sees by name, so a pass
            // cannot be passed where a state or target is expected.
            let is_render_pass_handle = matches!(
                &*pointer.elem,
                Type::Path(p)
                    if p.path.segments.last().is_some_and(|segment| {
                        segment.ident == "FfiWgpuRenderPassHandle"
                    })
            );
            // A native host handle is named too, so a host cannot be passed for any other carrier.
            let host_handle = match &*pointer.elem {
                Type::Path(path) => path.path.segments.last().and_then(|segment| {
                    crate::host_seam::HOST_FEATURES
                        .iter()
                        .find(|feature| segment.ident == feature.handle)
                }),
                _ => None,
            };
            let c = if is_render_pass_handle {
                "FlightWgpuRenderPassHandle *".to_string()
            } else if let Some(feature) = host_handle {
                format!("{} *", feature.c_handle)
            } else if is_shape_bounds_vtable {
                if pointer.const_token.is_some() {
                    "const FlightShapeBoundsContextVTable *".to_string()
                } else {
                    "FlightShapeBoundsContextVTable *".to_string()
                }
            } else if let Some(name) = opaque_name {
                if pointer.const_token.is_some() {
                    format!("const {name} *")
                } else {
                    format!("{name} *")
                }
            } else if is_char {
                if pointer.const_token.is_some() {
                    "const char *".to_string()
                } else {
                    "char *".to_string()
                }
            } else {
                // Expose SDK pointers as opaque C carriers, matching the generated Haxe handles.
                "void *".to_string()
            };
            Carrier {
                c,
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

fn scalar_pointer_c_type(ty: &Type) -> Option<String> {
    let Type::Ptr(pointer) = ty else {
        return None;
    };
    let Type::Path(path) = &*pointer.elem else {
        return None;
    };
    let scalar = match path.path.segments.last()?.ident.to_string().as_str() {
        "f32" => "float",
        "f64" => "double",
        "i8" => "int8_t",
        "u8" => "uint8_t",
        "i16" => "int16_t",
        "u16" => "uint16_t",
        "i32" => "int32_t",
        "u32" => "uint32_t",
        "i64" => "int64_t",
        "u64" => "uint64_t",
        "isize" => "intptr_t",
        "usize" => "size_t",
        "bool" => "bool",
        _ => return None,
    };
    return Some(if pointer.const_token.is_some() {
        format!("const {scalar} *")
    } else {
        format!("{scalar} *")
    });
}

fn uses_typed_scalar_pointer(function: &str, parameter: &str) -> bool {
    return matches!(
        (function, parameter),
        (
            "flight_detect_audio_mime_type"
                | "flight_detect_font_format"
                | "flight_detect_video_mime_type"
                | "flight_write_file_atomic",
            "data_ptr"
        )
    );
}

// flight-ffi returns a scalar tuple through trailing `out_0`, `out_1`, ... `*mut scalar` parameters.
// HashLink passes those as `hl.Ref<T>` (`_REF`), not as `hl.Bytes`, so they need typed pointers.
// The element set matches flight-bindgen's `tuple_element_storage`; any other element keeps the
// opaque `_BYTES` carrier, and flight-bindgen declares no Haxe extern for that tuple.
fn tuple_out_carrier(name: &str, ty: &Type) -> Option<Carrier> {
    let index = name.strip_prefix("out_")?;
    if index.is_empty() || !index.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let Type::Ptr(pointer) = ty else {
        panic!("tuple output {name} must be a pointer");
    };
    assert!(
        pointer.mutability.is_some(),
        "tuple output {name} must be a mutable pointer"
    );
    let Type::Path(path) = &*pointer.elem else {
        panic!("tuple output {name} must point to a scalar");
    };
    let element = path.path.segments.last().unwrap().ident.to_string();
    let (c, hl, signature) = match element.as_str() {
        "f32" => ("float *", "float *", "_REF(_F32)"),
        "f64" => ("double *", "double *", "_REF(_F64)"),
        "i32" => ("int32_t *", "int *", "_REF(_I32)"),
        "u32" => ("uint32_t *", "int *", "_REF(_I32)"),
        "u8" => ("uint8_t *", "unsigned char *", "_REF(_UI8)"),
        "u16" => ("uint16_t *", "unsigned short *", "_REF(_UI16)"),
        "bool" => ("bool *", "bool *", "_REF(_BOOL)"),
        _ => return None,
    };
    return Some(Carrier {
        c: c.into(),
        hl,
        signature,
    });
}

// Every `FfiImportDiagnosticList` pointer comes from the one constructor: helpers that mutate or
// release the list take it `*mut`, readers take it `*const`, and a wrapper borrows at most one list.
fn validate_import_diagnostic_list(file: &syn::File) {
    let list_type = "FfiImportDiagnosticList";
    let mut seen = Vec::new();
    for item in &file.items {
        let Item::Fn(function) = item else {
            continue;
        };
        let name = function.sig.ident.to_string();
        if name == "flight_create_import_diagnostic_list" {
            let pointer = function_return(function)
                .and_then(pointer_type)
                .expect("flight_create_import_diagnostic_list must return a list pointer");
            assert!(
                pointer.mutability.is_some() && type_fingerprint(&pointer.elem) == list_type,
                "flight_create_import_diagnostic_list must return an owned *mut {list_type}"
            );
            seen.push(name);
            continue;
        }
        let lists: Vec<_> = function
            .sig
            .inputs
            .iter()
            .filter_map(|argument| match argument {
                FnArg::Typed(parameter) => pointer_type(&parameter.ty),
                FnArg::Receiver(_) => None,
            })
            .filter(|pointer| type_fingerprint(&pointer.elem) == list_type)
            .collect();
        if lists.is_empty() || !name.starts_with("flight_") {
            continue;
        }
        assert_eq!(lists.len(), 1, "{name} borrows more than one {list_type}");
        let mutable = lists[0].mutability.is_some();
        if name.contains("_import_diagnostic_list") {
            let mutates = name == "flight_clear_import_diagnostic_list"
                || name == "flight_destroy_import_diagnostic_list";
            assert_eq!(
                mutable, mutates,
                "{name} has the wrong {list_type} mutability"
            );
            seen.push(name);
        } else {
            assert!(mutable, "{name} must borrow its {list_type} as *mut");
        }
    }
    seen.sort();
    assert_eq!(
        seen,
        [
            "flight_clear_import_diagnostic_list",
            "flight_create_import_diagnostic_list",
            "flight_destroy_import_diagnostic_list",
            "flight_get_import_diagnostic_list_detail_bool",
            "flight_get_import_diagnostic_list_detail_key",
            "flight_get_import_diagnostic_list_detail_kind",
            "flight_get_import_diagnostic_list_detail_length",
            "flight_get_import_diagnostic_list_detail_number",
            "flight_get_import_diagnostic_list_detail_string",
            "flight_get_import_diagnostic_list_kind",
            "flight_get_import_diagnostic_list_length",
            "flight_get_import_diagnostic_list_message",
            "flight_get_import_diagnostic_list_origin",
            "flight_get_import_diagnostic_list_severity",
        ],
        "{list_type} helper ABI changed"
    );
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

// `#[doc = "ffi-param <name>: <note>"]` attributes the generator writes for parameters whose
// ownership is not obvious from the pointer shape (a transferred box, a cloned Ref handle).
fn get_param_ownership_notes(function: &syn::ItemFn) -> BTreeMap<String, String> {
    let mut notes = BTreeMap::new();
    for attribute in &function.attrs {
        let syn::Meta::NameValue(meta) = &attribute.meta else {
            continue;
        };
        if !meta.path.is_ident("doc") {
            continue;
        }
        let syn::Expr::Lit(syn::ExprLit {
            lit: syn::Lit::Str(text),
            ..
        }) = &meta.value
        else {
            continue;
        };
        let text = text.value();
        if let Some((name, note)) = text
            .strip_prefix("ffi-param ")
            .and_then(|rest| rest.split_once(": "))
        {
            notes.insert(name.to_string(), note.to_string());
        }
    }
    return notes;
}

// The guard macro of the host section a wrapper belongs to, from its section tag.
fn get_function_section(function: &syn::ItemFn) -> Option<String> {
    return function.attrs.iter().find_map(|attribute| {
        let syn::Meta::NameValue(meta) = &attribute.meta else {
            return None;
        };
        if !meta.path.is_ident("doc") {
            return None;
        }
        let Expr::Lit(literal) = &meta.value else {
            return None;
        };
        let syn::Lit::Str(value) = &literal.lit else {
            return None;
        };
        return value
            .value()
            .strip_prefix(crate::host_seam::SECTION_DOC_PREFIX)
            .map(str::to_string);
    });
}

// Contract docs use an explicit prefix so ordinary implementation prose never leaks into the
// consumer ABI. Attribute order is source order, which keeps multiple contract lines stable.
fn get_function_contracts(function: &syn::ItemFn) -> Vec<String> {
    let mut contracts = Vec::new();
    for attribute in &function.attrs {
        let syn::Meta::NameValue(meta) = &attribute.meta else {
            continue;
        };
        if !meta.path.is_ident("doc") {
            continue;
        }
        let syn::Expr::Lit(syn::ExprLit {
            lit: syn::Lit::Str(text),
            ..
        }) = &meta.value
        else {
            continue;
        };
        let value = text.value();
        let Some(contract) = value.strip_prefix(CONTRACT_DOC_PREFIX) else {
            continue;
        };
        assert!(
            !contract.contains('\n') && !contract.contains("*/"),
            "{} has a contract doc that cannot be emitted as one C comment",
            function.sig.ident
        );
        contracts.push(contract.to_string());
    }
    return contracts;
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
        Type::Tuple(tuple) => format!(
            "({})",
            tuple
                .elems
                .iter()
                .map(type_fingerprint)
                .collect::<Vec<_>>()
                .join(",")
        ),
        // Boxed scalar fixed arrays are released by `flight_free_<scalar>_array_<length>`.
        Type::Array(array) => format!("[{}; _]", type_fingerprint(&array.elem)),
        Type::Slice(slice) => format!("[{}]", type_fingerprint(&slice.elem)),
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

fn function_named_param<'a>(function: &'a syn::ItemFn, name: &str) -> Option<&'a Type> {
    function.sig.inputs.iter().find_map(|argument| {
        let FnArg::Typed(parameter) = argument else {
            return None;
        };
        let syn::Pat::Ident(ident) = &*parameter.pat else {
            return None;
        };
        (ident.ident == name).then_some(&*parameter.ty)
    })
}

fn function_return(function: &syn::ItemFn) -> Option<&Type> {
    match &function.sig.output {
        ReturnType::Default => None,
        ReturnType::Type(_, ty) => Some(ty),
    }
}

fn owned_delivery_pointer<'a>(
    function: &'a syn::ItemFn,
    kind: OwnershipKind,
) -> Option<&'a syn::TypePtr> {
    match kind {
        OwnershipKind::OwnedReturn => function_return(function).and_then(pointer_type),
        OwnershipKind::OwnedCallback => {
            let Type::BareFn(callback) = function_named_param(function, "complete_fn")? else {
                return None;
            };
            callback
                .inputs
                .iter()
                .nth(1)
                .and_then(|argument| pointer_type(&argument.ty))
        }
        OwnershipKind::OwnedOutput => function_named_param(function, "out_values")
            .and_then(pointer_type)
            .and_then(|outer| pointer_type(&outer.elem)),
        OwnershipKind::Borrowed => None,
    }
}

fn is_generated_ffi_function(function: &syn::ItemFn) -> bool {
    function.sig.ident.to_string().starts_with("flight_")
        && function
            .sig
            .abi
            .as_ref()
            .and_then(|abi| abi.name.as_ref())
            .is_some_and(|name| name.value() == "C")
}

fn canonical_type(source: &str) -> String {
    let ty: Type = syn::parse_str(source)
        .unwrap_or_else(|error| panic!("invalid ownership type {source}: {error}"));
    type_fingerprint(&ty)
}

fn validate_return_ownership(file: &syn::File) {
    let mut functions = BTreeMap::new();
    for item in &file.items {
        let Item::Fn(function) = item else {
            continue;
        };
        if !is_generated_ffi_function(function) {
            continue;
        }
        let name = function.sig.ident.to_string();
        assert!(
            functions.insert(name.clone(), function).is_none(),
            "duplicate generated FFI function {name}"
        );
    }

    let mut errors = Vec::new();
    for (name, function) in &functions {
        let ownership = function_ownership(function);
        let pointer_return = function_return(function).and_then(pointer_type);
        let mut visitor = RawOwnerVisitor::default();
        visitor.visit_block(&function.block);

        if pointer_return.is_some() && ownership.is_none() {
            errors.push(format!(
                "{name} returns a pointer without ownership metadata"
            ));
            continue;
        }
        if visitor.allocations > 0 && ownership.is_none() {
            errors.push(format!(
                "{name} creates {} raw owner(s) without ownership metadata",
                visitor.allocations
            ));
            continue;
        }
        let Some(ownership) = ownership else {
            continue;
        };
        match ownership.kind {
            OwnershipKind::Borrowed => {
                if pointer_return.is_none() {
                    errors.push(format!("{name} marks a non-pointer return as borrowed"));
                }
                if visitor.allocations > 0 {
                    errors.push(format!("{name} marks a raw owner as borrowed"));
                }
                if ownership.anchor.as_deref().is_none_or(str::is_empty) {
                    errors.push(format!("{name} has no borrowed lifetime anchor"));
                }
            }
            OwnershipKind::OwnedReturn
            | OwnershipKind::OwnedCallback
            | OwnershipKind::OwnedOutput => {
                if ownership.kind == OwnershipKind::OwnedReturn && pointer_return.is_none() {
                    errors.push(format!("{name} marks a non-pointer return as owned"));
                }
                if ownership.kind != OwnershipKind::OwnedReturn && pointer_return.is_some() {
                    errors.push(format!(
                        "{name} uses {:?} metadata for a pointer return",
                        ownership.kind
                    ));
                }
                let Some(free_name) = ownership.free.as_deref() else {
                    errors.push(format!("{name} has no paired free name"));
                    continue;
                };
                let Some(owned_type) = ownership.owned_type.as_deref() else {
                    errors.push(format!("{name} has no owned Rust type"));
                    continue;
                };
                let Some(free) = functions.get(free_name) else {
                    errors.push(format!("{name} names missing paired free {free_name}"));
                    continue;
                };
                if free.sig.inputs.len() != 1 || function_return(free).is_some() {
                    errors.push(format!(
                        "{name} paired free {free_name} must take one pointer and return void"
                    ));
                    continue;
                }
                let Some(pointer) = pointer_type(function_param(free, 0)) else {
                    errors.push(format!(
                        "{name} paired free {free_name} does not take a pointer"
                    ));
                    continue;
                };
                if pointer.mutability.is_none() {
                    errors.push(format!(
                        "{name} paired free {free_name} does not take a mutable owner pointer"
                    ));
                }
                let expected = canonical_type(owned_type);
                let actual = type_fingerprint(&pointer.elem);
                if expected != actual {
                    errors.push(format!(
                        "{name} owns {expected}, but {free_name} releases {actual}"
                    ));
                }
                let Some(delivery) = owned_delivery_pointer(function, ownership.kind) else {
                    errors.push(format!(
                        "{name} has no {:?} delivery pointer",
                        ownership.kind
                    ));
                    continue;
                };
                if delivery.mutability.is_none() {
                    errors.push(format!("{name} delivers an immutable owned pointer"));
                }
                let delivered = type_fingerprint(&delivery.elem);
                if delivered != "std::ffi::c_void" && delivered != expected {
                    errors.push(format!(
                        "{name} declares {expected} ownership but delivers {delivered}"
                    ));
                }
            }
        }
    }
    assert!(
        errors.is_empty(),
        "generated return ownership invariant failed:\n{}",
        errors.join("\n")
    );
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

pub fn emit(
    source: &str,
    out: &Path,
    caller_producible: &std::collections::BTreeSet<String>,
    reachability_aliases: &std::collections::BTreeMap<String, String>,
    reachability_surface: &std::collections::BTreeSet<String>,
) {
    let file = syn::parse_file(source).expect("generated FFI Rust must parse");
    validate_import_diagnostic_list(&file);
    validate_vec_result_helpers(&file);
    validate_vec_ref_handles(&file);
    validate_return_ownership(&file);
    let reachability = crate::reachability::generate(
        source,
        caller_producible,
        reachability_aliases,
        reachability_surface,
    );
    std::fs::write(out.join("ffi_reachability_graph.tsv"), reachability.graph).unwrap();
    std::fs::write(
        out.join("ffi_reachability_baseline.tsv"),
        reachability.baseline,
    )
    .unwrap();
    let mut header = String::from(
        "/* Generated by flight-ffi. Opaque pointers preserve ABI without exposing Rust layouts. */\n#ifndef FLIGHT_FFI_H\n#define FLIGHT_FFI_H\n#include <stdbool.h>\n#include <stdint.h>\n#include <stddef.h>\n\
typedef struct FlightNode FlightNode;\n\
typedef struct FlightNodeArray FlightNodeArray;\n\
typedef struct FlightShapeBoundsContextVTable {\n\
  bool (*close_path)(void *context);\n\
  bool (*cubic_curve_to)(void *context, double control_x1, double control_y1, double control_x2, double control_y2, double x, double y);\n\
  bool (*draw_circle)(void *context, double center_x, double center_y, double radius);\n\
  bool (*draw_ellipse)(void *context, double center_x, double center_y, double radius_x, double radius_y);\n\
  bool (*draw_rectangle)(void *context, double x, double y, double width, double height);\n\
  bool (*draw_rounded_rectangle)(void *context, double x, double y, double width, double height, double radius);\n\
  bool (*expand_point)(void *context, double x, double y);\n\
  bool (*flush_path)(void *context);\n\
  bool (*line_to)(void *context, double x, double y);\n\
  bool (*move_to)(void *context, double x, double y);\n\
  bool (*quadratic_curve_to)(void *context, double control_x, double control_y, double x, double y);\n\
  bool (*set_stroke_style)(void *context, double width, uint32_t caps, uint32_t joints, double miter_limit);\n\
} FlightShapeBoundsContextVTable;\n\
typedef struct FlightWgpuRenderPassHandle FlightWgpuRenderPassHandle;\n\
#ifdef __cplusplus\nextern \"C\" {\n#endif\n",
    );
    let mut shim = String::from(
        "/* Generated by flight-ffi for the HashLink native ABI. */\n#define HL_NAME(n) flight_hl_##n\n#include <hl.h>\n#include \"flight_ffi.h\"\n",
    );
    // A host section opens its guard, and declares its handle type, before its first wrapper and
    // closes it after its last; sections never interleave with the unguarded surface.
    let mut open_section: Option<String> = None;
    let mut closed_sections = std::collections::BTreeSet::new();
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
        let section = get_function_section(&function);
        if section != open_section {
            if let Some(guard) = open_section.take() {
                writeln!(header, "#endif /* {guard} */").unwrap();
                writeln!(shim, "#endif /* {guard} */").unwrap();
                closed_sections.insert(guard);
            }
            if let Some(guard) = &section {
                assert!(
                    !closed_sections.contains(guard),
                    "the {guard} section must be contiguous"
                );
                writeln!(header, "#ifdef {guard}").unwrap();
                for feature in crate::host_seam::HOST_FEATURES {
                    if feature.guard == guard {
                        writeln!(header, "typedef struct {0} {0};", feature.c_handle).unwrap();
                    }
                }
                writeln!(shim, "#ifdef {guard}").unwrap();
            }
            open_section = section;
        }
        let notes = get_param_ownership_notes(&function);
        let contracts = get_function_contracts(&function);
        let result = match &function.sig.output {
            ReturnType::Default => None,
            ReturnType::Type(_, ty) => Some(carrier(ty)),
        };
        let mut c_params = Vec::new();
        let mut hl_params = Vec::new();
        let mut call_args = Vec::new();
        let mut signatures = Vec::new();
        // HashLink's native-call bridge corrupts by-value floating-point arguments after six
        // lanes. Derive the workaround from the generated ABI signature: both f32 and f64 lanes
        // count, references do not, and the public C declaration remains unchanged. The HashLink
        // primitive receives one GC-rooted NativeArray<Float> at the first float position and
        // restores every value, in order, immediately before the C ABI call.
        let packed_float_count = function
            .sig
            .inputs
            .iter()
            .filter(|argument| {
                let FnArg::Typed(parameter) = argument else {
                    return false;
                };
                return matches!(carrier(&parameter.ty).signature, "_F32" | "_F64");
            })
            .count();
        let pack_floats = packed_float_count > HASHLINK_FLOAT_PACK_THRESHOLD;
        let mut packed_float_index = 0usize;
        for (index, argument) in function.sig.inputs.iter().enumerate() {
            let FnArg::Typed(parameter) = argument else {
                panic!("C ABI receiver");
            };
            let parameter_name = match &*parameter.pat {
                syn::Pat::Ident(ident) => ident.ident.to_string(),
                _ => String::new(),
            };
            let mut ty = tuple_out_carrier(&parameter_name, &parameter.ty)
                .unwrap_or_else(|| carrier(&parameter.ty));
            if uses_typed_scalar_pointer(&name, &parameter_name) {
                ty.c = scalar_pointer_c_type(&parameter.ty)
                    .unwrap_or_else(|| panic!("{name}.{parameter_name} must be a scalar pointer"));
            }
            let arg = format!("arg{index}");
            let callback = callback_parameter(&parameter.ty);
            if let Some(function) = callback {
                let typed_scalar_pointers = name == "flight_build_particle_color_curve";
                c_params.push(bare_fn_c_type(function, &arg, typed_scalar_pointers));
            } else {
                let note = notes
                    .get(&parameter_name)
                    .map(|note| format!(" /* {note} */"))
                    .unwrap_or_default();
                c_params.push(format!("{} {arg}{note}", ty.c));
            }
            if pack_floats && matches!(ty.signature, "_F32" | "_F64") {
                if packed_float_index == 0 {
                    hl_params.push("varray *flight_values".to_string());
                    signatures.push("_ARR");
                }
                call_args.push(format!(
                    "({})hl_aptr(flight_values, double)[{packed_float_index}]",
                    ty.c
                ));
                packed_float_index += 1;
                continue;
            }
            let call_carrier = callback.map_or_else(
                || ty.c.clone(),
                |function| {
                    bare_fn_c_type(function, "", name == "flight_build_particle_color_curve")
                },
            );
            call_args.push(format!("({call_carrier}){arg}"));
            hl_params.push(format!("{} {arg}", ty.hl));
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
        for contract in &contracts {
            writeln!(header, "/* {contract} */").unwrap();
        }
        if let Some(ownership) = function_ownership(&function) {
            match ownership.kind {
                OwnershipKind::OwnedReturn => writeln!(
                    header,
                    "/* Caller owns the return value; call {} when done. */",
                    ownership.free.as_deref().unwrap()
                )
                .unwrap(),
                OwnershipKind::OwnedCallback => writeln!(
                    header,
                    "/* On successful completion, caller owns the callback value; call {} when done. */",
                    ownership.free.as_deref().unwrap()
                )
                .unwrap(),
                OwnershipKind::OwnedOutput => writeln!(
                    header,
                    "/* Caller owns each handle written to the output; call {} for each when done. */",
                    ownership.free.as_deref().unwrap()
                )
                .unwrap(),
                OwnershipKind::Borrowed => writeln!(
                    header,
                    "/* Borrowed return; do not free; valid while {}. */",
                    ownership.anchor.as_deref().unwrap()
                )
                .unwrap(),
            }
        }
        writeln!(header, "{ret} {name}({c_params});").unwrap();
        let call = format!("{name}({})", call_args.join(", "));
        let body = if result.is_some() {
            format!("return ({hl_ret}){call};")
        } else {
            format!("{call};")
        };
        for contract in &contracts {
            writeln!(shim, "/* {contract} */").unwrap();
        }
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
    if let Some(guard) = open_section {
        writeln!(header, "#endif /* {guard} */").unwrap();
        writeln!(shim, "#endif /* {guard} */").unwrap();
    }
    header.push_str("#ifdef __cplusplus\n}\n#endif\n#endif\n");
    std::fs::write(out.join("flight_ffi.h"), header).unwrap();
    std::fs::write(out.join("flight_hl.c"), shim).unwrap();
}
