use flight_spritesheet::{
    SpritesheetAnimationDataOptions, SpritesheetData, SpritesheetDataOptions,
    SpritesheetFrameDataOptions, create_spritesheet_animation_data, create_spritesheet_data,
    create_spritesheet_frame_data,
};

pub(crate) const ASEPRITE_HASH: &str = r#"{
  "frames": {
    "sprite 0.aseprite": {"frame":{"x":0,"y":0,"w":32,"h":32},"rotated":false,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":32,"h":32},"sourceSize":{"w":32,"h":32},"duration":100},
    "sprite 1.aseprite": {"frame":{"x":32,"y":0,"w":32,"h":32},"rotated":false,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":32,"h":32},"sourceSize":{"w":32,"h":32},"duration":150},
    "sprite 2.aseprite": {"frame":{"x":64,"y":0,"w":30,"h":28},"rotated":false,"trimmed":true,"spriteSourceSize":{"x":1,"y":2,"w":30,"h":28},"sourceSize":{"w":32,"h":32},"duration":200},
    "sprite 3.aseprite": {"frame":{"x":96,"y":0,"w":32,"h":32},"rotated":false,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":32,"h":32},"sourceSize":{"w":32,"h":32},"duration":100}
  },
  "meta": {"app":"https://www.aseprite.org/","version":"1.3","image":"sprite.png","format":"RGBA8888","size":{"w":128,"h":32},"scale":"1","frameTags":[{"name":"run","from":0,"to":1,"direction":"forward"},{"name":"jump","from":2,"to":3,"direction":"reverse"}],"layers":[{"name":"Layer 1","opacity":255,"blendMode":"normal"}]}
}"#;

pub(crate) const ASEPRITE_ARRAY: &str = r#"{
  "frames": [
    {"filename":"anim 0.aseprite","frame":{"x":0,"y":0,"w":16,"h":16},"rotated":false,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":16,"h":16},"sourceSize":{"w":16,"h":16},"duration":80},
    {"filename":"anim 1.aseprite","frame":{"x":16,"y":0,"w":12,"h":20},"rotated":true,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":20,"h":12},"sourceSize":{"w":20,"h":12},"duration":80}
  ],
  "meta": {"app":"https://www.aseprite.org/","version":"1.3","image":"anim.png","format":"RGBA8888","size":{"w":32,"h":20},"scale":"1","frameTags":[{"name":"idle","from":0,"to":1,"direction":"pingpong"}]}
}"#;

pub(crate) const TEXTURE_PACKER_HASH: &str = r#"{
  "frames": {
    "hero/idle_0.png":{"frame":{"x":0,"y":0,"w":60,"h":56},"rotated":false,"trimmed":true,"spriteSourceSize":{"x":2,"y":4,"w":60,"h":56},"sourceSize":{"w":64,"h":64},"pivot":{"x":0.5,"y":1}},
    "hero/idle_1.png":{"frame":{"x":60,"y":0,"w":60,"h":56},"rotated":false,"trimmed":true,"spriteSourceSize":{"x":2,"y":4,"w":60,"h":56},"sourceSize":{"w":64,"h":64},"pivot":{"x":0.5,"y":1}},
    "fx/spark.png":{"frame":{"x":0,"y":56,"w":16,"h":16},"rotated":false,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":16,"h":16},"sourceSize":{"w":16,"h":16}}
  },
  "meta":{"app":"https://www.codeandweb.com/texturepacker","version":"1.0","image":"atlas.png","format":"RGBA8888","size":{"w":256,"h":128},"scale":"2","frameTags":[{"name":"idle","from":0,"to":1,"direction":"forward"}]}
}"#;

pub(crate) const TEXTURE_PACKER_ARRAY: &str = r#"{
  "frames":[
    {"filename":"hero/idle_0.png","frame":{"x":0,"y":0,"w":60,"h":56},"rotated":false,"trimmed":true,"spriteSourceSize":{"x":2,"y":4,"w":60,"h":56},"sourceSize":{"w":64,"h":64},"pivot":{"x":0.5,"y":1}},
    {"filename":"hero/run_0.png","frame":{"x":60,"y":0,"w":20,"h":40},"rotated":true,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":40,"h":20},"sourceSize":{"w":40,"h":20}}
  ],
  "meta":{"app":"https://www.codeandweb.com/texturepacker","version":"1.0","image":"sprites.png","format":"RGBA8888","size":{"w":128,"h":64},"scale":1}
}"#;

pub(crate) const COCOS_PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>frames</key><dict>
<key>hero.png</key><dict><key>frame</key><string>{{0,0},{64,64}}</string><key>spriteOffset</key><string>{0,0}</string><key>spriteSize</key><string>{64,64}</string><key>spriteSourceSize</key><string>{64,64}</string><key>spriteTrimmed</key><false/><key>textureRotated</key><false/></dict>
<key>coin.png</key><dict><key>frame</key><string>{{64,0},{32,64}}</string><key>spriteOffset</key><string>{1,2}</string><key>spriteSize</key><string>{64,32}</string><key>spriteSourceSize</key><string>{70,40}</string><key>spriteTrimmed</key><true/><key>textureRotated</key><true/></dict>
</dict><key>metadata</key><dict><key>format</key><integer>3</integer><key>size</key><string>{256,128}</string><key>textureFileName</key><string>atlas.png</string></dict></dict></plist>"#;

pub(crate) const STARLING_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="walk_02.png" x="10" y="20" width="30" height="40" frameX="-2" frameY="-3" frameWidth="36" frameHeight="48" pivotX="18" pivotY="24"/>
  <SubTexture name="walk_01.png" x="40" y="20" width="40" height="20" rotated="true"/>
  <SubTexture name="solo.png" x="0" y="0" width="8" height="8"/>
</TextureAtlas>"#;

pub(crate) const LIBGDX_ATLAS: &str = "atlas.png\n  size: 256, 128\n  format: RGBA8888\n  filter: Linear, Linear\n  repeat: none\nwalk\n  rotate: false\n  xy: 0, 0\n  size: 32, 32\n  orig: 32, 32\n  offset: 0, 0\n  index: 2\nwalk\n  rotate: true\n  xy: 32, 0\n  size: 20, 40\n  orig: 40, 20\n  offset: 1, 2\n  index: 1\n";

pub(crate) fn sample_data() -> SpritesheetData {
    let frames = vec![
        create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
            height: Some(32.0),
            name: Some("hero_0.png".to_string()),
            offset_x: Some(0.0),
            offset_y: Some(0.0),
            pivot_x: Some(0.5),
            pivot_y: Some(1.0),
            rotated: Some(false),
            source_height: Some(32.0),
            source_width: Some(32.0),
            width: Some(32.0),
            x: Some(0.0),
            y: Some(0.0),
        })),
        create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
            height: Some(20.0),
            name: Some("hero_1.png".to_string()),
            offset_x: Some(1.0),
            offset_y: Some(2.0),
            pivot_x: None,
            pivot_y: None,
            rotated: Some(true),
            source_height: Some(24.0),
            source_width: Some(44.0),
            width: Some(40.0),
            x: Some(32.0),
            y: Some(0.0),
        })),
    ];
    let animation = create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
        frame_duration: Some(100.0),
        frame_durations: Some(vec![100.0, 150.0]),
        frame_names: Some(vec!["hero_0.png".to_string(), "hero_1.png".to_string()]),
        name: Some("hero".to_string()),
        repeat_count: Some(-1),
        ..SpritesheetAnimationDataOptions::default()
    }));
    return create_spritesheet_data(Some(SpritesheetDataOptions {
        animations: Some(vec![animation]),
        frames: Some(frames),
        image_file: Some("atlas.png".to_string()),
        image_height: Some(128.0),
        image_width: Some(256.0),
        scale: Some(1.0),
    }));
}
