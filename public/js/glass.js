// Liquid Glass for the app's glass surfaces: a port of the material and motion of Liquid Glass
// (github.com/Glass-HQ/liquid-glass, MIT), without WebGPU or a build step.
//
// - The rim: the overlay plane of its shader (gpu/maps.wgsl), computed here per pixel for each
//   surface's own size, corner radius and pixel ratio, and painted beneath the surface's content.
// - Refraction and the material, where the browser takes an SVG filter as a backdrop-filter
//   (Chromium): its filter graph for Regular glass. The backdrop is frosted (a 7.33px blur
//   lightened by a wide fill blur), bent by the field plane of the shader, and put through the
//   material's tone curve. Safari and Firefox take only CSS filter functions there, so app.css
//   gives them the same material without the bending.
// - Motion: the elastic press of dom/interaction.ts (the glass swells under a finger, stretches
//   toward a drag, settles like a gel, and lights up from where it is touched) and the tab bar's
//   selection lens of dom/selection.ts (it springs between tabs and can be dragged to one).
//
// Everything above the DOM wiring at the bottom is pure, so test/glass.test.mjs can check it.

const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Distance from a rounded rectangle centered on the origin (negative inside), and the outward
// normal of its nearest edge. `out` is reused to keep the per-pixel loops allocation-free.
export function roundedRect(x, y, hw, hh, r, out = {}) {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  const sx = x < 0 ? -1 : 1;
  const sy = y < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy);
    out.d = l - r;
    out.nx = (sx * qx) / l;
    out.ny = (sy * qy) / l;
  } else if (qx > qy) {
    out.d = qx - r;
    out.nx = sx;
    out.ny = 0;
  } else {
    out.d = qy - r;
    out.nx = 0;
    out.ny = sy;
  }
  return out;
}

const SPEC = Math.cos(1.08);
const DIFFUSE = Math.cos(1.08 * 0.65);
const SIDE = Math.cos(0.98);

// The overlay at a point `d` CSS px from the outline with normal (nx, ny), antialiased over `aa`
// px: [light, alpha]. Light catches the rim where it faces up or down (fading out by about 62°)
// with a soft glow just inside it, over a dark hairline where the outline faces sideways.
export function overlayAt(d, nx, ny, aa, dark) {
  const coverage = sat(0.5 - d / aa);
  const ay = Math.abs(ny);
  const directional = sat((ay - SPEC) / (1 - SPEC)) ** 1.25;
  const diffuseDir = sat((ay - DIFFUSE) / (1 - DIFFUSE)) ** 1.25;
  const stroke = sat((d + 0.9) / aa + 0.5) * sat(0.5 - d / aa);
  let specular = directional * stroke;
  specular /= 1 + 0.5 * (1 - specular);
  const diffuse = diffuseDir * 0.18 * (1 - sat(-d / 4.5)) ** 2 * coverage;
  const highlight = sat(specular * (dark ? 0.82 : 1) + diffuse * (dark ? 0.4 : 1));
  const adjusted = d - 0.5;
  const falloff = 1 - sat(-adjusted / 0.5);
  const ramp = (falloff > 0 ? 0.25 : 0) + 0.75 * falloff;
  const outline = ramp * sat((adjusted + 0.5) / aa + 0.5) * sat(-adjusted / aa + 0.5);
  const right = sat((nx - SIDE) / (1 - SIDE)) * outline;
  const left = sat((-nx - SIDE) / (1 - SIDE)) * outline;
  const shade = (right / (1 + 0.4 * (1 - right)) + left / (1 + 0.4 * (1 - left))) * (dark ? 0.6 : 0.48);
  const alpha = highlight + shade * (1 - highlight);
  return [((dark ? 0.82 : 1) * highlight) / Math.max(alpha, 1e-5), alpha];
}

// The field at depth `d` (negative inside): how far to bend the backdrop, as the red and green
// of an SVG displacement map. Nothing moves deeper than 20px; at the rim the backdrop is drawn
// from further inside, so it looks pulled around the edge as through a lens.
export function fieldAt(d, nx, ny) {
  const depth = sat(-d * 0.05);
  const edge = 1 - sat(Math.sqrt((2 - depth) * depth));
  return [0.5 - nx * edge * 0.5, 0.5 - ny * edge * 0.5];
}

