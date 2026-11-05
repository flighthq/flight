use syn::Visibility;

use super::PROVENANCE_SEPARATOR;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum SourceAccess {
    Local,
    Crate,
    Public,
}

pub(super) fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

pub(super) fn is_crate_wide(visibility: &Visibility) -> bool {
    return is_public(visibility)
        || matches!(visibility, Visibility::Restricted(restricted) if restricted.path.is_ident("crate"));
}

pub(super) fn source_access_for_visibility(visibility: &Visibility) -> SourceAccess {
    return if is_public(visibility) {
        SourceAccess::Public
    } else if is_crate_wide(visibility) {
        SourceAccess::Crate
    } else {
        SourceAccess::Local
    };
}

pub(super) fn owner_marker(marker: &str, module: &str, name: &str, access: SourceAccess) -> String {
    let visibility = match access {
        SourceAccess::Local => "private",
        SourceAccess::Crate => "crate",
        SourceAccess::Public => "public",
    };
    return format!(
        "{marker}{module}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}{visibility}"
    );
}
