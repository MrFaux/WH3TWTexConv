/**
 * WH3 DDS Codec — Pure JavaScript BC1 & BC3 encoder/decoder
 * No external dependencies. Runs in any modern browser.
 *
 * DXGI formats supported:
 *   BC1_UNORM      (71)  — no alpha
 *   BC1_UNORM_SRGB (72)  — no alpha, sRGB
 *   BC3_UNORM      (77)  — with alpha
 *   BC3_UNORM_SRGB (78)  — with alpha, sRGB
 *
 * Also reads legacy FourCC DXT1 / DXT5.
 */

// ── Constants ────────────────────────────────────────────────
const DDS_MAGIC        = 0x20534444;
const DDPF_FOURCC      = 0x4;
const DDSD_CAPS        = 0x1;
const DDSD_HEIGHT      = 0x2;
const DDSD_WIDTH       = 0x4;
const DDSD_PIXELFORMAT = 0x1000;
const DDSD_LINEARSIZE  = 0x80000;
const DDSD_MIPMAPCOUNT = 0x20000;
const DDSCAPS_TEXTURE  = 0x1000;
const DDSCAPS_MIPMAP   = 0x400000;
const DDSCAPS_COMPLEX  = 0x8;

const DXGI_BC1       = 71;
const DXGI_BC1_SRGB  = 72;
const DXGI_BC3       = 77;
const DXGI_BC3_SRGB  = 78;

const FOURCC_DXT1 = 0x31545844;
const FOURCC_DXT5 = 0x35545844;
const FOURCC_DX10 = 0x30315844;

// ── Helpers ──────────────────────────────────────────────────
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function rgb565ToRgb(c) {
  return [
    Math.round(((c >> 11) & 0x1F) * 255 / 31),
    Math.round(((c >>  5) & 0x3F) * 255 / 63),
    Math.round(( c        & 0x1F) * 255 / 31),
  ];
}

function rgbToRgb565(r, g, b) {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

// ── BC1 block decode ─────────────────────────────────────────
function decodeBC1Block(src, si, dst, bx, by, w, h, forceOpaque) {
  const c0r = src[si] | (src[si+1] << 8);
  const c1r = src[si+2] | (src[si+3] << 8);
  const [r0,g0,b0] = rgb565ToRgb(c0r);
  const [r1,g1,b1] = rgb565ToRgb(c1r);

  let pal;
  if (c0r > c1r || forceOpaque) {
    pal = [
      [r0,g0,b0,255], [r1,g1,b1,255],
      [Math.round((2*r0+r1)/3), Math.round((2*g0+g1)/3), Math.round((2*b0+b1)/3), 255],
      [Math.round((r0+2*r1)/3), Math.round((g0+2*g1)/3), Math.round((b0+2*b1)/3), 255],
    ];
  } else {
    pal = [
      [r0,g0,b0,255], [r1,g1,b1,255],
      [Math.round((r0+r1)/2), Math.round((g0+g1)/2), Math.round((b0+b1)/2), 255],
      [0,0,0,0],
    ];
  }

  const idx = (src[si+4] | (src[si+5]<<8) | (src[si+6]<<16) | (src[si+7]<<24)) >>> 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const px = bx + col, py = by + row;
      if (px >= w || py >= h) continue;
      const c = pal[(idx >> ((row*4+col)*2)) & 3];
      const di = (py * w + px) * 4;
      dst[di]=c[0]; dst[di+1]=c[1]; dst[di+2]=c[2]; dst[di+3]=c[3];
    }
  }
}

// ── BC3 alpha block decode ───────────────────────────────────
function decodeBC3AlphaBlock(src, si, dst, bx, by, w, h) {
  const a0 = src[si], a1 = src[si+1];
  const pal = [a0, a1];
  if (a0 > a1) {
    for (let i=1;i<=6;i++) pal.push(Math.round(((7-i)*a0 + i*a1)/7));
  } else {
    for (let i=1;i<=4;i++) pal.push(Math.round(((5-i)*a0 + i*a1)/5));
    pal.push(0); pal.push(255);
  }
  // 6 bytes → 48 bits → 16 x 3-bit indices
  const lo = (src[si+2]|(src[si+3]<<8)|(src[si+4]<<16)) >>> 0;
  const hi = (src[si+5]|(src[si+6]<<8)|(src[si+7]<<16)) >>> 0;
  for (let row=0;row<4;row++) {
    for (let col=0;col<4;col++) {
      const px=bx+col, py=by+row;
      if (px>=w||py>=h) continue;
      const bit=(row*4+col)*3;
      const idx = bit<24 ? (lo>>bit)&7 : (hi>>(bit-24))&7;
      dst[(py*w+px)*4+3] = pal[idx];
    }
  }
}

