use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

use syn::visit::Visit;
use syn::{Expr, FnArg, Item, ReturnType, Type};

const OWNERSHIP_DOC_PREFIX: &str = "flight-ffi ownership|";
const HOST_CAPABILITY_POLICY: &str = "host_capability";
const HOST_CAPABILITY_REASON: &str =
    "feature-gated native host crates supply borrowed Host*Capability carriers";

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
    owned_type: Option<String>,
}

#[derive(Debug, Default)]
struct FunctionCarriers {
    consumes: BTreeSet<String>,
    produces: BTreeSet<String>,
}

#[derive(Debug)]
pub struct Reports {
    pub graph: String,
    pub baseline: String,
}

fn function_ownership(function: &syn::ItemFn) -> Option<Ownership> {
    function.attrs.iter().find_map(|attribute| {
        if !attribute.path().is_ident("doc") {
            return None;
        }
        let syn::Meta::NameValue(meta) = &attribute.meta else {
            return None;
        };
        let Expr::Lit(literal) = &meta.value else {
            return None;
        };
        let syn::Lit::Str(value) = &literal.lit else {
            return None;
        };
        let value = value.value();
        let fields: Vec<_> = value
            .strip_prefix(OWNERSHIP_DOC_PREFIX)?
            .split('|')
            .collect();
        return match fields.as_slice() {
            ["owned-return", _, owned_type] => Some(Ownership {
                kind: OwnershipKind::OwnedReturn,
                owned_type: Some(canonical_type(owned_type)),
            }),
            ["owned-callback", _, owned_type] => Some(Ownership {
                kind: OwnershipKind::OwnedCallback,
                owned_type: Some(canonical_type(owned_type)),
            }),
            ["owned-output", _, owned_type] => Some(Ownership {
                kind: OwnershipKind::OwnedOutput,
                owned_type: Some(canonical_type(owned_type)),
            }),
            ["borrowed", _] => Some(Ownership {
                kind: OwnershipKind::Borrowed,
                owned_type: None,
            }),
            _ => panic!(
                "malformed ownership metadata on {}: {value}",
                function.sig.ident
            ),
        };
    })
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
        .unwrap_or_else(|error| panic!("invalid reachability carrier {source}: {error}"));
    type_fingerprint(&ty)
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
                    let arguments: Vec<_> = arguments
                        .args
                        .iter()
                        .filter_map(|argument| match argument {
                            syn::GenericArgument::Type(ty) => Some(type_fingerprint(ty)),
                            _ => None,
                        })
                        .collect();
                    value.push('<');
                    value.push_str(&arguments.join(","));
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
                    syn::TypeParamBound::Trait(bound) => Some(
                        bound
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
        Type::Array(array) => {
            let length = &array.len;
            format!(
                "[{};{}]",
                type_fingerprint(&array.elem),
                quote::quote!(#length).to_string().replace(' ', "")
            )
        }
        Type::Slice(slice) => format!("[{}]", type_fingerprint(&slice.elem)),
        Type::Infer(_) => "_".to_string(),
        _ => quote::quote!(#ty).to_string().replace(' ', ""),
    }
}

fn pointer(ty: &Type) -> Option<&syn::TypePtr> {
    let Type::Ptr(pointer) = ty else {
        return None;
    };
    Some(pointer)
}

fn function_return(function: &syn::ItemFn) -> Option<&Type> {
    match &function.sig.output {
        ReturnType::Default => None,
        ReturnType::Type(_, ty) => Some(ty),
    }
}

fn parameter_name(argument: &FnArg) -> Option<String> {
    let FnArg::Typed(parameter) = argument else {
        return None;
    };
    let syn::Pat::Ident(ident) = &*parameter.pat else {
        return None;
    };
    Some(ident.ident.to_string())
}

fn is_scalar_fingerprint(ty: &str) -> bool {
    matches!(
        ty.rsplit("::").next().unwrap_or(ty),
        "bool"
            | "i8"
            | "u8"
            | "i16"
            | "u16"
            | "i32"
            | "u32"
            | "i64"
            | "u64"
            | "i128"
            | "u128"
            | "isize"
            | "usize"
            | "f32"
            | "f64"
            | "c_char"
    )
}

fn is_void(ty: &str) -> bool {
    ty.rsplit("::").next().is_some_and(|name| name == "c_void")
}

fn is_caller_producible(ty: &str, caller_producible: &BTreeSet<String>) -> bool {
    if is_scalar_fingerprint(ty) || is_void(ty) || ty == "FfiShapeBoundsContextVTable" {
        return true;
    }
    let bare = ty.rsplit("::").next().unwrap_or(ty);
    caller_producible.contains(bare)
}

fn carrier_for_pointer(
    pointer: &syn::TypePtr,
    owned_types: &BTreeSet<String>,
    caller_producible: &BTreeSet<String>,
) -> Option<String> {
    if matches!(&*pointer.elem, Type::Ptr(_) | Type::BareFn(_)) {
        return None;
    }
    let pointee = type_fingerprint(&pointer.elem);
    if is_caller_producible(&pointee, caller_producible) {
        return None;
    }
    if owned_types.contains(&pointee) {
        return Some(format!("Box<{pointee}>"));
    }
    Some(format!(
        "*{} {pointee}",
        if pointer.mutability.is_some() {
            "mut"
        } else {
            "const"
        }
    ))
}

fn root_parameter(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Path(path) if path.path.segments.len() == 1 => {
            Some(path.path.segments[0].ident.to_string())
        }
        Expr::Cast(cast) => root_parameter(&cast.expr),
        Expr::Group(group) => root_parameter(&group.expr),
        Expr::Paren(paren) => root_parameter(&paren.expr),
        Expr::Reference(reference) => root_parameter(&reference.expr),
        _ => None,
    }
}

struct CastVisitor<'a> {
    parameters: &'a BTreeSet<String>,
    casts: BTreeMap<String, Vec<syn::TypePtr>>,
}

