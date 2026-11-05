use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use syn::visit::Visit;
use syn::{Expr, FnArg, GenericArgument, Pat, PathArguments, ReturnType, Stmt, Type};

use crate::model::Program;
use crate::{CompileError, compile_error};

use super::{
    ExternalIdentityAlias, IDENTITY_ALIAS_MARKER, MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER,
    NULLABLE_OPTIONS_MARKER, PreferredAliases, RETURNS_NULLABLE_MARKER, argument_is_nullable_guard,
    array_type, emit_expression, emit_type, export_name, expression_is_path,
    is_primitive_typescript_type, is_standard_type_path, nullable_type, option_inner_type,
    resolve_type_path, snake_to_lower_camel, write_indent,
};
pub(super) fn emit_receiver_preserving_optional_call(
    out: &mut String,
    expression: &syn::ExprIf,
    binding: &(String, String, &'static str),
    entities: &HashSet<String>,
    indent: usize,
) -> Result<bool, CompileError> {
    if expression.else_branch.is_some() {
        return Ok(false);
    }
    let Expr::Let(condition) = expression.cond.as_ref() else {
        return Ok(false);
    };
    if !expression_is_field_reference(&condition.expr) {
        return Ok(false);
    }
    let (call, returns) = match expression.then_branch.stmts.as_slice() {
        [Stmt::Expr(Expr::Call(call), _)] => (call, false),
        [Stmt::Expr(Expr::Return(return_expression), _)] => {
            let Some(Expr::Call(call)) = return_expression.expr.as_deref() else {
                return Ok(false);
            };
            (call, true)
        }
        _ => return Ok(false),
    };
    let Expr::Path(function) = call.func.as_ref() else {
        return Ok(false);
    };
    if function.qself.is_some() || function.path.segments.len() != 1 {
        return Ok(false);
    }
    let Some(function) = function.path.segments.first() else {
        return Ok(false);
    };
    let function = function.ident.to_string();
    let function = export_name(entities, &function)
        .map_or_else(|| snake_to_lower_camel(&function), str::to_string);
    if function != binding.0 {
        return Ok(false);
    }
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?
        .join(", ");
    write_indent(out, indent);
    if returns {
        writeln!(out, "if ({} !== {}) {{", binding.1, binding.2)
            .expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {}({arguments});", binding.1)
            .expect("writing to a String cannot fail");
        write_indent(out, indent);
        out.push_str("}\n");
    } else {
        writeln!(out, "{}?.({arguments});", binding.1).expect("writing to a String cannot fail");
    }
    return Ok(true);
}

pub(super) fn expression_is_field_reference(expression: &Expr) -> bool {
    return match expression {
        Expr::Field(_) => true,
        Expr::Group(group) => expression_is_field_reference(&group.expr),
        Expr::Paren(paren) => expression_is_field_reference(&paren.expr),
        Expr::Reference(reference) => expression_is_field_reference(&reference.expr),
        _ => false,
    };
}

pub(crate) fn emit_parameter(
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_parameter_with_aliases(
        argument,
        entities,
        &PreferredAliases::new(),
        false,
        false,
        false,
        false,
    );
}

pub(super) fn emit_parameter_with_aliases(
    argument: &FnArg,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    optional: bool,
    nullable: bool,
    default_null: bool,
    entity_construction: bool,
) -> Result<String, CompileError> {
    let FnArg::Typed(argument) = argument else {
        return Err(compile_error(
            "free-function contract cannot contain a self receiver",
        ));
    };
    let name = match argument.pat.as_ref() {
        Pat::Ident(pattern) => snake_to_lower_camel(&pattern.ident.to_string()),
        Pat::Wild(_) => "_unused".to_string(),
        _ => {
            return Err(compile_error(
                "unsupported destructuring in function parameter",
            ));
        }
    };
    if matches!(argument.pat.as_ref(), Pat::Ident(pattern)
    if entities.contains(&format!(
        "{MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER}{}",
        pattern.ident
    ))) && let Type::Reference(reference) = argument.ty.as_ref()
        && reference.mutability.is_some()
    {
        return Ok(format!(
            "{name}: {{ value: {} }}",
            emit_preferred_type(&reference.elem, entities, aliases)?
        ));
    }
    if entity_construction {
        return Ok(format!(
            "{name}: EntityConstruction<{}>",
            emit_preferred_type(&argument.ty, entities, aliases)?
        ));
    }
    if optional {
        let Some(inner) = option_inner_type(&argument.ty) else {
            return Err(compile_error(
                "only trailing Option parameters can be emitted as optional",
            ));
        };
        return Ok(format!(
            "{name}?: {}",
            emit_preferred_type(inner, entities, aliases)?
        ));
    }
    if nullable {
        let Some(inner) = option_inner_type(&argument.ty) else {
            return Err(compile_error("nullable guard parameter must use Option"));
        };
        let parameter = format!(
            "{name}: {}",
            nullable_type(emit_preferred_type(inner, entities, aliases)?)
        );
        return Ok(if default_null {
            format!("{parameter} = null")
        } else {
            parameter
        });
    }
    return Ok(format!(
        "{name}: {}",
        emit_preferred_type(&argument.ty, entities, aliases)?
    ));
}

pub(super) fn emit_preferred_type(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
) -> Result<String, CompileError> {
    let rendered = emit_type(rust_type, entities)?;
    return Ok(aliases.get(&rendered).cloned().unwrap_or(rendered));
}

pub(super) fn emit_type_with_aliases(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<String, CompileError> {
    let Type::Path(path) = rust_type else {
        return emit_preferred_type(rust_type, entities, aliases);
    };
    let Some(segment) = path.path.segments.last() else {
        return Err(compile_error("empty Rust type path"));
    };
    let name = segment.ident.to_string();
    if matches!(name.as_str(), "Option" | "Vec" | "Mutex" | "Arc" | "Ref") {
        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
            return emit_preferred_type(rust_type, entities, aliases);
        };
        let Some(inner) = arguments.args.iter().find_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        }) else {
            return emit_preferred_type(rust_type, entities, aliases);
        };
        let inner = emit_type_with_aliases(inner, entities, aliases, nullable_types)?;
        return Ok(match name.as_str() {
            "Option"
                if entities.contains(NULLABLE_OPTIONS_MARKER)
                    || nullable_types.contains(&inner) =>
            {
                nullable_type(inner)
            }
            "Option" => format!("{inner} | undefined"),
            "Vec" => array_type(inner),
            "Mutex" => format!("{{ value: {inner} }}"),
            "Arc" if is_primitive_typescript_type(&inner) => inner,
            "Arc" => format!("Readonly<{inner}>"),
            "Ref" => inner,
            _ => unreachable!(),
        });
    }
    return emit_preferred_type(rust_type, entities, aliases);
}

