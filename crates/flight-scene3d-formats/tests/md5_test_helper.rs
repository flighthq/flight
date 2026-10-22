use flight_scene3d::{Scene3DDocument, Scene3DDocumentScene};
use flight_scene3d_formats::Md5Joint;

pub fn empty_document() -> Scene3DDocument {
    return Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: vec![Scene3DDocumentScene {
            name: None,
            root_nodes: Vec::new(),
        }],
        skins: Vec::new(),
    };
}

pub fn joint(name: &str, parent_index: i32, position_y: f32) -> Md5Joint {
    return Md5Joint {
        name: name.to_string(),
        orientation_w: 1.0,
        orientation_x: 0.0,
        orientation_y: 0.0,
        orientation_z: 0.0,
        parent_index,
        position_x: 0.0,
        position_y,
        position_z: 0.0,
    };
}

pub const SINGLE_TRIANGLE: &str = r#"MD5Version 10
commandline ""

numJoints 1
numMeshes 1

joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
}

mesh {
  shader "textures/default"

  numverts 3
  vert 0 ( 0.0 0.0 ) 0 1
  vert 1 ( 1.0 0.0 ) 1 1
  vert 2 ( 0.0 1.0 ) 2 1

  numtris 1
  tri 0 0 1 2

  numweights 3
  weight 0 0 1.0 ( 0 0 0 )
  weight 1 0 1.0 ( 1 0 0 )
  weight 2 0 1.0 ( 0 1 0 )
}"#;

pub const DEGENERATE_UV_TRIANGLE: &str = r#"MD5Version 10
commandline ""

numJoints 1
numMeshes 1

joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
}

mesh {
  shader "textures/default"

  numverts 3
  vert 0 ( 0.25 0.25 ) 0 1
  vert 1 ( 0.25 0.25 ) 1 1
  vert 2 ( 0.25 0.25 ) 2 1

  numtris 1
  tri 0 0 1 2

  numweights 3
  weight 0 0 1.0 ( 0 0 0 )
  weight 1 0 1.0 ( 1 0 0 )
  weight 2 0 1.0 ( 0 1 0 )
}"#;

pub const MIRRORED_UV_TRIANGLES: &str = r#"MD5Version 10
commandline ""
numJoints 1
numMeshes 1
joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
}
mesh {
  shader "textures/mirrored"
  numverts 4
  vert 0 ( 0.0 0.0 ) 0 1
  vert 1 ( 1.0 0.0 ) 1 1
  vert 2 ( 0.0 1.0 ) 2 1
  vert 3 ( 1.0 0.0 ) 3 1
  numtris 2
  tri 0 0 1 2
  tri 1 0 2 3
  numweights 4
  weight 0 0 1.0 ( 0 0 0 )
  weight 1 0 1.0 ( 1 0 0 )
  weight 2 0 1.0 ( 0 1 0 )
  weight 3 0 1.0 ( -1 0 0 )
}"#;

pub const DIVERGENT_MIRRORED_UV_SEAM: &str = r#"MD5Version 10
commandline ""
numJoints 1
numMeshes 1
joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
}
mesh {
  shader "textures/mirrored-seam"
  numverts 6
  vert 0 ( 0.0 0.0 ) 0 1
  vert 1 ( 1.0 0.0 ) 1 1
  vert 2 ( 0.0 1.0 ) 2 1
  vert 3 ( 0.0 0.0 ) 3 1
  vert 4 ( 0.0 1.0 ) 4 1
  vert 5 ( 1.0 0.0 ) 5 1
  numtris 2
  tri 0 0 2 1
  tri 1 3 5 4
  numweights 6
  weight 0 0 1.0 ( 0 0 0 )
  weight 1 0 1.0 ( 1 0 0 )
  weight 2 0 1.0 ( 0 0 1 )
  weight 3 0 1.0 ( 0 0 0 )
  weight 4 0 1.0 ( -1 0 0 )
  weight 5 0 1.0 ( 0 0 -1 )
}"#;

pub const UV_SEAM_FOLD: &str = r#"MD5Version 10
commandline ""
numJoints 1
numMeshes 1
joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
}
mesh {
  shader "textures/seam-fold"
  numverts 6
  vert 0 ( 0.0 0.0 ) 0 1
  vert 1 ( 1.0 0.0 ) 1 1
  vert 2 ( 0.0 1.0 ) 2 1
  vert 3 ( 0.25 0.25 ) 3 1
  vert 4 ( 0.25 0.75 ) 4 1
  vert 5 ( 0.75 0.25 ) 5 1
  numtris 2
  tri 0 0 1 2
  tri 1 3 4 5
  numweights 6
  weight 0 0 1.0 ( 0 0 0 )
  weight 1 0 1.0 ( 2 0 0 )
  weight 2 0 1.0 ( 0 2 0 )
  weight 3 0 1.0 ( 0 0 0 )
  weight 4 0 1.0 ( 2 0 0 )
  weight 5 0 1.0 ( 0 0 1 )
}"#;

pub const MULTI_JOINT_HIERARCHY: &str = r#"MD5Version 10
commandline ""

numJoints 3
numMeshes 1

joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
  "child_a" 0 ( 1 0 0 ) ( 0 0 0 )
  "child_b" 0 ( 0 1 0 ) ( 0 0 0 )
}

mesh {
  shader "textures/body"

  numverts 3
  vert 0 ( 0.0 0.0 ) 0 1
  vert 1 ( 1.0 0.0 ) 1 1
  vert 2 ( 0.5 0.5 ) 2 1

  numtris 1
  tri 0 0 1 2

  numweights 3
  weight 0 0 1.0 ( 0 0 0 )
  weight 1 1 1.0 ( 0 0 0 )
  weight 2 2 1.0 ( 0 0 0 )
}"#;

pub const WEIGHTED_VERTICES: &str = r#"MD5Version 10
commandline ""

numJoints 2
numMeshes 1

joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
  "arm" 0 ( 10 0 0 ) ( 0 0 0 )
}

mesh {
  shader "textures/arm"

  numverts 3
  vert 0 ( 0.0 0.0 ) 0 2
  vert 1 ( 1.0 0.0 ) 2 1
  vert 2 ( 0.5 1.0 ) 3 1

  numtris 1
  tri 0 0 1 2

  numweights 4
  weight 0 0 0.5 ( 0 0 0 )
  weight 1 1 0.5 ( 0 0 0 )
  weight 2 0 1.0 ( 1 0 0 )
  weight 3 1 1.0 ( 0 1 0 )
}"#;

pub const OVER_INFLUENCED_VERTEX: &str = r#"MD5Version 10
commandline ""

numJoints 5
numMeshes 1

joints {
  "root" -1 ( 0 0 0 ) ( 0 0 0 )
  "j1" 0 ( 10 0 0 ) ( 0 0 0 )
  "j2" 0 ( 0 20 0 ) ( 0 0 0 )
  "j3" 0 ( 0 0 40 ) ( 0 0 0 )
  "far" 0 ( 1000 0 0 ) ( 0 0 0 )
}

mesh {
  shader "textures/over"

  numverts 3
  vert 0 ( 0.0 0.0 ) 0 5
  vert 1 ( 1.0 0.0 ) 5 1
  vert 2 ( 0.0 1.0 ) 6 1

  numtris 1
  tri 0 0 1 2

  numweights 7
  weight 0 0 0.4 ( 0 0 0 )
  weight 1 1 0.3 ( 0 0 0 )
  weight 2 2 0.2 ( 0 0 0 )
  weight 3 3 0.1 ( 0 0 0 )
  weight 4 4 0.05 ( 0 0 0 )
  weight 5 0 1.0 ( 5 0 0 )
  weight 6 0 1.0 ( 0 5 0 )
}"#;

pub const SINGLE_JOINT_ANIM: &str = r#"MD5Version 10
commandline ""
numFrames 1
numJoints 1
frameRate 24
numAnimatedComponents 0
hierarchy {
  "root" -1 0 0
}
bounds {
  ( -1 -1 -1 ) ( 1 1 1 )
}
baseframe {
  ( 5 10 15 ) ( 0 0 0 )
}
frame 0 {
}"#;

pub const JOINTLESS_MESH: &str = r#"MD5Version 10
commandline ""

numJoints 0
numMeshes 1

joints {
}

mesh {
  shader "textures/none"

  numverts 3
  vert 0 ( 0.0 0.0 ) 0 0
  vert 1 ( 1.0 0.0 ) 0 0
  vert 2 ( 0.0 1.0 ) 0 0

  numtris 1
  tri 0 0 1 2

  numweights 0
}"#;

pub const SINGLE_JOINT_STATIC: &str = r#"MD5Version 10
commandline ""

numFrames 1
numJoints 1
frameRate 24
numAnimatedComponents 0

hierarchy {
  "root" -1 0 0
}

bounds {
  ( -1 -1 -1 ) ( 1 1 1 )
}

baseframe {
  ( 5 10 15 ) ( 0 0 0 )
}

frame 0 {
}"#;

pub const TWO_JOINT_TWO_FRAME: &str = r#"MD5Version 10
commandline ""

numFrames 2
numJoints 2
frameRate 30
numAnimatedComponents 3

hierarchy {
  "root" -1 7 0
  "child" 0 0 0
}

bounds {
  ( -1 -1 -1 ) ( 1 1 1 )
  ( -1 -1 -1 ) ( 1 1 1 )
}

baseframe {
  ( 0 0 0 ) ( 0 0 0 )
  ( 1 2 3 ) ( 0 0 0 )
}

frame 0 {
  0 0 0
}

frame 1 {
  10 20 30
}"#;

pub const ANIMATED_ROTATION: &str = r#"MD5Version 10
commandline ""

numFrames 2
numJoints 1
frameRate 10
numAnimatedComponents 3

hierarchy {
  "root" -1 56 0
}

bounds {
  ( -1 -1 -1 ) ( 1 1 1 )
  ( -1 -1 -1 ) ( 1 1 1 )
}

baseframe {
  ( 0 0 0 ) ( 0 0 0 )
}

frame 0 {
  0 0 0
}

frame 1 {
  0.5 0.5 0.5
}"#;
