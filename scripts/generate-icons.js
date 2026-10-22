import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function generatePNG(size, isMaskable = false) {
  const width = size;
  const height = size;

  // Raw pixel data: 1 filter byte (0) + width * 4 (RGBA) bytes per scanline
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(rowLen * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.46;
  const innerRadius = width * 0.38;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // Filter type None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background gradient from Teal-800 (#115e59) to Teal-500 (#14b8a6)
      const gradRatio = (x + y) / (width + height);
      let r = Math.round(17 + (20 - 17) * gradRatio);
      let g = Math.round(94 + (184 - 94) * gradRatio);
      let b = Math.round(89 + (166 - 89) * gradRatio);
      let a = 255;

      if (!isMaskable) {
        // Rounded squircle mask
        const cornerRadius = width * 0.22;
        const qx = Math.max(0, Math.abs(dx) - (cx - cornerRadius));
        const qy = Math.max(0, Math.abs(dy) - (cy - cornerRadius));
        const cornerDist = Math.sqrt(qx * qx + qy * qy);
        if (cornerDist > cornerRadius) {
          a = 0;
        }
      }

      // Draw center icon emblem: a briefcase and delivery sprint bolt
      if (a > 0) {
        // Briefcase body
        const bw = width * 0.44;
        const bh = width * 0.32;
        const bx = cx - bw / 2;
        const by = cy - bh / 2 + width * 0.04;

        const inBox = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
        // Briefcase handle
        const hw = width * 0.22;
        const hh = width * 0.12;
        const hx = cx - hw / 2;
        const hy = by - hh;
        const inHandleOuter = x >= hx && x <= hx + hw && y >= hy && y <= by;
        const inHandleInner = x >= hx + width * 0.05 && x <= hx + hw - width * 0.05 && y >= hy + width * 0.04 && y <= by;
        const inHandle = inHandleOuter && !inHandleInner;

        // Lightning / sprint stripe in middle
        const inStripe = inBox && y >= by + bh * 0.42 && y <= by + bh * 0.52;

        if (inHandle || inBox) {
          if (inStripe) {
            // Amber/Gold accent line
            r = 251; g = 191; b = 36;
          } else {
            // Crisp White
            r = 255; g = 255; b = 255;
          }
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // Color type 6 (RGBA)
  ihdrData[10] = 0; // Compression deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace none
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePNG(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePNG(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePNG(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePNG(180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), generatePNG(64, false));

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#115e59" />
      <stop offset="50%" stop-color="#0d9488" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#grad)" />
  <path d="M192 144 h128 v32 h-128 z" fill="none" stroke="#ffffff" stroke-width="24" stroke-linejoin="round" />
  <rect x="96" y="176" width="320" height="230" rx="30" fill="#ffffff" />
  <rect x="96" y="270" width="320" height="30" fill="#f59e0b" />
  <path d="M236 250 L276 250 L256 310 Z" fill="#0d9488" />
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);

console.log('Successfully generated all PWA icons and SVG assets.');