pub(super) fn nullable_guard_types(
    programs: &[&Program],
    aliases: &PreferredAliases,
    type_context: &HashSet<String>,
) -> Result<HashSet<String>, CompileError> {
    let mut types = HashSet::new();
    for program in programs {
        for function in &program.functions {
            for argument in &function.sig.inputs {
                if argument_is_nullable_guard(function, argument)
                    && let FnArg::Typed(argument) = argument
                    && let Some(inner) = option_inner_type(&argument.ty)
                {
                    types.insert(emit_preferred_type(inner, type_context, aliases)?);
                }
            }
        }
    }
    return Ok(types);
}

// The `T | null` value of an `Option` expression whose emitted form is `emitted`: `None` is `null`,
// `Some(x)` is `x`, and any other `Option` value (absent as `undefined`) coalesces to `null`.
// The ordinary (`undefined`-absent) value of an `Option` expression emitted in a `nullable-options`
// source, where `None` and absent values are `null`.
pub(super) fn ordinary_option_value(expression: &Expr, emitted: String) -> String {
    let expression = match expression {
        Expr::Group(group) => group.expr.as_ref(),
        Expr::Paren(paren) => paren.expr.as_ref(),
        expression => expression,
    };
    if expression_is_path(expression, "None") {
        return "undefined".to_string();
    }
    if let Expr::Call(call) = expression
        && (expression_is_path(&call.func, "Some") || expression_is_path(&call.func, "Ok"))
    {
        return emitted;
    }
    return format!("({emitted}) ?? undefined");
}

pub(super) fn nullable_option_value(expression: &Expr, emitted: String) -> String {
    let expression = match expression {
        Expr::Group(group) => group.expr.as_ref(),
        Expr::Paren(paren) => paren.expr.as_ref(),
        expression => expression,
    };
    if expression_is_path(expression, "None") {
        return "null".to_string();
    }
    if let Expr::Call(call) = expression
        && (expression_is_path(&call.func, "Some") || expression_is_path(&call.func, "Ok"))
    {
        return emitted;
    }
    return format!("({emitted}) ?? null");
}

