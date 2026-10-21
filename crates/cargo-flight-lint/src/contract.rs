//! Rules that enforce the contract direction in agents/design-decisions.md:
//! `f64` (D1), `hidden-state` (D5), `sugar-delegates` (D6), `hashmap-iteration` (D3),
//! `contract-vocabulary` (agents/ir-vocabulary.md), `enum-payload-named` (D2).

use std::collections::HashSet;
use std::path::Path;

use proc_macro2::TokenTree;
use syn::spanned::Spanned;
use syn::visit::{self, Visit};
use syn::{
    Expr, Fields, GenericArgument, ImplItem, Item, PathArguments, Type, TypeParamBound,
};

use crate::allow::FileAllows;
use crate::model::Violation;
use crate::structure::is_pub;
use crate::vocabulary;

const ITER_METHODS: &[&str] = &[
    "iter",
    "iter_mut",
    "keys",
    "values",
    "values_mut",
    "into_iter",
    "into_keys",
    "into_values",
    "drain",
];
const PEEL_METHODS: &[&str] = &[
    "borrow",
    "borrow_mut",
    "as_ref",
    "as_mut",
    "unwrap",
    "expect",
    "lock",
    "read",
    "write",
    "clone",
];
/// Immutable `LazyLock` constants are vocabulary; anything mutable inside them is still caught.
const INTERIOR_MUT: &[&str] = &["Cell", "RefCell", "Mutex", "RwLock", "OnceLock", "OnceCell"];
const NON_NAMED_PAYLOAD: &[&str] = &[
    "String", "Vec", "Option", "Box", "Rc", "Arc", "HashMap", "HashSet", "RefCell", "Cell",
];
/// Trait impls whose bodies are boilerplate rather than sugar.
const SUGAR_EXEMPT_TRAITS: &[&str] = &[
    "Default", "Clone", "Copy", "Debug", "Display", "Eq", "Hash", "Ord", "PartialOrd",
];

/// Workspace-wide facts gathered before checking.
#[derive(Default)]
pub struct Index {
    pub free_fns: HashSet<String>,
    /// Struct, enum, alias, and trait names defined anywhere in the workspace.
    pub types: HashSet<String>,
    /// Field, parameter, and binding names declared with a HashMap/HashSet type, per crate.
    pub map_names: std::collections::HashMap<String, HashSet<String>>,
}

pub fn index_file(index: &mut Index, crate_name: &str, file: &syn::File) {
    for item in &file.items {
        match item {
            Item::Fn(f) => {
                index.free_fns.insert(f.sig.ident.to_string());
            }
            Item::Struct(s) => {
                index.types.insert(s.ident.to_string());
            }
            Item::Enum(e) => {
                index.types.insert(e.ident.to_string());
            }
            Item::Type(t) => {
                index.types.insert(t.ident.to_string());
            }
            Item::Trait(t) => {
                index.types.insert(t.ident.to_string());
            }
            _ => {}
        }
    }
    let mut collector = MapNameCollector::default();
    collector.visit_file(file);
    index
        .map_names
        .entry(crate_name.to_string())
        .or_default()
        .extend(collector.names);
}

pub fn check_contract(
    path: &Path,
    crate_name: &str,
    file: &syn::File,
    allows: &FileAllows,
    index: &Index,
) -> Vec<Violation> {
    let empty = HashSet::new();
    let map_names = index.map_names.get(crate_name).unwrap_or(&empty);
    let mut out = Vec::new();

    for item in &file.items {
        let Some((label, line)) = item_label(item) else {
            continue;
        };

        if let Item::Impl(imp) = item {
            for impl_item in &imp.items {
                if let ImplItem::Fn(m) = impl_item {
                    let m_label = format!("{}::{}", label, m.sig.ident);
                    let m_line = m.sig.fn_token.span.start().line;
                    let lines = [m_line, line];
                    check_f64(&mut out, path, allows, &m_label, &lines, Node::Method(m));
                    check_clock(&mut out, path, allows, &m_label, &lines, Node::Method(m));
                    check_iteration(&mut out, path, allows, &m_label, &lines, Node::Method(m), map_names);
                }
            }
            check_sugar(&mut out, path, allows, &label, line, imp, &index.free_fns);
            continue;
        }

        let lines = [line];
        check_unhomed(&mut out, path, crate_name, allows, &label, line, item);
        check_f64(&mut out, path, allows, &label, &lines, Node::Item(item));
        check_clock(&mut out, path, allows, &label, &lines, Node::Item(item));
        check_iteration(&mut out, path, allows, &label, &lines, Node::Item(item), map_names);
        check_statics(&mut out, path, allows, item);
        check_contract_types(&mut out, path, allows, &label, line, item, &index.types);
        if let Item::Enum(e) = item
            && is_pub(&e.vis)
        {
            check_enum_payloads(&mut out, path, allows, line, e);
        }
    }

    return out;
}

