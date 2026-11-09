use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use syn::{Expr, ItemConst, ItemEnum, Stmt, Type, UnOp};

use crate::CompileError;
use crate::model::{Program, StringUnionStyle};

use super::{
    BindingFact, CONST_GROUP_MEMBER_MARKER, DEPENDENCY_EXPORT_NAME_BINDING_MARKER,
    DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER, DEPENDENCY_EXPORT_NAME_MARKER,
    DEPENDENCY_EXPORT_NAME_TARGET_MARKER, EXPORT_NAME_MARKER, EXPORT_NAME_TARGET_MARKER,
    EXTERNAL_STRUCT_BINDING_MARKER, EXTERNAL_STRUCT_FIELD_MARKER, PROVENANCE_SEPARATOR,
    SEQUENCE_FIELD_ELEMENT_MARKER, SHARED_IDENTITY_BINDING_MARKER,
    SHARED_IDENTITY_ELEMENT_FIELD_MARKER, SHARED_IDENTITY_EXTERNAL_FIELD_MARKER,
    SHARED_IDENTITY_EXTERNAL_TYPE_MARKER, SHARED_IDENTITY_FIELD_MARKER,
    SHARED_IDENTITY_RETURN_MARKER, STRUCT_FIELD_TYPE_MARKER, STRUCT_RETURN_MARKER,
    TYPE_SCRIPT_ARRAY_FIELD_MARKER, TYPED_ARRAY_CONSTANT_MARKER, TYPED_ARRAY_FIELD_MARKER,
    VITEST_PUBLIC_FUNCTION_MARKER, binding_fact_from_marker, call_fact, compile_error,
    context_type_identity, current_source, emit_documentation, emit_expression_for_type,
    expression_is_associated_path, expression_is_field_reference, expression_struct_name,
    external_struct_return, is_string_union, lexical_binding, lexical_fact,
    owner_method_delegation_fact, path_owner_and_member, peel_reference_and_paren,
    peel_shared_view, sequence_element_binding_fact, unique_alias_owner, unique_marker_suffix,
    vitest_path_binding_name,
};
pub(super) fn call_returns_shared_identity(entities: &HashSet<String>, callee: &Expr) -> bool {
    let Expr::Path(path) = callee else {
        return false;
    };
    if path.qself.is_some() {
        return false;
    }
    if call_fact(entities, SHARED_IDENTITY_RETURN_MARKER, &path.path).is_some() {
        return true;
    }
    let Some(local) = vitest_path_binding_name(&path.path, entities) else {
        return false;
    };
    return unique_marker_suffix(
        entities,
        &format!("{VITEST_PUBLIC_FUNCTION_MARKER}{local}{PROVENANCE_SEPARATOR}"),
    )
    .is_some_and(|function| {
        entities.contains(&format!(
            "{SHARED_IDENTITY_RETURN_MARKER}{function}{PROVENANCE_SEPARATOR}"
        ))
    });
}