// RGBA pixels of the overlay for a w×h surface with corner radius r, 2px larger on every side
// (the shade lies just outside the outline), at `dpr` pixels per CSS px.
export function overlayPixels(w, h, r, dpr, dark) {
  const W = Math.round((w + 4) * dpr);
  const H = Math.round((h + 4) * dpr);
  const px = new Uint8ClampedArray(W * H * 4);
  const aa = 1 / dpr;
  const p = {};
  for (let j = 0; j < H; j++) {
    const y = (j + 0.5) / dpr - 2 - h / 2;
    for (let i = 0; i < W; i++) {
      roundedRect((i + 0.5) / dpr - 2 - w / 2, y, w / 2, h / 2, r, p);
      if (p.d < -5 || p.d > 1.5) continue;
      const [light, alpha] = overlayAt(p.d, p.nx, p.ny, aa, dark);
      const k = (j * W + i) * 4;
      px[k] = px[k + 1] = px[k + 2] = light * 255;
      px[k + 3] = alpha * 255;
    }
  }
  return { width: W, height: H, data: px };
}

// RGBA pixels of the field at one pixel per CSS px. Opaque, so no canvas premultiplies it.
export function fieldPixels(w, h, r) {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  const px = new Uint8ClampedArray(W * H * 4);
  const p = {};
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      roundedRect(((i + 0.5) * w) / W - w / 2, ((j + 0.5) * h) / H - h / 2, w / 2, h / 2, r, p);
      const [red, green] = fieldAt(Math.min(p.d, 0), p.nx, p.ny);
      const k = (j * W + i) * 4;
      px[k] = red * 255;
      px[k + 1] = green * 255;
      px[k + 2] = 128;
      px[k + 3] = 255;
    }
  }
  return { width: W, height: H, data: px };
}

// Regular glass, as calibrated in core/materials.ts.
export const REGULAR = {
  blur: 7.33,
  light: { fillSigma: 23, fillOpacity: 0.34, tone: [0.36, 0.67, -0.1113], toneWeight: 0.8, chroma: 1.1031 },
  dark: { fillSigma: 21.8, fillOpacity: 0.65, tone: [0.105, 0.83, -0.2091], toneWeight: 0.9, chroma: 1.0648 },
};

// The tone curve as an SVG transfer table: it lifts the shadows of what is behind the glass
// (light) or holds back its highlights (dark).
export function toneTable(dark) {
  const { tone: [a, b, q], toneWeight } = dark ? REGULAR.dark : REGULAR.light;
  return Array.from({ length: 33 }, (_, n) => {
    const v = n / 32;
    return +(toneWeight * (a + b * v + q * v * v) + (1 - toneWeight) * v).toFixed(4);
  });
}

