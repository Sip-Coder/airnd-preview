/**
 * Encyclopedia atlas. Sections are spiral arms, modules are stops,
 * nodes are the radial labels. Catalog.json is the hierarchy.
 */
const $ = (id) => document.getElementById(id);

function fail(err) {
  const boot = $("boot");
  if (boot) {
    boot.hidden = false;
    boot.textContent = "The atlas could not start. Refresh and try again.";
  }
  const state = $("atlas-state");
  if (state) state.textContent = "error";
  console.error(err);
}

const ACCENT = {
  history: "#ff6b3d",
  "what-ai-is": "#5dffc2",
  talking: "#6aa8ff",
  building: "#ffe14a",
  work: "#ff4ad8",
};

const VERBS = [
  "open node",
  "trace the idea",
  "mark the cluster",
  "follow the arm",
  "read the label",
  "link the section",
  "note the stop",
  "pull the thread",
];

try {
  await run();
} catch (err) {
  fail(err);
}

async function run() {
  const THREE = await import("three");
  const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
  const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
  const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");
  const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");

  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let MOB = innerWidth < 760;
  const body = document.body;
  const nodeBase = body.dataset.nodeBase || "/encyclopedia/";
  const sectionBase = body.dataset.sectionBase || "/sections/";
  const ext = body.dataset.ext || "";
  const copy = JSON.parse($("atlas-copy").textContent || "[]");
  const catalog = await (await fetch(body.dataset.catalog || "/data/catalog.json")).json();
  const rawNodes = Array.isArray(catalog.nodes) ? catalog.nodes : [];
  if (!rawNodes.length) throw new Error("Empty catalog");

  const copyById = new Map(copy.map((section) => [section.id, section]));
  const grouped = new Map();
  for (const node of rawNodes) {
    if (!node?.id || !node.sectionId || !node.moduleId) continue;
    let section = grouped.get(node.sectionId);
    if (!section) {
      const meta = copyById.get(node.sectionId);
      section = {
        id: node.sectionId,
        title: meta?.title || node.sectionTitle || node.sectionId,
        lede: meta?.lede || "",
        color: ACCENT[node.sectionId] || "#d7deea",
        modules: [],
        modMap: new Map(),
      };
      grouped.set(node.sectionId, section);
    }
    let learnModule = section.modMap.get(node.moduleId);
    if (!learnModule) {
      const modMeta = copyById.get(node.sectionId)?.modules?.find((item) => item.id === node.moduleId);
      learnModule = {
        id: node.moduleId,
        title: modMeta?.title || node.moduleTitle || node.moduleId,
        lede: modMeta?.lede || "",
        nodes: [],
      };
      section.modMap.set(node.moduleId, learnModule);
      section.modules.push(learnModule);
    }
    learnModule.nodes.push({
      id: node.id,
      title: node.title || node.id,
      summary: node.summary || "",
    });
  }

  const sectionOrder = copy.map((section) => section.id);
  const sections = [...grouped.values()].sort((a, b) => {
    const ia = sectionOrder.indexOf(a.id);
    const ib = sectionOrder.indexOf(b.id);
    return (ia === -1 ? 1000 : ia) - (ib === -1 ? 1000 : ib);
  });
  for (const section of sections) {
    const order = copyById.get(section.id)?.modules?.map((item) => item.id) || [];
    section.modules.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia === -1 ? 1000 : ia) - (ib === -1 ? 1000 : ib);
    });
  }
  const historyAt = sections.findIndex((section) => section.id === "history");
  if (historyAt > 0) sections.unshift(...sections.splice(historyAt, 1));

  const stops = [];
  sections.forEach((section, gi) => {
    section.modules.forEach((learnModule, mi) => {
      stops.push({
        g: gi,
        idx: stops.length,
        mi,
        section,
        module: learnModule,
        nodes: learnModule.nodes,
        got: 0,
        visited: false,
        pos: new THREE.Vector3(),
        t: 0,
      });
    });
  });
  const NS = stops.length;
  const TOTAL = stops.reduce((sum, stop) => sum + stop.nodes.length, 0);
  const NG = sections.length;
  if (!NS || !NG) throw new Error("Catalog has no modules");

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOB ? 1.25 : 1.5));
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#070b10");
  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);
  const comp = new EffectComposer(renderer);
  comp.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), RM ? 0.4 : 0.7, 0.45, 0.18);
  comp.addPass(bloom);
  comp.addPass(new OutputPass());

  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const ARM = sections.map(() => ({
    th0: 0,
    curv: 2.15 + rnd() * 1.15,
    len: 0.9 + rnd() * 0.22,
    wid: 0.7 + rnd() * 0.7,
    wob: rnd() * 6,
  }));
  ARM.forEach((arm, i) => {
    arm.th0 = (i / NG) * Math.PI * 2 + rnd() * 0.28;
  });
  const RMAX = 520;
  const YS = 0.86;
  function spiral(gi, t) {
    const arm = ARM[gi];
    const radius = 42 + t * RMAX * arm.len;
    const th = arm.th0 + arm.curv * (t * 2.05 + 0.32 * t * t) + 0.16 * Math.sin(t * 6.2 + arm.wob) * t;
    return new THREE.Vector3(Math.cos(th) * radius, Math.sin(th) * radius * YS, Math.sin(t * 8 + arm.wob) * 16 * t);
  }
  function frame3(gi, t) {
    const p = spiral(gi, t);
    const q = spiral(gi, Math.min(1.05, t + 0.012));
    const tg = q.sub(p).normalize();
    const nm = new THREE.Vector3(-tg.y, tg.x, 0);
    if (nm.lengthSq() < 1e-8) nm.set(0, 1, 0);
    else nm.normalize();
    return { p: spiral(gi, t), tg, nm };
  }

  sections.forEach((section, gi) => {
    const count = section.modules.length;
    section.modules.forEach((learnModule, mi) => {
      const stop = stops.find((item) => item.section === section && item.module === learnModule);
      const t = 0.18 + ((mi + 0.5) / count) * 0.72;
      const framed = frame3(gi, t);
      stop.pos.copy(framed.p);
      stop.t = t;
    });
  });

  let REACH = 140;
  stops.forEach((stop) => {
    REACH = Math.max(REACH, Math.hypot(stop.pos.x, stop.pos.y));
  });

  const armMats = [];
  sections.forEach((section, gi) => {
    const origin = spiral(gi, 0);
    const spoke = new THREE.BufferGeometry();
    spoke.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, origin.x, origin.y, origin.z], 3));
    const spokeMat = new THREE.LineBasicMaterial({ color: section.color, transparent: true, opacity: 0.2 });
    scene.add(new THREE.Line(spoke, spokeMat));
    armMats.push(spokeMat);
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const p = spiral(gi, i / 72);
      pts.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: section.color, transparent: true, opacity: 0.28 });
    scene.add(new THREE.Line(geo, mat));
    armMats.push(mat);
  });

  const N = MOB ? 16000 : 32000;
  const NK = Math.round(N * 0.4);
  const ND = Math.round(N * 0.5);
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const sid = new Float32Array(N);
  const ph = new Float32Array(N);
  const totalW = stops.reduce((sum, stop) => sum + stop.nodes.length + 3, 0);
  const gcol = sections.map((section) => new THREE.Color(section.color));
  const mist = new THREE.Color("#8ea0b8");
  const white = new THREE.Color("#f4f7ff");
  let cursor = 0;
  stops.forEach((stop, k) => {
    const cnt = k === NS - 1 ? NK - cursor : Math.round((NK * (stop.nodes.length + 3)) / totalW);
    const color = new THREE.Color(stop.section.color);
    const size = 9 + Math.sqrt(stop.nodes.length) * 6;
    for (let q = 0; q < cnt && cursor < NK; q++, cursor++) {
      const spread = q % 3 === 0 ? size * 2.5 : size;
      pos[cursor * 3] = stop.pos.x + gauss() * spread;
      pos[cursor * 3 + 1] = stop.pos.y + gauss() * spread * 0.86;
      pos[cursor * 3 + 2] = stop.pos.z + gauss() * spread * 0.5;
      col[cursor * 3] = color.r;
      col[cursor * 3 + 1] = color.g;
      col[cursor * 3 + 2] = color.b;
      sid[cursor] = k;
      ph[cursor] = rnd() * 6.28;
    }
  });
  for (; cursor < NK + ND && cursor < N; cursor++) {
    const gi = Math.floor(rnd() * NG);
    const t = Math.pow(rnd(), 0.8) * 1.05;
    const framed = frame3(gi, Math.min(1, t));
    const w = (12 + t * 70) * ARM[gi].wid;
    const inter = rnd() < 0.3;
    const p = framed.p.clone().addScaledVector(framed.nm, gauss() * w * (inter ? 2.4 : 1)).addScaledVector(framed.tg, gauss() * w * 0.55);
    p.z += gauss() * 22;
    const neighbor = (gi + (rnd() < 0.5 ? 1 : NG - 1)) % NG;
    const color = gcol[gi].clone().lerp(gcol[neighbor], inter ? 0.35 + rnd() * 0.3 : rnd() * 0.2).lerp(mist, 0.18);
    pos[cursor * 3] = p.x;
    pos[cursor * 3 + 1] = p.y;
    pos[cursor * 3 + 2] = p.z;
    col[cursor * 3] = color.r;
    col[cursor * 3 + 1] = color.g;
    col[cursor * 3 + 2] = color.b;
    sid[cursor] = -1;
    ph[cursor] = rnd() * 6.28;
  }
  for (; cursor < N; cursor++) {
    const radius = Math.abs(gauss()) * (rnd() < 0.7 ? 36 : 130);
    const th = rnd() * 6.283;
    const color = white.clone().lerp(mist, Math.min(1, radius / 140));
    pos[cursor * 3] = Math.cos(th) * radius;
    pos[cursor * 3 + 1] = Math.sin(th) * radius * YS;
    pos[cursor * 3 + 2] = gauss() * 12;
    col[cursor * 3] = color.r;
    col[cursor * 3 + 1] = color.g;
    col[cursor * 3 + 2] = color.b;
    sid[cursor] = -2;
    ph[cursor] = rnd() * 6.28;
  }

  const litData = new Float32Array(Math.max(1, NS) * 4);
  const litTex = new THREE.DataTexture(litData, Math.max(1, NS), 1, THREE.RGBAFormat, THREE.FloatType);
  litTex.magFilter = THREE.NearestFilter;
  litTex.minFilter = THREE.NearestFilter;
  litTex.needsUpdate = true;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  pg.setAttribute("aSub", new THREE.BufferAttribute(sid, 1));
  pg.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
  const SWIRL = RM ? 0 : 1;
  const pm = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uLit: { value: litTex },
      uN: { value: NS },
      uT: { value: 0 },
      uPx: { value: renderer.getPixelRatio() },
      uDust: { value: 0.85 },
      uSw: { value: SWIRL },
      uAll: { value: 0 },
    },
    vertexShader: `
      attribute vec3 color;
      attribute float aSub;
      attribute float aPh;
      uniform sampler2D uLit;
      uniform float uN, uT, uPx, uDust, uSw, uAll;
      varying vec3 vC;
      varying float vA;
      void main() {
        vec3 P = position;
        float l;
        vec3 base = vec3(.025, .03, .045);
        if (aSub > -.5) {
          l = max(texture2D(uLit, vec2((aSub + .5) / uN, .5)).r, uAll);
          vC = mix(base, color, l * (.5 + .28 * sin(uT * 2. + aPh))) + color * .06;
          vA = 1.;
        } else {
          float rr = length(P.xy);
          float a = uSw * uT * .03 * (220. / (rr + 120.));
          float c = cos(a), s = sin(a);
          P.xy = mat2(c, s, -s, c) * P.xy;
          l = aSub < -1.5 ? 1. : uDust;
          vC = color * l * (.5 + .22 * sin(uT * 1.2 + aPh));
          vA = aSub < -1.5 ? 1. : .65;
        }
        vec4 mv = modelViewMatrix * vec4(P, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (aSub > -.5 ? (1.35 + l * .7) : (aSub < -1.5 ? 2.1 : 1.35)) * uPx * (300. / -mv.z);
      }
    `,
    fragmentShader: `
      varying vec3 vC;
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - .5;
        float q = dot(d, d);
        if (q > .25) discard;
        gl_FragColor = vec4(vC * .8 * vA * (1. - q * 2.), 1.);
      }
    `,
  });

  const NH = MOB ? 420 : 700;
  const hp = new Float32Array(NH * 3);
  const hc = new Float32Array(NH * 3);
  const hs = new Float32Array(NH);
  for (let i = 0; i < NH; i++) {
    const core = i < NH * 0.12;
    const gi = i % NG;
    const t = core ? 0 : rnd();
    const framed = frame3(gi, t);
    const w = (28 + t * 110) * ARM[gi].wid;
    const p = core ? new THREE.Vector3(gauss() * 50, gauss() * 42, 0) : framed.p.clone().addScaledVector(framed.nm, gauss() * w);
    const color = core ? white.clone() : gcol[gi].clone().lerp(gcol[(gi + 1) % NG], rnd() * 0.35);
    hp[i * 3] = p.x;
    hp[i * 3 + 1] = p.y;
    hp[i * 3 + 2] = p.z - 16;
    hc[i * 3] = color.r;
    hc[i * 3 + 1] = color.g;
    hc[i * 3 + 2] = color.b;
    hs[i] = core ? 200 : 110 + rnd() * 180;
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute("position", new THREE.BufferAttribute(hp, 3));
  hg.setAttribute("color", new THREE.BufferAttribute(hc, 3));
  hg.setAttribute("aS", new THREE.BufferAttribute(hs, 1));
  const hm = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uT: pm.uniforms.uT, uPx: pm.uniforms.uPx, uSw: pm.uniforms.uSw },
    vertexShader: `
      attribute vec3 color;
      attribute float aS;
      uniform float uT, uPx, uSw;
      varying vec3 vC;
      void main() {
        vec3 P = position;
        float rr = length(P.xy);
        float a = uSw * uT * .025 * (220. / (rr + 120.));
        float c = cos(a), s = sin(a);
        P.xy = mat2(c, s, -s, c) * P.xy;
        vC = color;
        vec4 mv = modelViewMatrix * vec4(P, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(1200., aS * uPx * (300. / -mv.z));
      }
    `,
    fragmentShader: `
      varying vec3 vC;
      void main() {
        vec2 d = gl_PointCoord - .5;
        float q = dot(d, d) * 4.;
        if (q > 1.) discard;
        float f = pow(1. - q, 3.);
        gl_FragColor = vec4(vC * f * .035, 1.);
      }
    `,
  });
  scene.add(new THREE.Points(hg, hm));
  scene.add(new THREE.Points(pg, pm));
  $("pc").textContent = N.toLocaleString();
  const lit = new Float32Array(NS);

  const crawler = new THREE.Group();
  scene.add(crawler);
  const coreM = new THREE.MeshBasicMaterial({ color: "#ff6b3d" });
  crawler.add(new THREE.Mesh(new THREE.SphereGeometry(2.5, 24, 16), coreM));
  crawler.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12), new THREE.MeshBasicMaterial({ color: "#f4f7ff" })));
  const sparks = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const len = i % 2 ? 6.2 : 9.2;
    sparks.push(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 0, Math.cos(a) * len, Math.sin(a) * len, 0);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.Float32BufferAttribute(sparks, 3));
  const ring = new THREE.LineSegments(sparkGeo, new THREE.LineBasicMaterial({ color: "#ff6b3d" }));
  crawler.add(ring);
  const TL = 140;
  const tp = new Float32Array(TL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(tp, 3));
  const trailMat = new THREE.LineBasicMaterial({ color: "#ff6b3d", transparent: true, opacity: 0.35 });
  scene.add(new THREE.Line(trailGeo, trailMat));

  let tendrils = [];
  const tagsEl = $("tags");
  const tethers = $("tethers");
  const hub = $("hub");
  function clearT() {
    tendrils.forEach((tendril) => {
      tendril.path.remove();
      tendril.el.remove();
    });
    tendrils = [];
  }
  function UI() {
    return MOB ? 1 : parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
  }
  function shown(el) {
    return Boolean(el && getComputedStyle(el).display !== "none");
  }
  function syncChrome() {
    const chrome = document.querySelector(".site-chrome");
    const tabs = document.querySelector(".mobile-tabs");
    const top = chrome ? Math.max(0, Math.round(chrome.getBoundingClientRect().bottom)) : 0;
    const bot = shown(tabs) ? Math.round(tabs.getBoundingClientRect().height) : 0;
    document.body.style.setProperty("--site-top", `${top}px`);
    document.body.style.setProperty("--site-bot", `${bot}px`);
  }
  function region() {
    syncChrome();
    const bar = document.querySelector(".topbar");
    const menu = document.querySelector("nav.nav");
    const tabs = document.querySelector(".mobile-tabs");
    const chromeTop = (bar ? bar.offsetHeight : 0) + (shown(menu) ? menu.offsetHeight : 0);
    const tabsH = shown(tabs) ? tabs.offsetHeight : 0;
    const top = (MOB ? 168 : Math.round(190 * UI())) + chromeTop;
    const bot = (MOB ? 210 : Math.round(250 * UI())) + tabsH;
    return { top, bot: Math.max(top + 48, innerHeight - bot) };
  }
  const PAD = 6;
  function rectOf(el) {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }
  function hit(a, b, pad) {
    return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  }
  function chromeZones() {
    const zones = [];
    for (const el of [document.querySelector(".topbar"), document.querySelector("nav.nav"), document.querySelector(".mobile-tabs")]) {
      if (shown(el)) zones.push(rectOf(el));
    }
    return zones;
  }
  function reserved(cx, cy) {
    const zones = [rectOf($("top")), rectOf($("ctrl")), rectOf($("dash")), ...chromeZones()];
    [...$("step").children].forEach((child) => {
      if (child.offsetParent && child.textContent.trim()) zones.push(rectOf(child));
    });
    if (hub.firstChild && hub.firstChild.textContent) zones.push(rectOf(hub));
    zones.push({ x: cx - 26, y: cy - 26, w: 52, h: 52 });
    return zones;
  }
  function solve(sizes, cx, cy, zones) {
    const margin = 8;
    const placed = [];
    const maxR = Math.hypot(innerWidth, innerHeight);
    for (let i = 0; i < sizes.length; i++) {
      const { w, h } = sizes[i];
      const pref = (i / sizes.length) * Math.PI * 2 - Math.PI / 2;
      let ok = null;
      for (let radius = MOB ? 72 : 104; radius < maxR && !ok; radius += 8) {
        const da = Math.max(0.045, (w * 0.35) / radius);
        for (let m = 0; m * da <= Math.PI && !ok; m++) {
          const signs = m ? [1, -1] : [1];
          for (const sign of signs) {
            const a = pref + sign * m * da;
            const px = cx + Math.cos(a) * radius;
            const py = cy + Math.sin(a) * radius;
            const box = { x: px - w / 2, y: py - h / 2, w, h };
            if (box.x < margin || box.y < margin || box.x + w > innerWidth - margin || box.y + h > innerHeight - margin) continue;
            if (zones.some((zone) => hit(box, zone, PAD)) || placed.some((zone) => hit(box, zone, PAD))) continue;
            ok = box;
            break;
          }
        }
      }
      if (!ok) return null;
      placed.push(ok);
    }
    return placed;
  }

  function lineOf(text, max = 96) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    const stopAt = clean.search(/[.!?](\s|$)/);
    const sentence = stopAt === -1 ? clean : clean.slice(0, stopAt + 1);
    return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
  }
  function nodeHref(id) {
    return `${nodeBase}${id}${ext}`;
  }
  function moduleHref(sectionId, moduleId) {
    return ext === ".html" ? `${sectionBase}${sectionId}/${moduleId}.html` : `${sectionBase}${sectionId}/${moduleId}`;
  }
  function esc(value) {
    return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  }

  const seen = new Set();
  window.__fallback = 0;
  function noteNode(stop, id) {
    if (seen.has(id)) return;
    seen.add(id);
    stop.got += 1;
    if (stop.got >= stop.nodes.length) stop.visited = true;
    const row = rows[stop.idx];
    if (row) row.lastChild.textContent = `${stop.got}/${stop.nodes.length}`;
    updCount();
  }
  function spawnT(stop, cx, cy, instant) {
    clearT();
    const color = stop.section.color;
    hub.style.left = `${cx}px`;
    hub.style.top = `${cy + (MOB ? 18 : 24)}px`;
    let hb = rectOf(hub);
    const top = rectOf($("top"));
    const ctl = rectOf($("ctrl"));
    if (hb.y < top.y + top.h + 6) hub.style.top = `${top.y + top.h + 6}px`;
    hb = rectOf(hub);
    if (hb.y + hb.h > ctl.y - 8) hub.style.top = `${ctl.y - 8 - hb.h}px`;
    hb = rectOf(hub);
    if (hb.x < 8) hub.style.left = `${8 + hb.w / 2}px`;
    if (hb.x + hb.w > innerWidth - 8) hub.style.left = `${innerWidth - 8 - hb.w / 2}px`;
    const zones = reserved(cx, cy);
    const els = stop.nodes.map((node) => {
      const el = document.createElement("div");
      el.className = "tag";
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.dataset.id = node.id;
      el.setAttribute("aria-label", `${node.title} — open this node`);
      el.style.setProperty("--c", color);
      el.textContent = node.title;
      el.style.opacity = "0";
      el.style.left = "-999px";
      el.style.top = "0px";
      tagsEl.appendChild(el);
      return el;
    });
    let fs = MOB ? (stop.nodes.length > 5 ? 11 : 12) : Math.round((stop.nodes.length > 5 ? 13 : 15) * UI());
    let placed = null;
    for (; fs >= 10 && !placed; fs--) {
      els.forEach((el) => el.style.setProperty("--fs", `${fs}px`));
      placed = solve(els.map((el) => ({ w: el.offsetWidth, h: el.offsetHeight })), cx, cy, zones);
    }
    if (!placed) {
      window.__fallback += 1;
      placed = els.map((el, i) => ({ x: 8, y: 36 + i * (el.offsetHeight + 4), w: el.offsetWidth, h: el.offsetHeight }));
      fs = 10;
    } else fs += 1;
    window.__fs = fs;
    hub.dataset.kind = "module";
    hub.dataset.section = stop.section.id;
    hub.dataset.module = stop.module.id;
    hub.setAttribute("aria-label", `${stop.module.title} — show this module`);
    stop.nodes.forEach((node, j) => {
      const el = els[j];
      const box = placed[j];
      el.style.left = `${box.x}px`;
      el.style.top = `${box.y}px`;
      const ex = Math.max(box.x, Math.min(cx, box.x + box.w));
      const ey = Math.max(box.y, Math.min(cy, box.y + box.h));
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "1.75");
      path.setAttribute("stroke-linecap", "round");
      path.style.filter = `drop-shadow(0 0 5px ${color})`;
      tethers.appendChild(path);
      if (instant) {
        el.style.opacity = "1";
        noteNode(stop, node.id);
      }
      tendrils.push({
        path,
        el,
        id: node.id,
        sx: ex,
        sy: ey,
        done: !!instant,
        born: instant ? now - 99 : now,
        delay: j * (RM ? 0.05 : 0.18),
        wob: Math.random() * 9,
      });
    });
  }

  const logEl = $("log");
  const secsEl = $("secs");
  const rows = [];
  sections.forEach((section, gi) => {
    const head = document.createElement("div");
    head.className = "gh";
    head.textContent = `${String(gi + 1).padStart(2, "0")}  ${section.title}`;
    head.onclick = () => jump(stops.findIndex((stop) => stop.g === gi));
    secsEl.appendChild(head);
    stops.filter((stop) => stop.g === gi).forEach((stop) => {
      const row = document.createElement("div");
      row.className = "ar";
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.style.setProperty("--c", section.color);
      row.innerHTML = `<span></span><span>0/${stop.nodes.length}</span>`;
      row.firstChild.textContent = stop.module.title;
      row.onclick = () => jump(stop.idx);
      row.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          jump(stop.idx);
        }
      };
      secsEl.appendChild(row);
      rows[stop.idx] = row;
    });
  });

  function log(text) {
    const row = document.createElement("div");
    row.textContent = `${now.toFixed(1).padStart(6, "0")}  ${text}`;
    logEl.appendChild(row);
    while (logEl.children.length > (MOB ? 6 : 8)) logEl.firstChild.remove();
  }
  const radar = $("radar");
  const beat = $("beat");
  let beatArr = Array(60).fill(0);
  function drawRadar(color) {
    let svg = "";
    for (let q = 1; q <= 3; q++) {
      const pts = stops.map((_, i) => {
        const a = (i / NS) * Math.PI * 2 - Math.PI / 2;
        return `${Math.cos(a) * q * 16},${Math.sin(a) * q * 16}`;
      }).join(" ");
      svg += `<polygon fill="none" stroke="#ffffff18" points="${pts}"/>`;
    }
    const poly = stops.map((stop, i) => {
      const a = (i / NS) * Math.PI * 2 - Math.PI / 2;
      const v = 6 + (stop.nodes.length ? stop.got / stop.nodes.length : 0) * 42;
      return `${Math.cos(a) * v},${Math.sin(a) * v}`;
    }).join(" ");
    svg += `<polygon fill="${color}33" stroke="${color}" points="${poly}"/>`;
    svg += stops.map((stop, i) => {
      const a = (i / NS) * Math.PI * 2 - Math.PI / 2;
      return `<circle r="1.6" fill="${stop.section.color}" cx="${Math.cos(a) * 50}" cy="${Math.sin(a) * 50}"/>`;
    }).join("");
    radar.innerHTML = svg;
  }
  function drawBeat(color) {
    beat.innerHTML = `<polyline fill="none" stroke="${color}" stroke-width="1.5" points="${beatArr.map((v, i) => `${(i / (beatArr.length - 1)) * 200},${105 - v * 95}`).join(" ")}"/>`;
  }
  function updCount() {
    const ex = seen.size;
    if ($("sval").textContent !== String(ex)) $("sval").textContent = String(ex);
    $("stot").textContent = `/ ${TOTAL}`;
    const ringEl = $("ring");
    ringEl.setAttribute("stroke-dashoffset", String(251 * (1 - (TOTAL ? ex / TOTAL : 0))));
  }

  const SP = RM ? 1.35 : 1;
  function dwell(n) {
    return SP * (8.5 + 0.5 * n);
  }
  let cur = 0;
  let stop = null;
  let stepStart = 0;
  let now = 0;
  let dur = 1;
  let travel = 1;
  let spawned = false;
  let paused = false;
  let prevStop = null;
  const camFrom = new THREE.Vector3();
  const camTo = new THREE.Vector3();
  const look = new THREE.Vector3();
  const lookFrom = new THREE.Vector3();
  const lookTo = new THREE.Vector3();
  const offFrom = new THREE.Vector3();
  const offTo = new THREE.Vector3();
  const camOffFrom = new THREE.Vector3();
  const camOffTo = new THREE.Vector3();
  let path = [];
  let plen = [];
  let bump = 0;
  function armPts(g, t0, t1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(spiral(g, t0 + ((t1 - t0) * i) / n));
    return pts;
  }
  function buildPath(target) {
    const start = crawler.position.clone();
    let pts;
    const pg = prevStop ? prevStop.g : null;
    const pt = prevStop ? prevStop.t : 0;
    if (!target) pts = pg == null ? [start, new THREE.Vector3()] : armPts(pg, pt, 0, 28);
    else if (pg == null) pts = [start, ...armPts(target.g, 0, target.t, 28)];
    else if (pg === target.g) pts = armPts(target.g, pt, target.t, Math.max(4, Math.ceil(Math.abs(target.t - pt) * 64)));
    else pts = [...armPts(pg, pt, 0, 20), ...armPts(target.g, 0, target.t, 20)];
    const end = target ? target.pos.clone() : new THREE.Vector3();
    const n = Math.max(1, pts.length - 1);
    const d0 = start.clone().sub(pts[0]);
    const d1 = end.clone().sub(pts[n]);
    path = pts.map((q, i) => q.clone().add(d0.clone().multiplyScalar(1 - i / n)).add(d1.clone().multiplyScalar(i / n)));
    plen = [0];
    for (let i = 1; i < path.length; i++) plen.push(plen[i - 1] + path[i].distanceTo(path[i - 1]));
    prevStop = target;
  }
  function pathAt(u) {
    const length = plen[plen.length - 1] * u;
    let i = 1;
    while (i < plen.length - 1 && plen[i] < length) i++;
    const a = plen[i - 1];
    const b = plen[i];
    const f = b > a ? (length - a) / (b - a) : 1;
    return path[i - 1].clone().lerp(path[i], Math.min(1, Math.max(0, f)));
  }
  function wrap(k) {
    const span = NS + 1;
    return ((k % span) + span) % span;
  }
  function setArms(opacity) {
    armMats.forEach((mat) => {
      mat.opacity = opacity;
    });
  }
  function zoomTargets() {
    const rg = region();
    const th = Math.tan((27.5 * Math.PI) / 180);
    const asp = innerWidth / Math.max(1, innerHeight);
    const fh = Math.max(0.35, (rg.bot - rg.top) / innerHeight);
    const dz = Math.max((REACH * 1.34) / (th * asp), (REACH * YS * 1.34) / (th * fh));
    const sh = (((rg.top + rg.bot) / 2 - innerHeight / 2) / innerHeight) * 2 * dz * th;
    lookTo.set(0, sh, 0);
    camTo.set(0, sh, dz);
  }
  function frameZoom(manual) {
    $("num").textContent = "✦";
    $("title").textContent = "The whole map";
    $("tagline").textContent = `${NG} sections, connected.`;
    $("acad").textContent = "All sections";
    $("subt").textContent = `${NS} MODULES · ${TOTAL} NODES`;
    $("step").style.setProperty("--c", "#d7deea");
    $("ring").setAttribute("stroke", "#d7deea");
    ring.material.color.set("#d7deea");
    trailMat.color.set("#d7deea");
    hub.style.opacity = "0";
    hub.style.pointerEvents = "none";
    hub.setAttribute("aria-hidden", "true");
    zoomTargets();
    buildPath(null);
    travel = manual === "load" ? 0.2 : 3.4 * SP;
    dur = travel + 13 * SP;
    pm.uniforms.uAll.value = 1;
    setArms(0.72);
    if (manual !== "resize") log(`zoom out · ${NG} sections · ${TOTAL} nodes`);
    rows.forEach((row, i) => {
      row.className = `ar${stops[i].visited ? " done" : ""}`;
    });
  }
  function frameStop(manual) {
    pm.uniforms.uAll.value = 0;
    setArms(0.2);
    const section = stop.section;
    const learnModule = stop.module;
    const color = section.color;
    $("num").textContent = String(stop.g + 1).padStart(2, "0");
    $("title").textContent = section.title;
    $("tagline").textContent = lineOf(section.lede);
    $("acad").textContent = learnModule.title;
    $("subt").textContent = `${stop.mi + 1} / ${section.modules.length} · ${learnModule.nodes.length} NODES`;
    $("step").style.setProperty("--c", color);
    $("ring").setAttribute("stroke", color);
    ring.material.color.set(color);
    coreM.color.set(color);
    trailMat.color.set(color);
    hub.style.setProperty("--c", color);
    hub.firstChild.textContent = learnModule.title;
    hub.lastChild.textContent = lineOf(learnModule.lede, 72) || section.title;
    hub.style.opacity = "0";
    hub.style.pointerEvents = "none";
    hub.setAttribute("aria-hidden", "true");
    const rg = region();
    const midY = (rg.top + rg.bot) / 2;
    const offs = (midY - innerHeight / 2) / innerHeight;
    const dist = MOB ? 300 : 236;
    lookTo.copy(stop.pos);
    lookTo.y += offs * 2 * dist * Math.tan((27.5 * Math.PI) / 180);
    camTo.set(lookTo.x, lookTo.y - 10, stop.pos.z + dist);
    offFrom.copy(lookFrom).sub(crawler.position);
    offTo.copy(lookTo).sub(stop.pos);
    camOffFrom.copy(camFrom).sub(lookFrom);
    camOffTo.copy(camTo).sub(lookTo);
    const newSection = !prevStop || prevStop.g !== stop.g;
    travel = manual === "load" ? 0.05 : SP * (newSection ? 4.2 : 2.15);
    dur = travel + dwell(learnModule.nodes.length);
    bump = newSection ? (MOB ? 340 : 260) : 40;
    if (manual === "load") {
      crawler.position.copy(stop.pos);
      path = [stop.pos.clone(), stop.pos.clone()];
      plen = [0, 0.0001];
      prevStop = stop;
    } else buildPath(stop);
    if (manual === "load") {
      cam.position.copy(camTo);
      look.copy(lookTo);
      camFrom.copy(camTo);
      lookFrom.copy(lookTo);
      offFrom.copy(offTo);
      camOffFrom.copy(camOffTo);
    }
    if (newSection) log(`section → ${section.title.toLowerCase()}`);
    log(`enter ${learnModule.title.toLowerCase()}`);
    rows.forEach((row, i) => {
      row.className = `ar${i === stop.idx ? " on" : ""}${stops[i].visited ? " done" : ""}`;
    });
    const row = rows[stop.idx];
    if (row && !MOB) secsEl.scrollTop = Math.max(0, row.offsetTop - 28);
  }
  function setStep(k, manual) {
    k = wrap(k);
    clearT();
    cur = k;
    stepStart = now;
    spawned = false;
    camFrom.copy(cam.position);
    lookFrom.copy(look);
    const all = k >= NS;
    stop = all ? null : stops[k];
    $("stopn").textContent = all ? "ALL" : `${k + 1}/${NS}`;
    if (all) frameZoom(manual);
    else frameStop(manual);
    updCount();
  }

  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
  const bPlay = $("bPlay");
  function setPaused(value) {
    paused = value;
    bPlay.innerHTML = value ? ICON_PLAY : ICON_PAUSE;
    bPlay.setAttribute("aria-label", value ? "Play" : "Pause");
  }
  function jump(k) {
    setStep(k, true);
  }
  let lastRew = -9;
  function rew() {
    const t = performance.now() / 1000;
    if (cur >= NS) {
      jump(stops.findIndex((item) => item.g === NG - 1));
      lastRew = t;
      return;
    }
    const here = stops[cur];
    const first = stops.findIndex((item) => item.g === here.g);
    if (cur === first || t - lastRew < 1.5) {
      if (here.g === 0) jump(NS);
      else jump(stops.findIndex((item) => item.g === here.g - 1));
    } else jump(first);
    lastRew = t;
  }
  function ff() {
    if (cur >= NS) {
      jump(0);
      return;
    }
    const next = stops.findIndex((item) => item.g === stops[cur].g + 1);
    jump(next === -1 ? NS : next);
  }
  let SPEED = 1;
  const SPEEDS = [0.5, 1, 2];
  function speedLabel(value) {
    return value === 0.5 ? "0.5×" : `${value}×`;
  }
  function cycleSpeed(dir) {
    const i = SPEEDS.indexOf(SPEED);
    SPEED = SPEEDS[(i + (dir || 1) + SPEEDS.length) % SPEEDS.length];
    const button = $("bSpd");
    button.textContent = speedLabel(SPEED);
    button.setAttribute("aria-label", `Playback speed ${SPEED}x`);
  }

  let defOpen = false;
  let defWas = false;
  let defFrom = null;
  function openNode(id, from) {
    const owner = stops.find((item) => item.nodes.some((node) => node.id === id));
    const node = owner?.nodes.find((item) => item.id === id);
    if (!node) return;
    if (!defOpen) {
      defWas = paused;
      defFrom = from || document.activeElement;
    }
    setPaused(true);
    defOpen = true;
    const color = owner.section.color;
    $("def").style.setProperty("--c", color);
    $("defT").textContent = node.title;
    $("defP").textContent = `${owner.section.title} · ${owner.module.title}`;
    $("defB").innerHTML = `<p>${esc(node.summary)}</p>`;
    const open = $("defOpen");
    open.href = nodeHref(node.id);
    open.textContent = "Open this node";
    $("defbg").hidden = false;
    $("defX").focus();
  }
  function openModule(sectionId, moduleId, from) {
    const owner = stops.find((item) => item.section.id === sectionId && item.module.id === moduleId);
    if (!owner) return;
    if (!defOpen) {
      defWas = paused;
      defFrom = from || document.activeElement;
    }
    setPaused(true);
    defOpen = true;
    $("def").style.setProperty("--c", owner.section.color);
    $("defT").textContent = owner.module.title;
    $("defP").textContent = `${owner.section.title} · module`;
    const items = owner.nodes.map((node) => `<li><a href="${esc(nodeHref(node.id))}">${esc(node.title)}</a></li>`).join("");
    $("defB").innerHTML = `<p>${esc(owner.module.lede || "")}</p><ul>${items}</ul>`;
    const open = $("defOpen");
    open.href = moduleHref(owner.section.id, owner.module.id);
    open.textContent = "Open this module";
    $("defbg").hidden = false;
    $("defX").focus();
  }
  function closeDef(resume) {
    if (!defOpen) return;
    defOpen = false;
    $("defbg").hidden = true;
    if (resume) setPaused(false);
    else if (!defWas) setPaused(true);
    if (defFrom && defFrom.focus && document.contains(defFrom)) defFrom.focus();
  }

  bPlay.onclick = () => setPaused(!paused);
  $("bPrev").onclick = () => jump(cur - 1);
  $("bNext").onclick = () => jump(cur + 1);
  $("bRew").onclick = () => rew();
  $("bFF").onclick = () => ff();
  $("bSpd").onclick = () => cycleSpeed(1);
  $("defX").onclick = () => closeDef(false);
  $("defClose").onclick = () => closeDef(false);
  $("defRes").onclick = () => closeDef(true);
  $("defbg").addEventListener("click", (event) => {
    if (event.target.id === "defbg") closeDef(false);
  });
  tagsEl.addEventListener("click", (event) => {
    const tag = event.target.closest(".tag");
    if (tag) openNode(tag.dataset.id, tag);
  });
  hub.addEventListener("click", () => {
    if (hub.dataset.kind === "module") openModule(hub.dataset.section, hub.dataset.module, hub);
  });
  addEventListener("keydown", (event) => {
    if (event.target.closest && event.target.closest("input, textarea, select")) return;
    if (defOpen) {
      if (event.key === "Escape") {
        closeDef(false);
        event.preventDefault();
      } else if (event.key === "Tab") {
        const focusable = [...$("def").querySelectorAll("button, a")];
        const index = focusable.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) {
          focusable[focusable.length - 1].focus();
          event.preventDefault();
        } else if (!event.shiftKey && index === focusable.length - 1) {
          focusable[0].focus();
          event.preventDefault();
        }
      }
      return;
    }
    const tag = event.target.closest && event.target.closest(".tag,#hub");
    if ((event.key === "Enter" || event.key === " ") && tag) {
      event.preventDefault();
      if (tag.id === "hub") openModule(hub.dataset.section, hub.dataset.module, hub);
      else openNode(tag.dataset.id, tag);
      return;
    }
    if (event.target.closest && event.target.closest("button, [role=button]") && event.key === " ") return;
    if (event.key === "s" || event.key === "S") {
      cycleSpeed(event.shiftKey ? -1 : 1);
      event.preventDefault();
    } else if ((event.shiftKey && event.key === "ArrowLeft") || event.key === "PageUp") {
      rew();
      event.preventDefault();
    } else if ((event.shiftKey && event.key === "ArrowRight") || event.key === "PageDown") {
      ff();
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      jump(cur + 1);
      event.preventDefault();
    } else if (event.key === "ArrowLeft") {
      jump(cur - 1);
      event.preventDefault();
    } else if (event.key === " ") {
      setPaused(!paused);
      event.preventDefault();
    }
  });

  let last = performance.now();
  let frames = 0;
  let frameTime = 0;
  let FIX = 0;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
  function tick(t, noloop) {
    const raw = FIX || Math.min(0.05, (t - last) / 1000);
    last = t;
    const dt = paused ? 0 : raw * SPEED;
    now += dt;
    frames += 1;
    frameTime += raw;
    if (frameTime > 0.5 && !FIX) {
      $("fps").textContent = String(Math.round(frames / frameTime));
      frames = 0;
      frameTime = 0;
    }
    const all = cur >= NS;
    const elapsed = now - stepStart;
    const mv = ease(Math.min(1, travel ? elapsed / travel : 1));
    crawler.position.copy(pathAt(mv));
    const cm = ease(Math.min(1, travel ? elapsed / (travel * 1.05) : 1));
    if (all) {
      cam.position.lerpVectors(camFrom, camTo, cm);
      look.lerpVectors(lookFrom, lookTo, cm);
    } else {
      const lo = offFrom.clone().lerp(offTo, cm);
      look.copy(crawler.position).add(lo);
      const co = camOffFrom.clone().lerp(camOffTo, cm);
      co.z += Math.sin(Math.PI * Math.min(1, travel ? elapsed / travel : 1)) * bump;
      cam.position.copy(look).add(co);
    }
    cam.lookAt(look);
    cam.updateMatrixWorld();
    ring.rotation.z += raw * (RM ? 0.25 : 1.15);
    crawler.scale.setScalar(1 + Math.sin(now * (RM ? 1.5 : 4)) * (RM ? 0.02 : 0.05));
    tp.copyWithin(3, 0, (TL - 1) * 3);
    tp[0] = crawler.position.x;
    tp[1] = crawler.position.y;
    tp[2] = crawler.position.z;
    trailGeo.attributes.position.needsUpdate = true;
    const cp = crawler.position.clone().project(cam);
    const cx = ((cp.x + 1) / 2) * innerWidth;
    const cy = ((1 - cp.y) / 2) * innerHeight;
    if (!all && stop) {
      if (elapsed > travel * 0.82) {
        hub.style.opacity = "1";
        hub.style.pointerEvents = "auto";
        hub.setAttribute("aria-hidden", "false");
      }
      if (!spawned) {
        hub.style.left = `${cx}px`;
        hub.style.top = `${cy + (MOB ? 18 : 24)}px`;
      }
      if (elapsed > travel && !spawned) {
        spawned = true;
        spawnT(stop, cx, cy, false);
      }
      if (elapsed > travel) lit[cur] = Math.min(1, lit[cur] + raw * 1.4);
    }
    tendrils.forEach((tendril, j) => {
      const age = Math.max(0, Math.min(1, (now - tendril.born - tendril.delay) / 0.7));
      const grow = 1 - (1 - age) ** 3;
      const wobble = RM ? 0 : 14;
      const mx = (cx + tendril.sx) / 2 + Math.sin(now * 1.5 + tendril.wob) * wobble;
      const my = (cy + tendril.sy) / 2 + Math.cos(now * 1.2 + tendril.wob) * wobble;
      tendril.path.setAttribute("d", `M ${cx} ${cy} Q ${mx} ${my} ${tendril.sx} ${tendril.sy}`);
      const len = tendril.path.getTotalLength() || 1;
      if (grow < 1) {
        tendril.path.style.strokeDasharray = `${Math.max(1, len * grow)} ${len}`;
        tendril.path.style.strokeDashoffset = "0";
      } else {
        tendril.path.style.strokeDasharray = "10 8";
        tendril.path.style.strokeDashoffset = String(now * 46 + j * 6);
      }
      if (age >= 1 && !tendril.done) {
        tendril.done = true;
        tendril.el.style.opacity = "1";
        if (stop) noteNode(stop, tendril.id);
        log(`${VERBS[(j + cur) % VERBS.length]} · ${tendril.el.textContent}`);
        beatArr[beatArr.length - 1] = 1;
      }
    });
    for (let i = 0; i < NS; i++) litData[i * 4] = lit[i];
    litTex.needsUpdate = true;
    pm.uniforms.uT.value = now;
    if (frames % 2 === 0 && !paused) {
      const pulse = all ? 0 : Math.min(1, beatArr[beatArr.length - 1] * 0.55 + 0.05);
      beatArr.push(all ? beatArr[beatArr.length - 1] * 0.82 : pulse);
      if (beatArr.length > 60) beatArr.shift();
    }
    if (frames % 3 === 0) {
      const color = all ? "#d7deea" : stop.section.color;
      drawRadar(color);
      drawBeat(color);
      updCount();
    }
    if (elapsed > dur && !paused && !defOpen) setStep(cur + 1);
    if (!noloop) {
      comp.render();
      requestAnimationFrame(tick);
    }
  }
  function resize() {
    syncChrome();
    MOB = innerWidth < 760;
    cam.aspect = innerWidth / Math.max(1, innerHeight);
    cam.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOB ? 1.25 : 1.5));
    renderer.setSize(innerWidth, innerHeight);
    comp.setSize(innerWidth, innerHeight);
    pm.uniforms.uPx.value = renderer.getPixelRatio();
    $("res").textContent = `${innerWidth}×${innerHeight}`;
    if (cur >= NS) {
      zoomTargets();
      cam.position.copy(camTo);
      look.copy(lookTo);
      camFrom.copy(camTo);
      lookFrom.copy(lookTo);
    }
  }
  addEventListener("resize", () => {
    resize();
    if (spawned && stop && cur < NS) {
      const p = crawler.position.clone().project(cam);
      spawnT(stop, ((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight, true);
    }
  });
  resize();
  document.fonts?.ready.then(() => syncChrome());
  setStep(0, "load");
  updCount();
  $("boot").hidden = true;
  $("atlas-state").textContent = "playing";

  const params = new URLSearchParams(location.search);
  if (params.has("check") || params.get("stop") !== null) body.classList.add("still");
  if (params.has("check")) {
    const report = [];
    FIX = 1 / 30;
    for (let k = 0; k < NS; k++) {
      jump(k);
      let guard = 0;
      while ((!spawned || !stop || stop.got < stop.nodes.length) && guard++ < 1500) tick(0, true);
      for (let i = 0; i < 20; i++) tick(0, true);
      const projected = crawler.position.clone().project(cam);
      const cx = ((projected.x + 1) / 2) * innerWidth;
      const cy = ((1 - projected.y) / 2) * innerHeight;
      const tags = [...tagsEl.children].map((el) => ({ n: el.textContent, ...rectOf(el) }));
      const zones = [
        ["hub", rectOf(hub)],
        ["top", rectOf($("top"))],
        ["ctrl", rectOf($("ctrl"))],
        ["dash", rectOf($("dash"))],
        ...chromeZones().map((zone, index) => [`chrome:${index}`, zone]),
        ...[...$("step").children].filter((child) => child.offsetParent && child.textContent.trim()).map((child) => [`step:${child.id}`, rectOf(child)]),
        ["crawler", { x: cx - 12, y: cy - 12, w: 24, h: 24 }],
      ];
      const bad = [];
      if (tags.length !== stop.nodes.length) bad.push(`count ${tags.length}/${stop.nodes.length}`);
      tags.forEach((a, i) => {
        if (a.x < 0 || a.y < 0 || a.x + a.w > innerWidth + 1 || a.y + a.h > innerHeight + 1) bad.push(`${a.n}|offscreen`);
        tags.forEach((b, j) => {
          if (j > i && hit(a, b, 0)) bad.push(`${a.n}|${b.n}`);
        });
        zones.forEach(([name, zone]) => {
          if (hit(a, zone, 0)) bad.push(`${a.n}|${name}`);
        });
      });
      zones.forEach(([name, zone]) => {
        if (name !== "hub" && name !== "crawler" && hit(zones[0][1], zone, 0)) bad.push(`hub|${name}`);
      });
      report.push({
        k,
        section: stop.section.id,
        module: stop.module.id,
        n: tags.length,
        fs: window.__fs,
        got: stop.got,
        bad,
      });
    }
    jump(NS);
    for (let i = 0; i < 10; i++) tick(0, true);
    const fails = report.filter((item) => item.bad.length);
    const out = document.createElement("pre");
    out.id = "check";
    out.textContent = JSON.stringify({
      vp: `${innerWidth}x${innerHeight}`,
      stops: report.length,
      total: TOTAL,
      explored: seen.size,
      historyFirst: sections[0]?.id === "history" && stops[0]?.module.id === "myths",
      zoom: $("title").textContent,
      lit: pm.uniforms.uAll.value,
      fails: fails.length,
      fallback: window.__fallback || 0,
      minfs: Math.min(...report.map((item) => item.fs)),
      detail: fails.slice(0, 12),
    });
    document.body.appendChild(out);
    $("atlas-state").textContent = "check";
    comp.render();
    return;
  }

  const stopParam = params.get("stop");
  if (stopParam !== null) {
    FIX = 1 / 30;
    if (stopParam === "zoom" || stopParam === "all") jump(NS);
    else jump(Number(stopParam));
    let guard = 0;
    while (cur < NS && (!spawned || (stop && stop.got < stop.nodes.length)) && guard++ < 1500) tick(0, true);
    for (let i = 0; i < 15; i++) tick(0, true);
    FIX = 0;
    setPaused(true);
    last = performance.now();
    comp.render();
    $("atlas-state").textContent = "ready";
  }
  requestAnimationFrame(tick);
}