// ── BC3 block decode ─────────────────────────────────────────
function decodeBC3Block(src, si, dst, bx, by, w, h) {
  decodeBC3AlphaBlock(src, si,   dst, bx, by, w, h);
  decodeBC1Block     (src, si+8, dst, bx, by, w, h, true);
}

// ── DDS → RGBA ───────────────────────────────────────────────
export function decodeDDS(buffer) {
  const u8  = new Uint8Array(buffer);
  const dv  = new DataView(buffer);

  if (dv.getUint32(0, true) !== DDS_MAGIC) throw new Error('Not a valid DDS file');

  const flags  = dv.getUint32(8,  true);
  const height = dv.getUint32(12, true);
  const width  = dv.getUint32(16, true);
  const mips   = dv.getUint32(28, true) || 1;
  const pfFlags  = dv.getUint32(80, true);
  const fourCC   = dv.getUint32(84, true);

  let isBC1 = false, isBC3 = false, dataOffset = 128;

  if (pfFlags & DDPF_FOURCC) {
    if (fourCC === FOURCC_DXT1) { isBC1 = true; }
    else if (fourCC === FOURCC_DXT5) { isBC3 = true; }
    else if (fourCC === FOURCC_DX10) {
      const dxgi = dv.getUint32(128, true);
      dataOffset = 148;
      if (dxgi === DXGI_BC1 || dxgi === DXGI_BC1_SRGB) isBC1 = true;
      else if (dxgi === DXGI_BC3 || dxgi === DXGI_BC3_SRGB) isBC3 = true;
      else throw new Error(`Unsupported DXGI format: ${dxgi}`);
    } else throw new Error(`Unsupported FourCC: 0x${fourCC.toString(16)}`);
  } else throw new Error('Unsupported DDS pixel format (non-FourCC)');

  const rgba = new Uint8Array(width * height * 4);
  const blockSize = isBC3 ? 16 : 8;
  const bw = Math.max(1, (width  + 3) >> 2);
  const bh = Math.max(1, (height + 3) >> 2);

  let si = dataOffset;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      if (isBC1) decodeBC1Block(u8, si, rgba, bx*4, by*4, width, height, false);
      else       decodeBC3Block(u8, si, rgba, bx*4, by*4, width, height);
      si += blockSize;
    }
  }

  return { rgba, width, height };
}