export function filterMarkup(id, field, w, h, dark, refraction) {
  const m = dark ? REGULAR.dark : REGULAR.light;
  const table = toneTable(dark).join(' ');
  const funcs = ['R', 'G', 'B'].map((c) => `<feFunc${c} type="table" tableValues="${table}"/>`).join('');
  return (
    `<filter id="${id}" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feImage href="${field}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="field"/>` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${REGULAR.blur}" edgeMode="duplicate" result="frost"/>` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${m.fillSigma}" edgeMode="duplicate" result="fill"/>` +
    `<feBlend in="frost" in2="fill" mode="${dark ? 'darken' : 'lighten'}" result="blend"/>` +
    `<feComposite in="blend" in2="frost" operator="arithmetic" k2="${m.fillOpacity}" k3="${+(1 - m.fillOpacity).toFixed(2)}" result="mix"/>` +
    `<feDisplacementMap in="mix" in2="field" scale="${2 * refraction}" xChannelSelector="R" yChannelSelector="G" result="refracted"/>` +
    `<feComponentTransfer in="refracted" result="tone">${funcs}</feComponentTransfer>` +
    `<feColorMatrix in="tone" type="saturate" values="${m.chroma}"/>` +
    `</filter>`
  );
}

// Named springs shared by every glass interaction, as in core/spring.ts: a perceptual duration
// and a bounce. Stepped with the closed-form solution, so dropped frames stay stable.
export const SPRINGS = {
  press: { duration: 0.24, bounce: 0.2 },
  release: { duration: 0.5, bounce: 0.42 },
  glow: { duration: 0.42, bounce: 0 },
  layout: { duration: 0.4, bounce: 0.16 },
  track: { duration: 0.18, bounce: 0 },
};

export class Spring {
  constructor(value, options) {
    this.value = this.target = value;
    this.velocity = 0;
    this.configure(options);
  }
  configure({ duration, bounce }) {
    const omega = (2 * Math.PI) / duration;
    this.stiffness = omega * omega;
    this.damping = bounce >= 0 ? (4 * Math.PI * (1 - bounce)) / duration : (4 * Math.PI) / (duration * (1 + bounce));
    return this;
  }
  jump(value) {
    this.value = this.target = value;
    this.velocity = 0;
    return this;
  }
  get settled() {
    return this.value === this.target && this.velocity === 0;
  }
  step(dt) {
    if (this.settled || !(dt > 0)) return this;
    const omega = Math.sqrt(this.stiffness);
    const zeta = this.damping / (2 * omega);
    const x0 = this.value - this.target;
    const v0 = this.velocity;
    let x;
    let v;
    if (zeta < 1) {
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      const decay = Math.exp(-zeta * omega * dt);
      const b = (v0 + zeta * omega * x0) / wd;
      const cos = Math.cos(wd * dt);
      const sin = Math.sin(wd * dt);
      x = decay * (x0 * cos + b * sin);
      v = decay * ((b * wd - zeta * omega * x0) * cos - (x0 * wd + zeta * omega * b) * sin);
    } else if (zeta === 1) {
      const decay = Math.exp(-omega * dt);
      const b = v0 + omega * x0;
      x = decay * (x0 + b * dt);
      v = decay * (b - omega * (x0 + b * dt));
    } else {
      const root = omega * Math.sqrt(zeta * zeta - 1);
      const r1 = -zeta * omega + root;
      const r2 = -zeta * omega - root;
      const c2 = (v0 - r1 * x0) / (r2 - r1);
      const c1 = x0 - c2;
      x = c1 * Math.exp(r1 * dt) + c2 * Math.exp(r2 * dt);
      v = c1 * r1 * Math.exp(r1 * dt) + c2 * r2 * Math.exp(r2 * dt);
    }
    const scale = Math.max(1, Math.abs(this.target), Math.abs(x0));
    if (Math.abs(x) < 1e-4 * scale && Math.abs(v) < 1e-3 * scale) this.jump(this.target);
    else {
      this.value = this.target + x;
      this.velocity = v;
    }
    return this;
  }
}

// iOS-style rubber band: follows a short drag, then resists without a hard stop.
export function rubberBand(offset, limit, coefficient = 0.55) {
  if (limit <= 0) return 0;
  return Math.sign(offset) * limit * (1 - 1 / ((Math.abs(offset) * coefficient) / limit + 1));
}

// ---------------------------------------------------------------------------------------------
// DOM wiring

const ns = 'http://www.w3.org/2000/svg';
// Glass that answers to a finger; the tab bar is one surface with a lens inside it.
const INTERACTIVE = 'a.glass, button.glass, .tab-capsule';

let defs = null;
let serial = 0;
const surfaces = new Map();
const maps = new Map();

function remember(key, make) {
  let value = maps.get(key);
  if (value === undefined) {
    value = make();
    if (maps.size >= 64) maps.delete(maps.keys().next().value);
    maps.set(key, value);
  }
  return value;
}

function toURL({ width, height, data }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.toDataURL('image/png');
}

const media = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {} });
const darkQuery = media('(prefers-color-scheme: dark)');
const reducedMotion = media('(prefers-reduced-motion: reduce)');
const reducedTransparency = media('(prefers-reduced-transparency: reduce)');
// Only Chromium draws an SVG filter as a backdrop-filter; Safari would show no glass at all.
const canRefract = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.userAgentData) && CSS.supports('backdrop-filter', 'url(#a)') && !reducedTransparency.matches;

function radius(el, w, h) {
  const v = getComputedStyle(el).borderTopLeftRadius;
  const r = v.endsWith('%') ? (parseFloat(v) / 100) * Math.min(w, h) : parseFloat(v) || 0;
  return Math.min(r, w / 2, h / 2);
}

function setRefraction(s, filter) {
  const el = s.el;
  if (filter) {
    el.style.setProperty('-webkit-backdrop-filter', `url("#${s.id}")`);
    el.style.setProperty('backdrop-filter', `url("#${s.id}")`);
    el.dataset.lgRefract = '';
  } else if (el.dataset.lgRefract !== undefined) {
    el.style.removeProperty('-webkit-backdrop-filter');
    el.style.removeProperty('backdrop-filter');
    delete el.dataset.lgRefract;
  }
}

// Draws a surface for its current size. While the size keeps changing (the tab bar collapsing,
// a dialog growing) the last maps are stretched and the bending pauses; a new size is drawn once
// it has held still for a moment, since a map takes a few milliseconds.
function draw(s, settled = false) {
  const el = s.el;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!w || !h) return;
  const now = performance.now();
  const changed = w !== s.w || h !== s.h;
  if (changed && s.w && !settled && now - s.at < 150) {
    s.at = now;
    setRefraction(s, false);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => draw(s, true), 160);
    return;
  }
  s.at = now;
  s.w = w;
  s.h = h;
  const r = radius(el, w, h);
  const dark = darkQuery.matches;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const overlay = remember(`o${w}|${h}|${r}|${dpr}|${dark}`, () => toURL(overlayPixels(w, h, r, dpr, dark)));
  el.style.setProperty('--lg-overlay', `url("${overlay}")`);
  el.dataset.lg = '';
  const refraction = parseFloat(getComputedStyle(el).getPropertyValue('--lg-refraction')) || 0;
  if (!refraction || !canRefract() || !el.classList.contains('glass')) return setRefraction(s, false);
  const field = remember(`f${w}|${h}|${r}`, () => toURL(fieldPixels(w, h, r)));
  const markup = filterMarkup(s.id, field, w, h, dark, refraction);
  if (s.markup !== markup) {
    s.filter?.remove();
    const holder = document.createElementNS(ns, 'svg');
    holder.innerHTML = markup;
    s.filter = holder.firstChild;
    defs.append(s.filter);
    s.markup = markup;
  }
  setRefraction(s, true);
}

const resized = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => entries.forEach((e) => surfaces.has(e.target) && draw(surfaces.get(e.target)))) : null;

function add(el) {
  if (surfaces.has(el)) return;
  const s = { el, id: `lg-${++serial}`, w: 0, h: 0, at: 0 };
  surfaces.set(el, s);
  resized.observe(el);
  draw(s);
}

function remove(el) {
  const s = surfaces.get(el);
  if (!s) return;
  clearTimeout(s.timer);
  s.filter?.remove();
  resized.unobserve(el);
  surfaces.delete(el);
  animators.delete(el);
}

// --- motion ---

const ticking = new Set();
let frame = 0;
let previous = 0;
function kick(animator) {
  ticking.add(animator);
  if (!frame) frame = requestAnimationFrame(tick);
}
function tick(now) {
  // The springs are analytic, so a slow frame is simply a longer step.
  const dt = previous ? Math.min(0.1, (now - previous) / 1000) : 1 / 60;
  previous = now;
  for (const a of ticking) if (!a.frame(dt)) ticking.delete(a);
  frame = ticking.size ? requestAnimationFrame(tick) : 0;
  if (!frame) previous = 0;
}

const animators = new Map();
const disabled = (el) => el.matches(':disabled, [aria-disabled="true"]');

function write(el, name, value) {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

// The elastic, lit response of one surface: it grows by about 8px under a press, stretches toward
// a drag with constant volume, settles back with a gel-like overshoot, and lights up from the
// point of contact. Writes only `translate`, `scale` and custom properties.
function interaction(el) {
  const tx = new Spring(0, SPRINGS.track);
  const ty = new Spring(0, SPRINGS.track);
  const press = new Spring(0, SPRINGS.press);
  const glow = new Spring(0, SPRINGS.glow);
  let pointer = null;
  let keyboard = false;
  let hovering = false;
  let glowX = 0;
  let glowY = 0;
  let carriedX = 0;
  let carriedY = 0;
  let written = false;
  const set = (spring, target, options) => {
    spring.configure(options).target = target;
  };
  const layout = () => {
    const rect = el.getBoundingClientRect();
    const width = el.offsetWidth || 1;
    const height = el.offsetHeight || 1;
    return { rect, width, height, cx: rect.left + rect.width / 2 - tx.value, cy: rect.top + rect.height / 2 - ty.value };
  };
  const light = (x, y) => {
    const { rect, width, height } = layout();
    glowX = ((x - rect.left) * width) / (rect.width || 1);
    glowY = ((y - rect.top) * height) / (rect.height || 1);
  };
  const self = {
    down(e) {
      if (disabled(el)) return;
      const { cx, cy, width, height } = layout();
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, cx, cy, clientX: e.clientX, clientY: e.clientY, lastX: cx, lastY: cy };
      carriedX = carriedY = 0;
      light(e.clientX, e.clientY);
      set(press, 1, SPRINGS.press);
      set(glow, 1, SPRINGS.press);
      // Larger glass is heavier: it follows a drag more slowly.
      const follow = { duration: SPRINGS.track.duration + 0.0005 * Math.max(width, height), bounce: 0 };
      set(tx, 0, follow);
      set(ty, 0, follow);
      kick(self);
    },
    move(e) {
      if (!pointer || e.pointerId !== pointer.id) return;
      pointer.clientX = e.clientX;
      pointer.clientY = e.clientY;
    },
    up(e) {
      if (!pointer || (e && e.pointerId !== pointer.id)) return;
      pointer = null;
      set(press, 0, SPRINGS.release);
      set(tx, 0, SPRINGS.release);
      set(ty, 0, SPRINGS.release);
      set(glow, hovering ? 0.35 : 0, SPRINGS.glow);
      kick(self);
    },
    hover(on, e) {
      hovering = on;
      if (on) light(e.clientX, e.clientY);
      if (!pointer && !keyboard) set(glow, on ? 0.35 : 0, SPRINGS.glow);
      kick(self);
    },
    key(down) {
      if (down === keyboard || (down && (pointer || disabled(el)))) return;
      keyboard = down;
      glowX = el.offsetWidth / 2;
      glowY = el.offsetHeight / 2;
      set(press, down ? 1 : 0, down ? SPRINGS.press : SPRINGS.release);
      set(glow, down ? 1 : hovering ? 0.35 : 0, down ? SPRINGS.press : SPRINGS.glow);
      kick(self);
    },
    frame(dt) {
      if (!el.isConnected) return false;
      const elastic = !reducedMotion.matches;
      const { width, height, cx, cy } = layout();
      const size = Math.max(width, height);
      const small = size <= 72;
      if (pointer) {
        // Controls give a little under the finger; surfaces only past their edges.
        const ox = small ? pointer.clientX - pointer.x - (cx - pointer.cx) : pointer.clientX - Math.max(cx - width / 2, Math.min(cx + width / 2, pointer.clientX));
        const oy = small ? pointer.clientY - pointer.y - (cy - pointer.cy) : pointer.clientY - Math.max(cy - height / 2, Math.min(cy + height / 2, pointer.clientY));
        const limit = small ? 4 + 0.15 * size : Math.min(10, 3 + 0.04 * size);
        tx.target = rubberBand(ox, limit);
        ty.target = rubberBand(oy, limit);
        light(pointer.clientX, pointer.clientY);
        carriedX += ((cx - pointer.lastX) / dt - carriedX) * Math.min(1, dt * 12);
        carriedY += ((cy - pointer.lastY) / dt - carriedY) * Math.min(1, dt * 12);
        pointer.lastX = cx;
        pointer.lastY = cy;
      } else {
        carriedX *= Math.exp(-dt * 10);
        carriedY *= Math.exp(-dt * 10);
      }
      for (const spring of [tx, ty, press, glow]) spring.step(dt);
      const grow = elastic ? Math.min(0.16, 8 / size) * press.value : 0;
      const cap = small ? 0.2 : 0.12;
      const ex = elastic ? Math.min(cap, (0.5 * Math.abs(tx.value)) / width + 0.00007 * Math.abs(tx.velocity) + 0.00005 * Math.abs(carriedX)) : 0;
      const ey = elastic ? Math.min(cap, (0.5 * Math.abs(ty.value)) / height + 0.00007 * Math.abs(ty.velocity) + 0.00005 * Math.abs(carriedY)) : 0;
      const sx = ((1 + grow) * (1 + ex)) / Math.sqrt(1 + ey);
      const sy = ((1 + grow) * (1 + ey)) / Math.sqrt(1 + ex);
      const moved = elastic && (Math.abs(tx.value) > 0.01 || Math.abs(ty.value) > 0.01);
      const scaled = Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4;
      const lit = glow.value > 0.001;
      if (moved || scaled || lit || pointer || keyboard) {
        written = true;
        write(el, 'translate', moved ? `${tx.value.toFixed(3)}px ${ty.value.toFixed(3)}px` : '');
        write(el, 'scale', scaled ? `${sx.toFixed(5)} ${sy.toFixed(5)}` : '');
        write(el, '--glow', lit ? glow.value.toFixed(4) : '0');
        write(el, '--glow-x', `${glowX.toFixed(1)}px`);
        write(el, '--glow-y', `${glowY.toFixed(1)}px`);
        write(el, '--glow-r', `${Math.max(36, Math.min(180, size * 0.9)).toFixed(0)}px`);
      } else if (written) {
        written = false;
        for (const name of ['translate', 'scale', '--glow', '--glow-x', '--glow-y', '--glow-r']) el.style.removeProperty(name);
      }
      return Boolean(pointer) || [tx, ty, press, glow].some((spring) => !spring.settled);
    },
  };
  return self;
}

function animatorFor(el) {
  let a = animators.get(el);
  if (!a) animators.set(el, (a = interaction(el)));
  return a;
}

// The tab bar's selection: one lens that springs from tab to tab, stretching along its path as
// it moves, and that can be dragged across the bar to choose a tab. The tabs stay links: on a drag
// the lens clicks the one it lands on.
function selectionLens(list, indicator) {
  const pos = new Spring(0, SPRINGS.layout);
  const cross = new Spring(0, SPRINGS.layout);
  const length = new Spring(0, SPRINGS.layout);
  const thickness = new Spring(0, SPRINGS.layout);
  let ready = false;
  let drag = null;
  let moved = false;
  let suppress = false;
  const vertical = () => getComputedStyle(list).flexDirection === 'column';
  const tabs = () => [...list.querySelectorAll('a')].filter((a) => a.offsetWidth);
  const box = (tab) =>
    vertical()
      ? { pos: tab.offsetTop, cross: tab.offsetLeft, length: tab.offsetHeight, thickness: tab.offsetWidth }
      : { pos: tab.offsetLeft, cross: tab.offsetTop, length: tab.offsetWidth, thickness: tab.offsetHeight };
  const client = (e) => (vertical() ? e.clientY : e.clientX);
  const local = (value) => {
    const rect = list.getBoundingClientRect();
    return vertical() ? ((value - rect.top) * list.offsetHeight) / (rect.height || 1) : ((value - rect.left) * list.offsetWidth) / (rect.width || 1);
  };
  const nearest = (center) =>
    tabs()
      .map((tab) => ({ tab, distance: Math.abs(box(tab).pos + box(tab).length / 2 - center) }))
      .sort((a, b) => a.distance - b.distance)[0]?.tab;
  const end = () => {
    drag = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  };
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.client = client(e);
    moved ||= Math.abs(drag.client - drag.start) > 4;
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    // Where the finger let go, not where the lens has got to: a quick flick ends before it arrives.
    const choice = nearest(local(client(e)) - drag.grab);
    const dragged = moved;
    end();
    kick(self);
    if (dragged && choice) {
      // The browser's own click would land wherever the finger is; the lens decides, once.
      suppress = true;
      setTimeout(() => (suppress = false), 0);
      if (!choice.classList.contains('active')) choice.click();
    }
  }
  function cancel(e) {
    if (drag && e.pointerId === drag.id) end();
  }
  list.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || reducedMotion.matches) return;
    const tab = e.target.closest('a');
    if (!tab || !list.contains(tab)) return;
    const at = local(client(e));
    // Grab the lens where it was touched; pressing another tab pulls it there.
    const grab = tab.classList.contains('active') ? at - (pos.value + length.value / 2) : 0;
    drag = { id: e.pointerId, start: client(e), client: client(e), grab };
    moved = false;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    kick(self);
  });
  list.addEventListener(
    'click',
    (e) => {
      if (!suppress || !e.isTrusted) return;
      suppress = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  const self = {
    frame(dt) {
      const active = list.querySelector('a.active');
      const target = active?.offsetWidth ? box(active) : null;
      list.classList.toggle('has-pill', Boolean(target));
      if (!target) {
        ready = false;
        return Boolean(drag);
      }
      if (!ready || reducedMotion.matches) {
        pos.jump(target.pos);
        cross.jump(target.cross);
        length.jump(target.length);
        thickness.jump(target.thickness);
        ready = true;
      } else if (drag && moved) {
        // Follow the finger, taking on the size of the tab passing beneath.
        const all = tabs().map(box);
        const min = Math.min(...all.map((b) => b.pos));
        const max = Math.max(...all.map((b) => b.pos + b.length));
        const under = nearest(local(drag.client) - drag.grab);
        const size = under ? box(under).length : target.length;
        const center = Math.max(min + size / 2, Math.min(max - size / 2, local(drag.client) - drag.grab));
        pos.configure(SPRINGS.track).target = center - size / 2;
        length.configure(SPRINGS.track).target = size;
        cross.target = target.cross;
        thickness.target = target.thickness;
      } else {
        for (const spring of [pos, cross, length, thickness]) spring.configure(SPRINGS.layout);
        pos.target = target.pos;
        cross.target = target.cross;
        length.target = target.length;
        thickness.target = target.thickness;
      }
      for (const spring of [pos, cross, length, thickness]) spring.step(dt);
      const stretch = Math.min(0.2, Math.abs(pos.velocity) * 0.00035) * (drag ? 1 : 0.6);
      const along = 1 + stretch;
      const across = 1 / Math.sqrt(1 + stretch);
      const v = vertical();
      write(indicator, 'left', `${(v ? cross.value : pos.value).toFixed(3)}px`);
      write(indicator, 'top', `${(v ? pos.value : cross.value).toFixed(3)}px`);
      write(indicator, 'width', `${(v ? thickness.value : length.value).toFixed(3)}px`);
      write(indicator, 'height', `${(v ? length.value : thickness.value).toFixed(3)}px`);
      write(indicator, 'scale', stretch > 1e-4 ? (v ? `${across.toFixed(4)} ${along.toFixed(4)}` : `${along.toFixed(4)} ${across.toFixed(4)}`) : '');
      if (drag && moved) indicator.dataset.lifted = '';
      else delete indicator.dataset.lifted;
      return Boolean(drag) || [pos, cross, length, thickness].some((spring) => !spring.settled);
    },
  };
  return self;
}

let tabLens = null;
// The active tab changed (or the bar was laid out again): the lens goes there.
export function moveTabLens() {
  if (tabLens) kick(tabLens);
}

export function startGlass() {
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('class', 'lg-defs');
  defs = document.createElementNS(ns, 'defs');
  svg.append(defs);
  document.body.append(svg);

  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches('.glass, .tab-pill')) add(root);
    root.querySelectorAll('.glass, .tab-pill').forEach(add);
  };
  scan(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach(scan);
      r.removedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        for (const el of surfaces.keys()) if (!el.isConnected && (node === el || node.contains(el))) remove(el);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
  const redraw = () => surfaces.forEach((s) => ((s.w = 0), draw(s)));
  darkQuery.addEventListener('change', redraw);
  reducedTransparency.addEventListener('change', redraw);

  const capsule = document.querySelector('.tab-capsule');
  const pill = document.querySelector('.tab-pill');
  if (capsule && pill) {
    tabLens = selectionLens(capsule, pill);
    new ResizeObserver(moveTabLens).observe(capsule);
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest?.(INTERACTIVE);
      if (el) animatorFor(el).down(e);
    },
    { passive: true },
  );
  const forward = (e) => animators.forEach((a) => a.move(e));
  const release = (e) => animators.forEach((a) => a.up(e));
  window.addEventListener('pointermove', forward, { passive: true });
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  // A mouse lights glass a little on hover, following the pointer.
  let hovered = null;
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest?.(INTERACTIVE) || null;
      if (el !== hovered) {
        if (hovered) animatorFor(hovered).hover(false, e);
        hovered = el;
      }
      if (el) animatorFor(el).hover(true, e);
    },
    { passive: true },
  );
  document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && e.target.matches?.(INTERACTIVE)) animatorFor(e.target).key(true);
  });
  document.addEventListener('keyup', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.matches?.(INTERACTIVE)) animatorFor(e.target).key(false);
  });
  document.addEventListener('focusout', (e) => animators.get(e.target)?.key(false));
}