// The `Owner.Member` a `const-group` member constant is referenced as.
// flight-lint: allow(hashmap-iteration) const-group validation gives each constant at most one group
pub(super) fn const_group_member_reference<'a>(
    context: &'a HashSet<String>,
    rust_name: &str,
) -> Option<&'a str> {
    let prefix = format!("{CONST_GROUP_MEMBER_MARKER}{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

// The one loaded source alias a `crate::...::Name` path can name when sources are identified by file
// rather than module path (test generation): exactly one alias called `Name`, or nothing.
pub(super) fn crate_alias_owner(
    entities: &HashSet<String>,
    resolved: &[String],
) -> Option<(String, String)> {
    let [first, .., name] = resolved else {
        return None;
    };
    if first != "crate" {
        return None;
    }
    return unique_alias_owner(entities, name);
}

// The TypeScript name a dependency package's `export-name` directive gives its item `rust_name`, as
// exported from `module`.
// flight-lint: allow(hashmap-iteration) dependency export-name validation guarantees one target per item
pub(super) fn dependency_export_name<'a>(
    context: &'a HashSet<String>,
    module: &str,
    rust_name: &str,
) -> Option<&'a str> {
    if !context.contains(&format!(
        "{DEPENDENCY_EXPORT_NAME_MARKER}{module}|{rust_name}"
    )) {
        return None;
    }
    let prefix = format!("{DEPENDENCY_EXPORT_NAME_TARGET_MARKER}{module}|{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

// The dependency items the current source binds by mapped name, as `(TypeScript name, module, Rust
// name)`.
// flight-lint: allow(hashmap-iteration) the result is collected into a sorted set
pub(super) fn dependency_export_name_bindings(
    context: &HashSet<String>,
) -> BTreeSet<(String, String, String)> {
    if !context.contains(DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER) {
        return BTreeSet::new();
    }
    return context
        .iter()
        .filter_map(|marker| marker.strip_prefix(DEPENDENCY_EXPORT_NAME_BINDING_MARKER))
        .map(|binding| {
            let mut fields = binding.splitn(3, '|').map(str::to_string);
            return (
                fields.next().unwrap_or_default(),
                fields.next().unwrap_or_default(),
                fields.next().unwrap_or_default(),
            );
        })
        .collect();
}

// Rust names of the dependency items the current source binds by mapped name.
pub(crate) fn dependency_export_name_local_items(context: &HashSet<String>) -> BTreeSet<String> {
    return dependency_export_name_bindings(context)
        .into_iter()
        .map(|(_, _, rust)| rust)
        .collect();
}

// A dependency source's own type context plus the identity-bearing types proven so far, its own
// crate's also under `crate`.
pub(super) fn dependency_source_context(
    mut context: HashSet<String>,
    known: &BTreeSet<String>,
    crate_name: &str,
) -> HashSet<String> {
    for name in known {
        context.insert(format!("{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}{name}"));
        if let Some(item) = name.strip_prefix(&format!("{crate_name}::")) {
            context.insert(format!(
                "{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}crate::{item}"
            ));
        }
    }
    return context;
}

// `export const Owner = { Member: value, ... };` from the `const-group` members, in source order, each
// keeping its documentation and its literal spelling.
// flight-lint: allow(hashmap-iteration) constants are a Vec slice in Rust source order
pub(super) fn emit_const_group(
    out: &mut String,
    owner: &str,
    members: &[(String, String, String)],
    constants: &[syn::ItemConst],
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    writeln!(out, "export const {owner} = {{").expect("writing to a String cannot fail");
    for (rust_name, member_owner, member) in members {
        if member_owner != owner {
            continue;
        }
        let constant = constants
            .iter()
            .find(|constant| constant.ident == rust_name.as_str())
            .expect("const-group members come from these constants");
        emit_documentation(out, &constant.attrs, 1);
        let value = emit_expression_for_type(&constant.expr, &constant.ty, entities)?;
        writeln!(out, "  {member}: {value},").expect("writing to a String cannot fail");
    }
    out.push_str("};\n");
    return Ok(());
}

// Whether an enum emits a runtime value binding: a TypeScript `enum`, or the `const` object of an exact
// string union. Numeric, data and other string unions are type-only.
pub(super) fn enum_has_runtime_binding(program: &Program, rust_enum: &syn::ItemEnum) -> bool {
    let name = rust_enum.ident.to_string();
    return !program.numeric_unions.contains_key(&name)
        && !program.data_unions.contains(&name)
        && program
            .string_unions
            .get(&name)
            .is_none_or(|style| *style == StringUnionStyle::Exact);
}

// The explicit TypeScript name an `export-name` directive gives the Rust item `rust_name`, if any.
// flight-lint: allow(hashmap-iteration) export-name validation guarantees one target name per Rust item
pub(crate) fn export_name<'a>(context: &'a HashSet<String>, rust_name: &str) -> Option<&'a str> {
    if !context.contains(&format!("{EXPORT_NAME_MARKER}{rust_name}")) {
        return None;
    }
    let prefix = format!("{EXPORT_NAME_TARGET_MARKER}{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

// The dependency-crate struct (`crate::Struct`) an expression holds: a parameter or local declared as
// one, or a source struct field declared as one, seen through references and clones.

// A shared-allocation payload whose TypeScript lowering is a fresh object: a struct literal, a
// closure, or a new collection or `Mutex` cell, possibly inside an erased `RwLock`.
pub(super) fn expression_is_identity_payload(expression: &Expr) -> bool {
    return match expression {
        Expr::Group(group) => expression_is_identity_payload(&group.expr),
        Expr::Paren(paren) => expression_is_identity_payload(&paren.expr),
        Expr::Struct(_) | Expr::Closure(_) | Expr::Array(_) => true,
        Expr::Macro(expression) => expression.mac.path.is_ident("vec"),
        // `RwLock<T>` lowers to `T`, so its payload decides.
        Expr::Call(call)
            if expression_is_associated_path(&call.func, "RwLock", "new")
                && call.args.len() == 1 =>
        {
            expression_is_identity_payload(&call.args[0])
        }
        Expr::Call(call) => [
            "Vec", "VecDeque", "HashMap", "HashSet", "BTreeMap", "BTreeSet", "Mutex",
        ]
        .iter()
        .any(|owner| expression_is_associated_path(&call.func, owner, "new")),
        _ => false,
    };
}

pub(super) fn expression_is_rereadable(expression: &Expr) -> bool {
    return match expression {
        Expr::Group(group) => expression_is_rereadable(&group.expr),
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_deref" | "as_mut" | "as_ref"
                ) =>
        {
            expression_is_rereadable(&call.receiver)
        }
        Expr::Paren(paren) => expression_is_rereadable(&paren.expr),
        Expr::Path(path) => path.qself.is_none() && path.path.segments.len() == 1,
        Expr::Reference(reference) => expression_is_rereadable(&reference.expr),
        expression => expression_is_field_reference(expression),
    };
}