fn item_label(item: &Item) -> Option<(String, usize)> {
    return match item {
        Item::Fn(f) => Some((format!("fn {}", f.sig.ident), f.sig.fn_token.span.start().line)),
        Item::Struct(s) => Some((
            format!("struct {}", s.ident),
            s.struct_token.span.start().line,
        )),
        Item::Enum(e) => Some((format!("enum {}", e.ident), e.enum_token.span.start().line)),
        Item::Type(t) => Some((format!("type {}", t.ident), t.type_token.span.start().line)),
        Item::Const(c) => Some((format!("const {}", c.ident), c.const_token.span.start().line)),
        Item::Static(s) => Some((
            format!("static {}", s.ident),
            s.static_token.span.start().line,
        )),
        Item::Impl(i) => {
            let ty = type_name(&i.self_ty);
            let label = match &i.trait_ {
                Some((_, p, _)) => format!(
                    "impl {} for {}",
                    p.segments.last().map(|s| s.ident.to_string()).unwrap_or_default(),
                    ty
                ),
                None => format!("impl {}", ty),
            };
            Some((label, i.impl_token.span.start().line))
        }
        Item::Macro(m) => {
            let name = m.mac.path.segments.last()?.ident.to_string();
            Some((format!("{}!", name), m.mac.path.span().start().line))
        }
        _ => None,
    };
}

fn type_name(ty: &Type) -> String {
    if let Type::Path(p) = ty {
        return p
            .path
            .segments
            .last()
            .map(|s| s.ident.to_string())
            .unwrap_or_default();
    }
    return String::from("?");
}

// ---------------------------------------------------------------------------
// unhomed (plan: flight-unhomed)
// ---------------------------------------------------------------------------

fn check_unhomed(
    out: &mut Vec<Violation>,
    path: &Path,
    crate_name: &str,
    allows: &FileAllows,
    label: &str,
    line: usize,
    item: &Item,
) {
    if crate_name != "flight-unhomed" {
        return;
    }
    let public = match item {
        Item::Fn(f) => is_pub(&f.vis),
        Item::Struct(s) => is_pub(&s.vis),
        Item::Enum(e) => is_pub(&e.vis),
        Item::Type(t) => is_pub(&t.vis),
        Item::Const(c) => is_pub(&c.vis),
        Item::Static(s) => is_pub(&s.vis),
        _ => false,
    };
    if public && !allows.is_allowed("unhomed", &[line]) {
        out.push(Violation::new(
            path,
            line,
            "unhomed",
            format!("{} has no `allow(unhomed) <proposed owner>` marker", label),
        ));
    }
}

// ---------------------------------------------------------------------------
// f64 (D1)
// ---------------------------------------------------------------------------

fn check_f64(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    label: &str,
    lines: &[usize],
    node: Node,
) {
    let mut finder = F64Finder::default();
    visit_node(&mut finder, node);
    if let Some(line) = finder.first
        && !allows.is_allowed("f64", lines)
    {
        out.push(Violation::new(
            path,
            line,
            "f64",
            format!("`{}` uses f64 without an `allow(f64) <reason>` declaration", label),
        ));
    }
}

#[derive(Default)]
pub struct F64Finder {
    first: Option<usize>,
}

impl<'ast> Visit<'ast> for F64Finder {
    fn visit_type_path(&mut self, node: &'ast syn::TypePath) {
        if node.qself.is_none() && node.path.is_ident("f64") && self.first.is_none() {
            self.first = Some(node.span().start().line);
        }
        visit::visit_type_path(self, node);
    }

    fn visit_lit_float(&mut self, node: &'ast syn::LitFloat) {
        if node.suffix() == "f64" && self.first.is_none() {
            self.first = Some(node.span().start().line);
        }
    }

    fn visit_expr_path(&mut self, node: &'ast syn::ExprPath) {
        // `f64::MAX`, `f64::from(...)`
        if node.path.segments.len() >= 2
            && node.path.segments[0].ident == "f64"
            && self.first.is_none()
        {
            self.first = Some(node.span().start().line);
        }
        visit::visit_expr_path(self, node);
    }
}

