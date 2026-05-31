# WH3 Texture Converter

A simple, client-side web tool to convert Total War: Warhammer 3 DDS textures to compressionless PNG and back. No installation, Python, or external tools required. Everything runs locally in your browser.

👉 **[Launch Tool](https://mrfaux.github.io/WH3TWTexConv/)**

---

## What it does

### DDS → PNG
*   **Normal Maps:** Converts WH3's orange-tinted normal maps (DXT5nm) into standard blue OpenGL normal maps.
*   **Material Maps:** Automatically splits channels and exports them as individual greyscale PNGs along with a merged RGB file.
*   **Color & Masks:** Straight conversion to standard PNG.

### PNG → DDS
*   **Normal Maps:** Converts standard blue normal maps back into the orange DXT5nm layout required by the engine.
*   **Material Maps:** Rebuilds the custom material texture from individual channel maps or a merged file.
*   **Formats Used:**
    *   `Base_Colour`: `BC1_UNORM_SRGB`
    *   `Material_Map`: `BC1_UNORM_SRGB`
    *   `Normal`: `BC3_UNORM`
    *   `Mask`: `BC3_UNORM`
*   Optionally generates a full mipmap chain.

---

## Channels & Formatting

### Material Map Layout
*   **Red:** Metalness (usually `0` or `255`).
*   **Green:** Roughness.
*   **Blue:** Unused (forced to `0` during encoding).
*   **Alpha:** Ambient Occlusion / Static AO (defaults to `255` / `1.0`).

### Normal Map Channels (DXT5nm swizzle)
To reconstruct the normal map, we use the vector length formula:
`Z = sqrt(max(0, 1 - X^2 - Y^2))`

| Channel | Orange (Engine DDS) | Blue (Standard PNG) |
|---|---|---|
| **Red** | Gloss / Scale Multiplier | X Vector |
| **Green** | Y Vector | Y Vector |
| **Blue** | Unused (`0`) | Z Vector |
| **Alpha** | X Vector | Unused (`255`) |

*Swizzle logic based on [mr-phazer's TheAssetEditor](https://github.com/mr-phazer/TheAssetEditor).*

---

## Hosting on GitHub Pages (Free)

1. Create a public GitHub repository named `wh3-tex-converter`.
2. Upload the contents of the `wh3-tex-web` folder:
    *   `index.html`
    *   `style.css`
    *   `LICENSE`
    *   `js/` (containing the scripts)
3. Go to **Settings** -> **Pages** in your repository.
4. Set the build source to **Deploy from a branch**, choose `main` / `root`, and hit **Save**.

The tool will be live at `https://<your-username>.github.io/wh3-tex-converter/` in a couple of minutes.

### Local Hosting
If you want to run it on your own machine, serve the folder using a local server (needed for ES module support):
```bash
python -m http.server 8080
```
Then visit `http://localhost:8080`.