// True when the emitted JS `value` string contains `name` as a standalone identifier (word-boundary
// check). Used to decide whether `const name = value` would cause a TDZ error because `value`
// references the same `name` that the `const` declares.
pub(super) fn value_references_name(name: &str, value: &str) -> bool {
    fn is_js_ident_char(b: u8) -> bool {
        return b.is_ascii_alphanumeric() || b == b'_' || b == b'$';
    }
    for (start, _) in value.match_indices(name) {
        let before_ok = start == 0 || !is_js_ident_char(value.as_bytes()[start - 1]);
        let after_pos = start + name.len();
        let after_ok = after_pos >= value.len() || !is_js_ident_char(value.as_bytes()[after_pos]);
        if before_ok && after_ok {
            return true;
        }
    }
    return false;
}

// An `Arc::ptr_eq` operand proven to hold an identity-bearing TypeScript object, so `===` compares
// allocations as Rust does. A primitive or unit payload lowers to its value and never qualifies.
pub(super) fn expression_is_shared_identity(expression: &Expr, entities: &HashSet<String>) -> bool {
    let expression = peel_shared_view(expression);
    return match expression {
        Expr::Call(call)
            if (expression_is_associated_path(&call.func, "Arc", "new")
                || expression_is_associated_path(&call.func, "Rc", "new"))
                && call.args.len() == 1 =>
        {
            shared_payload_is_identity(&call.args[0], entities)
        }
        Expr::Call(call) => {
            call_returns_shared_identity(entities, &call.func)
                || expression_struct_identity(expression, entities).is_some()
        }
        Expr::Field(field) => {
            if expression_struct_identity(expression, entities).is_some() {
                return true;
            }
            let syn::Member::Named(member) = &field.member else {
                return false;
            };
            let base = peel_shared_view(&field.base);
            if expression_struct_identity(base, entities).is_some_and(|owner| {
                entities.contains(&format!(
                    "{SHARED_IDENTITY_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}"
                ))
            }) {
                return true;
            }
            expression_external_struct(base, entities).is_some_and(|external| {
                entities.contains(&format!(
                    "{SHARED_IDENTITY_EXTERNAL_FIELD_MARKER}{external}{PROVENANCE_SEPARATOR}{member}"
                ))
            })
        }
        Expr::Index(index) => {
            let Expr::Field(field) = peel_shared_view(&index.expr) else {
                return false;
            };
            let syn::Member::Named(member) = &field.member else {
                return false;
            };
            expression_struct_identity(peel_shared_view(&field.base), entities).is_some_and(
                |owner| {
                    entities.contains(&format!(
                        "{SHARED_IDENTITY_ELEMENT_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}"
                    ))
                },
            )
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let name = path.path.segments[0].ident.to_string();
            if matches!(
                lexical_fact(entities, &name),
                Some(BindingFact::Structure(_) | BindingFact::HashMap | BindingFact::HashSet)
            ) {
                return true;
            }
            lexical_binding(entities, &name).is_some_and(|id| {
                entities.contains(&format!("{SHARED_IDENTITY_BINDING_MARKER}{id}"))
            })
        }
        _ => expression_struct_identity(expression, entities).is_some(),
    };
}

