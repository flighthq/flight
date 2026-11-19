use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

use syn::fold::Fold;
use syn::visit::Visit;
use syn::{Expr, FnArg, Item, ReturnType, Type};

const OWNERSHIP_DOC_PREFIX: &str = "flight-ffi ownership|";
const NULLABLE_PARAM_DOC_PREFIX: &str = "flight-ffi nullable|";
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
    // Carriers of nullable parameters (Rust `Option` inputs): passing NULL is a valid call, so they
    // never block reachability. Reported separately as optional coverage.
    optional: BTreeSet<String>,
    produces: BTreeSet<String>,
}

#[derive(Debug)]
pub struct Reports {
    pub graph: String,
    pub baseline: String,
}

// The C parameters the generator marked nullable (`#[doc = "flight-ffi nullable|<param>"]`).
fn function_nullable_params(function: &syn::ItemFn) -> BTreeSet<String> {
    return function
        .attrs
        .iter()
        .filter_map(|attribute| {
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
                .strip_prefix(NULLABLE_PARAM_DOC_PREFIX)
                .map(str::to_string);
        })
        .collect();
}

fn function_ownership(
    function: &syn::ItemFn,
    aliases: &BTreeMap<String, String>,
) -> Option<Ownership> {
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
                owned_type: Some(canonical_type_with_aliases(owned_type, aliases)),
            }),
            ["owned-callback", _, owned_type] => Some(Ownership {
                kind: OwnershipKind::OwnedCallback,
                owned_type: Some(canonical_type_with_aliases(owned_type, aliases)),
            }),
            ["owned-output", _, owned_type] => Some(Ownership {
                kind: OwnershipKind::OwnedOutput,
                owned_type: Some(canonical_type_with_aliases(owned_type, aliases)),
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

pub(crate) fn canonical_type(source: &str) -> String {
    canonical_type_with_aliases(source, &BTreeMap::new())
}

pub(crate) fn canonical_type_with_aliases(
    source: &str,
    aliases: &BTreeMap<String, String>,
) -> String {
    let ty: Type = syn::parse_str(source)
        .unwrap_or_else(|error| panic!("invalid reachability carrier {source}: {error}"));
    type_fingerprint_with_aliases(&ty, aliases)
}

pub(crate) fn unambiguous_alias_target(
    targets: impl IntoIterator<Item = Option<String>>,
) -> Option<String> {
    let mut targets = targets.into_iter();
    let first = targets.next()??;
    targets
        .all(|target| target.as_deref() == Some(first.as_str()))
        .then_some(first)
}

fn alias_name(path: &syn::TypePath) -> Option<String> {
    if path.qself.is_some() {
        return None;
    }
    let first = path.path.segments.first()?;
    let last = path.path.segments.last()?;
    if !matches!(last.arguments, syn::PathArguments::None) {
        return None;
    }
    match path.path.segments.len() {
        1 => Some(last.ident.to_string()),
        2 if first.ident == "flight_sdk" && matches!(first.arguments, syn::PathArguments::None) => {
            Some(last.ident.to_string())
        }
        _ => None,
    }
}

struct AliasExpander<'a> {
    aliases: &'a BTreeMap<String, String>,
    resolving: BTreeSet<String>,
}

impl Fold for AliasExpander<'_> {
    fn fold_type(&mut self, ty: Type) -> Type {
        let ty = syn::fold::fold_type(self, ty);
        let Type::Path(path) = &ty else {
            return ty;
        };
        let Some(name) = alias_name(path) else {
            return ty;
        };
        let Some(target) = self.aliases.get(&name) else {
            return ty;
        };
        if !self.resolving.insert(name.clone()) {
            return ty;
        }
        let target: Type = syn::parse_str(target).unwrap_or_else(|error| {
            panic!("invalid reachability alias {name} = {target}: {error}")
        });
        let expanded = self.fold_type(target);
        self.resolving.remove(&name);
        expanded
    }
}

