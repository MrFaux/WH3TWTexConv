/**
 * WH3 Texture Ops — Normal map swizzle + material channel split/merge
 * All operations work on raw RGBA Uint8Array pixel buffers.
 */

// ── Normal map: WH3 orange (DXT5nm) → OpenGL blue ───────────
// Matches DdsToNormalPngExporter.cs by mr-phazer / TheAssetEditor
//   orange.R * orange.A → X, scale to [-1,1], orange.G → Y, scale to [-1,1]
//   Reconstruct Z = sqrt(1 - X² - Y²)
//   Output: standard RGB normal (X→R, Y→G, Z→B), A=255
export function orangeToBlue(rgba, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const R = rgba[base]   / 255;
    const G = rgba[base+1] / 255;
    // B unused in orange
    const A = rgba[base+3] / 255;

    // X = R * A  (R is gloss multiplier for X per phazer's code)
    let X = R * A * 2 - 1;
    let Y = G * 2 - 1;

    // Clamp for safety before sqrt
    const Z2 = Math.max(0, 1 - X*X - Y*Y);
    const Z   = Math.sqrt(Z2);

    out[base]   = Math.round((X + 1) * 0.5 * 255);
    out[base+1] = Math.round((Y + 1) * 0.5 * 255);
    out[base+2] = Math.round((Z + 1) * 0.5 * 255);
    out[base+3] = 255;
  }
  return out;
}

// ── Normal map: OpenGL blue → WH3 orange (DXT5nm) ───────────
// Reverse:
//   new.R = 255 (gloss multiplier = 1.0, no attenuation)
//   new.G = blue.G  (Y channel stays)
//   new.B = 0       (unused)
//   new.A = blue.R  (X → alpha)
export function blueToOrange(rgba, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    out[base]   = 255;           // R = gloss = 1.0
    out[base+1] = rgba[base+1];  // G = Y (unchanged)
    out[base+2] = 0;             // B = unused
    out[base+3] = rgba[base];    // A = X (from blue R)
  }
  return out;
}

// ── Material map: RGB → 3 greyscale channels ─────────────────
// R = Metallic, G = Roughness, B = Ambient Occlusion
export function splitMaterialChannels(rgba, width, height) {
  const n = width * height;
  const metallic  = new Uint8Array(n * 4);
  const roughness = new Uint8Array(n * 4);
  const ao        = new Uint8Array(n * 4);

  for (let i = 0; i < n; i++) {
    const b = i * 4;
    const R = rgba[b], G = rgba[b+1], Bl = rgba[b+2];
    // Metallic (R → grey)
    metallic[b]=R; metallic[b+1]=R; metallic[b+2]=R; metallic[b+3]=255;
    // Roughness (G → grey)
    roughness[b]=G; roughness[b+1]=G; roughness[b+2]=G; roughness[b+3]=255;
    // AO (B → grey)
    ao[b]=Bl; ao[b+1]=Bl; ao[b+2]=Bl; ao[b+3]=255;
  }
  return { metallic, roughness, ao };
}

// ── Material map: merge channels → RGB ──────────────────────
// Each input is RGBA (greyscale, only R channel used) or null → defaults to 128
export function mergeMaterialChannels(metRgba, roughRgba, aoRgba, width, height) {
  const n = width * height;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const b = i * 4;
    out[b]   = metRgba   ? metRgba[b]   : 128;
    out[b+1] = roughRgba ? roughRgba[b] : 128;
    out[b+2] = aoRgba    ? aoRgba[b]    : 128;
    out[b+3] = 255;
  }
  return out;
}