// The payload of `Arc::new` / `Rc::new` proven to lower to a fresh or existing object: a literal
// allocation, an erased `RwLock` around one, or a struct value.
pub(super) fn shared_payload_is_identity(payload: &Expr, entities: &HashSet<String>) -> bool {
    return match payload {
        Expr::Group(group) => shared_payload_is_identity(&group.expr, entities),
        Expr::Paren(paren) => shared_payload_is_identity(&paren.expr, entities),
        Expr::Call(call)
            if expression_is_associated_path(&call.func, "RwLock", "new")
                && call.args.len() == 1 =>
        {
            shared_payload_is_identity(&call.args[0], entities)
        }
        payload => {
            expression_is_identity_payload(payload)
                || expression_struct_identity(payload, entities).is_some()
                || external_struct_return(payload, entities).is_some()
        }
    };
}

// The dependency-crate struct (`crate::Struct`) an expression holds: a parameter or local declared as
// one, or a source struct field declared as one, seen through references and clones.
pub(super) fn expression_external_struct(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::Group(group) => expression_external_struct(&group.expr, entities),
        Expr::Paren(paren) => expression_external_struct(&paren.expr, entities),
        Expr::Reference(reference) => expression_external_struct(&reference.expr, entities),
        Expr::MethodCall(call) if call.method == "clone" && call.args.is_empty() => {
            expression_external_struct(&call.receiver, entities)
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let id = lexical_binding(entities, &path.path.segments[0].ident.to_string())?;
            unique_marker_suffix(
                entities,
                &format!("{EXTERNAL_STRUCT_BINDING_MARKER}{id}{PROVENANCE_SEPARATOR}"),
            )
        }
        Expr::Field(field) => {
            let syn::Member::Named(member) = &field.member else {
                return None;
            };
            let owner = expression_struct_identity(&field.base, entities)?;
            unique_marker_suffix(
                entities,
                &format!(
                    "{EXTERNAL_STRUCT_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        _ => None,
    };
}

// The string union every value of `expression` is a variant of: a variant path, or a conditional,
// match or block whose every result is a variant of that one union.
pub(super) fn expression_string_union_owner(
    expression: &Expr,
    context: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::Block(block) => match block.block.stmts.as_slice() {
            [Stmt::Expr(result, None)] => expression_string_union_owner(result, context),
            _ => None,
        },
        Expr::Group(group) => expression_string_union_owner(&group.expr, context),
        Expr::If(if_expression) => {
            let (_, else_branch) = if_expression.else_branch.as_ref()?;
            let [Stmt::Expr(then_result, None)] = if_expression.then_branch.stmts.as_slice() else {
                return None;
            };
            let then_owner = expression_string_union_owner(then_result, context)?;
            let else_owner = expression_string_union_owner(else_branch, context)?;
            (then_owner == else_owner).then_some(then_owner)
        }
        Expr::Match(match_expression) => {
            let mut owners = match_expression
                .arms
                .iter()
                .map(|arm| expression_string_union_owner(&arm.body, context))
                .collect::<Option<BTreeSet<_>>>()?;
            match (owners.pop_first(), owners.is_empty()) {
                (Some(owner), true) => Some(owner),
                _ => None,
            }
        }
        Expr::Paren(paren) => expression_string_union_owner(&paren.expr, context),
        Expr::Path(path) if path.qself.is_none() => path_owner_and_member(&path.path)
            .map(|(owner, _)| owner)
            .filter(|owner| is_string_union(context, owner)),
        _ => None,
    };
}

// The canonical identity of the struct `expression` evaluates to in emitted code, derived from
// declarations: a typed binding, a struct-returning call, a struct literal's resolved path, or a field
// whose declared type is a struct (recursively, so `a.b.c` resolves `b`'s owner through `a`).
pub(super) fn expression_struct_identity(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::Group(group) => expression_struct_identity(&group.expr, entities),
        Expr::Paren(paren) => expression_struct_identity(&paren.expr, entities),
        Expr::Reference(reference) => expression_struct_identity(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_struct_identity(&unary.expr, entities)
        }
        Expr::Call(call) => match call.func.as_ref() {
            Expr::Path(path) if path.qself.is_none() => {
                call_fact(entities, STRUCT_RETURN_MARKER, &path.path)
            }
            _ => None,
        },
        Expr::Struct(literal) if literal.qself.is_none() => context_type_identity(
            entities,
            &Type::Path(syn::TypePath {
                qself: None,
                path: literal.path.clone(),
            }),
        ),
        Expr::Field(field) => {
            let syn::Member::Named(member) = &field.member else {
                return None;
            };
            let owner = expression_struct_identity(&field.base, entities)?;
            unique_marker_suffix(
                entities,
                &format!(
                    "{STRUCT_FIELD_TYPE_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        Expr::Index(index) => match expression_sequence_element_fact(&index.expr, entities)? {
            BindingFact::Structure(identity) if current_source(entities).is_some() => {
                Some(identity)
            }
            _ => None,
        },
        Expr::MethodCall(call) if current_source(entities).is_some() => {
            match expression_struct_identity(&call.receiver, entities).and_then(|owner| {
                owner_method_delegation_fact(
                    entities,
                    &owner,
                    &call.method.to_string(),
                    STRUCT_RETURN_MARKER,
                )
            }) {
                Some(identity) if !identity.is_empty() => Some(identity),
                _ => expression_struct_name(expression, entities),
            }
        }
        expression => expression_struct_name(expression, entities),
    };
}

// The element fact of a sequence-valued local or struct field (`holder.items` for `items: Vec<Item>`).
pub(super) fn expression_sequence_element_fact(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<BindingFact> {
    if let Expr::Field(field) = peel_reference_and_paren(expression)
        && let syn::Member::Named(member) = &field.member
    {
        let owner = expression_struct_identity(&field.base, entities)?;
        return unique_marker_suffix(
            entities,
            &format!(
                "{SEQUENCE_FIELD_ELEMENT_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
            ),
        )
        .map(|fact| binding_fact_from_marker(&fact));
    }
    return sequence_element_binding_fact(expression, entities);
}

// The typed array an expression's value is: a local, parameter, constant or struct field typed as a
// fixed typed-primitive array (`[f64; 4]` is `Float64Array`), seen through references.
pub(super) fn expression_typed_array(
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
                    "{TYPED_ARRAY_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        Expr::Group(group) => expression_typed_array(&group.expr, entities),
        Expr::Paren(paren) => expression_typed_array(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let name = path.path.segments[0].ident.to_string();
            match lexical_fact(entities, &name) {
                Some(BindingFact::TypedArray(array_type)) => Some(array_type),
                Some(_) => None,
                None if lexical_binding(entities, &name).is_none() => {
                    unique_marker_suffix(entities, &format!("{TYPED_ARRAY_CONSTANT_MARKER}{name}:"))
                        .filter(|array_type| array_type != "other")
                }
                None => None,
            }
        }
        Expr::Reference(reference) => expression_typed_array(&reference.expr, entities),
        _ => None,
    };
}

pub(super) fn type_script_array_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> Option<String> {
    return unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_SCRIPT_ARRAY_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}{PROVENANCE_SEPARATOR}"
        ),
    );
}

pub(super) fn contract_array_field_value(
    expression: &Expr,
    emitted: String,
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> String {
    let Some(array_type) = type_script_array_field(entities, identity, field) else {
        return emitted;
    };
    if expression_typed_array(expression, entities).as_deref() == Some(array_type.as_str()) {
        return emitted;
    }
    return format!("new {array_type}({emitted})");
}
