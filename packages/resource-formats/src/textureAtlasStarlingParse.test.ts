import { createTextureAtlas } from '@flighthq/textureatlas';

import { parseTextureAtlasStarlingXml } from './textureAtlasStarlingParse';

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero_idle" x="0" y="0" width="64" height="64"/>
  <SubTexture name="hero_walk" x="64" y="0" width="48" height="56"
    frameX="-8" frameY="-4" frameWidth="64" frameHeight="64"/>
  <SubTexture name="hero_jump" x="112" y="0" width="40" height="50" rotated="true"/>
  <SubTexture name="coin" x="152" y="0" width="32" height="32" pivotX="16" pivotY="16"/>
</TextureAtlas>`;

describe('parseTextureAtlasStarlingXml', () => {
  it('populates regions from a Starling XML string', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions).toHaveLength(4);
  });
  it('assigns sequential ids starting at 0', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions[0].id).toBe(0);
    expect(atlas.regions[3].id).toBe(3);
  });
  it('sets region name from the SubTexture name attribute', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions[0].name).toBe('hero_idle');
    expect(atlas.regions[1].name).toBe('hero_walk');
  });
  it('sets x/y/width/height from SubTexture attributes', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    expect(atlas.regions[0].width).toBe(64);
    expect(atlas.regions[0].height).toBe(64);
  });
  it('sets trimmed fields when frameX/frameWidth are present', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    const walk = atlas.regions[1];
    expect(walk.trimmed).toBe(true);
    expect(walk.originalWidth).toBe(64);
    expect(walk.originalHeight).toBe(64);
    expect(walk.sourceX).toBe(8); // -frameX = 8
    expect(walk.sourceY).toBe(4); // -frameY = 4
  });
  it('marks non-trimmed regions correctly', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions[0].trimmed).toBe(false);
    expect(atlas.regions[0].originalWidth).toBeNull();
    expect(atlas.regions[0].originalHeight).toBeNull();
  });
  it('sets rotated on regions with rotated="true"', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions[2].rotated).toBe(true);
    expect(atlas.regions[0].rotated).toBe(false);
  });
  it('sets pivot when pivotX/pivotY attributes are present', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    const coin = atlas.regions[3];
    expect(coin.pivotX).toBe(16);
    expect(coin.pivotY).toBe(16);
  });
  it('sets null pivot when pivot attributes are absent', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions[0].pivotX).toBeNull();
    expect(atlas.regions[0].pivotY).toBeNull();
  });
  it('clears existing regions before parsing', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(atlas.regions).toHaveLength(4);
  });
  it('returns the atlas for chaining', () => {
    const atlas = createTextureAtlas();
    const result = parseTextureAtlasStarlingXml(SIMPLE_XML, atlas);
    expect(result).toBe(atlas);
  });
  it('returns the atlas unchanged when no SubTexture elements exist', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml('<TextureAtlas imagePath="a.png"></TextureAtlas>', atlas);
    expect(atlas.regions).toHaveLength(0);
  });
});