/// Lets one helper visit both whole items and impl methods.
#[derive(Clone, Copy)]
pub enum Node<'a> {
    Item(&'a Item),
    Method(&'a syn::ImplItemFn),
}

fn visit_node<'a, V: Visit<'a>>(v: &mut V, node: Node<'a>) {
    match node {
        Node::Item(i) => v.visit_item(i),
        Node::Method(m) => v.visit_impl_item_fn(m),
    }
}

// ---------------------------------------------------------------------------
// hidden-state (D5)
// ---------------------------------------------------------------------------

fn check_statics(out: &mut Vec<Violation>, path: &Path, allows: &FileAllows, item: &Item) {
    match item {
        Item::Macro(m) if m.mac.path.is_ident("thread_local") => {
            let macro_line = m.mac.path.span().start().line;
            let tokens: Vec<TokenTree> = m.mac.tokens.clone().into_iter().collect();
            for i in 0..tokens.len() {
                if let TokenTree::Ident(kw) = &tokens[i]
                    && kw == "static"
                {
                    // Skip `static mut`/`static ref` style qualifiers.
                    let mut j = i + 1;
                    while let Some(TokenTree::Ident(q)) = tokens.get(j) {
                        if q == "mut" || q == "ref" {
                            j += 1;
                        } else {
                            break;
                        }
                    }
                    if let Some(TokenTree::Ident(name)) = tokens.get(j) {
                        let line = name.span().start().line;
                        if !allows.is_allowed("hidden-state", &[line, macro_line]) {
                            out.push(Violation::new(
                                path,
                                line,
                                "hidden-state",
                                format!(
                                    "thread_local `{}` is hidden global state; pass it explicitly or mark a non-semantic cache with `allow(hidden-state) <reason>`",
                                    name
                                ),
                            ));
                        }
                    }
                }
            }
        }
        Item::Static(s) => {
            let line = s.static_token.span.start().line;
            let mutable = matches!(s.mutability, syn::StaticMutability::Mut(_));
            let mut finder = IdentFinder::new(INTERIOR_MUT);
            finder.visit_type(&s.ty);
            let atomic = type_mentions_prefix(&s.ty, "Atomic");
            if (mutable || !finder.found.is_empty() || atomic)
                && !allows.is_allowed("hidden-state", &[line])
            {
                out.push(Violation::new(
                    path,
                    line,
                    "hidden-state",
                    format!(
                        "static `{}` is hidden global state; pass it explicitly or mark a non-semantic cache with `allow(hidden-state) <reason>`",
                        s.ident
                    ),
                ));
            }
        }
        _ => {}
    }
}

fn check_clock(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    label: &str,
    lines: &[usize],
    node: Node,
) {
    let mut finder = ClockFinder::default();
    visit_node(&mut finder, node);
    if let Some(line) = finder.first
        && !allows.is_allowed("hidden-state", lines)
    {
        out.push(Violation::new(
            path,
            line,
            "hidden-state",
            format!("`{}` reads the system clock; take the time as a parameter", label),
        ));
    }
}

#[derive(Default)]
pub struct ClockFinder {
    first: Option<usize>,
}

impl<'ast> Visit<'ast> for ClockFinder {
    fn visit_expr_path(&mut self, node: &'ast syn::ExprPath) {
        let segs: Vec<String> = node.path.segments.iter().map(|s| s.ident.to_string()).collect();
        if segs.len() >= 2 {
            let n = segs.len();
            let clock = segs[n - 1] == "now" && (segs[n - 2] == "SystemTime" || segs[n - 2] == "Instant");
            if clock && self.first.is_none() {
                self.first = Some(node.span().start().line);
            }
        }
        visit::visit_expr_path(self, node);
    }
}

// ---------------------------------------------------------------------------
// sugar-delegates (D6)
// ---------------------------------------------------------------------------

fn check_sugar(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    label: &str,
    impl_line: usize,
    imp: &syn::ItemImpl,
    free_fns: &HashSet<String>,
) {
    if let Some((_, trait_path, _)) = &imp.trait_ {
        let name = trait_path
            .segments
            .last()
            .map(|s| s.ident.to_string())
            .unwrap_or_default();
        if SUGAR_EXEMPT_TRAITS.contains(&name.as_str()) {
            return;
        }
    }
    for impl_item in &imp.items {
        let ImplItem::Fn(m) = impl_item else {
            continue;
        };
        let m_line = m.sig.fn_token.span.start().line;
        let mut finder = DelegateFinder {
            free_fns,
            calls_free_fn: false,
            has_loop: false,
        };
        finder.visit_block(&m.block);
        let problem = if finder.has_loop {
            Some("contains a loop")
        } else if !finder.calls_free_fn {
            Some("does not call a free function")
        } else {
            None
        };
        if let Some(problem) = problem
            && !allows.is_allowed("sugar-delegates", &[m_line, impl_line])
        {
            out.push(Violation::new(
                path,
                m_line,
                "sugar-delegates",
                format!(
                    "`{}::{}` {}; impl sugar must delegate to the free-function contract",
                    label, m.sig.ident, problem
                ),
            ));
        }
    }
}

struct DelegateFinder<'a> {
    free_fns: &'a HashSet<String>,
    calls_free_fn: bool,
    has_loop: bool,
}

