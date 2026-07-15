import type { ObjMaterial, ObjMaterialLibrary } from './objSchema';

// Parses a Wavefront MTL material library from its text source. Every recognized directive
// (`newmtl`, `Ka`, `Kd`, `Ks`, `Ns`, `d`, `Tr`, `illum`, `map_Kd`, `map_Ka`, `map_Ks`,
// `map_Bump`/`bump`) is read; unrecognized directives are silently skipped. Malformed values
// push a warning and fall back to defaults rather than throwing.
export function parseObjMaterialLibrary(source: string, warnings?: string[]): ObjMaterialLibrary {
  const materials = new Map<string, ObjMaterial>();
  let current: ObjMaterial | null = null;
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw.length === 0 || raw.charCodeAt(0) === 35) continue; // skip empty and # comments

    const spaceIndex = raw.indexOf(' ');
    if (spaceIndex < 0) {
      // A directive with no argument — only `newmtl` requires one.
      if (raw === 'newmtl') {
        warnings?.push(`parseObjMaterialLibrary: newmtl on line ${i + 1} has no name; skipped`);
      }
      continue;
    }

    const directive = raw.slice(0, spaceIndex);
    const args = raw.slice(spaceIndex + 1).trim();

    switch (directive) {
      case 'newmtl': {
        current = createDefaultObjMaterial(args);
        materials.set(args, current);
        break;
      }
      case 'Ka': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        const c = parseColor(args, warnings, directive, i);
        if (c !== null) current.ambient = c;
        break;
      }
      case 'Kd': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        const c = parseColor(args, warnings, directive, i);
        if (c !== null) current.diffuse = c;
        break;
      }
      case 'Ks': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        const c = parseColor(args, warnings, directive, i);
        if (c !== null) current.specular = c;
        break;
      }
      case 'Ns': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.specularExponent = v;
        else warnings?.push(`parseObjMaterialLibrary: invalid Ns value on line ${i + 1}`);
        break;
      }
      case 'd': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.dissolve = v;
        else warnings?.push(`parseObjMaterialLibrary: invalid d value on line ${i + 1}`);
        break;
      }
      case 'Tr': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.dissolve = 1 - v;
        else warnings?.push(`parseObjMaterialLibrary: invalid Tr value on line ${i + 1}`);
        break;
      }
      case 'illum': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        const v = parseInt(args, 10);
        if (Number.isFinite(v)) current.illumination = v;
        else warnings?.push(`parseObjMaterialLibrary: invalid illum value on line ${i + 1}`);
        break;
      }
      case 'map_Kd': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        current.mapDiffuse = args;
        break;
      }
      case 'map_Ka': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        current.mapAmbient = args;
        break;
      }
      case 'map_Ks': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        current.mapSpecular = args;
        break;
      }
      case 'map_Bump':
      case 'bump': {
        if (current === null) {
          warnNoMaterial(warnings, directive, i);
          break;
        }
        current.mapBump = args;
        break;
      }
      default:
        break;
    }
  }

  return { materials };
}

function createDefaultObjMaterial(name: string): ObjMaterial {
  return {
    ambient: [0, 0, 0],
    diffuse: [0.8, 0.8, 0.8],
    dissolve: 1,
    illumination: 2,
    mapAmbient: null,
    mapBump: null,
    mapDiffuse: null,
    mapSpecular: null,
    name,
    specular: [0, 0, 0],
    specularExponent: 0,
  };
}

function parseColor(
  args: string,
  warnings: string[] | undefined,
  directive: string,
  lineIndex: number,
): readonly [number, number, number] | null {
  const parts = args.split(/\s+/);
  if (parts.length < 3) {
    warnings?.push(`parseObjMaterialLibrary: ${directive} on line ${lineIndex + 1} has fewer than 3 components`);
    return null;
  }
  const r = parseFloat(parts[0]);
  const g = parseFloat(parts[1]);
  const b = parseFloat(parts[2]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    warnings?.push(`parseObjMaterialLibrary: ${directive} on line ${lineIndex + 1} has non-numeric components`);
    return null;
  }
  return [r, g, b];
}

function warnNoMaterial(warnings: string[] | undefined, directive: string, lineIndex: number): void {
  warnings?.push(`parseObjMaterialLibrary: ${directive} on line ${lineIndex + 1} appears before any newmtl`);
}