// ── BC1 block encode ─────────────────────────────────────────
function encodeBC1Block(rgba, bx, by, w, h, forceOpaque) {
  // Gather 4x4 pixels
  const R=[],G=[],B=[],A=[];
  for (let row=0;row<4;row++) {
    for (let col=0;col<4;col++) {
      const px=Math.min(bx+col,w-1), py=Math.min(by+row,h-1);
      const i=(py*w+px)*4;
      R.push(rgba[i]); G.push(rgba[i+1]); B.push(rgba[i+2]); A.push(rgba[i+3]);
    }
  }

  // Find min/max per channel (luminance-weighted for better endpoint axis)
  let minC=[255,255,255], maxC=[0,0,0];
  for (let i=0;i<16;i++) {
    minC[0]=Math.min(minC[0],R[i]); maxC[0]=Math.max(maxC[0],R[i]);
    minC[1]=Math.min(minC[1],G[i]); maxC[1]=Math.max(maxC[1],G[i]);
    minC[2]=Math.min(minC[2],B[i]); maxC[2]=Math.max(maxC[2],B[i]);
  }

  let c0r = rgbToRgb565(maxC[0],maxC[1],maxC[2]);
  let c1r = rgbToRgb565(minC[0],minC[1],minC[2]);

  // Ensure 4-color mode: c0 > c1
  if (c0r < c1r) { let t=c0r; c0r=c1r; c1r=t; }
  if (c0r === c1r && c0r > 0) c1r--;

  const [r0,g0,b0] = rgb565ToRgb(c0r);
  const [r1,g1,b1] = rgb565ToRgb(c1r);

  const pal = [
    [r0,g0,b0], [r1,g1,b1],
    [Math.round((2*r0+r1)/3), Math.round((2*g0+g1)/3), Math.round((2*b0+b1)/3)],
    [Math.round((r0+2*r1)/3), Math.round((g0+2*g1)/3), Math.round((b0+2*b1)/3)],
  ];

  let indices = 0;
  for (let i=0;i<16;i++) {
    let bestDist=Infinity, bestIdx=0;
    for (let p=0;p<4;p++) {
      const dr=R[i]-pal[p][0], dg=G[i]-pal[p][1], db=B[i]-pal[p][2];
      const d=dr*dr + dg*dg + db*db;
      if (d<bestDist) { bestDist=d; bestIdx=p; }
    }
    indices |= (bestIdx << (i*2));
  }

  const out = new Uint8Array(8);
  out[0]=c0r&0xFF; out[1]=(c0r>>8)&0xFF;
  out[2]=c1r&0xFF; out[3]=(c1r>>8)&0xFF;
  out[4]=indices&0xFF; out[5]=(indices>>8)&0xFF;
  out[6]=(indices>>16)&0xFF; out[7]=(indices>>24)&0xFF;
  return out;
}

// ── BC3 alpha block encode ───────────────────────────────────
function encodeBC3AlphaBlock(rgba, bx, by, w, h) {
  const A=[];
  for (let row=0;row<4;row++)
    for (let col=0;col<4;col++) {
      const px=Math.min(bx+col,w-1), py=Math.min(by+row,h-1);
      A.push(rgba[(py*w+px)*4+3]);
    }

  let a0=0,a1=255;
  for (let i=0;i<16;i++) { a0=Math.max(a0,A[i]); a1=Math.min(a1,A[i]); }
  // Ensure 8-alpha mode: a0 > a1
  if (a0 < a1) { let t=a0; a0=a1; a1=t; }
  if (a0===a1 && a0>0) a1--;

  const pal=[a0,a1];
  for (let i=1;i<=6;i++) pal.push(Math.round(((7-i)*a0+i*a1)/7));

  let bits_lo=0, bits_hi=0;
  for (let i=0;i<16;i++) {
    let bestDist=Infinity, bestIdx=0;
    for (let p=0;p<8;p++) {
      const d=Math.abs(A[i]-pal[p]);
      if (d<bestDist) { bestDist=d; bestIdx=p; }
    }
    if (i<8) bits_lo |= bestIdx << (i*3);
    else     bits_hi |= bestIdx << ((i-8)*3);
  }

  const out=new Uint8Array(8);
  out[0]=a0; out[1]=a1;
  out[2]=bits_lo&0xFF; out[3]=(bits_lo>>8)&0xFF; out[4]=(bits_lo>>16)&0xFF;
  out[5]=bits_hi&0xFF; out[6]=(bits_hi>>8)&0xFF; out[7]=(bits_hi>>16)&0xFF;
  return out;
}

// ── BC3 block encode ─────────────────────────────────────────
function encodeBC3Block(rgba, bx, by, w, h) {
  const aBlock = encodeBC3AlphaBlock(rgba, bx, by, w, h);
  const cBlock = encodeBC1Block(rgba, bx, by, w, h, true);
  const out = new Uint8Array(16);
  out.set(aBlock, 0); out.set(cBlock, 8);
  return out;
}

