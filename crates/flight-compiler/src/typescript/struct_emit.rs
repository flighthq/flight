use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use syn::{Expr, ItemStruct, UnOp};

use crate::model::Program;
use crate::{CompileError, compile_error};

use super::{
    ENTITY_RUNTIME_STATE_FIELD_MARKER, ENTITY_RUNTIME_STATE_MARKER, MUTEX_GUARD_BINDING_MARKER,
    NULLABLE_OPTION_LITERAL_FIELD_MARKER, NULLABLE_OPTIONS_MARKER, PROVENANCE_SEPARATOR,
    PreferredAliases, current_source, emit_documentation, emit_expression,
    emit_named_callable_type, emit_preferred_type, emit_type_parameters, emit_type_with_aliases,
    export_name, expression_struct_name, insert_type_parameter_context, is_lowered_primary,
    is_primary_expression_text, is_public, lexical_binding, lower_camel_from_upper_camel,
    nullable_type, option_inner_type, referenced_path_identifier, snake_to_lower_camel,
    type_script_array_field, unique_marker_suffix,
};
pub(super) fn emit_static(
    out: &mut String,
    rust_static: &syn::ItemStatic,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<(), CompileError> {
    emit_documentation(out, &rust_static.attrs, 0);
    let export = if is_public(&rust_static.vis) {
        "export "
    } else {
        ""
    };
    let rust_name = rust_static.ident.to_string();
    let name = export_name(entities, &rust_name).unwrap_or(&rust_name);
    // A `LazyLock` static is initialized once, eagerly, when the module loads: `T` from `init()`.
    if let Some((inner, initializer)) = crate::model::lazy_lock_static(rust_static) {
        let typescript_type = emit_type_with_aliases(inner, entities, aliases, nullable_types)?;
        let value = match initializer {
            Expr::Path(_) => format!("{}()", emit_expression(initializer, entities)?),
            Expr::Closure(closure) if !matches!(closure.body.as_ref(), Expr::Block(_)) => {
                emit_expression(&closure.body, entities)?
            }
            _ => format!("({})()", emit_expression(initializer, entities)?),
        };
        writeln!(out, "{export}const {name}: {typescript_type} = {value};")
            .expect("writing to a String cannot fail");
        return Ok(());
    }
    let typescript_type =
        emit_type_with_aliases(&rust_static.ty, entities, aliases, nullable_types)?;
    let mut value = emit_expression(&rust_static.expr, entities)?;
    if typescript_type.contains(" | null") {
        value = value.replace("undefined", "null");
    }
    writeln!(out, "{export}const {name}: {typescript_type} = {value};")
        .expect("writing to a String cannot fail");
    return Ok(());
}

pub(super) fn emit_struct(
    out: &mut String,
    structure: &ItemStruct,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    callable_field_parameters: &BTreeMap<(String, String), Vec<String>>,
    readonly: bool,
) -> Result<(), CompileError> {
    emit_documentation(out, &structure.attrs, 0);
    let rust_name = structure.ident.to_string();
    let entity = entities.contains(&rust_name);
    let name = if entity {
        format!("{rust_name}Raw")
    } else {
        rust_name
    };
    let export = if is_public(&structure.vis) {
        "export "
    } else {
        ""
    };
    let module_private_plain_data = !is_public(&structure.vis) && !entity;
    let extension = if entity { " extends EntityRaw" } else { "" };
    let type_parameters = emit_type_parameters(&structure.generics);
    let mut type_context = entities.clone();
    insert_type_parameter_context(&mut type_context, &structure.generics);
    writeln!(
        out,
        "{export}interface {name}{type_parameters}{extension} {{"
    )
    .expect("writing to a String cannot fail");
    for field in &structure.fields {
        if !module_private_plain_data && !is_public(&field.vis) {
            continue;
        }
        emit_documentation(out, &field.attrs, 1);
        let Some(field_name) = &field.ident else {
            return Err(compile_error(format!(
                "unnamed field on `{}` cannot be transpiled",
                structure.ident
            )));
        };
        let name = snake_to_lower_camel(&field_name.to_string());
        let prefix = if readonly { "readonly " } else { "" };
        let structure_identity = current_source(entities)
            .map(|module| format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident))
            .unwrap_or_else(|| structure.ident.to_string());
        if let Some(array_type) = type_script_array_field(entities, &structure_identity, field_name)
        {
            writeln!(out, "  {prefix}{name}: {array_type};")
                .expect("writing to a String cannot fail");
            continue;
        }
        if let Some(inner) = option_inner_type(&field.ty)
            && let Some(current) = current_source(entities)
            && entities.contains(&format!(
                "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                structure.ident
            ))
        {
            writeln!(
                out,
                "  {prefix}{name}: {};",
                nullable_type(emit_preferred_type(inner, entities, aliases)?)
            )
            .expect("writing to a String cannot fail");
            continue;
        }
        let (optional, rust_type) = if entities.contains(NULLABLE_OPTIONS_MARKER) {
            ("", &field.ty)
        } else if let Some(inner) = option_inner_type(&field.ty) {
            ("?", inner)
        } else {
            ("", &field.ty)
        };
        let parameter_names = callable_field_parameters
            .get(&(structure.ident.to_string(), field_name.to_string()))
            .map(Vec::as_slice);
        let typescript_type = if let Some(parameter_names) = parameter_names {
            emit_named_callable_type(rust_type, &type_context, parameter_names)?
        } else {
            emit_preferred_type(rust_type, &type_context, aliases)?
        };
        writeln!(out, "  {prefix}{name}{optional}: {};", typescript_type)
            .expect("writing to a String cannot fail");
    }
    out.push_str("}\n");
    return Ok(());
}

