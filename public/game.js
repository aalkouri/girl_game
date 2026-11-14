'use strict';
// Island Night client: PixiJS renderer (water shader, dynamic lighting, particles) + net + input
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BM = PIXI.BLEND_MODES;
let RR = 900;
const edge = a => RR + 16 * Math.sin(3 * a + 1.3) + 9 * Math.sin(7 * a + .4) + 5 * Math.sin(13 * a + 2.1);

// ---------- procedural textures ----------
const cv2 = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };
const tex = (w, h, fn) => PIXI.Texture.from(cv2(w, h, fn));
const circ = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const ell = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); };
const radial = (size, stops) => tex(size, size, g => { const h = size / 2, r = g.createRadialGradient(h, h, 0, h, h, h); stops.forEach(s => r.addColorStop(s[0], s[1])); g.fillStyle = r; g.fillRect(0, 0, size, size); });

const T_GLOW = radial(128, [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
const T_LIGHT = radial(128, [[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.75)'], [.8, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]);
const T_SHADOW = radial(64, [[0, 'rgba(0,0,0,.55)'], [.6, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']]);
const T_RING = radial(256, [[0, 'rgba(255,255,255,0)'], [.86, 'rgba(255,255,255,0)'], [.96, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);

function noiseTile(base, cols, bladeCols) {
  return tex(256, 256, g => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = rnd(6, 24); g.fillStyle = cols[i % cols.length];
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.globalAlpha = .28; circ(g, x + dx, y + dy, r); }
    }
    g.globalAlpha = .5;
    for (let i = 0; i < 1100; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, h = rnd(3, 7);
      g.strokeStyle = bladeCols[i % bladeCols.length]; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - h); g.stroke();
    }
    g.globalAlpha = 1;
  });
}
const T_GRASS = noiseTile('#3d7a3a', ['#4a9244', '#2f6a30', '#52a04a', '#357233'], ['#6cbb5d', '#2a5e2b', '#8fd070']);
const T_SAND = noiseTile('#dccb90', ['#e8d9a2', '#cdb97c', '#d5c284'], ['#f0e4b4', '#bfa96c']);

const T_TREE = tex(130, 140, g => {
  g.fillStyle = '#4b2f17'; g.fillRect(58, 82, 14, 42); g.fillStyle = '#6b4423'; g.fillRect(58, 82, 6, 42);
  const blob = (x, y, r, c) => { g.fillStyle = c; circ(g, x, y, r); };
  [[65, 70, 34], [42, 78, 26], [88, 78, 26], [50, 48, 27], [80, 48, 27], [65, 36, 24]].forEach(b => blob(b[0], b[1], b[2], '#15462a'));
  [[65, 66, 28], [45, 74, 20], [85, 74, 20], [52, 46, 21], [78, 46, 21], [65, 36, 18]].forEach(b => blob(b[0], b[1], b[2], '#1f6a37'));
  [[56, 52, 12], [44, 70, 9], [70, 36, 9], [80, 56, 8]].forEach(b => blob(b[0], b[1], b[2], '#3f9a4d'));
  g.globalAlpha = .6; blob(52, 44, 5, '#8bd47a'); blob(70, 32, 4, '#8bd47a'); g.globalAlpha = 1;
});
const T_ROCK = tex(72, 60, g => {
  g.fillStyle = '#5b6068'; g.beginPath(); g.moveTo(8, 48); g.lineTo(14, 22); g.lineTo(32, 8); g.lineTo(54, 14); g.lineTo(66, 36); g.lineTo(58, 52); g.lineTo(20, 54); g.closePath(); g.fill();
  g.fillStyle = '#8a9099'; g.beginPath(); g.moveTo(14, 22); g.lineTo(32, 8); g.lineTo(54, 14); g.lineTo(40, 30); g.lineTo(18, 36); g.closePath(); g.fill();
  g.fillStyle = '#b5bbc4'; g.beginPath(); g.moveTo(24, 20); g.lineTo(34, 12); g.lineTo(46, 16); g.lineTo(34, 24); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 30); g.lineTo(58, 52); g.stroke();
});
const T_BUSH = tex(64, 56, g => {
  [[20, 36, 16, '#1d5a2a'], [44, 36, 16, '#1d5a2a'], [32, 28, 18, '#27763a'], [26, 24, 11, '#3a9a4a']].forEach(b => { g.fillStyle = b[3]; circ(g, b[0], b[1], b[2]); });
  g.fillStyle = '#e53935'; [[22, 30], [38, 26], [32, 40], [46, 36], [16, 40], [30, 20]].forEach(b => circ(g, b[0], b[1], 3.6));
  g.fillStyle = '#ff8a80'; [[21, 29], [37, 25], [31, 39]].forEach(b => circ(g, b[0], b[1], 1.2));
});
const T_TUFT = tex(24, 20, g => { g.strokeStyle = '#2d6b2e'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(12, 19); g.quadraticCurveTo(12 + (i - 2.5) * 3, 10, 12 + (i - 2.5) * 5, 2 + (i % 2) * 3); g.stroke(); } });
const T_FLOWER = tex(16, 16, g => { g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) circ(g, 8 + Math.cos(i * 1.256) * 3.5, 8 + Math.sin(i * 1.256) * 3.5, 2.6); g.fillStyle = '#ffd54f'; circ(g, 8, 8, 2.2); });
const T_PEBBLE = tex(14, 10, g => { g.fillStyle = '#9aa0a8'; ell(g, 7, 5, 6, 4); g.fillStyle = '#c5cad2'; ell(g, 5.5, 3.5, 2.5, 1.5); });
const T_FLAME = tex(64, 100, g => {
  const gr = g.createRadialGradient(32, 70, 2, 32, 62, 38); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(.35, 'rgba(255,200,60,.95)'); gr.addColorStop(.7, 'rgba(255,110,20,.6)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(50, 36, 62, 56, 48, 82); g.bezierCurveTo(42, 96, 22, 96, 16, 82); g.bezierCurveTo(2, 56, 20, 40, 32, 2); g.fill();
});

// ---- hand-held tools and back items (drawn facing +x, origin at body centre) ----
const stroke = (g, c, w, x1, y1, x2, y2) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
const poly = (g, c, pts) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
const FRONTS = {
  axe: g => { stroke(g, '#7b4f24', 3, 10, 18, 30, 8); poly(g, '#cfd8dc', [26, 2, 34, 6, 30, 14]); },
  gun: g => { g.fillStyle = '#37474f'; g.fillRect(10, 8, 22, 6); g.fillStyle = '#90a4ae'; g.fillRect(26, 9, 8, 4); },
  flare: g => { g.fillStyle = '#fff59d'; circ(g, 22, 12, 4); },
  dagger: g => { stroke(g, '#cfd8dc', 3, 12, 14, 30, 8); stroke(g, '#6d4c41', 4, 10, 15, 14, 13); },
  pick: g => { stroke(g, '#7b4f24', 3, 10, 18, 30, 6); poly(g, '#90a4ae', [24, -2, 38, 6, 33, 11, 22, 4]); },
  torch: g => { stroke(g, '#6d4c41', 3, 10, 18, 26, 11); g.fillStyle = '#ff6d00'; circ(g, 29, 9, 6); g.fillStyle = '#ffee58'; circ(g, 29, 9, 3); },
  shield: g => { g.fillStyle = '#546e7a'; circ(g, 16, -17, 11); g.strokeStyle = '#263238'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#b0bec5'; circ(g, 16, -17, 5); },
  bow: g => { g.strokeStyle = '#8d6e63'; g.lineWidth = 3; g.beginPath(); g.arc(24, 0, 17, -1.2, 1.2); g.stroke(); stroke(g, '#eeeeee', 1, 24 + 17 * Math.cos(-1.2), 17 * Math.sin(-1.2), 24 + 17 * Math.cos(1.2), 17 * Math.sin(1.2)); },
  sword: g => { stroke(g, '#e0e0e0', 3, 12, 16, 36, 8); stroke(g, '#ffd54f', 3, 13, 11, 15, 20); },
  wrench: g => { stroke(g, '#9e9e9e', 4, 10, 18, 28, 8); g.fillStyle = '#bdbdbd'; circ(g, 31, 7, 6); g.fillStyle = '#37474f'; circ(g, 33, 6, 2.5); },
  staff: g => { stroke(g, '#6d4c41', 3, 6, 22, 32, -8); g.fillStyle = '#4db6ac'; circ(g, 33, -9, 5); g.fillStyle = '#e0f7fa'; circ(g, 32, -10, 2); },
  greataxe: g => { stroke(g, '#5d4037', 4, 6, 22, 30, 4); poly(g, '#b0bec5', [24, -8, 40, 0, 38, 14, 26, 10]); poly(g, '#e57373', [26, -4, 36, 1, 35, 9, 28, 7]); },
  lantern: g => { stroke(g, '#6d4c41', 2, 12, 16, 22, 13); g.fillStyle = '#ffee58'; g.fillRect(22, 8, 9, 11); g.strokeStyle = '#5d4037'; g.lineWidth = 2; g.strokeRect(22, 8, 9, 11); },
  clover: g => { g.fillStyle = '#66bb6a'; [[22, 8], [28, 8], [22, 14], [28, 14]].forEach(a => circ(g, a[0], a[1], 4)); stroke(g, '#2e7d32', 2, 25, 14, 20, 20); },
  fireorb: g => { g.fillStyle = '#ff5722'; circ(g, 26, 12, 8); g.fillStyle = '#ffab00'; circ(g, 26, 12, 5); g.fillStyle = '#fff59d'; circ(g, 26, 12, 2.5); },
  banner: g => { stroke(g, '#bdbdbd', 3, 14, 18, 28, -10); poly(g, '#e53935', [28, -10, 40, -6, 30, 1]); },
  twindagger: g => { stroke(g, '#e0e0e0', 3, 12, 15, 30, 20); stroke(g, '#e0e0e0', 3, 12, -15, 30, -20); },
  blade: g => { g.shadowColor = '#ffe082'; g.shadowBlur = 8; stroke(g, '#fff59d', 4, 10, 16, 38, 6); g.shadowBlur = 0; stroke(g, '#ffb300', 3, 12, 11, 15, 21); },
};
const BACKS = {
  radio: g => { stroke(g, '#cfd8dc', 2, -14, -6, -26, -16); g.fillStyle = '#546e7a'; g.fillRect(-18, -10, 10, 14); },
  medpack: g => { g.fillStyle = '#eceff1'; g.fillRect(-18, -9, 12, 18); g.fillStyle = '#e53935'; g.fillRect(-14, -6, 4, 12); g.fillRect(-17, -3, 10, 4); },
  pack: g => { g.fillStyle = '#6d4c41'; g.fillRect(-19, -9, 12, 18); g.fillStyle = '#8d6e63'; g.fillRect(-17, -6, 8, 6); },
  basket: g => { g.fillStyle = '#a1887f'; ell(g, -14, 0, 8, 11); g.fillStyle = '#e53935'; circ(g, -16, -3, 2.5); circ(g, -12, 2, 2.5); circ(g, -15, 5, 2.5); },
  quiver: g => { g.fillStyle = '#5d4037'; g.fillRect(-19, -7, 8, 15); stroke(g, '#cfd8dc', 1.5, -17, -7, -20, -14); stroke(g, '#cfd8dc', 1.5, -14, -7, -15, -15); },
};
function mkPlayerCanvas(L) {
  return cv2(64, 64, g => {
    g.translate(32, 32); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.5)';
    if (BACKS[L[4]]) BACKS[L[4]](g);
    g.fillStyle = L[1]; ell(g, -2, 0, 12, 19); g.stroke();
    g.fillStyle = L[0]; ell(g, -3, -1, 10, 16);
    g.fillStyle = '#f0c8a0'; circ(g, 12, -16, 5); circ(g, 12, 16, 5);
    if (FRONTS[L[3]]) FRONTS[L[3]](g);
    g.fillStyle = '#f0c8a0'; circ(g, 2, 0, 11); g.stroke();
    g.fillStyle = L[2]; g.beginPath(); g.arc(2, 0, 11, Math.PI * .5, Math.PI * 1.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; circ(g, 5, -4, 3);
  });
}
const T_PL = {}, PCAN = {};
GC.LIST.forEach(c => { const cv = mkPlayerCanvas(c.look); PCAN[c.id] = cv; T_PL[c.id] = PIXI.Texture.from(cv); });
const T_ALIEN = tex(84, 84, g => {
  g.translate(42, 42);
  g.strokeStyle = '#2a0c3c'; g.lineWidth = 4; g.lineCap = 'round';
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + .2; g.beginPath(); g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); g.lineTo(Math.cos(a + .25) * 28, Math.sin(a + .25) * 28); g.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); g.stroke(); }
  const gr = g.createRadialGradient(-4, -4, 2, 0, 0, 24); gr.addColorStop(0, '#b45fe0'); gr.addColorStop(.6, '#6b2191'); gr.addColorStop(1, '#2e0b46');
  g.fillStyle = gr; circ(g, 0, 0, 24); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(0,0,0,.25)'; circ(g, -8, 6, 6); circ(g, -4, -10, 4);
  g.fillStyle = '#d4ff3a'; circ(g, 12, -7, 3.4); circ(g, 12, 7, 3.4);
});

// ---------- renderer ----------
const app = new PIXI.Application({ resizeTo: window, backgroundColor: 0x0d2a40, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
document.body.insertBefore(app.view, document.body.firstChild);
app.view.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
const stage = app.stage;
let W = innerWidth, H = innerHeight, Z = 1;

const WATER_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vTextureCoord;
uniform float uTime; uniform vec2 uCam; uniform vec2 uRes; uniform float uZoom; uniform float uR;
float edge(float a){return uR+16.*sin(3.*a+1.3)+9.*sin(7.*a+.4)+5.*sin(13.*a+2.1);}
void main(){
  vec2 px=(vTextureCoord-.5)*uRes;
  vec2 p=uCam+px/uZoom;
  float d=length(p)-edge(atan(p.y,p.x));
  float t=uTime;
  float w=(sin(p.x*.045+t*.9)+sin(p.y*.05-t*1.1)+sin((p.x*.7+p.y)*.03+t*.6)+sin(length(p)*.06-t*1.4))*.25;
  vec3 deep=vec3(.03,.13,.24),mid=vec3(.07,.33,.46),shallow=vec3(.22,.62,.62);
  float k=clamp(d/260.,0.,1.);
  vec3 c=mix(shallow,mid,smoothstep(0.,.35,k)); c=mix(c,deep,smoothstep(.25,1.,k));
  c+=vec3(.04,.07,.09)*w;
  float g=smoothstep(.5,.95,w+.12*sin(p.x*.2+t*2.)*sin(p.y*.2-t*1.7));
  c+=vec3(.5,.7,.8)*g*.1*(1.-k*.6);
  float f1=exp(-pow((d-(10.+7.*sin(t*1.2)))/7.,2.));
  float f2=exp(-pow((d-(34.+10.*sin(t*1.2+1.5)))/5.,2.))*.55*(.5+.5*sin(p.x*.08+p.y*.06+t));
  c=mix(c,vec3(.93,.98,1.),clamp(f1*.85+f2,0.,1.));
  gl_FragColor=vec4(c,1.);
}`;
const water = new PIXI.Sprite(PIXI.Texture.WHITE);
const waterF = new PIXI.Filter(undefined, WATER_FRAG, { uTime: 0, uCam: [0, 0], uRes: [W, H], uZoom: 1, uR: RR });
water.filters = [waterF]; stage.addChild(water);

const world = new PIXI.Container(), overL = new PIXI.Container();
const ground = new PIXI.Container(), ents = new PIXI.Container(), pfx = new PIXI.Container();
ents.sortableChildren = true; world.addChild(ground, pfx, ents); stage.addChild(world);

// lighting: dark layer rendered to a half-res texture with erased holes
const LS = .5; let rt = null; const lightCont = new PIXI.Container(), darkBase = new PIXI.Sprite(PIXI.Texture.WHITE), lightSpr = new PIXI.Sprite();
lightCont.addChild(darkBase); const lightPool = [];
function getLight(i) { if (!lightPool[i]) { const s = new PIXI.Sprite(T_LIGHT); s.anchor.set(.5); s.blendMode = BM.ERASE; lightCont.addChild(s); lightPool[i] = s; } return lightPool[i]; }
stage.addChild(lightSpr);
const fogC = new PIXI.Container(); stage.addChild(fogC);
const fogs = []; for (let i = 0; i < 6; i++) { const s = new PIXI.Sprite(T_GLOW); s.anchor.set(.5); s.tint = 0x9db4dc; s.alpha = 0; s.ph = rnd(0, TAU); s.sp = rnd(.05, .12); s.sc = rnd(.9, 1.5); fogC.addChild(s); fogs.push(s); }
stage.addChild(overL);
const flies = []; for (let i = 0; i < 22; i++) { const s = new PIXI.Sprite(T_GLOW); s.anchor.set(.5); s.tint = 0xd8ff6a; s.blendMode = BM.ADD; s.scale.set(.14); s.fx = rnd(-380, 380); s.fy = rnd(-380, 380); s.ph = rnd(0, TAU); overL.addChild(s); flies.push(s); }

function resize() {
  W = innerWidth; H = innerHeight; Z = Math.min(W, H) / 620;
  water.width = W; water.height = H; waterF.uniforms.uRes = [W, H]; waterF.uniforms.uZoom = Z;
  if (rt) rt.destroy(true);
  rt = PIXI.RenderTexture.create({ width: Math.ceil(W * LS), height: Math.ceil(H * LS) });
  lightSpr.texture = rt; lightSpr.scale.set(1 / LS);
}
addEventListener('resize', resize); resize();

// ---------- world building (after server init) ----------
let resNodes = [], built = false, fireStones = null;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function buildWorld(list) {
  waterF.uniforms.uR = RR;
  const poly = fn => { const p = []; for (let i = 0; i < 200; i++) { const a = i / 200 * TAU, r = fn(a); p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; };
  const shore = new PIXI.Graphics(); shore.beginFill(0x9d8c58, .5); shore.drawPolygon(poly(a => edge(a) + 10)); shore.endFill(); ground.addChild(shore);
  const sand = new PIXI.TilingSprite(T_SAND, RR * 2 + 120, RR * 2 + 120); sand.position.set(-RR - 60, -RR - 60);
  const sm = new PIXI.Graphics(); sm.beginFill(0xffffff); sm.drawPolygon(poly(a => edge(a))); sm.endFill(); sand.mask = sm; ground.addChild(sm, sand);
  const grassR = a => edge(a) - 55 + 10 * Math.sin(5 * a + .7) + 6 * Math.sin(11 * a);
  const gr = new PIXI.TilingSprite(T_GRASS, RR * 2, RR * 2); gr.position.set(-RR, -RR);
  const gm = new PIXI.Graphics(); gm.beginFill(0xffffff); gm.drawPolygon(poly(grassR)); gm.endFill(); gr.mask = gm;
  const rim = new PIXI.Graphics(); rim.lineStyle(10, 0x25552a, .35); rim.drawPolygon(poly(a => grassR(a) - 4)); rim.lineStyle(0);
  ground.addChild(gm, gr, rim);
  const dirt = new PIXI.Graphics(); dirt.beginFill(0x5e4526, .5); dirt.drawCircle(0, 0, 78); dirt.beginFill(0x3d2c17, .55); dirt.drawCircle(0, 0, 46); dirt.endFill(); ground.addChild(dirt);
  const rng = mulberry(7);
  for (let i = 0; i < 320; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (RR - 110); if (d < 90) continue;
    const k = rng(); const s = new PIXI.Sprite(k < .6 ? T_TUFT : k < .85 ? T_FLOWER : T_PEBBLE);
    s.anchor.set(.5, .9); s.position.set(Math.cos(a) * d, Math.sin(a) * d); s.scale.set(.8 + rng() * .6); s.rotation = (rng() - .5) * .4;
    if (k >= .6 && k < .85) s.tint = [0xffffff, 0xff8aa0, 0xffe066, 0xa0c4ff][i % 4];
    ground.addChild(s);
  }
  // fire pit stones
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, s = new PIXI.Sprite(T_ROCK); s.anchor.set(.5, .8); s.scale.set(.26); s.position.set(Math.cos(a) * 30, Math.sin(a) * 30 + 4); s.zIndex = s.y; s.tint = 0xbbbbbb; ents.addChild(s); }
  // resources
  list.forEach((r, i) => {
    const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); c.addChild(sh);
    let s;
    if (r[0] === 't') { s = new PIXI.Sprite(T_TREE); s.anchor.set(.5, .88); s.scale.set(.62 + (i % 5) * .03); sh.scale.set(1.7, .8); sh.y = 4; }
    else if (r[0] === 'r') { s = new PIXI.Sprite(T_ROCK); s.anchor.set(.5, .8); s.scale.set(.6); sh.scale.set(1.1, .6); sh.y = 4; }
    else { s = new PIXI.Sprite(T_BUSH); s.anchor.set(.5, .8); s.scale.set(.62); sh.scale.set(1, .5); sh.y = 4; }
    c.addChild(s); c.position.set(r[1], r[2]); c.zIndex = r[2]; ents.addChild(c);
    resNodes.push({ c, s, k: r[0], x: r[1], y: r[2], pop: 1, alive: true, ph: rnd(0, TAU), base: s.scale.x });
  });
  built = true;
}

// campfire visuals (above darkness)
const flames = [0, 1, 2].map(i => { const s = new PIXI.Sprite(T_FLAME); s.anchor.set(.5, .9); s.blendMode = BM.ADD; overL.addChild(s); return s; });
const fireGlow = new PIXI.Sprite(T_GLOW); fireGlow.anchor.set(.5); fireGlow.blendMode = BM.ADD; fireGlow.tint = 0xff8a30; overL.addChildAt(fireGlow, 0);
const ring = new PIXI.Sprite(T_RING); ring.anchor.set(.5); ring.blendMode = BM.ADD; ring.tint = 0xffc266; overL.addChildAt(ring, 0);

// ---------- particles ----------
const parts = [];
function emit(layer, t, x, y, vx, vy, life, s0, s1, col, a0, add, g) {
  const s = new PIXI.Sprite(t); s.anchor.set(.5); s.position.set(x, y); s.tint = col; s.blendMode = add ? BM.ADD : BM.NORMAL; s.scale.set(s0); layer.addChild(s);
  parts.push({ s, vx, vy, life, max: life, s0, s1, a0, g: g || 0 });
}
function burst(x, y, n, col, speed, add, size) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(.3, 1) * speed; emit(add ? overL : pfx, T_GLOW, x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(.3, .6), size || .12, 0, col, 1, add, 0); } }
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { p.s.destroy(); parts.splice(i, 1); continue; }
    const k = 1 - p.life / p.max; p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.vy += p.g * dt; p.s.scale.set(p.s0 + (p.s1 - p.s0) * k); p.s.alpha = p.a0 * (1 - k);
  }
}
function floatText(x, y, txt, col) {
  const t = new PIXI.Text(txt, { fontFamily: 'system-ui,sans-serif', fontSize: 16, fontWeight: '800', fill: col, stroke: 0x000000, strokeThickness: 4 });
  t.anchor.set(.5); t.position.set(x, y - 30); t.resolution = 2; overL.addChild(t); ftexts.push({ t, life: 1.1 });
}
const ftexts = [];

// ---------- entities ----------
let S = null, myId = 0, roomCode = '', tipUntil = 0, ws = null, T = 0, shake = 0, lastInv = null, lastHp = null;
const ents2 = {}; // key -> {x,y,tx,ty,node...}
function mkPlayer(p) {
  const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(.8, .5); sh.y = 8; sh.alpha = .9;
  const body = new PIXI.Sprite(T_PL[p[2]]); body.anchor.set(.5); body.scale.set(.85);
  const name = new PIXI.Text(p[1], { fontFamily: 'system-ui,sans-serif', fontSize: 13, fontWeight: '700', fill: 0xffffff, stroke: 0x000000, strokeThickness: 3 }); name.anchor.set(.5, 1); name.y = -30; name.resolution = 2;
  const hp = new PIXI.Graphics(); hp.y = 28; c.addChild(sh, body, name, hp); ents.addChild(c);
  return { c, body, name, hp, ang: 0, lh: -1, ld: -1, dust: 0, kind: 'p' };
}
function mkAlien(a) {
  const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(a[5] ? 1.8 : 1, a[5] ? .9 : .55); sh.y = 6;
  const body = new PIXI.Sprite(T_ALIEN); body.anchor.set(.5); const sc = a[5] ? .95 : .5; body.scale.set(sc); if (a[5]) body.tint = 0xff9ad0;
  const hp = new PIXI.Graphics(); c.addChild(sh, body, hp); ents.addChild(c); c.alpha = 0;
  const eyes = [0, 1].map(() => { const s = new PIXI.Sprite(T_GLOW); s.anchor.set(.5); s.tint = 0xc6ff2a; s.blendMode = BM.ADD; s.scale.set(a[5] ? .42 : .24); overL.addChild(s); return s; });
  return { c, body, hp, eyes, sc, big: !!a[5], ang: 0, age: 0, lh: -1, kind: 'a', flash: 0 };
}
function drawHp(g, w, f, col) { g.clear(); g.beginFill(0x000000, .55); g.drawRoundedRect(-w / 2, 0, w, 5, 2); g.endFill(); g.beginFill(col); g.drawRoundedRect(-w / 2, 0, Math.max(0, w * f), 5, 2); g.endFill(); }
function angLerp(a, b, k) { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * k; }

function onSnap(m) {
  const prevS = S; S = m; const seen = {};
  const meE = ents2['p' + myId], _d = (x, y) => meE ? Math.hypot(x - meE.x, y - meE.y) : 0, _dx = x => meE ? x - meE.x : 0;
  for (const p of m.p) {
    const k = 'p' + p[0]; seen[k] = 1; let e = ents2[k];
    if (!e) { e = ents2[k] = mkPlayer(p); e.x = e.tx = p[3]; e.y = e.ty = p[4]; e.c.position.set(e.x, e.y); }
    e.tx = p[3]; e.ty = p[4]; e.d = p;
  }
  for (const a of m.a) {
    const k = 'a' + a[0]; seen[k] = 1; let e = ents2[k];
    if (!e) { e = ents2[k] = mkAlien(a); e.x = e.tx = a[1]; e.y = e.ty = a[2]; e.c.position.set(e.x, e.y); }
    if (e.lh >= 0 && a[3] < e.lh) { e.flash = .12; burst(e.x, e.y, 6, 0xc6ff2a, 120, true, .1); SFX.hit(_d(e.x, e.y), _dx(e.x)); }
    e.lh = a[3]; e.tx = a[1]; e.ty = a[2]; e.d = a;
  }
  for (const k in ents2) if (!seen[k]) {
    const e = ents2[k];
    if (e.kind === 'a') { SFX.alienDie(_d(e.x, e.y), _dx(e.x)); burst(e.x, e.y, 14, 0xb45fe0, 160, true, .2); burst(e.x, e.y, 8, 0xc6ff2a, 90, true, .12); e.eyes.forEach(s => s.destroy()); }
    e.c.destroy({ children: true }); delete ents2[k];
  }
  if (built) for (let i = 0; i < resNodes.length; i++) {
    const r = resNodes[i], al = m.r[i] === '1';
    if (r.alive && !al) { (r.k === 't' ? SFX.chop : r.k === 'r' ? SFX.mine : SFX.pick)(_d(r.x, r.y), _dx(r.x)); burst(r.x, r.y - 8, 10, r.k === 't' ? 0x5fbf5a : r.k === 'r' ? 0xb0b6be : 0xe53935, 140, false, .12); r.c.visible = false; }
    if (!r.alive && al) { r.c.visible = true; r.pop = 0; }
    r.alive = al;
  }
  const mp = m.p.find(p => p[0] === myId);
  if (mp) {
    if (lastInv) { const dw = mp[7] - lastInv[0], ds = mp[8] - lastInv[1], df = mp[9] - lastInv[2], e = ents2['p' + myId];
      if (e) { if (dw > 0) floatText(e.x, e.y, '+' + dw + ' wood', 0xffcc80); if (ds > 0) floatText(e.x, e.y, '+' + ds + ' stone', 0xcfd8dc); if (df > 0) floatText(e.x, e.y, '+' + df + ' food', 0xff8a80); } }
    lastInv = [mp[7], mp[8], mp[9]];
    if (lastHp !== null && mp[5] < lastHp) { shake = .3; SFX.hurt(); const h = $('hurt'); h.style.opacity = '1'; setTimeout(() => h.style.opacity = '0', 120); }
    lastHp = mp[5];
  }
  if (prevS && m.n > prevS.n) floatText(0, -120, 'Night ' + m.n + ' begins', 0xffffff);
  if (prevS) {
    if (m.ph !== prevS.ph) { if (m.ph === 1) SFX.horn(); else if (m.ph === 2) SFX.night(); else SFX.dawn(); }
    if (m.f[0] > prevS.f[0] + 5) SFX.feed();
    if (m.f[2] > prevS.f[2]) SFX.levelup();
    if (prevS.f[0] > 0 && m.f[0] <= 0) SFX.fireOut();
    for (const p of m.p) { const o = prevS.p.find(q => q[0] === p[0]); if (!o) continue; if (!o[10] && p[10] && p[0] === myId) SFX.down(); if (o[10] && !p[10]) SFX.revive(); }
  }
}

// ---------- frame ----------
function darkness(c) { return c < 5 ? .74 * (1 - c / 5) : c < 90 ? 0 : c < 120 ? .74 * (c - 90) / 30 : .74; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const rgb = c => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
let camX = 0, camY = 0, fireTick = 0, smokeTick = 0;

app.ticker.add(() => {
  const dt = Math.min(.1, app.ticker.deltaMS / 1000); T += dt;
  const me = ents2['p' + myId];
  if (!S || !me || !built) return;
  water.visible = true;
  // smoothing + node updates
  for (const k in ents2) {
    const e = ents2[k], f = Math.min(1, dt * 14), ox = e.x, oy = e.y;
    e.x += (e.tx - e.x) * f; e.y += (e.ty - e.y) * f;
    const vx = (e.x - ox) / dt, vy = (e.y - oy) / dt, sp = Math.hypot(vx, vy);
    e.c.position.set(e.x, e.y); e.c.zIndex = e.y;
    if (e.kind === 'p') {
      const p = e.d, down = p[10];
      if (sp > 12 && !down) e.ang = angLerp(e.ang, Math.atan2(vy, vx), Math.min(1, dt * 12));
      e.body.rotation = down ? 1.2 : e.ang; e.body.tint = down ? 0x777777 : 0xffffff;
      e.body.y = down ? 0 : Math.sin(T * 16 + e.x) * (sp > 12 ? 1.8 : .4); e.body.scale.y = (down ? .6 : .85) * (1 + (sp > 12 ? Math.sin(T * 16) * .04 : 0));
      if (e.lh !== p[5] || e.ld !== p[10] || e.lr !== p[11]) { e.lh = p[5]; e.ld = p[10]; e.lr = p[11]; if (p[10]) drawHp(e.hp, 40, Math.min(1, p[11] / 3), 0x4caf50); else drawHp(e.hp, 34, p[5] / p[6], 0xef5350); }
      if (sp > 30 && !down) { e.st = (e.st || 0) - dt; if (e.st <= 0) { e.st = .3; SFX.step(Math.hypot(e.x - me.x, e.y - me.y), e.x - me.x); } e.dust -= dt; if (e.dust <= 0) { e.dust = .14; emit(pfx, T_GLOW, e.x, e.y + 8, rnd(-8, 8), rnd(-8, 4), .5, .12, .3, 0xd9c79a, .35, false, 0); } }
    } else {
      const a = e.d; e.age += dt; e.c.alpha = Math.min(1, e.age * 2);
      if (sp > 8) e.ang = angLerp(e.ang, Math.atan2(vy, vx), Math.min(1, dt * 8));
      e.body.rotation = e.ang; const pulse = 1 + Math.sin(T * 9 + e.x * .1) * .05; e.body.scale.set(e.sc * pulse);
      if (S.ph === 2 && Math.random() < dt * .12) { const gd = Math.hypot(e.x - me.x, e.y - me.y); if (gd < 520) SFX.growl(gd, e.x - me.x); }
      e.flash = Math.max(0, e.flash - dt); e.body.tint = e.flash > 0 ? 0xffffff : e.big ? 0xff9ad0 : 0xffffff;
      if (a[3] < a[4] && e.lh2 !== a[3]) { e.lh2 = a[3]; drawHp(e.hp, e.big ? 50 : 26, a[3] / a[4], 0xb6ff3c); e.hp.y = e.big ? -42 : -26; e.hp.visible = true; }
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang), o = e.big ? 20 : 10, sy = e.big ? 12 : 6;
      e.eyes[0].position.set(e.x + ca * o - sa * -sy, e.y + sa * o + ca * -sy); e.eyes[1].position.set(e.x + ca * o - sa * sy, e.y + sa * o + ca * sy);
      e.eyes.forEach(s => s.alpha = e.c.alpha * (.75 + Math.sin(T * 6 + e.x) * .25));
    }
  }
  // resources: sway + pop-in
  for (const r of resNodes) if (r.c.visible) {
    if (r.pop < 1) { r.pop = Math.min(1, r.pop + dt * 2.5); const b = 1 - Math.pow(1 - r.pop, 3); r.s.scale.set(r.base * (.2 + .8 * b)); }
    if (r.k === 't') r.s.skew.x = Math.sin(T * 1.3 + r.ph) * .035 + Math.sin(T * 3.1 + r.ph) * .01;
    else if (r.k === 'b') r.s.skew.x = Math.sin(T * 2 + r.ph) * .02;
  }
  // camera
  camX += (me.x - camX) * Math.min(1, dt * 10); camY += (me.y - camY) * Math.min(1, dt * 10);
  if (T < 1) { camX = me.x; camY = me.y; }
  shake = Math.max(0, shake - dt); const sx = shake > 0 ? rnd(-1, 1) * shake * 18 : 0, sy2 = shake > 0 ? rnd(-1, 1) * shake * 18 : 0;
  const ox = W / 2 - camX * Z + sx, oy = H / 2 - camY * Z + sy2;
  world.position.set(ox, oy); world.scale.set(Z); overL.position.set(ox, oy); overL.scale.set(Z);
  waterF.uniforms.uTime = T; waterF.uniforms.uCam = [camX - sx / Z, camY - sy2 / Z];
  // campfire
  const f = S.f, fuelK = clamp(f[0] / f[1], 0, 1), alive = f[0] > 0, fl = 1 + Math.sin(T * 17) * .06 + Math.sin(T * 29) * .04;
  flames.forEach((s, i) => { s.visible = alive; const w = (.5 + .5 * fuelK) * (1 - i * .22) * fl; s.scale.set(w * (1 + Math.sin(T * (9 + i * 3) + i) * .08), w * (1 + Math.sin(T * (13 + i * 4) + i * 2) * .14)); s.rotation = Math.sin(T * (6 + i * 2) + i) * .08; s.position.set((i - 1) * 4, 6); });
  fireGlow.visible = alive; fireGlow.position.set(0, -6); fireGlow.scale.set((1.6 + fuelK * 1.4) * fl); fireGlow.alpha = .55;
  ring.visible = alive; ring.scale.set(f[3] * 2 / 256 * 1.0); ring.alpha = .35 + Math.sin(T * 2) * .08;
  if (alive) { fireTick += dt * (20 + 40 * fuelK); while (fireTick > 1) { fireTick--; emit(overL, T_GLOW, rnd(-8, 8), -2, rnd(-14, 14), rnd(-70, -35), rnd(.6, 1.3), .08, .01, Math.random() < .5 ? 0xffb347 : 0xffe08a, 1, true, -10); } }
  smokeTick += dt * (alive ? 4 : 9); while (smokeTick > 1) { smokeTick--; emit(pfx, T_GLOW, rnd(-6, 6), -14, rnd(-6, 6), rnd(-26, -14), 2.2, .25, .9, alive ? 0x555555 : 0x444444, alive ? .22 : .35, false, 0); }
  stepParts(dt);
  for (let i = ftexts.length - 1; i >= 0; i--) { const q = ftexts[i]; q.life -= dt; q.t.y -= dt * 34; q.t.alpha = clamp(q.life * 2, 0, 1); if (q.life <= 0) { q.t.destroy(); ftexts.splice(i, 1); } }
  // lighting
  const d = darkness(S.c);
  let col, al;
  if (S.c >= 90 && S.c < 120) { const k = (S.c - 90) / 30; col = mix([255, 140, 70], [10, 14, 46], Math.pow(k, .7)); al = .12 + (d - .12) * k; } else { col = [10, 14, 46]; al = d; }
  darkBase.visible = d > .005; darkBase.width = rt.width; darkBase.height = rt.height; darkBase.tint = rgb(col); darkBase.alpha = al;
  if (darkBase.visible) {
    let li = 0;
    if (alive) { const L = getLight(li++); L.visible = true; L.position.set((W / 2 + (0 - camX) * Z + sx) * LS, (H / 2 + (0 - camY) * Z + sy2) * LS); const r = f[3] * 1.25 * Z * (1 + Math.sin(T * 13) * .012); L.scale.set(r * 2 * LS / 128); }
    for (const p of S.p) { const e = ents2['p' + p[0]]; if (!e) continue; const L = getLight(li++); L.visible = true; L.position.set((W / 2 + (e.x - camX) * Z + sx) * LS, (H / 2 + (e.y - camY) * Z + sy2) * LS); L.scale.set(((GC.BY[p[2]] || GC.BY.forester).light) * Z * 2 * LS / 128); L.alpha = p[10] ? .3 : 1; }
    for (let j = li; j < lightPool.length; j++) lightPool[j].visible = false;
    app.renderer.render(lightCont, { renderTexture: rt, clear: true });
  }
  lightSpr.visible = darkBase.visible;
  // fog + fireflies react to darkness
  const nk = d / .74;
  fogs.forEach(s => { s.visible = nk > .05; s.alpha = .13 * nk; s.scale.set(Math.max(W, H) / 128 * s.sc * 1.2); s.position.set(W / 2 + Math.sin(T * s.sp + s.ph) * W * .35 - camX * .15 % 50, H / 2 + Math.cos(T * s.sp * .8 + s.ph) * H * .3); });
  flies.forEach(s => { s.visible = nk > .1; if (!s.visible) return; s.position.set(camX + s.fx + Math.sin(T * .6 + s.ph) * 40, camY + s.fy + Math.cos(T * .5 + s.ph) * 30); s.alpha = nk * (.4 + .6 * Math.abs(Math.sin(T * 1.7 + s.ph))); });
  const md = Math.hypot(me.x, me.y);
  SFX.update({ night: d / .74, shore: clamp(1 - (edge(Math.atan2(me.y, me.x)) - md) / 260, 0, 1), fire: alive ? clamp(1 - md / 520, 0, 1) : 0, alive });
  hud(me);
});

// ---------- HUD (DOM) ----------
function hud() {
  const f = S.f, mp = S.p.find(p => p[0] === myId), PH = ['DAY', 'DUSK', 'NIGHT'][S.ph], left = Math.ceil(S.ph === 0 ? 90 - S.c : S.ph === 1 ? 120 - S.c : 180 - S.c);
  $('t1').textContent = 'Night ' + S.n + ' · ' + PH + ' ' + left + 's · 🔥 Lv' + f[2];
  $('bar').firstElementChild.style.width = (100 * f[0] / f[1]) + '%';
  if (mp) $('inv').textContent = '🪵' + mp[7] + '  🪨' + mp[8] + '  🍓' + mp[9] + '   ❤ ' + mp[5] + '/' + mp[6];
  $('pl').textContent = S.p.length + ' player' + (S.p.length > 1 ? 's' : '');
  const now = performance.now(); let b = '';
  if (S.o) b = 'Everyone is down... restarting';
  else if (mp && mp[10]) b = 'You are down - a teammate can revive you (hold ACT)';
  else if (S.ph === 1) b = (Math.floor(now / 500) % 2 ? '🌆 ' : '') + 'DUSK - get back to the fire!';
  else if (S.ph === 2 && f[0] <= 0) b = '⚠ The fire is out!';
  else if (f[0] > 0 && f[0] < 25) b = 'Fire is low - bring wood!';
  else if (now < tipUntil) b = 'ACT: chop trees / mine rocks / pick berries. Walk to the fire and ACT to add wood or upgrade (stone). HIT: fight aliens.';
  const bn = $('banner'); if (bn.textContent !== b) { bn.textContent = b; bn.style.fontSize = b.length > 60 ? '15px' : '22px'; }
}

// ---------- accounts (Google or emailed code) / lobby ----------
const post = async (path, body) => { try { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); } catch (e) { return { ok: false, err: 'Network problem. Check your connection.' }; } };
let token = '', myEmail = '', cfg = {};
try { token = localStorage.getItem('tok') || ''; } catch (e) { }
const PF = { d: 0, owned: GC.DEFAULT_OWNED.slice() };
let sel = 'forester', hadCls = false; try { const sc = localStorage.getItem('cls'); if (sc) { sel = sc; hadCls = true; } } catch (e) { }
function chosen() { const c = GC.BY[sel] || GC.BY.forester; $('cIcon').textContent = c.e; $('cName').textContent = c.n; }
function setDia(n) { PF.d = n; document.querySelectorAll('.diaN').forEach(e => e.textContent = n); }
function applyProfile(pr, useLast) {
  PF.owned = pr.owned; setDia(pr.d);
  if (useLast || !PF.owned.includes(sel)) sel = PF.owned.includes(pr.last) ? pr.last : 'forester';
  try { localStorage.setItem('cls', sel); } catch (e) { }
  chosen(); buildPicker();
}
try { $('name').value = localStorage.getItem('nm') || ''; } catch (e) { }
const q = new URLSearchParams(location.search).get('room'); if (q) $('room').value = q;

// class picker
const TIERS = [[0, 'Unlocked'], [50, 'Tier 1 · 50 💎'], [120, 'Tier 2 · 120 💎'], [250, 'Tier 3 · 250 💎'], [400, 'Tier 4 · 400 💎']];
function buildPicker() {
  const box = $('grid'); box.innerHTML = '';
  for (const [price, title] of TIERS) {
    const h = document.createElement('div'); h.className = 'tier'; h.textContent = title; box.appendChild(h);
    const row = document.createElement('div'); row.className = 'row'; box.appendChild(row);
    for (const c of GC.LIST.filter(x => x.price === price)) {
      const owned = PF.owned.includes(c.id), d = document.createElement('div'); d.className = 'card' + (c.id === sel ? ' sel' : '') + (owned ? '' : ' locked');
      const cvs = document.createElement('canvas'); cvs.width = cvs.height = 64; cvs.getContext('2d').drawImage(PCAN[c.id], 0, 0); d.appendChild(cvs);
      const st = '❤' + c.hp + '  ⚔' + c.dmg + '  👟' + c.spd;
      d.insertAdjacentHTML('beforeend', '<div class="cn">' + c.e + ' ' + c.n + '</div><div class="cd">' + c.d + '</div><div class="cs">' + st + '</div><div class="cb">' + (c.id === sel ? '✔ Selected' : owned ? 'Tap to select' : '🔒 ' + c.price + ' 💎') + '</div>');
      d.onclick = () => owned ? pick(c.id) : askBuy(c.id);
      row.appendChild(d);
    }
  }
}
function pick(id) { sel = id; try { localStorage.setItem('cls', id); } catch (e) { } chosen(); buildPicker(); $('picker').style.display = 'none'; }
let buying = null;
function askBuy(id) {
  const c = GC.BY[id]; buying = id; const need = c.price - PF.d;
  $('buyTxt').innerHTML = '<b>' + c.e + ' ' + c.n + '</b><br>' + c.d + '<br><br>Price: ' + c.price + ' 💎<br>You have: ' + PF.d + ' 💎' + (need > 0 ? '<br><span style="color:#ff8a80">Need ' + need + ' more 💎 (earn them by surviving nights)</span>' : '');
  $('buyGo').style.display = need > 0 ? 'none' : ''; $('buy').style.display = 'flex';
}
$('buyNo').onclick = () => { $('buy').style.display = 'none'; };
$('buyGo').onclick = async () => {
  $('buyGo').disabled = true;
  try {
    const r = await post('/api/buy', { token, cls: buying });
    if (r.err === 'auth') { logoutUI('Please sign in again.'); return; }
    if (r.ok) { applyProfile(r.profile); SFX.init(); SFX.levelup(); pick(buying); }
    else if (r.profile) { applyProfile(r.profile); buildPicker(); if (r.err === 'need') { } }
    if (!r.ok) { $('buyTxt').insertAdjacentHTML('beforeend', '<br><span style="color:#ff8a80">' + (r.err === 'need' ? 'Not enough 💎' : 'Could not buy') + '</span>'); }
  } catch (e) { }
  $('buyGo').disabled = false; $('buy').style.display = 'none';
};
$('chooseBtn').onclick = () => { buildPicker(); $('picker').style.display = 'flex'; };
$('pickDone').onclick = () => { $('picker').style.display = 'none'; };


// ---- sign in ----
function showLogin(msg) { $('login').style.display = 'flex'; $('lmsg').textContent = msg || ''; $('stepEmail').style.display = ''; $('stepCode').style.display = 'none'; }
function logoutUI(msg) { token = ''; myEmail = ''; try { localStorage.removeItem('tok'); } catch (e) { } if (ws) { try { ws.close(); } catch (e) { } ws = null; } myId = 0; $('picker').style.display = 'none'; $('buy').style.display = 'none'; showLogin(msg); }
function loggedIn(r) {
  token = r.token || token; myEmail = r.email; try { localStorage.setItem('tok', token); localStorage.removeItem('pid'); } catch (e) { }
  $('who').textContent = myEmail; $('login').style.display = 'none'; applyProfile(r.profile, !hadCls); hadCls = true; $('err').textContent = '';
}
const legacyPid = () => { try { return localStorage.getItem('pid') || ''; } catch (e) { return ''; } };
let pendingEmail = '';
$('sendCode').onclick = async () => {
  const em = $('email').value.trim(); if (!em) { $('lmsg').textContent = 'Enter your email address.'; return; }
  $('sendCode').disabled = true; $('lmsg').textContent = 'Sending...';
  const r = await post('/api/auth/email/start', { email: em });
  $('sendCode').disabled = false;
  if (r.ok) { pendingEmail = em; $('lmsg').textContent = ''; $('sentTo').textContent = em; $('stepEmail').style.display = 'none'; $('stepCode').style.display = ''; $('code').value = ''; $('code').focus(); }
  else $('lmsg').textContent = r.err || 'Could not send the code.';
};
$('email').addEventListener('keydown', e => { if (e.key === 'Enter') $('sendCode').click(); });
$('verify').onclick = async () => {
  const c = $('code').value.replace(/\D/g, ''); if (c.length !== 6) { $('lmsg').textContent = 'Enter the 6-digit code from the email.'; return; }
  $('verify').disabled = true; $('lmsg').textContent = 'Checking...';
  const r = await post('/api/auth/email/verify', { email: pendingEmail, code: c, pid: legacyPid() });
  $('verify').disabled = false;
  if (r.ok) loggedIn(r); else $('lmsg').textContent = r.err || 'Could not sign in.';
};
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('verify').click(); });
$('backEmail').onclick = () => { $('lmsg').textContent = ''; $('stepCode').style.display = 'none'; $('stepEmail').style.display = ''; };
$('signout').onclick = async () => { await post('/api/auth/logout', { token }); logoutUI(''); };
function initGoogle(clientId) {
  const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
  sc.onload = () => {
    google.accounts.id.initialize({ client_id: clientId, callback: async resp => {
      $('lmsg').textContent = 'Signing in...'; const r = await post('/api/auth/google', { credential: resp.credential, pid: legacyPid() });
      if (r.ok) loggedIn(r); else $('lmsg').textContent = r.err || 'Google sign-in failed.';
    }, auto_select: false });
    google.accounts.id.renderButton($('gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', width: 280 });
    $('gwrap').style.display = ''; $('orline').style.display = '';
  };
  sc.onerror = () => { $('gwrap').style.display = 'none'; };
  document.head.appendChild(sc);
}
function initApple(clientId) {
  const sc = document.createElement('script'); sc.async = true; sc.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
  sc.onload = () => {
    try { AppleID.auth.init({ clientId, scope: 'name email', redirectURI: location.origin + '/', usePopup: true }); } catch (e) { return; }
    $('awrap').style.display = ''; $('orline').style.display = '';
  };
  sc.onerror = () => { $('awrap').style.display = 'none'; };
  document.head.appendChild(sc);
  document.addEventListener('AppleIDSignInOnSuccess', async ev => {
    const cred = ev.detail && ev.detail.authorization && ev.detail.authorization.id_token; if (!cred) return;
    $('lmsg').textContent = 'Signing in...'; const r = await post('/api/auth/apple', { credential: cred, pid: legacyPid() });
    if (r.ok) loggedIn(r); else $('lmsg').textContent = r.err || 'Apple sign-in failed.';
  });
  document.addEventListener('AppleIDSignInOnFailure', ev => { const e = ev.detail && ev.detail.error; if (e && e !== 'popup_closed_by_user' && e !== 'user_cancelled_authorize') $('lmsg').textContent = 'Apple sign-in was cancelled or failed.'; });
}
(async function boot() {
  try { cfg = await (await fetch('/api/config', { cache: 'no-store' })).json(); } catch (e) { cfg = {}; }
  if (cfg.google) initGoogle(cfg.google);
  if (cfg.apple) initApple(cfg.apple);
  if (token) { const r = await post('/api/auth/session', { token }); if (r.ok) { loggedIn(r); return; } token = ''; try { localStorage.removeItem('tok'); } catch (e) { } }
  showLogin('');
})();

$('go').onclick = () => {
  if (!token) { showLogin('Please sign in to play.'); return; }
  SFX.init();
  const name = $('name').value.trim() || 'Survivor'; try { localStorage.setItem('nm', name); } catch (e) { }
  $('err').textContent = 'Connecting...';
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, cls: sel, room: $('room').value, token }));
  ws.onerror = () => $('err').textContent = 'Could not connect';
  ws.onclose = () => { if (myId) $('banner').textContent = 'Disconnected - reload to rejoin'; };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'err') { if (m.m === 'auth') logoutUI('Your session expired. Please sign in again.'); else { $('err').textContent = m.m; ws.close(); ws = null; } }
    else if (m.t === 'init') {
      myId = m.id; RR = m.R; roomCode = m.room; buildWorld(m.res); if (m.prof) { PF.owned = m.prof.owned; setDia(m.prof.d); }
      $('lobby').style.display = 'none'; $('hud').style.display = 'block'; $('btns').style.display = 'block';
      $('rm').textContent = 'Room ' + roomCode + ' (tap to copy link)'; tipUntil = performance.now() + 14000; history.replaceState(null, '', '?room=' + roomCode);
    } else if (m.t === 'dia') {
      setDia(m.d); const me = ents2['p' + myId];
      if (me) floatText(me.x, me.y - 24, '+' + m.n + ' 💎' + (m.why === 'milestone' ? ' milestone!' : ''), 0x7fe9ff);
      SFX.coin();
    } else if (m.t === 's') onSnap(m);
  };
};
$('rm').onclick = () => { const u = location.origin + '/?room=' + roomCode; try { navigator.clipboard.writeText(u); $('rm').textContent = 'Link copied!'; } catch (e) { prompt('Share this link', u); } };

const snd = $('snd'); const sndIcon = () => snd.textContent = SFX.isMuted() ? '🔇' : '🔊'; sndIcon();
snd.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); SFX.init(); SFX.setMuted(!SFX.isMuted()); sndIcon(); });
addEventListener('pointerdown', () => SFX.resume());
// ---------- input ----------
let joy = null, act = 0, hit = 0; const keys = {};
const jb = $('jbase'), jk = $('jknob');
app.view.addEventListener('pointerdown', e => { if (joy || e.clientX > innerWidth * .6) return; joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; app.view.setPointerCapture(e.pointerId); jb.style.display = jk.style.display = 'block'; jpos(); });
app.view.addEventListener('pointermove', e => { if (joy && joy.id === e.pointerId) { joy.x = e.clientX; joy.y = e.clientY; jpos(); } });
const jend = e => { if (joy && joy.id === e.pointerId) { joy = null; jb.style.display = jk.style.display = 'none'; } };
app.view.addEventListener('pointerup', jend); app.view.addEventListener('pointercancel', jend);
function jpos() { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.min(55, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); jb.style.left = joy.ox + 'px'; jb.style.top = joy.oy + 'px'; jk.style.left = (joy.ox + Math.cos(a) * m) + 'px'; jk.style.top = (joy.oy + Math.sin(a) * m) + 'px'; }
function bind(id, set) { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); set(1); b.setPointerCapture(e.pointerId); b.style.transform = 'scale(.92)'; }); ['pointerup', 'pointercancel'].forEach(t => b.addEventListener(t, () => { set(0); b.style.transform = ''; })); }
bind('act', v => act = v); bind('hit', v => hit = v);
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = 1; }); addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; });
function readInput() {
  let dx = 0, dy = 0;
  if (joy) { dx = (joy.x - joy.ox) / 55; dy = (joy.y - joy.oy) / 55; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } if (m < .12) dx = dy = 0; }
  if (keys.a || keys.arrowleft) dx -= 1; if (keys.d || keys.arrowright) dx += 1; if (keys.w || keys.arrowup) dy -= 1; if (keys.s || keys.arrowdown) dy += 1;
  return { dx, dy, act: act || keys[' '] || keys.e ? 1 : 0, hit: hit || keys.f || keys.j ? 1 : 0 };
}
setInterval(() => { if (ws && ws.readyState === 1 && myId) ws.send(JSON.stringify(Object.assign({ t: 'in' }, readInput()))); }, 50);