impl<'ast> Visit<'ast> for DelegateFinder<'_> {
    fn visit_expr_call(&mut self, node: &'ast syn::ExprCall) {
        if let Expr::Path(p) = &*node.func
            && let Some(last) = p.path.segments.last()
            && self.free_fns.contains(&last.ident.to_string())
        {
            self.calls_free_fn = true;
        }
        visit::visit_expr_call(self, node);
    }

    fn visit_expr_for_loop(&mut self, node: &'ast syn::ExprForLoop) {
        self.has_loop = true;
        visit::visit_expr_for_loop(self, node);
    }

    fn visit_expr_while(&mut self, node: &'ast syn::ExprWhile) {
        self.has_loop = true;
        visit::visit_expr_while(self, node);
    }

    fn visit_expr_loop(&mut self, node: &'ast syn::ExprLoop) {
        self.has_loop = true;
        visit::visit_expr_loop(self, node);
    }
}

// ---------------------------------------------------------------------------
// hashmap-iteration (D3)
// ---------------------------------------------------------------------------

#[derive(Default)]
struct MapNameCollector {
    names: HashSet<String>,
}

impl<'ast> Visit<'ast> for MapNameCollector {
    fn visit_field(&mut self, node: &'ast syn::Field) {
        if let Some(ident) = &node.ident
            && type_mentions(&node.ty, &["HashMap", "HashSet"])
        {
            self.names.insert(ident.to_string());
        }
        visit::visit_field(self, node);
    }

    fn visit_pat_type(&mut self, node: &'ast syn::PatType) {
        if let syn::Pat::Ident(pi) = &*node.pat
            && type_mentions(&node.ty, &["HashMap", "HashSet"])
        {
            self.names.insert(pi.ident.to_string());
        }
        visit::visit_pat_type(self, node);
    }

    fn visit_local(&mut self, node: &'ast syn::Local) {
        if let syn::Pat::Ident(pi) = &node.pat
            && let Some(init) = &node.init
            && expr_constructs_map(&init.expr)
        {
            self.names.insert(pi.ident.to_string());
        }
        visit::visit_local(self, node);
    }
}

fn expr_constructs_map(expr: &Expr) -> bool {
    if let Expr::Call(c) = expr
        && let Expr::Path(p) = &*c.func
    {
        return p
            .path
            .segments
            .iter()
            .any(|s| s.ident == "HashMap" || s.ident == "HashSet");
    }
    return false;
}

fn check_iteration(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    label: &str,
    lines: &[usize],
    node: Node,
    map_names: &HashSet<String>,
) {
    if map_names.is_empty() {
        return;
    }
    let mut finder = IterationFinder {
        map_names,
        hits: Vec::new(),
    };
    visit_node(&mut finder, node);
    if finder.hits.is_empty() || allows.is_allowed("hashmap-iteration", lines) {
        return;
    }
    let mut seen = HashSet::new();
    for (name, line) in finder.hits {
        if seen.insert(name.clone()) {
            out.push(Violation::new(
                path,
                line,
                "hashmap-iteration",
                format!(
                    "`{}` iterates HashMap/HashSet `{}`; order is unspecified (use a Vec for observable order, or `allow(hashmap-iteration) <reason>`)",
                    label, name
                ),
            ));
        }
    }
}

pub struct IterationFinder<'a> {
    map_names: &'a HashSet<String>,
    hits: Vec<(String, usize)>,
}

impl IterationFinder<'_> {
    fn check_receiver(&mut self, expr: &Expr, line: usize) {
        if let Some(name) = receiver_name(expr)
            && self.map_names.contains(&name)
        {
            self.hits.push((name, line));
        }
    }
}

impl<'ast> Visit<'ast> for IterationFinder<'_> {
    fn visit_expr_method_call(&mut self, node: &'ast syn::ExprMethodCall) {
        if ITER_METHODS.contains(&node.method.to_string().as_str()) {
            self.check_receiver(&node.receiver, node.method.span().start().line);
        }
        visit::visit_expr_method_call(self, node);
    }

    fn visit_expr_for_loop(&mut self, node: &'ast syn::ExprForLoop) {
        self.check_receiver(&node.expr, node.for_token.span.start().line);
        visit::visit_expr_for_loop(self, node);
    }
}

fn receiver_name(expr: &Expr) -> Option<String> {
    return match expr {
        Expr::Reference(r) => receiver_name(&r.expr),
        Expr::Paren(p) => receiver_name(&p.expr),
        Expr::Unary(u) => receiver_name(&u.expr),
        Expr::MethodCall(m) if PEEL_METHODS.contains(&m.method.to_string().as_str()) => {
            receiver_name(&m.receiver)
        }
        Expr::Path(p) if p.path.segments.len() == 1 => Some(p.path.segments[0].ident.to_string()),
        Expr::Field(f) => match &f.member {
            syn::Member::Named(n) => Some(n.to_string()),
            syn::Member::Unnamed(_) => None,
        },
        _ => None,
    };
}

