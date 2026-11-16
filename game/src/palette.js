// RUSTLINE DEPOT — the look plan: one palette, procedural canvas textures,
// no image assets. Dawn over a rail depot: cold steel blues against rust
// orange, Vanguard amber against Sentinel teal.
import * as THREE from 'three';

export const PALETTE = {
  skyTop: '#2e4a6b',
  skyLow: '#e8a35c',
  fog: '#8d99a8',
  ground: '#3a3f45',
  concrete: '#6d7278',
  concreteDark: '#4a4e54',
  steel: '#7d838c',
  rust: '#9a5a30',
  rustDark: '#6e3f22',
  containerA: '#b0622f',
  containerB: '#3f6d7a',
  containerC: '#7a7d33',
  hazard: '#e0a92e',
  vanguard: '#f0a830',
  sentinel: '#35c4b5',
  ink: '#ece7db',
  muted: '#9aa2ab',
  accent: '#f0a830',
  dark: '#14161a',
};

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, w, h, count, alpha, light) {
  for (let i = 0; i < count; i += 1) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// Asphalt with faint lane wear and cracks.
export function asphaltTexture() {
  const t = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 2600, 0.08, false);
    speckle(ctx, w, h, 1200, 0.05, true);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s += 1) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230,220,190,0.16)';
    ctx.fillRect(0, 250, w, 6);
    ctx.fillRect(0, 256, w, 2);
  });
  t.repeat.set(8, 6);
  return t;
}

export function concreteTexture() {
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6d7278';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 1800, 0.09, false);
    speckle(ctx, w, h, 900, 0.06, true);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  });
  t.repeat.set(2, 2);
  return t;
}

// Corrugated container side with a stencilled label.
export function containerTexture(base, label) {
  const t = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x, 0, 5, h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + 8, 0, 4, h);
    }
    speckle(ctx, w, h, 900, 0.1, false);
    ctx.fillStyle = 'rgba(20,16,12,0.35)';
    ctx.fillRect(0, h - 26, w, 26);
    ctx.fillStyle = 'rgba(236,231,219,0.85)';
    ctx.font = 'bold 44px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 18, h - 13);
    ctx.fillStyle = 'rgba(236,231,219,0.5)';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('RUSTLINE  •  DEPOT 07', 18, 34);
  });
  return t;
}

export function hazardTexture() {
  const t = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e0a92e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#191919';
    for (let x = -h; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 64, 0);
      ctx.lineTo(x + 32, h);
      ctx.closePath();
      ctx.fill();
    }
  });
  t.repeat.set(4, 1);
  return t;
}

// Vertical gradient sky dome texture (top = cold blue, horizon = dawn amber).
export function skyTexture() {
  const t = canvasTexture(64, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d3247');
    g.addColorStop(0.45, '#2e4a6b');
    g.addColorStop(0.72, '#7d8aa0');
    g.addColorStop(0.88, '#e8a35c');
    g.addColorStop(1, '#f2c078');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return t;
}

export function shade(name) {
  return PALETTE[name];
}
