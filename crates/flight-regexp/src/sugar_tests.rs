use super::*;

#[test]
fn reg_exp_constructor_matches_the_free_function() {
    let method = RegExp::new("a+", "mi");
    let function = create_reg_exp("a+", "mi");
    assert_eq!(
        method.read().unwrap().source,
        function.read().unwrap().source
    );
    assert_eq!(method.read().unwrap().flags, function.read().unwrap().flags);
    assert_eq!(
        method.read().unwrap().last_index,
        function.read().unwrap().last_index
    );
}

#[test]
fn reg_exp_methods_match_their_free_functions() {
    let method = create_reg_exp("(?<letter>a)(b)?", "dg");
    let function = create_reg_exp("(?<letter>a)(b)?", "dg");
    let method_result = method.exec("xa").unwrap();
    let function_result = exec_reg_exp(&function, "xa").unwrap();
    assert_eq!(method_result.index, function_result.index);
    assert_eq!(method_result.matches, function_result.matches);
    assert_eq!(
        method.read().unwrap().last_index,
        function.read().unwrap().last_index
    );

    let method = create_reg_exp("z", "");
    let function = create_reg_exp("z", "");
    assert_eq!(method.test("pizza"), test_reg_exp(&function, "pizza"));
}
