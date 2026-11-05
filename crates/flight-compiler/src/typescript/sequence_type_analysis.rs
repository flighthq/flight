use std::collections::HashSet;

use syn::visit::Visit;
use syn::{Expr, GenericArgument, PathArguments, Type, UnOp};

use crate::CompileError;

use super::{
    BindingFact, NULLABLE_OPTIONS_MARKER, PROVENANCE_SEPARATOR, TYPE_LOCAL_MARKER,
    TYPE_PARAMETER_MARKER, TYPE_USE_MARKER, TYPED_ARRAY_SEQUENCE_FIELD_MARKER, array_type,
    context_type_identity, current_source, emit_type, expression_struct_name,
    is_standard_type_path, lexical_fact, named_type, nullable_type, resolve_type_path,
    shared_identity_type_at_depth, unique_marker_suffix,
};

pub(super) fn rust_type_is_ordered_primitive(rust_type: &Type) -> bool {
    return matches!(
        named_type(rust_type).as_deref(),
        Some(
            "i8" | "i16"
                | "i32"
                | "i64"
                | "isize"
                | "u8"
                | "u16"
                | "u32"
                | "u64"
                | "usize"
                | "String"
                | "str"
        )
    );
}

pub(super) fn rust_type_is_sequence(rust_type: &Type) -> bool {
    return match rust_type {
        Type::Group(group) => rust_type_is_sequence(&group.elem),
        Type::Paren(paren) => rust_type_is_sequence(&paren.elem),
        Type::Reference(reference) => rust_type_is_sequence(&reference.elem),
        Type::Array(_) | Type::Slice(_) => true,
        Type::Path(path) => path
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "Vec"),
        _ => false,
    };
}

// A declared type whose TypeScript lowering is an identity-bearing object that `===` compares by
// allocation: a source struct, a collection, a callable, a `Mutex` cell or an opaque `dyn Any`, seen
// through `Arc` / `Rc` / `RwLock` / `Ref` layers and source type aliases. A primitive, string, unit,
// `Option` or type parameter is not: its lowering is a value.
pub(super) fn rust_type_is_shared_identity(entities: &HashSet<String>, rust_type: &Type) -> bool {
    return context_type_identity(entities, rust_type).is_some()
        || shared_identity_type_at_depth(
            entities,
            current_source(entities).as_deref(),
            rust_type,
            0,
        );
}

// The typed array each element of a sequence expression is: a local or parameter typed as a sequence
// of fixed typed-primitive arrays (`Vec<[f64; 2]>`), or a struct field so declared.
pub(super) fn sequence_element_typed_array(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return None;
            };
            let identity = expression_struct_name(&field.base, entities)?;
            unique_marker_suffix(
                entities,
                &format!(
                    "{TYPED_ARRAY_SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        Expr::Group(group) => sequence_element_typed_array(&group.expr, entities),
        Expr::Paren(paren) => sequence_element_typed_array(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            match lexical_fact(entities, &path.path.segments[0].ident.to_string()) {
                Some(BindingFact::Sequence(element)) => match *element {
                    BindingFact::TypedArray(array_type) => Some(array_type),
                    _ => None,
                },
                _ => None,
            }
        }
        Expr::Reference(reference) => sequence_element_typed_array(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            sequence_element_typed_array(&unary.expr, entities)
        }
        _ => None,
    };
}

pub(super) fn sequence_inner_type(rust_type: &Type) -> Option<&Type> {
    return match rust_type {
        Type::Array(array) => Some(&array.elem),
        Type::Group(group) => sequence_inner_type(&group.elem),
        Type::Paren(paren) => sequence_inner_type(&paren.elem),
        Type::Reference(reference) => sequence_inner_type(&reference.elem),
        Type::Slice(slice) => Some(&slice.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            if segment.ident != "Vec" {
                return None;
            }
            let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                return None;
            };
            let mut types = arguments.args.iter().filter_map(|argument| match argument {
                GenericArgument::Type(rust_type) => Some(rust_type),
                _ => None,
            });
            let inner = types.next()?;
            types.next().is_none().then_some(inner)
        }
        _ => None,
    };
}

pub(super) fn standard_vec_inner_type<'a>(
    rust_type: &'a Type,
    entities: &HashSet<String>,
) -> Option<&'a Type> {
    return match rust_type {
        Type::Group(group) => standard_vec_inner_type(&group.elem, entities),
        Type::Paren(paren) => standard_vec_inner_type(&paren.elem, entities),
        Type::Reference(reference) => standard_vec_inner_type(&reference.elem, entities),
        Type::Path(path)
            if path.qself.is_none() && type_path_is_standard_vec(&path.path, entities) =>
        {
            sequence_inner_type(rust_type)
        }
        _ => None,
    };
}

pub(super) fn type_path_is_standard_vec(path: &syn::Path, entities: &HashSet<String>) -> bool {
    if resolve_type_path(path, entities).is_some_and(|path| is_standard_type_path(&path, "Vec")) {
        return true;
    }
    // A bare `Vec` is supplied by the standard prelude unless this source explicitly declares or
    // imports a type-namespace binding with that name. Vitest suites often have `use super::*`, whose
    // wildcard prevents the general resolver from choosing a prelude fallback even when the selected
    // production sources contribute no `Vec` declaration.
    return path.leading_colon.is_none()
        && path.segments.len() == 1
        && path.segments[0].ident == "Vec"
        && !entities.contains(&format!("{TYPE_LOCAL_MARKER}Vec"))
        && !entities.contains(&format!("{TYPE_USE_MARKER}Vec"));
}