impl<'ast> Visit<'ast> for CastVisitor<'_> {
    fn visit_expr_cast(&mut self, cast: &'ast syn::ExprCast) {
        let Some(parameter) = root_parameter(&cast.expr) else {
            syn::visit::visit_expr_cast(self, cast);
            return;
        };
        let Type::Ptr(pointer) = &*cast.ty else {
            syn::visit::visit_expr_cast(self, cast);
            return;
        };
        let pointee = type_fingerprint(&pointer.elem);
        if self.parameters.contains(&parameter) && !is_void(&pointee) && pointee != "_" {
            self.casts
                .entry(parameter)
                .or_default()
                .push(pointer.clone());
        }
        syn::visit::visit_expr_cast(self, cast);
    }
}

fn owned_carrier(owned_type: &str) -> Option<String> {
    (!is_caller_producible(owned_type, &BTreeSet::new())).then(|| format!("Box<{owned_type}>"))
}

fn collect_function_carriers(
    function: &syn::ItemFn,
    owned_types: &BTreeSet<String>,
    caller_producible: &BTreeSet<String>,
) -> FunctionCarriers {
    let ownership = function_ownership(function);
    let parameters: BTreeSet<_> = function
        .sig
        .inputs
        .iter()
        .filter_map(parameter_name)
        .collect();
    let mut visitor = CastVisitor {
        parameters: &parameters,
        casts: BTreeMap::new(),
    };
    visitor.visit_block(&function.block);
    let body = &function.block;
    let nullable_owned_return = quote::quote!(#body)
        .to_string()
        .contains("None => std :: ptr :: null");

    let mut carriers = FunctionCarriers::default();
    for argument in &function.sig.inputs {
        let FnArg::Typed(parameter) = argument else {
            continue;
        };
        if matches!(&*parameter.ty, Type::BareFn(_)) {
            continue;
        }
        let Type::Ptr(pointer) = &*parameter.ty else {
            continue;
        };
        let name = parameter_name(argument).expect("generated FFI parameter name");
        if matches!(
            ownership.as_ref().map(|ownership| ownership.kind),
            Some(OwnershipKind::OwnedOutput)
        ) && name == "out_values"
        {
            continue;
        }
        let pointee = type_fingerprint(&pointer.elem);
        if is_void(&pointee) {
            for cast in visitor.casts.get(&name).into_iter().flatten() {
                if let Some(carrier) = carrier_for_pointer(cast, owned_types, caller_producible) {
                    carriers.consumes.insert(carrier);
                }
            }
        } else if let Some(carrier) = carrier_for_pointer(pointer, owned_types, caller_producible) {
            carriers.consumes.insert(carrier);
        }
    }

    match ownership.as_ref().map(|ownership| ownership.kind) {
        Some(
            OwnershipKind::OwnedReturn | OwnershipKind::OwnedCallback | OwnershipKind::OwnedOutput,
        ) => {
            let owned_type = ownership
                .as_ref()
                .and_then(|ownership| ownership.owned_type.as_deref())
                .expect("owned FFI delivery type");
            // A nullable Option return cannot establish that C can actually obtain the carrier.
            // It may use a carrier that is already reachable, but it never seeds the fixed point.
            if !nullable_owned_return && let Some(carrier) = owned_carrier(owned_type) {
                carriers.produces.insert(carrier);
            }
        }
        Some(OwnershipKind::Borrowed) => {
            if let Some(pointer) = function_return(function).and_then(pointer)
                && let Some(carrier) = carrier_for_pointer(pointer, owned_types, caller_producible)
            {
                carriers.produces.insert(carrier);
            }
        }
        None => {}
    }
    carriers
}

fn is_host_capability_carrier(carrier: &str) -> bool {
    carrier
        .split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .any(|name| name.starts_with("Host") && name.ends_with("Capability"))
}

fn solve(
    functions: &BTreeMap<String, FunctionCarriers>,
    seed: impl IntoIterator<Item = String>,
) -> (BTreeSet<String>, BTreeSet<String>) {
    let mut reachable = BTreeSet::new();
    let mut producible: BTreeSet<String> = seed.into_iter().collect();
    loop {
        let mut changed = false;
        for (name, function) in functions {
            if reachable.contains(name) || !function.consumes.is_subset(&producible) {
                continue;
            }
            reachable.insert(name.clone());
            changed = true;
            for carrier in &function.produces {
                changed |= producible.insert(carrier.clone());
            }
        }
        if !changed {
            return (reachable, producible);
        }
    }
}

pub fn generate(
    source: &str,
    caller_producible: &BTreeSet<String>,
    surface: &BTreeSet<String>,
) -> Reports {
    let file = syn::parse_file(source).expect("generated FFI Rust must parse for reachability");
    let generated: BTreeMap<_, _> = file
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Fn(function) if is_generated_ffi_function(function) => {
                Some((function.sig.ident.to_string(), function))
            }
            _ => None,
        })
        .collect();

    let owned_types: BTreeSet<_> = generated
        .values()
        .filter_map(|function| function_ownership(function))
        .filter_map(|ownership| ownership.owned_type)
        .filter(|ty| !is_caller_producible(ty, &BTreeSet::new()))
        .collect();
    let functions: BTreeMap<_, _> = generated
        .into_iter()
        .map(|(name, function)| {
            (
                name,
                collect_function_carriers(function, &owned_types, caller_producible),
            )
        })
        .collect();
    let missing_surface: Vec<_> = surface
        .iter()
        .filter(|name| !functions.contains_key(*name))
        .collect();
    assert!(
        missing_surface.is_empty(),
        "reachability surface names missing from generated Rust: {missing_surface:?}"
    );

    let (reachable, _) = solve(&functions, std::iter::empty());
    let policy_carriers: BTreeSet<_> = functions
        .values()
        .flat_map(|function| function.consumes.iter())
        .filter(|carrier| is_host_capability_carrier(carrier))
        .cloned()
        .collect();
    let (reachable_with_policy, producible_with_policy) =
        solve(&functions, policy_carriers.iter().cloned());
    let exempt: BTreeSet<_> = reachable_with_policy
        .difference(&reachable)
        .cloned()
        .collect();
    let unreachable: BTreeMap<_, _> = functions
        .iter()
        .filter(|(name, _)| !reachable_with_policy.contains(*name))
        .map(|(name, function)| {
            let first = function
                .consumes
                .difference(&producible_with_policy)
                .next()
                .unwrap_or_else(|| panic!("{name} is unresolved without a blocking carrier"));
            (name.clone(), first.clone())
        })
        .collect();
    let surface_exempt: BTreeSet<_> = exempt.intersection(surface).cloned().collect();
    let surface_unreachable: BTreeMap<_, _> = unreachable
        .iter()
        .filter(|(name, _)| surface.contains(*name))
        .map(|(name, carrier)| (name.clone(), carrier.clone()))
        .collect();

    let mut carrier_counts = BTreeMap::<String, usize>::new();
    for carrier in surface_unreachable.values() {
        *carrier_counts.entry(carrier.clone()).or_default() += 1;
    }

    let mut graph = String::new();
    writeln!(graph, "format|ffi-reachability-graph|1").unwrap();
    writeln!(
        graph,
        "policy|{HOST_CAPABILITY_POLICY}|{HOST_CAPABILITY_REASON}"
    )
    .unwrap();
    for (name, function) in &functions {
        let (classification, blocker) = if reachable.contains(name) {
            ("reachable", "-")
        } else if exempt.contains(name) {
            ("policy-exempt", HOST_CAPABILITY_POLICY)
        } else {
            ("unreachable", unreachable[name].as_str())
        };
        let kind = if surface.contains(name) {
            "surface"
        } else {
            "support"
        };
        writeln!(graph, "function|{name}|{kind}|{classification}|{blocker}").unwrap();
        for carrier in &function.consumes {
            writeln!(graph, "consume|{name}|{carrier}").unwrap();
        }
        for carrier in &function.produces {
            writeln!(graph, "produce|{name}|{carrier}").unwrap();
        }
    }
    writeln!(
        graph,
        "summary|functions|{}|reachable|{}|policy-exempt|{}|unreachable|{}|surface|{}|surface-policy-exempt|{}|surface-unreachable|{}",
        functions.len(),
        reachable.len(),
        exempt.len(),
        unreachable.len(),
        surface.len(),
        surface_exempt.len(),
        surface_unreachable.len()
    )
    .unwrap();

    let mut baseline = String::new();
    writeln!(baseline, "format|ffi-reachability-baseline|1").unwrap();
    writeln!(
        baseline,
        "policy|{HOST_CAPABILITY_POLICY}|{HOST_CAPABILITY_REASON}"
    )
    .unwrap();
    writeln!(
        baseline,
        "summary|policy-exempt|{}|unreachable|{}|blocking-carriers|{}",
        surface_exempt.len(),
        surface_unreachable.len(),
        carrier_counts.len()
    )
    .unwrap();
    for (carrier, count) in &carrier_counts {
        writeln!(baseline, "carrier|{count}|{carrier}").unwrap();
    }
    for name in &surface_exempt {
        let direct: Vec<_> = functions[name]
            .consumes
            .intersection(&policy_carriers)
            .cloned()
            .collect();
        let evidence = if direct.is_empty() {
            "transitive".to_string()
        } else {
            direct.join(",")
        };
        writeln!(
            baseline,
            "exempt|{name}|{HOST_CAPABILITY_POLICY}|{evidence}"
        )
        .unwrap();
    }
    for (name, carrier) in &surface_unreachable {
        writeln!(baseline, "unreachable|{name}|{carrier}").unwrap();
    }

    Reports { graph, baseline }
}
