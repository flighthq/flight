// flight-lint: allow(f64) Foreman80958601 and Principalcb66aa41: OBJ/MTL parseFloat decimal-prefix grammar and Number.isFinite precede final canonical writes; the reviewed MD5 scanner has the identical grammar
pub(crate) fn parse_obj_float(token: &str) -> Option<f64> {
    return crate::md5_number::parse_md5_float(token);
}

// flight-lint: allow(f64) Foreman80958601 and Principalcb66aa41: OBJ/MTL parseInt base10 prefix/finite classification precedes final canonical numeric or index projection
pub(crate) fn parse_obj_integer(token: &str) -> Option<f64> {
    return crate::md5_number::parse_md5_integer(token);
}