pub(super) fn emit_unary_expression(
    unary: &syn::ExprUnary,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let operator = emit_unary_operator(&unary.op)?;
    let operand = emit_expression(&unary.expr, entities)?;
    if matches!(unary.op, UnOp::Deref(_))
        && referenced_path_identifier(&unary.expr)
            .and_then(|name| lexical_binding(entities, &name))
            .is_some_and(|id| entities.contains(&format!("{MUTEX_GUARD_BINDING_MARKER}{id}")))
    {
        return Ok(format!("{operand}.value"));
    }
    if matches!(unary.op, UnOp::Not(_))
        && let Expr::MethodCall(method) = unary.expr.as_ref()
        && method.method == "is_empty"
        && method.args.is_empty()
        && let Some(receiver) = operand.strip_suffix(".length === 0")
        && is_primary_expression_text(receiver)
    {
        return Ok(format!("{receiver}.length !== 0"));
    }
    if !is_lowered_primary(&unary.expr, &operand) || !is_primary_expression_text(&operand) {
        return Ok(format!("{operator}({operand})"));
    }
    return Ok(format!("{operator}{operand}"));
}

pub(super) fn emit_unary_operator(operator: &UnOp) -> Result<&'static str, CompileError> {
    return match operator {
        UnOp::Deref(_) => Ok(""),
        UnOp::Neg(_) => Ok("-"),
        UnOp::Not(_) => Ok("!"),
        _ => Err(compile_error("unsupported Rust unary operator")),
    };
}