// ---------------------------------------------------------------------------
// contract-vocabulary (agents/ir-vocabulary.md)
// ---------------------------------------------------------------------------

fn check_contract_types(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    label: &str,
    line: usize,
    item: &Item,
    known: &HashSet<String>,
) {
    if let Item::Fn(function) = item
        && function.sig.ident == "unknown_from_panic"
    {
        if is_exact_unknown_from_panic(function) {
            return;
        }
        report_vocabulary(
            out,
            path,
            allows,
            label,
            line,
            vec![String::from(
                "`unknown_from_panic` must be exactly `fn(payload: Box<dyn Any + Send>) -> Unknown`",
            )],
        );
        return;
    }

    let mut types: Vec<&Type> = Vec::new();
    let generics: &syn::Generics = match item {
        Item::Fn(f) if is_pub(&f.vis) => {
            for input in &f.sig.inputs {
                if let syn::FnArg::Typed(t) = input {
                    types.push(&t.ty);
                }
            }
            if let syn::ReturnType::Type(_, t) = &f.sig.output {
                types.push(t);
            }
            &f.sig.generics
        }
        Item::Struct(s) if is_pub(&s.vis) => {
            for field in &s.fields {
                if is_pub(&field.vis) {
                    types.push(&field.ty);
                }
            }
            &s.generics
        }
        Item::Enum(e) if is_pub(&e.vis) => {
            for v in &e.variants {
                for field in &v.fields {
                    types.push(&field.ty);
                }
            }
            &e.generics
        }
        Item::Type(t) if is_pub(&t.vis) => {
            types.push(&t.ty);
            &t.generics
        }
        Item::Const(c) if is_pub(&c.vis) => {
            types.push(&c.ty);
            &c.generics
        }
        Item::Static(s) if is_pub(&s.vis) => {
            types.push(&s.ty);
            return check_static_vocabulary(out, path, allows, label, line, &s.ty, known);
        }
        _ => return,
    };
    let params: HashSet<String> = generics
        .type_params()
        .map(|p| p.ident.to_string())
        .collect();

    // The vocabulary's own aliases are defined in terms of non-vocabulary types.
    if let Item::Type(t) = item {
        if t.ident == "ProviderRef" {
            if is_exact_provider_ref_alias(t) {
                return;
            }
            report_vocabulary(
                out,
                path,
                allows,
                label,
                line,
                vec![String::from(
                    "`ProviderRef` must be exactly `Arc<dyn Any + Send + Sync>` with no type parameters",
                )],
            );
            return;
        }
        if ["AnySlot", "Unknown", "Callback", "Ref", "WeakRef", "Kind", "Handle"]
            .contains(&t.ident.to_string().as_str())
        {
            return;
        }
    }

    let mut problems: Vec<String> = Vec::new();
    for t in &types {
        problems.extend(vocabulary::check_type(t, known, &params));
    }
    problems.extend(vocabulary::check_generic_bounds(generics));
    report_vocabulary(out, path, allows, label, line, problems);
}

fn is_exact_provider_ref_alias(alias: &syn::ItemType) -> bool {
    if alias.ident != "ProviderRef" || !alias.generics.params.is_empty() {
        return false;
    }
    let Type::Path(path) = alias.ty.as_ref() else {
        return false;
    };
    let Some(arc) = path.path.segments.last() else {
        return false;
    };
    if arc.ident != "Arc" {
        return false;
    }
    let PathArguments::AngleBracketed(arguments) = &arc.arguments else {
        return false;
    };
    if arguments.args.len() != 1 {
        return false;
    }
    let Some(GenericArgument::Type(Type::TraitObject(trait_object))) = arguments.args.first()
    else {
        return false;
    };
    if trait_object.bounds.len() != 3 {
        return false;
    }
    let mut names = HashSet::new();
    for bound in &trait_object.bounds {
        let TypeParamBound::Trait(trait_bound) = bound else {
            return false;
        };
        if !matches!(trait_bound.modifier, syn::TraitBoundModifier::None) {
            return false;
        }
        let Some(segment) = trait_bound.path.segments.last() else {
            return false;
        };
        if !matches!(segment.arguments, PathArguments::None) {
            return false;
        }
        let name = segment.ident.to_string();
        if !["Any", "Send", "Sync"].contains(&name.as_str()) || !names.insert(name) {
            return false;
        }
    }
    return true;
}