pub(super) fn option_return_absent_value(entities: &HashSet<String>) -> &'static str {
    if entities.contains(RETURNS_NULLABLE_MARKER) {
        return "null";
    }
    return "undefined";
}

// `dyn Any [+ Send | + Sync | + 'a]` whose `Any` resolves (see `resolve_type_path`) to `std::any::Any`
// or `core::any::Any`: an opaque value portable code never inspects, `object` in TypeScript. `object`
// rather than `unknown` keeps `Arc::ptr_eq` (lowered to `===`) an identity comparison, and makes a
// payload with no identity (`Arc::new(())` lowers to `undefined`) a type error rather than a value that
// compares equal to every other. Any other bound, or an `Any` of uncertain provenance, is not this shape.
pub(super) fn trait_object_is_standard_any(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
) -> bool {
    let mut any = false;
    for bound in bounds {
        match bound {
            syn::TypeParamBound::Trait(trait_bound) => {
                if trait_bound.lifetimes.is_some()
                    || !matches!(trait_bound.modifier, syn::TraitBoundModifier::None)
                    || !matches!(
                        trait_bound
                            .path
                            .segments
                            .last()
                            .map(|segment| &segment.arguments),
                        Some(PathArguments::None)
                    )
                {
                    return false;
                }
                let Some(resolved) = resolve_type_path(&trait_bound.path, entities) else {
                    return false;
                };
                if matches!(
                    resolved
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>()
                        .as_slice(),
                    ["std" | "core", "any", "Any"]
                ) {
                    if any {
                        return false;
                    }
                    any = true;
                } else if !is_standard_type_path(&resolved, "Send")
                    && !is_standard_type_path(&resolved, "Sync")
                {
                    return false;
                }
            }
            syn::TypeParamBound::Lifetime(_) => {}
            _ => return false,
        }
    }
    return any;
}

pub(super) fn type_contains_nullable(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<bool, CompileError> {
    return Ok(
        emit_type_with_aliases(rust_type, entities, aliases, nullable_types)?.contains(" | null"),
    );
}

pub(super) fn external_identity_aliases(
    external_alias_programs: &[(BTreeMap<String, String>, &str)],
) -> Result<BTreeMap<String, ExternalIdentityAlias>, CompileError> {
    let mut aliases = BTreeMap::new();
    for (identity_aliases, module) in external_alias_programs {
        for (name, tag) in identity_aliases {
            if aliases
                .insert(
                    name.clone(),
                    ExternalIdentityAlias {
                        module: (*module).to_string(),
                        tag: tag.clone(),
                    },
                )
                .is_some()
            {
                return Err(compile_error(format!(
                    "external identity alias `{name}` is declared by more than one source"
                )));
            }
        }
    }
    return Ok(aliases);
}

pub(super) fn identity_alias_marker(name: &str, tag: &str) -> String {
    return format!("{IDENTITY_ALIAS_MARKER}{name}:{tag}");
}

pub(super) fn identity_alias_tag<'a>(context: &'a HashSet<String>, name: &str) -> Option<&'a str> {
    let prefix = format!("{IDENTITY_ALIAS_MARKER}{name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

pub(super) fn used_identity_aliases(
    program: &Program,
    aliases: &BTreeMap<String, ExternalIdentityAlias>,
) -> BTreeSet<String> {
    struct Collector<'a> {
        aliases: &'a BTreeMap<String, ExternalIdentityAlias>,
        names: BTreeSet<String>,
    }

    impl<'ast> Visit<'ast> for Collector<'_> {
        fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
            if let Some(segment) = rust_type.path.segments.last() {
                let name = segment.ident.to_string();
                if self.aliases.contains_key(&name) {
                    self.names.insert(name);
                }
            }
            syn::visit::visit_type_path(self, rust_type);
        }
    }

    let mut collector = Collector {
        aliases,
        names: BTreeSet::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for rust_enum in &program.enums {
        collector.visit_item_enum(rust_enum);
    }
    for function in &program.functions {
        collector.visit_item_fn(function);
    }
    for rust_static in &program.statics {
        collector.visit_item_static(rust_static);
    }
    for structure in &program.structs {
        collector.visit_item_struct(structure);
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }
    return collector.names;
}
