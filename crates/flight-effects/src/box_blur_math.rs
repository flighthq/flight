fn compute_box_blur_lower_pass_count(sigma: f32, passes: f32, lower_width: f32) -> f32 {
    let value = (12.0 * sigma * sigma
        - passes * (lower_width * lower_width + 4.0 * lower_width + 3.0))
        / (-4.0 * lower_width - 4.0);
    return (value + 0.5).floor();
}

fn compute_box_blur_lower_width(sigma: f32, passes: f32) -> f32 {
    let mut width = ((12.0 * sigma * sigma) / passes + 1.0).sqrt().floor();
    if (width as i32) % 2 == 0 {
        width -= 1.0;
    }
    return width;
}

pub fn compute_box_blur_pass_radius(sigma: f32, passes: f32, pass: f32) -> f32 {
    if sigma <= 0.0 {
        return 0.0;
    }
    let lower_width = compute_box_blur_lower_width(sigma, passes);
    let lower_count = compute_box_blur_lower_pass_count(sigma, passes, lower_width);
    let width = if pass < lower_count {
        lower_width
    } else {
        lower_width + 2.0
    };
    return 0.0_f32.max((width - 1.0) / 2.0);
}

pub fn compute_box_blur_radius(sigma: f32, passes: f32) -> f32 {
    if sigma <= 0.0 {
        return 0.0;
    }
    let value = (-1.0 + (1.0 + (12.0 * sigma * sigma) / passes).sqrt()) / 2.0;
    return 0.0_f32.max((value + 0.5).floor());
}

pub fn compute_gaussian_sigma_for_blur_radius(radius: f32, passes: f32) -> f32 {
    if radius <= 0.0 || passes <= 0.0 {
        return 0.0;
    }
    let width = 2.0 * radius + 1.0;
    return (passes * width * width / 12.0).sqrt();
}