fn is_exact_unknown_from_panic(function: &syn::ItemFn) -> bool {
    if !function.sig.generics.params.is_empty()
        || function.sig.asyncness.is_some()
        || function.sig.constness.is_some()
        || function.sig.unsafety.is_some()
        || function.sig.abi.is_some()
        || function.sig.variadic.is_some()
        || function.sig.inputs.len() != 1
    {
        return false;
    }
    let Some(syn::FnArg::Typed(input)) = function.sig.inputs.first() else {
        return false;
    };
    let syn::Pat::Ident(parameter) = input.pat.as_ref() else {
        return false;
    };
    if parameter.ident != "payload" {
        return false;
    }
    let Type::Path(box_path) = input.ty.as_ref() else {
        return false;
    };
    let Some(box_segment) = box_path.path.segments.last() else {
        return false;
    };
    if box_segment.ident != "Box" {
        return false;
    }
    let PathArguments::AngleBracketed(box_arguments) = &box_segment.arguments else {
        return false;
    };
    if box_arguments.args.len() != 1 {
        return false;
    }
    let Some(GenericArgument::Type(Type::TraitObject(payload))) = box_arguments.args.first() else {
        return false;
    };
    if payload.bounds.len() != 2 {
        return false;
    }
    let mut bounds = HashSet::new();
    for bound in &payload.bounds {
        let TypeParamBound::Trait(trait_bound) = bound else {
            return false;
        };
        if !matches!(trait_bound.modifier, syn::TraitBoundModifier::None) {
            return false;
        }
        let Some(segment) = trait_bound.path.segments.last() else {
            return false;
        };
        if !matches!(segment.arguments, PathArguments::None) {
            return false;
        }
        let name = segment.ident.to_string();
        if !["Any", "Send"].contains(&name.as_str()) || !bounds.insert(name) {
            return false;
        }
    }
    let syn::ReturnType::Type(_, output) = &function.sig.output else {
        return false;
    };
    let Type::Path(output) = output.as_ref() else {
        return false;
    };
    let Some(output) = output.path.segments.last() else {
        return false;
    };
    return output.ident == "Unknown" && matches!(output.arguments, PathArguments::None);
}

fn check_static_vocabulary(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    label: &str,
    line: usize,
    ty: &Type,
    known: &HashSet<String>,
) {
    let problems = vocabulary::check_type(ty, known, &HashSet::new());
    report_vocabulary(out, path, allows, label, line, problems);
}

fn report_vocabulary(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    label: &str,
    line: usize,
    mut problems: Vec<String>,
) {
    problems.sort();
    problems.dedup();
    if problems.is_empty() || allows.is_allowed("contract-vocabulary", &[line]) {
        return;
    }
    out.push(Violation::new(
        path,
        line,
        "contract-vocabulary",
        format!("`{}`: {}", label, problems.join("; ")),
    ));
}

struct IdentFinder {
    wanted: &'static [&'static str],
    found: HashSet<String>,
}

impl IdentFinder {
    fn new(wanted: &'static [&'static str]) -> IdentFinder {
        return IdentFinder {
            wanted,
            found: HashSet::new(),
        };
    }
}

impl<'ast> Visit<'ast> for IdentFinder {
    fn visit_path_segment(&mut self, node: &'ast syn::PathSegment) {
        let name = node.ident.to_string();
        if self.wanted.contains(&name.as_str()) {
            self.found.insert(name);
        }
        visit::visit_path_segment(self, node);
    }
}

fn type_mentions(ty: &Type, names: &'static [&'static str]) -> bool {
    let mut finder = IdentFinder::new(names);
    finder.visit_type(ty);
    return !finder.found.is_empty();
}

fn type_mentions_prefix(ty: &Type, prefix: &str) -> bool {
    struct PrefixFinder<'p> {
        prefix: &'p str,
        found: bool,
    }
    impl<'ast> Visit<'ast> for PrefixFinder<'_> {
        fn visit_path_segment(&mut self, node: &'ast syn::PathSegment) {
            if node.ident.to_string().starts_with(self.prefix) {
                self.found = true;
            }
            visit::visit_path_segment(self, node);
        }
    }
    let mut finder = PrefixFinder {
        prefix,
        found: false,
    };
    finder.visit_type(ty);
    return finder.found;
}

// ---------------------------------------------------------------------------
// enum-payload-named (D2)
// ---------------------------------------------------------------------------

