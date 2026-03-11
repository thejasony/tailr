// Run with: node generate-icons.js
// Requires: npm install canvas  (in this directory)
// Generates icons/icon16.png, icon48.png, icon128.png

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'icons');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.18; // corner radius

  // Background: blue rounded rect
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = '#2563eb';
  ctx.fill();

  // Chart line (upward trend)
  const pad = size * 0.22;
  const w = size - pad * 2;
  const h = size - pad * 2;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pad, pad + h * 0.75);
  ctx.lineTo(pad + w * 0.33, pad + h * 0.45);
  ctx.lineTo(pad + w * 0.62, pad + h * 0.65);
  ctx.lineTo(pad + w, pad + h * 0.15);
  ctx.stroke();

  // Dot at top right
  ctx.beginPath();
  ctx.arc(pad + w, pad + h * 0.15, size * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  return canvas.toBuffer('image/png');
}

[16, 48, 128].forEach(size => {
  const buf = drawIcon(size);
  fs.writeFileSync(path.join(dir, `icon${size}.png`), buf);
  console.log(`Generated icons/icon${size}.png`);
});
console.log('Done!');