// The store holding the designated crate-private entity state a field expression reads or writes. The
// state lives in a WeakMap owned by the declaring module, so no public interface, runtime slot, binding
// or object copy can reach it. A designated field name on a receiver whose struct cannot be resolved
// fails closed rather than emitting a public property access that does not exist.
// flight-lint: allow(hashmap-iteration) designated owners are collected into an ordered BTreeSet
pub(super) fn entity_runtime_state_access(
    field: &syn::ExprField,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let syn::Member::Named(member) = &field.member else {
        return Ok(None);
    };
    let owners = entities
        .iter()
        .filter_map(|marker| {
            marker
                .strip_prefix(ENTITY_RUNTIME_STATE_FIELD_MARKER)?
                .strip_prefix(&format!("{member}{PROVENANCE_SEPARATOR}"))
        })
        .collect::<BTreeSet<_>>();
    if owners.is_empty() {
        return Ok(None);
    }
    let Some(identity) = expression_struct_name(&field.base, entities) else {
        return Err(compile_error(format!(
            "cannot resolve the receiver of `.{member}`, which is designated entity runtime state on {}; bind the receiver to a local or parameter of that entity type",
            owners
                .iter()
                .map(|owner| format!("`{owner}`"))
                .collect::<Vec<_>>()
                .join(", ")
        )));
    };
    return Ok(unique_marker_suffix(
        entities,
        &format!(
            "{ENTITY_RUNTIME_STATE_MARKER}{identity}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
        ),
    ));
}

// Whether `owner` is an entity with designated crate-private runtime state in this context.
// flight-lint: allow(hashmap-iteration) `any` over the markers is order-independent
pub(super) fn entity_runtime_state_is_designated(entities: &HashSet<String>, owner: &str) -> bool {
    return entities.iter().any(|marker| {
        marker
            .strip_prefix(ENTITY_RUNTIME_STATE_FIELD_MARKER)
            .and_then(|rest| rest.split_once(PROVENANCE_SEPARATOR))
            .is_some_and(|(_, designated_owner)| designated_owner == owner)
    });
}

// The package-internal store of `owner.field` designated entity runtime state.
pub(super) fn entity_runtime_state_store(owner: &str, field: &str) -> String {
    let field = snake_to_lower_camel(field);
    let mut characters = field.chars();
    let field = characters
        .next()
        .map(|first| first.to_ascii_uppercase().to_string() + characters.as_str())
        .unwrap_or_default();
    return format!("{}{field}Store", lower_camel_from_upper_camel(owner));
}

// The `(store, module specifier)` imports `body` needs: each sibling-declared entity runtime state
// store its code reads or writes. A store name cannot come from portable Rust (collisions are
// rejected), so a code-only identifier match is exact. A store in a module this source cannot name
// relatively fails closed.
pub(super) fn entity_runtime_state_store_imports(
    body: &str,
    programs: &[&Program],
    modules: &[String],
) -> Result<BTreeSet<(String, String)>, CompileError> {
    let code_ranges = crate::typescript_code_ranges(body);
    let mut imports = BTreeSet::new();
    for (index, program) in programs.iter().enumerate().skip(1) {
        for (owner, field_name) in &program.entity_runtime_states {
            let store = entity_runtime_state_store(owner, field_name);
            let used = code_ranges.iter().any(|range| {
                let code = &body[range.clone()];
                code.match_indices(&store).any(|(offset, _)| {
                    let before = code[..offset].chars().next_back();
                    let after = code[offset + store.len()..].chars().next();
                    !before.is_some_and(|character| {
                        character.is_ascii_alphanumeric() || matches!(character, '_' | '$' | '.')
                    }) && !after.is_some_and(|character| {
                        character.is_ascii_alphanumeric() || matches!(character, '_' | '$')
                    })
                })
            });
            if !used {
                continue;
            }
            let current = modules[0].split("::").collect::<Vec<_>>();
            let declaring = modules[index].split("::").collect::<Vec<_>>();
            let [crate_name, module] = declaring.as_slice() else {
                return Err(compile_error(format!(
                    "entity runtime state `{owner}.{field_name}` is declared in `{}`, which this module cannot import; declare it in a top-level module of the crate",
                    modules[index]
                )));
            };
            if current.len() != 2 || current[0] != *crate_name {
                return Err(compile_error(format!(
                    "entity runtime state `{owner}.{field_name}` in `{}` is not reachable from `{}`",
                    modules[index], modules[0]
                )));
            }
            imports.insert((store, format!("./{}.ts", snake_to_lower_camel(module))));
        }
    }
    return Ok(imports);
}