fn check_enum_payloads(
    out: &mut Vec<Violation>,
    path: &Path,
    allows: &FileAllows,
    enum_line: usize,
    e: &syn::ItemEnum,
) {
    for v in &e.variants {
        let v_line = v.ident.span().start().line;
        let problem = match &v.fields {
            Fields::Unit => None,
            Fields::Named(_) => Some("uses struct-variant fields"),
            Fields::Unnamed(f) if f.unnamed.len() != 1 => Some("has more than one payload field"),
            Fields::Unnamed(f) => {
                if is_named_struct_type(&f.unnamed[0].ty)
                    || is_scalar_payload_type(&f.unnamed[0].ty)
                {
                    None
                } else {
                    Some("carries a non-struct payload")
                }
            }
        };
        if let Some(problem) = problem
            && !allows.is_allowed("enum-payload-named", &[v_line, enum_line])
        {
            out.push(Violation::new(
                path,
                v_line,
                "enum-payload-named",
                format!(
                    "`{}::{}` {}; wrap the data in a named struct",
                    e.ident, v.ident, problem
                ),
            ));
        }
    }
}

fn is_named_struct_type(ty: &Type) -> bool {
    if let Type::Path(p) = ty
        && let Some(last) = p.path.segments.last()
    {
        let name = last.ident.to_string();
        let upper = name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
        return upper && !NON_NAMED_PAYLOAD.contains(&name.as_str());
    }
    return false;
}

const SCALAR_PAYLOAD_TYPES: &[&str] = &[
    "f32", "f64", "bool", "i8", "i16", "i32", "u8", "u16", "u32", "usize",
    "i64", "u64", "String",
];

