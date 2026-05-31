# WH3 Texture Converter

A free, browser-based converter for **Warhammer 3: Total War** DDS textures.  
No installs. No Python. No external tools. Everything runs directly in your browser.

**[🚀 Open the Tool](https://YOUR-USERNAME.github.io/wh3-tex-converter/)**

---

## Features

| Feature | Details |
|---|---|
| **DDS → PNG** | Drag & drop any WH3 `.dds` file, get a clean PNG back |
| **Normal map swizzle** | Converts WH3 orange (DXT5nm) ↔ OpenGL blue automatically |
| **Material map split** | Exports merged RGB + separate Metallic / Roughness / AO greyscale PNGs |
| **PNG → DDS** | Encodes back to the correct BC format with mipmaps |
| **No server** | Pure client-side JavaScript — works offline after first load |

## Supported Formats

| Texture Type | DDS Format |
|---|---|
| Base Colour | `BC1_UNORM_SRGB` |
| Material Map | `BC1_UNORM_SRGB` |
| Normal Map | `BC3_UNORM` (DXT5nm swizzle) |
| Mask | `BC3_UNORM` |

## Normal Map Conversion

WH3 stores normal maps in **DXT5nm (orange)** format:

| Channel | Orange (WH3) | Blue (OpenGL/Standard) |
|---|---|---|
| R | Gloss multiplier for X | X normal |
| G | Y normal | Y normal |
| B | Unused | Z normal (reconstructed) |
| A | X normal | — |

Conversion formula matches [mr-phazer's TheAssetEditor](https://github.com/mr-phazer/TheAssetEditor) exactly.

---

## How to Host on GitHub Pages (Free)

### Step 1 — Create a GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `wh3-tex-converter` (or anything you like)
3. Set it to **Public**
4. Click **Create repository**

### Step 2 — Upload the files

Upload the entire contents of the `wh3-tex-web/` folder to the repository root:
```
index.html
style.css
js/
  app.js
  dds-codec.js
  texture-ops.js
```

You can drag & drop them on the GitHub web UI, or use git:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/wh3-tex-converter.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages

1. Go to your repository → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Choose branch: `main`, folder: `/ (root)`
4. Click **Save**

Your site will be live at:
```
https://YOUR-USERNAME.github.io/wh3-tex-converter/
```
(takes ~1 minute to go live after first push)

---

## Local Usage

You can also run it locally — just open a terminal in the project folder and run:

```bash
py -m http.server 8080
```

Then open `http://127.0.0.1:8080` in your browser.

> **Note:** You can't open `index.html` directly as a file (`file://`) because ES Modules require a server. Use the command above or any static file server.

---

## Credits

- Normal map conversion algorithm from [mr-phazer/TheAssetEditor](https://github.com/mr-phazer/TheAssetEditor) (`DdsToNormalPngExporter.cs`)
- BC1/BC3 DDS codec written from scratch in pure JavaScript
- No external dependencies
