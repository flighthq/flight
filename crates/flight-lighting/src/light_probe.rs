use flight_entity::{Float32Array, Ref, allocate_entity, throw_error};
use flight_geometry::{Aabb, Vector3, create_aabb, create_vector3};

use crate::types::{LIGHT_PROBE_SH_FLOATS, LightProbe, LightProbeGrid};

const SH_COEFFICIENT_COUNT: usize = 9;

// D23 (KEEP; Principal c0f9227c): position and coefficients define the probe's owned validated buffers.
pub fn create_light_probe(
    position: &Vector3,
    sh_coefficients: Option<&Float32Array>,
) -> LightProbe {
    let mut out: LightProbe = allocate_entity();
    initialize_light_probe(&mut out, position, sh_coefficients);
    return out;
}

// D23 (KEEP; Principal c0f9227c): probes and grid geometry define validated construction state.
pub fn create_light_probe_grid(
    probes: &[Ref<LightProbe>],
    bounds: &Aabb,
    resolution: &Vector3,
) -> LightProbeGrid {
    let mut out: LightProbeGrid = allocate_entity();
    initialize_light_probe_grid(&mut out, probes, bounds, resolution);
    return out;
}

// D23 (KEEP; Principal c0f9227c): initialization validates and copies the defining coefficient buffer.
pub fn initialize_light_probe(
    out: &mut LightProbe,
    position: &Vector3,
    sh_coefficients: Option<&Float32Array>,
) {
    if let Some(coefficients) = sh_coefficients {
        if coefficients.len() != LIGHT_PROBE_SH_FLOATS {
            throw_error(&format!(
                "LightProbe.shCoefficients must be {LIGHT_PROBE_SH_FLOATS} floats, got {}",
                coefficients.len()
            ));
        }
    }
    out.enabled = true;
    out.position = create_vector3(position.x, position.y, position.z);
    out.sh_coefficients = vec![0.0; LIGHT_PROBE_SH_FLOATS].into_boxed_slice();
    if let Some(coefficients) = sh_coefficients {
        out.sh_coefficients.copy_from_slice(coefficients);
    }
}

// D23 (KEEP; Principal c0f9227c): initialization validates the probe topology and copies grid geometry.
pub fn initialize_light_probe_grid(
    out: &mut LightProbeGrid,
    probes: &[Ref<LightProbe>],
    bounds: &Aabb,
    resolution: &Vector3,
) {
    let expected = resolution.x * resolution.y * resolution.z;
    if probes.len() as f32 != expected {
        throw_error(&format!(
            "LightProbeGrid.probes must hold {expected} probes for resolution {}x{}x{}, got {}",
            resolution.x,
            resolution.y,
            resolution.z,
            probes.len()
        ));
    }
    out.bounds = create_aabb(
        bounds.min.x,
        bounds.min.y,
        bounds.min.z,
        bounds.max.x,
        bounds.max.y,
        bounds.max.z,
    );
    out.enabled = true;
    out.probes = probes.to_vec();
    out.resolution = create_vector3(resolution.x, resolution.y, resolution.z);
}

fn axis_coordinate(value: f32, min: f32, max: f32, count: f32) -> f32 {
    if count <= 1.0 || max <= min {
        return 0.0;
    }
    let fraction = (value - min) / (max - min);
    let scaled = fraction * (count - 1.0);
    if !(scaled > 0.0) {
        return 0.0;
    }
    return if scaled < count - 1.0 {
        scaled
    } else {
        count - 1.0
    };
}

pub fn evaluate_light_probe_sh(
    out: &mut Float32Array,
    normal: &Vector3,
    sh_coefficients: &Float32Array,
) {
    let length = (normal.x * normal.x + normal.y * normal.y + normal.z * normal.z).sqrt();
    if length == 0.0 {
        out[0] = 0.0;
        out[1] = 0.0;
        out[2] = 0.0;
        return;
    }
    let inverse_length = 1.0 / length;
    let x = normal.x * inverse_length;
    let y = normal.y * inverse_length;
    let z = normal.z * inverse_length;
    let mut basis = [0.0; SH_COEFFICIENT_COUNT];
    write_sh_basis(&mut basis, x, y, z);

    let mut coefficients = [0.0; LIGHT_PROBE_SH_FLOATS];
    coefficients.copy_from_slice(&sh_coefficients[..LIGHT_PROBE_SH_FLOATS]);
    let mut red = 0.0;
    let mut green = 0.0;
    let mut blue = 0.0;
    for (index, basis_value) in basis.iter().copied().enumerate() {
        let offset = index * 3;
        red += coefficients[offset] * basis_value;
        green += coefficients[offset + 1] * basis_value;
        blue += coefficients[offset + 2] * basis_value;
    }
    out[0] = red;
    out[1] = green;
    out[2] = blue;
}