fn is_scalar_payload_type(ty: &Type) -> bool {
    if let Type::Path(p) = ty
        && let Some(last) = p.path.segments.last()
        && matches!(last.arguments, syn::PathArguments::None)
    {
        return SCALAR_PAYLOAD_TYPES.contains(&last.ident.to_string().as_str());
    }
    if let Type::Reference(r) = ty
        && r.mutability.is_none()
        && let Type::Path(p) = r.elem.as_ref()
        && let Some(last) = p.path.segments.last()
        && last.ident == "str"
    {
        return true;
    }
    return false;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules_for(src: &str) -> Vec<String> {
        return rules_for_crate(src, "c");
    }

    fn rules_for_crate(src: &str, crate_name: &str) -> Vec<String> {
        let file = syn::parse_file(src).unwrap();
        let mut index = Index::default();
        index_file(&mut index, crate_name, &file);
        let allows = FileAllows::new(src);
        let mut v: Vec<String> = check_contract(Path::new("a.rs"), crate_name, &file, &allows, &index)
            .into_iter()
            .map(|v| v.rule)
            .collect();
        v.sort();
        return v;
    }

    #[test]
    fn flags_undeclared_f64_and_honors_marker() {
        assert_eq!(rules_for("pub fn f(x: f64) -> f64 { return x; }"), vec!["f64"]);
        assert!(rules_for("// flight-lint: allow(f64) precision\npub fn f(x: f64) {}").is_empty());
        assert!(rules_for("pub fn f(x: f32) -> f32 { return x; }").is_empty());
    }

    #[test]
    fn flags_hidden_state() {
        let src = "thread_local! { static A: Cell<u32> = Cell::new(0); }\nstatic B: Mutex<u8> = Mutex::new(0);\nstatic C: [f32; 2] = [0.0, 1.0];\nfn now() -> u64 { return Instant::now().elapsed().as_secs(); }";
        assert_eq!(rules_for(src), vec!["hidden-state", "hidden-state", "hidden-state"]);
    }

    #[test]
    fn sugar_must_delegate() {
        let ok = "pub struct V { pub x: f32 }\npub fn create_v(x: f32) -> V { return V { x }; }\nimpl V { pub fn new(x: f32) -> Self { return create_v(x); } }";
        assert!(rules_for(ok).is_empty());
        let bad = "pub struct V { pub x: f32 }\nimpl V { pub fn sum(&self) -> f32 { let mut s = 0.0; for _ in 0..2 { s += self.x; } return s; } }";
        assert_eq!(rules_for(bad), vec!["sugar-delegates"]);
        let exempt = "pub struct V { pub x: f32 }\nimpl Default for V { fn default() -> Self { return V { x: 0.0 }; } }";
        assert!(rules_for(exempt).is_empty());
    }

    #[test]
    fn flags_hashmap_iteration_not_lookup() {
        let src = "pub struct S { pub m: HashMap<String, f32> }\nfn a(s: &S) -> f32 { return s.m.values().sum(); }\nfn b(s: &S) -> Option<&f32> { return s.m.get(\"k\"); }";
        assert_eq!(rules_for(src), vec!["hashmap-iteration"]);
    }

    #[test]
    fn flags_contract_types_and_enum_payloads() {
        let src = "pub struct Shape { pub x: f32 }\npub struct S { pub b: Box<dyn Any>, pub r: Rc<RefCell<u8>>, hidden: Rc<u8> }\npub enum E { A, B(Shape), C(f32), D { x: f32 }, F(Shape, Shape) }";
        assert_eq!(
            rules_for(src),
            vec![
                "contract-vocabulary",
                "enum-payload-named",
                "enum-payload-named",
            ]
        );
    }

    #[test]
    fn flags_unmarked_unhomed_items() {
        let src = "pub struct A { pub x: f32 }\n// flight-lint: allow(unhomed) owner: render\npub struct B { pub x: f32 }\nstruct C { x: f32 }";
        assert_eq!(rules_for_crate(src, "flight-unhomed"), vec!["unhomed"]);
        assert!(rules_for_crate(src, "flight-geometry").is_empty());
    }

    #[test]
    fn accepts_scalar_enum_payloads() {
        for src in [
            "pub enum Id { Number(i32), Text(String) }",
            "pub enum Val { Int(i32), Float(f32), Bool(bool) }",
            "pub enum Mixed { Struct(Shape), Scalar(u32) }\npub struct Shape { pub x: f32 }",
        ] {
            assert!(
                !rules_for(src).contains(&String::from("enum-payload-named")),
                "{} triggered enum-payload-named",
                src
            );
        }
    }

    #[test]
    fn accepts_named_payload_data_enums_with_or_without_existing_kind_fields() {
        for src in [
            "pub struct Loaded { pub value: f32 }\npub struct Failed { pub message: String }\npub enum Result { Loaded(Loaded), Failed(Failed) }",
            "pub enum LoadedKind { Loaded }\npub enum FailedKind { Failed }\npub struct Loaded { pub kind: LoadedKind, pub value: f32 }\npub struct Failed { pub kind: FailedKind, pub message: String }\npub enum Result { Loaded(Loaded), Failed(Failed) }",
        ] {
            assert!(
                !rules_for(src).contains(&String::from("enum-payload-named")),
                "{} triggered enum-payload-named",
                src
            );
        }
    }

    #[test]
    fn accepts_only_the_exact_provider_ref_alias_and_capability_field() {
        let accepted = "pub type ProviderRef = Arc<dyn Any + Send + Sync>;\npub struct HostCapability { pub callback: Arc<dyn Fn() + Send + Sync>, pub provider: ProviderRef }";
        assert!(rules_for(accepted).is_empty());

        for rejected in [
            "pub type ProviderRef = Arc<dyn Any>;",
            "pub type ProviderRef = Arc<dyn Any + Send>;",
            "pub type ProviderRef<T> = Arc<T>;",
            "pub type OtherProviderRef = Arc<dyn Any + Send + Sync>;",
        ] {
            assert_eq!(
                rules_for(rejected),
                vec!["contract-vocabulary"],
                "{}",
                rejected
            );
        }
    }

    #[test]
    fn accepts_only_the_exact_unknown_from_panic_bridge() {
        let accepted = "pub type Unknown = Option<Arc<dyn Any + Send + Sync>>;\npub fn unknown_from_panic(payload: Box<dyn Any + Send>) -> Unknown { todo!() }";
        assert!(rules_for(accepted).is_empty());

        for rejected in [
            "pub fn unknown_from_panic(payload: Box<dyn Any + Send + Sync>) -> Unknown { todo!() }",
            "pub fn unknown_from_panic(payload: Box<dyn Any>) -> Unknown { todo!() }",
            "pub fn unknown_from_panic(value: Box<dyn Any + Send>) -> Unknown { todo!() }",
            "pub fn unknown_from_panic(payload: Box<dyn Any + Send>) -> Option<Unknown> { todo!() }",
        ] {
            assert_eq!(
                rules_for(rejected),
                vec!["contract-vocabulary"],
                "{}",
                rejected
            );
        }
    }

    #[test]
    fn rejects_inline_payload_fields_even_when_named_kind() {
        let src = "pub enum Result { Loaded { kind: String, value: f32 } }";
        assert!(
            rules_for(src).contains(&String::from("enum-payload-named")),
            "inline payload fields unexpectedly accepted"
        );
    }

    #[test]
    fn rejects_non_scalar_non_struct_enum_payloads() {
        for src in [
            "pub enum E { Bad(Vec<f32>) }",
            "pub enum E { Bad(Option<f32>) }",
            "pub enum E { A, B { x: f32 } }",
            "pub enum E { A(Shape, Shape) }\npub struct Shape { pub x: f32 }",
        ] {
            assert!(
                rules_for(src).contains(&String::from("enum-payload-named")),
                "{} did not trigger enum-payload-named",
                src
            );
        }
    }

    #[test]
    fn accepts_the_entity_bound_and_flags_unrelated_trait_bounds() {
        assert!(rules_for("pub fn f<T: Entity>(x: &T) {}").is_empty());
        assert!(rules_for("pub fn f<T: flight_entity::Entity>(x: &T) {}").is_empty());
        assert_eq!(
            rules_for("pub fn f<T: Display>(x: &T) {}"),
            vec!["contract-vocabulary"]
        );
    }
}
