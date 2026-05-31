# WH3 Texture Converter

A powerful, high-fidelity client-side web tool built to convert Total War: Warhammer 3 DDS textures to lossless PNG format and back. Zero installations, zero external Python dependencies, and zero cloud uploads required — everything compiles and swizzles locally inside your browser using hardware-accelerated web APIs.

👉 **[Launch Tool](https://mrfaux.github.io/WH3TWTexConv/)**

---

## 🚀 Key Features

### DDS → PNG (Decoding)
*   **Normal Map Swizzling:** Always decodes Warhammer 3's native DXT5nm orange-tinted maps into standard RGB.
*   **Axis Alignment Toggles:** 
    *   **Standard Blue (OpenGL):** Decodes into standard tangent-space normals (Y+ Up orientation).
    *   **DirectX Normal (Y- Down):** Decodes and automatically inverts the Green (Y) channel to fit DirectX modding pipelines.
    *   **Raw Orange (DXT5nm):** Outputs the original unswizzled orange-packed texture as a PNG (for advanced shader development).
*   **Material Map Separation:** 
    *   **Export Both:** Downloads the pre-packed merged RGB map *and* splits it into individual high-fidelity greyscale PNGs.
    *   **Merged Only:** Exports only the combined texture file.
    *   **Channels Only:** Exports separate metallic, roughness, and static ambient occlusion maps.

### PNG → DDS (Encoding)
*   **Normal Map Pack options:**
    *   **Blue (Standard) Input:** Swizzles standard RGB normals back into the custom DXT5nm orange layout needed by WH3. Supports OpenGL (Y+) and DirectX (Y-) green channel flipping.
    *   **Orange (Raw WH3) Input:** Directly encodes already-packed DXT5nm orange PNG files into DDS (pass-through).
*   **Material Map Assembly:**
    *   **Merged Map:** Pack your pre-combined RGB texture.
    *   **Channels Mode:** Input individual R (Metalness) and G (Roughness) files. Unusable channels are hidden to prevent clutter (Blue is forced to `0`, AO/Alpha is forced to `255` per Warhammer 3 rendering standards).
*   **Mipmap Generation:** Optionally calculates and packages a complete, correct mipmap chain.

---

## 🎨 Layout & Channels

### Material Map Standard (`BC1_UNORM_SRGB`)
To reduce modder confusion and visual clutter, this tool auto-formats material layers to the exact Warhammer 3 render requirements:

| Channel | Map Target | Default / Output Value |
| :--- | :--- | :--- |
| **Red (R)** | **Metalness** | User Supplied (usually 0 or 255) |
| **Green (G)** | **Roughness** | User Supplied |
| **Blue (B)** | *Unused* | **Hardcoded to `0`** |
| **Alpha (A)** | **Ambient Occlusion** | **Hardcoded to `255` (1.0 static AO)** |

### Normal Map Channels (DXT5nm swizzle)
Tangent-space normals are reconstructed from DXT5nm compressed channels using the vector length formula:
`Z = sqrt(max(0, 1 - X² - Y²))`

| Channel | Orange (Engine DDS) | Blue (Standard OpenGL PNG) |
| :--- | :--- | :--- |
| **Red (R)** | Gloss / Scale Multiplier | X Vector (Right/Left) |
| **Green (G)** | Y Vector (Up/Down) | Y Vector (Up/Down) |
| **Blue (B)** | Unused (`0`) | Z Vector (Forward/Out) |
| **Alpha (A)** | X Vector (Right/Left) | Unused (`255`) |

---

## 🛠️ Usage & Guidelines

### 🟢 Recommended Default Setup
If you are unsure which settings to choose, leave all controls at their default settings:
*   **Standard Blue (OpenGL)** is the native coordinate system used by Blender, Substance Painter, Asset Editor, and most WH3 modeling tools.
*   **DirectX normal format** is only needed if your target pipeline or engine utilizes flipped Y conventions (e.g. Unreal Engine, 3ds Max).

---

## 💻 Local Hosting

Since the app relies on ES Modules (`import`/`export`), opening the `index.html` file directly from your disk (via the `file://` protocol) will trigger browser CORS restrictions. You must serve it using a lightweight local web server:

```bash
# Python 3
python -m http.server 5001

# Node.js
npx http-server -p 5001
```

Once running, navigate to `http://localhost:5001` in your browser.