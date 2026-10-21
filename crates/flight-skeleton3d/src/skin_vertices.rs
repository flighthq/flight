use flight_entity::Float32Array;

pub(crate) fn read_array(values: &[f32], index: usize) -> f32 {
    return values.get(index).copied().unwrap_or(f32::NAN);
}
pub(crate) fn read_float_index(values: &[f32], index: f32) -> f32 {
    if !index.is_finite() || index < 0.0 || index.fract() != 0.0 {
        return f32::NAN;
    }
    return read_array(values, index as usize);
}
pub fn skin_tangents(
    out_tangents: &mut Float32Array,
    tangents: &Float32Array,
    joints: &[f32],
    weights: &Float32Array,
    joint_matrices: &Float32Array,
) {
    for v in 0..tangents.len() / 4 {
        let t = v * 4;
        let input = [
            tangents[t],
            tangents[t + 1],
            tangents[t + 2],
            tangents[t + 3],
        ];
        let mut output = [0.0; 3];
        let mut influenced = false;
        for k in 0..4 {
            let weight = read_array(weights, t + k);
            if weight == 0.0 {
                continue;
            }
            influenced = true;
            let base = read_array(joints, t + k) * 16.0;
            for row in 0..3 {
                output[row] += weight
                    * (read_float_index(joint_matrices, base + row as f32) * input[0]
                        + read_float_index(joint_matrices, base + (4 + row) as f32) * input[1]
                        + read_float_index(joint_matrices, base + (8 + row) as f32) * input[2]);
            }
        }
        for row in 0..3 {
            write_array(
                out_tangents,
                t + row,
                if influenced { output[row] } else { input[row] },
            );
        }
        write_array(out_tangents, t + 3, input[3]);
    }
}
pub fn skin_vertices(
    out_positions: &mut Float32Array,
    out_normals: &mut Float32Array,
    positions: &Float32Array,
    normals: &Float32Array,
    joints: &[f32],
    weights: &Float32Array,
    joint_matrices: &Float32Array,
    normal_matrices: &Float32Array,
) {
    for v in 0..positions.len() / 3 {
        let p = v * 3;
        let position = [positions[p], positions[p + 1], positions[p + 2]];
        let normal = [
            read_array(normals, p),
            read_array(normals, p + 1),
            read_array(normals, p + 2),
        ];
        let mut op = [0.0; 3];
        let mut on = [0.0; 3];
        let mut influenced = false;
        for k in 0..4 {
            let weight = read_array(weights, v * 4 + k);
            if weight == 0.0 {
                continue;
            }
            influenced = true;
            let joint = read_array(joints, v * 4 + k);
            let m = joint * 16.0;
            let n = joint * 12.0;
            for row in 0..3 {
                op[row] += weight
                    * (read_float_index(joint_matrices, m + row as f32) * position[0]
                        + read_float_index(joint_matrices, m + (4 + row) as f32) * position[1]
                        + read_float_index(joint_matrices, m + (8 + row) as f32) * position[2]
                        + read_float_index(joint_matrices, m + (12 + row) as f32));
                on[row] += weight
                    * (read_float_index(normal_matrices, n + row as f32) * normal[0]
                        + read_float_index(normal_matrices, n + (4 + row) as f32) * normal[1]
                        + read_float_index(normal_matrices, n + (8 + row) as f32) * normal[2]);
            }
        }
        for row in 0..3 {
            write_array(
                out_positions,
                p + row,
                if influenced { op[row] } else { position[row] },
            );
            write_array(
                out_normals,
                p + row,
                if influenced { on[row] } else { normal[row] },
            );
        }
    }
}
pub(crate) fn write_array(values: &mut [f32], index: usize, value: f32) {
    if let Some(out) = values.get_mut(index) {
        *out = value;
    }
}

pub(crate) fn write_float_index(values: &mut [f32], index: f32, value: f32) {
    if index.is_finite() && index >= 0.0 && index.fract() == 0.0 {
        write_array(values, index as usize, value);
    }
}