pub fn sample_light_probe_grid(
    out: &mut Float32Array,
    position: &Vector3,
    grid: &LightProbeGrid,
) -> bool {
    if !grid.enabled || grid.probes.is_empty() {
        return false;
    }

    let nx = grid.resolution.x;
    let ny = grid.resolution.y;
    let nz = grid.resolution.z;
    let x = axis_coordinate(position.x, grid.bounds.min.x, grid.bounds.max.x, nx);
    let y = axis_coordinate(position.y, grid.bounds.min.y, grid.bounds.max.y, ny);
    let z = axis_coordinate(position.z, grid.bounds.min.z, grid.bounds.max.z, nz);
    let x_0 = x.floor();
    let y_0 = y.floor();
    let z_0 = z.floor();
    let fraction_x = x - x_0;
    let fraction_y = y - y_0;
    let fraction_z = z - z_0;
    let x_0 = x_0 as usize;
    let y_0 = y_0 as usize;
    let z_0 = z_0 as usize;
    let nx = nx as usize;
    let ny = ny as usize;

    let mut sample = [0.0; LIGHT_PROBE_SH_FLOATS];
    let mut total_weight = 0.0;
    for corner in 0..8 {
        let corner_x = corner & 1;
        let corner_y = (corner >> 1) & 1;
        let corner_z = (corner >> 2) & 1;
        let weight = (if corner_x == 1 {
            fraction_x
        } else {
            1.0 - fraction_x
        }) * (if corner_y == 1 {
            fraction_y
        } else {
            1.0 - fraction_y
        }) * (if corner_z == 1 {
            fraction_z
        } else {
            1.0 - fraction_z
        });
        if weight == 0.0 {
            continue;
        }
        let index = x_0 + corner_x + (y_0 + corner_y) * nx + (z_0 + corner_z) * nx * ny;
        let Some(probe) = grid.probes.get(index) else {
            continue;
        };
        let probe = probe.read().unwrap();
        if !probe.enabled {
            continue;
        }
        for (value, coefficient) in sample.iter_mut().zip(probe.sh_coefficients.iter()) {
            *value += coefficient * weight;
        }
        total_weight += weight;
    }

    if total_weight == 0.0 {
        return false;
    }
    let inverse_weight = 1.0 / total_weight;
    for (target, value) in out.iter_mut().zip(sample) {
        *target = value * inverse_weight;
    }
    return true;
}

pub fn set_light_probe_sh_from_colors(
    target: &mut LightProbe,
    colors: &Float32Array,
    directions: &Float32Array,
) {
    target.sh_coefficients.fill(0.0);
    let sample_count = colors.len().min(directions.len()) / 3;
    if sample_count == 0 {
        return;
    }

    let solid_angle = (4.0 * std::f32::consts::PI) / sample_count as f32;
    let mut basis = [0.0; SH_COEFFICIENT_COUNT];
    for sample in 0..sample_count {
        let offset = sample * 3;
        let direction_x = directions[offset];
        let direction_y = directions[offset + 1];
        let direction_z = directions[offset + 2];
        let length =
            (direction_x * direction_x + direction_y * direction_y + direction_z * direction_z)
                .sqrt();
        if length == 0.0 {
            continue;
        }
        let inverse_length = 1.0 / length;
        write_sh_basis(
            &mut basis,
            direction_x * inverse_length,
            direction_y * inverse_length,
            direction_z * inverse_length,
        );

        let red = colors[offset] * solid_angle;
        let green = colors[offset + 1] * solid_angle;
        let blue = colors[offset + 2] * solid_angle;
        for (index, basis_value) in basis.iter().copied().enumerate() {
            let target_offset = index * 3;
            target.sh_coefficients[target_offset] += red * basis_value;
            target.sh_coefficients[target_offset + 1] += green * basis_value;
            target.sh_coefficients[target_offset + 2] += blue * basis_value;
        }
    }
}

fn write_sh_basis(out: &mut [f32; SH_COEFFICIENT_COUNT], x: f32, y: f32, z: f32) {
    out[0] = 0.282_094_8;
    out[1] = 0.488_602_52 * y;
    out[2] = 0.488_602_52 * z;
    out[3] = 0.488_602_52 * x;
    out[4] = 1.092_548_5 * x * y;
    out[5] = 1.092_548_5 * y * z;
    out[6] = 0.315_391_57 * (3.0 * z * z - 1.0);
    out[7] = 1.092_548_5 * x * z;
    out[8] = 0.546_274_24 * (x * x - y * y);
}