// ── Write DDS header (DX10) ──────────────────────────────────
function writeDDSHeader(w, h, dxgiFormat, mipCount) {
  const isBC3 = (dxgiFormat === DXGI_BC3 || dxgiFormat === DXGI_BC3_SRGB);
  const blockSize = isBC3 ? 16 : 8;
  const linearSize = Math.max(1,(w+3)>>2) * Math.max(1,(h+3)>>2) * blockSize;
  const hasMips = mipCount > 1;

  const header = new ArrayBuffer(148);
  const dv = new DataView(header);
  dv.setUint32(0,  DDS_MAGIC, true);
  dv.setUint32(4,  124, true);  // dwSize
  let flags = DDSD_CAPS|DDSD_HEIGHT|DDSD_WIDTH|DDSD_PIXELFORMAT|DDSD_LINEARSIZE;
  if (hasMips) flags |= DDSD_MIPMAPCOUNT;
  dv.setUint32(8,  flags, true);
  dv.setUint32(12, h, true);
  dv.setUint32(16, w, true);
  dv.setUint32(20, linearSize, true);
  dv.setUint32(24, 0, true);  // depth
  dv.setUint32(28, mipCount, true);
  // PixelFormat at offset 76
  dv.setUint32(76, 32, true);           // pfSize
  dv.setUint32(80, DDPF_FOURCC, true);  // pfFlags
  dv.setUint32(84, FOURCC_DX10, true);  // fourCC
  // Caps
  let caps = DDSCAPS_TEXTURE;
  if (hasMips) caps |= DDSCAPS_MIPMAP|DDSCAPS_COMPLEX;
  dv.setUint32(108, caps, true);
  // DX10 extension at offset 128
  dv.setUint32(128, dxgiFormat, true); // dxgiFormat
  dv.setUint32(132, 3, true);          // D3D10_RESOURCE_DIMENSION_TEXTURE2D
  dv.setUint32(136, 0, true);          // miscFlag
  dv.setUint32(140, 1, true);          // arraySize
  dv.setUint32(144, 0, true);          // miscFlags2
  return new Uint8Array(header);
}

// ── Mipmap generation (box filter) ──────────────────────────
function downsample(rgba, w, h) {
  const nw = Math.max(1, w>>1), nh = Math.max(1, h>>1);
  const out = new Uint8Array(nw*nh*4);
  for (let y=0;y<nh;y++) {
    for (let x=0;x<nw;x++) {
      const px=x*2, py=y*2;
      const i00=((py  )*w+(px  ))*4;
      const i10=((py  )*w+(px+1<w?px+1:px))*4;
      const i01=((py+1<h?py+1:py)*w+(px  ))*4;
      const i11=((py+1<h?py+1:py)*w+(px+1<w?px+1:px))*4;
      const di=(y*nw+x)*4;
      for (let c=0;c<4;c++)
        out[di+c]=Math.round((rgba[i00+c]+rgba[i10+c]+rgba[i01+c]+rgba[i11+c])/4);
    }
  }
  return {rgba:out, width:nw, height:nh};
}

// ── RGBA → DDS ───────────────────────────────────────────────
export function encodeDDS(rgba, width, height, dxgiFormat, generateMipmaps) {
  const isBC3 = (dxgiFormat === DXGI_BC3 || dxgiFormat === DXGI_BC3_SRGB);

  // Build mip chain
  const mips = [{rgba, width, height}];
  if (generateMipmaps) {
    let {rgba:mr, width:mw, height:mh} = mips[0];
    while (mw > 1 || mh > 1) {
      const d = downsample(mr, mw, mh);
      mips.push(d);
      ({rgba:mr, width:mw, height:mh} = d);
    }
  }

  // Compute total block data size
  let dataSize = 0;
  for (const m of mips) {
    const bw=Math.max(1,(m.width+3)>>2), bh=Math.max(1,(m.height+3)>>2);
    dataSize += bw*bh*(isBC3?16:8);
  }

  const headerBytes = writeDDSHeader(width, height, dxgiFormat, mips.length);
  const out = new Uint8Array(148 + dataSize);
  out.set(headerBytes, 0);
  let offset = 148;

  for (const m of mips) {
    const bw=Math.max(1,(m.width+3)>>2), bh=Math.max(1,(m.height+3)>>2);
    for (let by=0;by<bh;by++) {
      for (let bx=0;bx<bw;bx++) {
        const block = isBC3
          ? encodeBC3Block(m.rgba, bx*4, by*4, m.width, m.height)
          : encodeBC1Block(m.rgba, bx*4, by*4, m.width, m.height, true);
        out.set(block, offset);
        offset += isBC3 ? 16 : 8;
      }
    }
  }

  return out.buffer;
}

// Format constants exported for use in app
export { DXGI_BC1, DXGI_BC1_SRGB, DXGI_BC3, DXGI_BC3_SRGB };