pub(super) fn rust_type_contains_current_parameter(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> bool {
    struct TypeParameterFinder<'a> {
        entities: &'a HashSet<String>,
        found: bool,
    }

    impl<'ast> Visit<'ast> for TypeParameterFinder<'_> {
        fn visit_type_path(&mut self, path: &'ast syn::TypePath) {
            if path.qself.is_none()
                && path.path.segments.iter().any(|segment| {
                    self.entities
                        .contains(&format!("{TYPE_PARAMETER_MARKER}{}", segment.ident))
                })
            {
                self.found = true;
                return;
            }
            syn::visit::visit_type_path(self, path);
        }
    }

    let mut finder = TypeParameterFinder {
        entities,
        found: false,
    };
    finder.visit_type(rust_type);
    return finder.found;
}

pub(super) fn safe_collection_element_typescript_type(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Option<String> {
    if rust_type_contains_current_parameter(rust_type, entities) {
        return None;
    }
    let typescript_type = emit_type(rust_type, entities).ok()?;
    if typescript_type
        .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
        .any(|part| matches!(part, "any" | "never" | "unknown"))
    {
        return None;
    }
    return Some(typescript_type);
}

pub(super) fn binding_fact_typescript_type(
    fact: &BindingFact,
    entities: &HashSet<String>,
) -> Option<String> {
    return match fact {
        BindingFact::Option(payload) => {
            let payload = binding_fact_typescript_type(payload, entities)?;
            Some(if entities.contains(NULLABLE_OPTIONS_MARKER) {
                nullable_type(payload)
            } else if payload.contains("=>") {
                format!("({payload}) | undefined")
            } else {
                format!("{payload} | undefined")
            })
        }
        BindingFact::Sequence(element) => {
            binding_fact_typescript_type(element, entities).map(array_type)
        }
        BindingFact::Structure(identity)
            if matches!(
                identity.as_str(),
                "bool"
                    | "char"
                    | "f32"
                    | "f64"
                    | "i8"
                    | "i16"
                    | "i32"
                    | "i64"
                    | "isize"
                    | "str"
                    | "String"
                    | "u8"
                    | "u16"
                    | "u32"
                    | "u64"
                    | "usize"
            ) =>
        {
            syn::parse_str::<Type>(identity)
                .ok()
                .and_then(|rust_type| safe_collection_element_typescript_type(&rust_type, entities))
        }
        BindingFact::Tuple(elements) => elements
            .iter()
            .map(|element| binding_fact_typescript_type(element, entities))
            .collect::<Option<Vec<_>>>()
            .map(|elements| format!("readonly [{}]", elements.join(", "))),
        BindingFact::TypedArray(array_type) => Some(array_type.clone()),
        BindingFact::HashMap
        | BindingFact::HashSet
        | BindingFact::Structure(_)
        | BindingFact::Unknown
        | BindingFact::UnresolvedPattern => None,
    };
}

pub(super) enum EmptyVecInitializer<'a> {
    Standard(Option<&'a Type>),
    UnprovenOwner,
}

pub(super) fn empty_vec_initializer<'a>(
    expression: &'a Expr,
    entities: &HashSet<String>,
) -> Option<EmptyVecInitializer<'a>> {
    return match expression {
        Expr::Call(call) => {
            let Expr::Path(function) = call.func.as_ref() else {
                return None;
            };
            if function.qself.is_some() {
                return None;
            }
            let mut owner = function.path.clone();
            let member = owner.segments.pop()?.into_value();
            if !matches!(member.ident.to_string().as_str(), "new" | "with_capacity")
                || (member.ident == "new" && !call.args.is_empty())
                || (member.ident == "with_capacity" && call.args.len() != 1)
            {
                return None;
            }
            let owner_segment = function.path.segments.iter().rev().nth(1)?;
            if owner_segment.ident != "Vec" {
                let resolved = resolve_type_path(&owner, entities)?;
                if !is_standard_type_path(&resolved, "Vec") {
                    return None;
                }
            }
            let element = match &owner_segment.arguments {
                PathArguments::None => None,
                PathArguments::AngleBracketed(arguments) => {
                    let mut types = arguments.args.iter().filter_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => Some(rust_type),
                        _ => None,
                    });
                    let element = types.next();
                    if element.is_none() || types.next().is_some() {
                        return Some(EmptyVecInitializer::UnprovenOwner);
                    }
                    element
                }
                PathArguments::Parenthesized(_) => {
                    return Some(EmptyVecInitializer::UnprovenOwner);
                }
            };
            Some(if type_path_is_standard_vec(&owner, entities) {
                EmptyVecInitializer::Standard(element)
            } else {
                EmptyVecInitializer::UnprovenOwner
            })
        }
        Expr::Group(group) => empty_vec_initializer(&group.expr, entities),
        Expr::Macro(invocation)
            if invocation.mac.path.is_ident("vec") && invocation.mac.tokens.is_empty() =>
        {
            Some(EmptyVecInitializer::Standard(None))
        }
        Expr::Paren(paren) => empty_vec_initializer(&paren.expr, entities),
        _ => None,
    };
}