fn type_fingerprint_with_aliases(ty: &Type, aliases: &BTreeMap<String, String>) -> String {
    let expanded = AliasExpander {
        aliases,
        resolving: BTreeSet::new(),
    }
    .fold_type(ty.clone());
    type_fingerprint(&expanded)
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

fn is_boxed_handle_type(ty: &str) -> bool {
    ty.starts_with("flight_sdk::Ref<")
        || ty.starts_with("std::sync::Arc<")
        || ty.starts_with("Vec<")
        || ty.starts_with("std::collections::HashMap<")
        || ty.starts_with("Ffi")
}

fn carrier_for_pointer(
    pointer: &syn::TypePtr,
    owned_types: &BTreeSet<String>,
    caller_producible: &BTreeSet<String>,
    aliases: &BTreeMap<String, String>,
) -> Option<String> {
    if matches!(&*pointer.elem, Type::BareFn(_)) {
        return None;
    }
    let pointee = type_fingerprint_with_aliases(&pointer.elem, aliases);
    if is_caller_producible(&pointee, caller_producible) {
        return None;
    }
    if owned_types.contains(&pointee) || is_boxed_handle_type(&pointee) {
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
    aliases: &'a BTreeMap<String, String>,
    casts: BTreeMap<String, Vec<syn::TypePtr>>,
    all_casts: Vec<syn::TypePtr>,
}

impl<'ast> Visit<'ast> for CastVisitor<'_> {
    fn visit_expr_cast(&mut self, cast: &'ast syn::ExprCast) {
        let Type::Ptr(pointer) = &*cast.ty else {
            syn::visit::visit_expr_cast(self, cast);
            return;
        };
        let pointee = type_fingerprint_with_aliases(&pointer.elem, self.aliases);
        if !is_void(&pointee) && pointee != "_" {
            self.all_casts.push(pointer.clone());
            if let Some(parameter) = root_parameter(&cast.expr)
                && self.parameters.contains(&parameter)
            {
                self.casts
                    .entry(parameter)
                    .or_default()
                    .push(pointer.clone());
            }
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
    aliases: &BTreeMap<String, String>,
) -> FunctionCarriers {
    let ownership = function_ownership(function, aliases);
    let parameters: BTreeSet<_> = function
        .sig
        .inputs
        .iter()
        .filter_map(parameter_name)
        .collect();
    let mut visitor = CastVisitor {
        parameters: &parameters,
        aliases,
        casts: BTreeMap::new(),
        all_casts: Vec::new(),
    };
    visitor.visit_block(&function.block);
    let body = &function.block;
    let nullable_owned_return = quote::quote!(#body)
        .to_string()
        .contains("None => std :: ptr :: null");

    let nullable = function_nullable_params(function);
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
        let required = if nullable.contains(&name) {
            &mut carriers.optional
        } else {
            &mut carriers.consumes
        };
        let pointee = type_fingerprint_with_aliases(&pointer.elem, aliases);
        if let Type::Ptr(inner) = &*pointer.elem {
            let inner_pointee = type_fingerprint_with_aliases(&inner.elem, aliases);
            if is_void(&inner_pointee) {
                for cast in &visitor.all_casts {
                    if let Some(carrier) =
                        carrier_for_pointer(cast, owned_types, caller_producible, aliases)
                    {
                        required.insert(carrier);
                    }
                }
            } else if let Some(carrier) =
                carrier_for_pointer(inner, owned_types, caller_producible, aliases)
            {
                required.insert(carrier);
            }
            continue;
        }
        if is_void(&pointee) {
            for cast in visitor.casts.get(&name).into_iter().flatten() {
                if let Some(carrier) =
                    carrier_for_pointer(cast, owned_types, caller_producible, aliases)
                {
                    required.insert(carrier);
                }
            }
        } else if let Some(carrier) =
            carrier_for_pointer(pointer, owned_types, caller_producible, aliases)
        {
            required.insert(carrier);
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
                && let Some(carrier) =
                    carrier_for_pointer(pointer, owned_types, caller_producible, aliases)
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
    aliases: &BTreeMap<String, String>,
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
        .filter_map(|function| function_ownership(function, aliases))
        .filter_map(|ownership| ownership.owned_type)
        .filter(|ty| !is_caller_producible(ty, &BTreeSet::new()))
        .collect();
    let functions: BTreeMap<_, _> = generated
        .into_iter()
        .map(|(name, function)| {
            (
                name,
                collect_function_carriers(function, &owned_types, caller_producible, aliases),
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
        for carrier in &function.optional {
            writeln!(graph, "optional|{name}|{carrier}").unwrap();
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

#[cfg(test)]
mod tests {
    use super::*;

    fn aliases() -> BTreeMap<String, String> {
        BTreeMap::from([
            ("Kind".to_string(), "String".to_string()),
            (
                "Node2DRef".to_string(),
                "flight_sdk::Ref<dyn flight_sdk::Node2D>".to_string(),
            ),
            (
                "NodeRef".to_string(),
                "flight_sdk::Ref<dyn flight_sdk::Node>".to_string(),
            ),
            (
                "NodeRefAlias".to_string(),
                "flight_sdk::NodeRef".to_string(),
            ),
        ])
    }

    #[test]
    fn nested_aliases_expand_recursively_to_a_fixed_point() {
        let aliases = aliases();
        assert_eq!(
            canonical_type_with_aliases("Vec<Kind>", &aliases),
            canonical_type_with_aliases("Vec<String>", &aliases)
        );
        assert_eq!(
            canonical_type_with_aliases("Vec<NodeRef>", &aliases),
            "Vec<flight_sdk::Ref<dyn flight_sdk::Node>>"
        );
        assert_eq!(
            canonical_type_with_aliases("Option<Node2DRef>", &aliases),
            "Option<flight_sdk::Ref<dyn flight_sdk::Node2D>>"
        );
        assert_eq!(
            canonical_type_with_aliases("Ref<Vec<Option<NodeRefAlias>>>", &aliases),
            "Ref<Vec<Option<flight_sdk::Ref<dyn flight_sdk::Node>>>>"
        );
    }

    #[test]
    fn only_unqualified_or_flight_sdk_alias_paths_expand() {
        let aliases = aliases();
        assert_eq!(
            canonical_type_with_aliases("flight_sdk::Kind", &aliases),
            "String"
        );
        assert_eq!(
            canonical_type_with_aliases("other_sdk::Kind", &aliases),
            "other_sdk::Kind"
        );
        assert_eq!(
            canonical_type_with_aliases("flight_sdk::other_module::Kind", &aliases),
            "flight_sdk::other_module::Kind"
        );
        assert_eq!(
            canonical_type_with_aliases("Vec<Option<flight_sdk::Kind>>", &aliases),
            "Vec<Option<String>>"
        );
        assert_eq!(
            canonical_type_with_aliases("Vec<Option<flight_sdk::other_module::Kind>>", &aliases,),
            "Vec<Option<flight_sdk::other_module::Kind>>"
        );
        assert_eq!(
            canonical_type_with_aliases("Vec<AmbiguousAlias>", &aliases),
            "Vec<AmbiguousAlias>"
        );
    }

    #[test]
    fn missing_nested_alias_is_an_observable_mutation() {
        let aliases = aliases();
        let expanded = canonical_type_with_aliases("Vec<Kind>", &aliases);
        let mut mutated = aliases;
        mutated.remove("Kind");
        assert_ne!(canonical_type_with_aliases("Vec<Kind>", &mutated), expanded);
    }

    #[test]
    fn ambiguous_or_unproven_alias_targets_stay_out_of_the_registry() {
        assert_eq!(
            unambiguous_alias_target([
                Some("flight_sdk::Ref<dyn flight_sdk::Node>".to_string()),
                Some("flight_sdk::Ref<dyn flight_sdk::Node>".to_string()),
            ]),
            Some("flight_sdk::Ref<dyn flight_sdk::Node>".to_string())
        );
        assert_eq!(
            unambiguous_alias_target([
                Some("flight_sdk::Ref<dyn flight_sdk::Node>".to_string()),
                Some("flight_sdk::Ref<dyn flight_sdk::Node2D>".to_string()),
            ]),
            None
        );
        assert_eq!(
            unambiguous_alias_target([Some("String".to_string()), None]),
            None
        );
    }

    #[test]
    fn nullable_parameters_do_not_block_a_call_that_accepts_null() {
        let source = r#"
            #[doc = "flight-ffi nullable|guard"]
            pub unsafe extern "C" fn flight_nullable_consumer(
                guard: *const flight_sdk::Unproducible,
            ) {
                unreachable!()
            }
            pub unsafe extern "C" fn flight_required_consumer(
                guard: *const flight_sdk::Unproducible,
            ) {
                unreachable!()
            }
        "#;
        let surface = BTreeSet::from([
            "flight_nullable_consumer".to_string(),
            "flight_required_consumer".to_string(),
        ]);
        let reports = generate(source, &BTreeSet::new(), &BTreeMap::new(), &surface);
        assert!(
            reports
                .graph
                .contains("function|flight_nullable_consumer|surface|reachable|-")
        );
        assert!(
            reports
                .graph
                .contains("optional|flight_nullable_consumer|*const flight_sdk::Unproducible")
        );
        assert!(!reports.graph.contains("consume|flight_nullable_consumer|"));
        assert!(reports.graph.contains(
            "function|flight_required_consumer|surface|unreachable|*const flight_sdk::Unproducible"
        ));
    }

    #[test]
    fn ownership_aliases_are_expanded_before_boxing_and_fixed_point_solving() {
        let source = r#"
            #[doc = "flight-ffi ownership|owned-return|flight_free_alias_values|Vec<Kind>"]
            pub unsafe extern "C" fn flight_alias_producer() -> *mut std::ffi::c_void {
                unreachable!()
            }
            pub unsafe extern "C" fn flight_alias_consumer(
                values: *const Vec<String>,
            ) {
                unreachable!()
            }
        "#;
        let aliases = BTreeMap::from([("Kind".to_string(), "String".to_string())]);
        let surface = BTreeSet::from([
            "flight_alias_consumer".to_string(),
            "flight_alias_producer".to_string(),
        ]);
        let reports = generate(source, &BTreeSet::new(), &aliases, &surface);
        assert!(
            reports
                .graph
                .contains("produce|flight_alias_producer|Box<Vec<String>>")
        );
        assert!(
            reports
                .graph
                .contains("consume|flight_alias_consumer|Box<Vec<String>>")
        );
        assert!(
            reports
                .graph
                .contains("function|flight_alias_consumer|surface|reachable|-")
        );
    }
}
