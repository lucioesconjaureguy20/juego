import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crosshair, Heart, Shield, Users, Skull, Zap, Backpack, Plane, MapPin } from "lucide-react";

const MAP_SIZE = 42000;
const WORLD_LIMIT = MAP_SIZE / 2;
const BOT_COUNT = 99;
const PLAYER_SPEED = 8.5;
const CROUCH_SPEED = 4.2;
const SPRINT_SPEED = 13;
const JUMP_FORCE = 5.5;
const BUS_HEIGHT = 3600;
const AUTO_GLIDER_HEIGHT = 850;
const GLIDER_FALL_SPEED = 3.4;
const FREE_FALL_SPEED = 13;
const GRAVITY = 0.55;
const BUS_SPEED = 540;
const BUS_CAMERA_DISTANCE = 1150;
const BUS_CAMERA_HEIGHT = 520;
const SAFE_START_SECONDS = 90;
const PLAYER_RADIUS = 46;

const WEAPONS = [
  { name: "Pistol", damage: 22, fireRate: 380, range: 700, mag: 12, color: 0xcfcfcf, ammo: "Light" },
  { name: "Rifle", damage: 28, fireRate: 125, range: 1400, mag: 30, color: 0x6ee7ff, ammo: "Medium" },
  { name: "Shotgun", damage: 78, fireRate: 780, range: 330, mag: 6, color: 0xff8f8f, ammo: "Shells" },
  { name: "SMG", damage: 16, fireRate: 80, range: 720, mag: 35, color: 0xffe08a, ammo: "Light" },
  { name: "Sniper", damage: 95, fireRate: 1200, range: 2500, mag: 5, color: 0xb9a2ff, ammo: "Heavy" },
  { name: "Burst AR", damage: 34, fireRate: 230, range: 1200, mag: 24, color: 0x86efac, ammo: "Medium" },
];

const POIS = [
  ["Pine Village", -14500, -13500],
  ["Dusty Farms", 14200, -13200],
  ["Crystal Lake", 0, 0],
  ["Old Factory", -15000, 13800],
  ["Green Hills", 14500, 14500],
  ["Cargo Town", 3500, -17500],
];

const NAMES = ["Raptor", "Nova", "Ghost", "Viper", "Blaze", "Echo", "Rogue", "Bolt", "River", "Pixel", "Kiro", "Milo", "Storm", "Nash"];

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function teamSize(mode) { return mode === "solo" ? 1 : mode === "duo" ? 2 : mode === "trio" ? 3 : 4; }

function canvasTexture({ base = "#2f7d32", colors = ["#1e5d25", "#4aa34c"], repeat = 80, pattern = "noise" }) {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 160, 160);

  if (pattern === "brick") {
    for (let y = 0; y < 160; y += 20) {
      for (let x = -20; x < 160; x += 42) {
        g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        g.fillRect(x + (y % 40 ? 21 : 0), y, 39, 18);
      }
    }
    g.strokeStyle = "rgba(0,0,0,.34)";
    for (let y = 0; y < 160; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(160, y); g.stroke(); }
  } else if (pattern === "wood") {
    for (let i = 0; i < 36; i++) {
      g.strokeStyle = colors[i % colors.length];
      g.globalAlpha = 0.42;
      g.lineWidth = rand(1, 6);
      g.beginPath();
      g.moveTo(0, rand(0, 160));
      g.bezierCurveTo(45, rand(0, 160), 110, rand(0, 160), 160, rand(0, 160));
      g.stroke();
    }
  } else if (pattern === "leaves") {
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      g.globalAlpha = rand(0.12, 0.42);
      g.beginPath();
      g.ellipse(rand(0, 160), rand(0, 160), rand(2, 8), rand(1, 5), rand(0, 6), 0, Math.PI * 2);
      g.fill();
    }
  } else if (pattern === "metal") {
    for (let i = 0; i < 1100; i++) {
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      g.globalAlpha = rand(0.05, 0.32);
      g.fillRect(rand(0, 160), rand(0, 160), rand(1, 9), rand(1, 9));
    }
    g.globalAlpha = .18;
    g.strokeStyle = "#fff";
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 20, 0); g.lineTo(i * 20 + 25, 160); g.stroke(); }
  } else {
    for (let i = 0; i < 1100; i++) {
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      g.globalAlpha = rand(0.06, 0.3);
      g.fillRect(rand(0, 160), rand(0, 160), rand(1, 6), rand(1, 12));
    }
  }

  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

function mat(opts) { return new THREE.MeshStandardMaterial(opts); }

function createWeaponModel(w, scale = 1) {
  const group = new THREE.Group();
  const metal = mat({ color: w.color, roughness: 0.35, metalness: 0.55 });
  const dark = mat({ color: 0x111827, roughness: 0.65, metalness: 0.25 });
  const wood = mat({ color: 0x6b4325, roughness: 0.85, map: canvasTexture({ base: "#6b4325", colors: ["#8a5a34", "#3f2414"], repeat: 1, pattern: "wood" }) });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24 * scale, 0.18 * scale, 0.95 * scale), metal);
  body.position.set(0.32 * scale, -0.24 * scale, -0.66 * scale);
  group.add(body);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.035 * scale, 0.72 * scale, 16), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.32 * scale, -0.22 * scale, -1.27 * scale);
  group.add(barrel);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.18 * scale, 0.36 * scale), wood);
  stock.position.set(0.29 * scale, -0.25 * scale, -0.1 * scale);
  stock.rotation.x = -0.18;
  group.add(stock);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13 * scale, 0.42 * scale, 0.17 * scale), dark);
  grip.rotation.x = 0.38;
  grip.position.set(0.24 * scale, -0.52 * scale, -0.42 * scale);
  group.add(grip);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, 0.36 * scale, 0.19 * scale), dark);
  mag.rotation.x = -0.12;
  mag.position.set(0.32 * scale, -0.5 * scale, -0.68 * scale);
  group.add(mag);

  return group;
}

function createLootWeapon(w) {
  const g = createWeaponModel(w, 28);
  g.rotation.set(0, Math.random() * Math.PI, 0);
  return g;
}

function createPickupModel(type) {
  if (type === "shield") {
    const group = new THREE.Group();
    const bottleMat = mat({ color: 0x38bdf8, transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.1, map: canvasTexture({ base: "#38bdf8", colors: ["#0ea5e9", "#dbeafe"], repeat: 1 }) });
    const capMat = mat({ color: 0x1e293b, roughness: 0.55, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(32, 38, 105, 18), bottleMat);
    body.position.y = 52; body.castShadow = true; group.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 18, 16), capMat);
    cap.position.y = 112; cap.castShadow = true; group.add(cap);
    return group;
  }
  if (type === "medkit") {
    const group = new THREE.Group();
    const boxMat = mat({ color: 0xf8fafc, roughness: 0.55, map: canvasTexture({ base: "#f8fafc", colors: ["#e2e8f0", "#fecaca"], repeat: 1 }) });
    const redMat = mat({ color: 0xef4444, roughness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(110, 72, 90), boxMat);
    box.position.y = 36; box.castShadow = true; group.add(box);
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 75), redMat);
    cross1.position.set(0, 76, 0); group.add(cross1);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(70, 10, 18), redMat);
    cross2.position.set(0, 77, 0); group.add(cross2);
    return group;
  }
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(48), mat({ color: 0xa78bfa, roughness: 0.35, metalness: 0.25, map: canvasTexture({ base: "#7c3aed", colors: ["#a78bfa", "#4c1d95"], repeat: 1, pattern: "metal" }) }));
  core.position.y = 48; core.castShadow = true; group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(58, 5, 8, 22), mat({ color: 0xc4b5fd, emissive: 0x7c3aed, emissiveIntensity: .35, roughness: .25 }));
  ring.position.y = 48; ring.rotation.x = Math.PI / 2; group.add(ring);
  return group;
}

function createPlayerModel(color = 0x22c55e) {
  const g = new THREE.Group();
  const suit = mat({ color, roughness: 0.78, map: canvasTexture({ base: "#263449", colors: ["#111827", "#3b82f6", "#64748b", "#0f172a"], repeat: 1 }) });
  const skin = mat({ color: 0xe6b28a, roughness: 0.6 });
  const dark = mat({ color: 0x111827, roughness: 0.7, map: canvasTexture({ base: "#111827", colors: ["#020617", "#334155"], repeat: 1, pattern: "metal" }) });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(17, 50, 8, 14), suit);
  body.position.y = 54; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(14, 18, 14), skin);
  head.position.y = 95; head.castShadow = true; g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(15, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 100; helmet.castShadow = true; g.add(helmet);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(5, 34, 6, 8), suit);
  armL.position.set(-22, 58, 0); armL.rotation.z = .25; armL.castShadow = true; g.add(armL);
  const armR = armL.clone(); armR.position.x = 22; armR.rotation.z = -.25; g.add(armR);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(6, 42, 6, 8), dark);
  legL.position.set(-9, 20, 0); legL.castShadow = true; g.add(legL);
  const legR = legL.clone(); legR.position.x = 9; g.add(legR);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(22, 32, 10), dark);
  backpack.position.set(0, 58, 15); backpack.castShadow = true; g.add(backpack);
  return g;
}

function createChestModel() {
  const g = new THREE.Group();
  const wood = mat({ map: canvasTexture({ base: "#6b4325", colors: ["#8a5a34", "#3f2414", "#b7793f"], repeat: 1, pattern: "wood" }), roughness: .82 });
  const metal = mat({ color: 0xd6a63a, roughness: .3, metalness: .65 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(90, 48, 62), wood); base.position.y = 24; base.castShadow = true; g.add(base);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(94, 16, 66), metal); lid.position.y = 54; lid.castShadow = true; g.add(lid);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(18, 18, 8), metal); lock.position.set(0, 31, -36); g.add(lock);
  const glow = new THREE.PointLight(0xffd166, .42, 210); glow.position.set(0, 55, 0); g.add(glow);
  return g;
}

function createBattleBus(busMat, metalMat) {
  const bus = new THREE.Group();
  const dark = mat({ color: 0x0f172a, roughness: .55, metalness: .25 });
  const rubber = mat({ color: 0x080808, roughness: .85 });
  const glass = mat({ color: 0x9bdcff, emissive: 0x0b4264, emissiveIntensity: .35, roughness: .16, metalness: .05 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(940, 250, 320), busMat);
  body.castShadow = true; body.receiveShadow = true; bus.add(body);
  const front = new THREE.Mesh(new THREE.BoxGeometry(120, 185, 290), busMat); front.position.set(530, -8, 0); front.castShadow = true; bus.add(front);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(55, 70, 340), metalMat); bumper.position.set(615, -55, 0); bumper.castShadow = true; bus.add(bumper);
  const roofRack = new THREE.Mesh(new THREE.BoxGeometry(760, 36, 355), dark); roofRack.position.set(-60, 155, 0); roofRack.castShadow = true; bus.add(roofRack);

  for (let i = 0; i < 7; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(80, 70, 8), glass);
    win.position.set(-365 + i * 105, 45, -164); bus.add(win);
    const win2 = win.clone(); win2.position.z = 164; bus.add(win2);
  }
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(8, 90, 210), glass); windshield.position.set(592, 44, 0); bus.add(windshield);

  for (const x of [-350, -70, 260, 505]) {
    for (const z of [-190, 190]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(58, 58, 45, 20), rubber);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(x, -135, z); wheel.castShadow = true; bus.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 48, 16), metalMat);
      hub.rotation.x = Math.PI / 2; hub.position.set(x, -135, z); bus.add(hub);
    }
  }

  const topEngine = new THREE.Mesh(new THREE.BoxGeometry(620, 95, 165), metalMat);
  topEngine.position.set(-40, 265, 0); topEngine.castShadow = true; bus.add(topEngine);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 210, 10), dark);
  antenna.position.set(-360, 390, 0); antenna.castShadow = true; bus.add(antenna);

  for (const z of [-205, 205]) {
    const thruster = new THREE.Mesh(new THREE.CylinderGeometry(44, 58, 135, 18), metalMat);
    thruster.rotation.z = Math.PI / 2; thruster.position.set(-520, 30, z); thruster.castShadow = true; bus.add(thruster);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(42, 120, 18), mat({ color: 0xf97316, emissive: 0xfb923c, emissiveIntensity: 1.6, transparent: true, opacity: .82 }));
    flame.rotation.z = -Math.PI / 2; flame.position.set(-605, 30, z); bus.add(flame);
  }
  return bus;
}

function createAudioSystem() {
  let ctx = null;
  const ensure = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const tone = (freq = 440, dur = .08, type = "sine", gain = .05, slide = 0) => {
    const ac = ensure();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + dur);
    osc.connect(g); g.connect(ac.destination); osc.start(); osc.stop(ac.currentTime + dur);
  };
  const noise = (dur = .08, gain = .05, filterFreq = 900) => {
    const ac = ensure();
    const buffer = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ac.createBufferSource(); src.buffer = buffer;
    const filter = ac.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = filterFreq;
    const g = ac.createGain(); g.gain.value = gain;
    src.connect(filter); filter.connect(g); g.connect(ac.destination); src.start();
  };
  return {
    start: ensure,
    bus: () => { tone(72, .18, "sawtooth", .025, -18); noise(.18, .012, 220); },
    jump: () => { tone(210, .12, "triangle", .04, 90); noise(.06, .018, 1200); },
    gliderOpen: () => { noise(.22, .055, 1800); tone(320, .16, "triangle", .035, 180); },
    gliderClose: () => { noise(.1, .03, 1000); tone(260, .08, "triangle", .025, -80); },
    footstep: () => { noise(.045, .022, 420); tone(88, .035, "sine", .018, -15); },
    land: () => { noise(.16, .08, 500); tone(70, .12, "sine", .045, -20); },
    pickup: () => { tone(620, .08, "sine", .045, 280); tone(920, .1, "triangle", .028, 160); },
    chest: () => { tone(220, .1, "triangle", .04, 320); tone(660, .22, "sine", .04, 180); noise(.16, .03, 1700); },
    reload: () => { noise(.08, .035, 1100); setTimeout(() => noise(.06, .03, 900), 90); },
    hit: () => { tone(120, .08, "sawtooth", .055, -50); noise(.08, .04, 700); },
    shoot: (name) => {
      if (name === "Sniper") { noise(.12, .09, 900); tone(95, .12, "sawtooth", .06, -35); return; }
      if (name === "Shotgun") { noise(.16, .11, 650); tone(80, .14, "sawtooth", .055, -40); return; }
      if (name === "SMG") { noise(.045, .055, 1500); tone(190, .045, "square", .025, -40); return; }
      if (name === "Pistol") { noise(.06, .06, 1200); tone(160, .055, "square", .03, -50); return; }
      noise(.055, .07, 1600); tone(130, .055, "sawtooth", .035, -45);
    }
  };
}

export default function IslandRoyaleFPS() {
  const gameHostRef = useRef(null);
  const rendererRef = useRef(null);
  const keys = useRef({});
  const pointer = useRef(false);
  const mouseLook = useRef({ active: false, lastX: 0, lastY: 0 });
  const isMouseDown = useRef(false);
  const [screen, setScreen] = useState("menu");
  const [mode, setMode] = useState("squad");
  const [loading, setLoading] = useState({ active: false, progress: 0, text: "Preparing island..." });
  const prevKeys = useRef({});
  const [ui, setUi] = useState({
    phase: "lobby", hp: 100, shield: 0, weapon: "No weapon", ammo: 0,
    alive: 100, kills: 0, storm: 180, msg: "", team: [], slots: Array(6).fill(null), tab: false, map: false, prompt: "", playerX: 0, playerZ: 0, gliderOpen: false, safeStart: SAFE_START_SECONDS
  });

  useEffect(() => {
    const down = (e) => { keys.current[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === "tab") e.preventDefault(); };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.domElement?.remove();
      }
    };
  }, []);

  const start = () => {
    setScreen("game");
    setLoading({ active: true, progress: 8, text: "Starting battle bus..." });
    setTimeout(initGame, 120);
  };

  function initGame() {
    const host = gameHostRef.current;
    if (!host) return;

    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current.domElement?.remove();
      rendererRef.current = null;
    }

    const loadStep = (progress, text) => setLoading({ active: true, progress, text });
    loadStep(14, "Building terrain...");

    const audio = createAudioSystem();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x89cfff);
    scene.fog = new THREE.Fog(0x89cfff, 3000, 30000);

    const camera = new THREE.PerspectiveCamera(76, host.clientWidth / host.clientHeight, 0.1, 60000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("mousedown", () => audio.start(), { once: true });

    scene.add(new THREE.HemisphereLight(0xcff5ff, 0x29451d, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-6000, 9000, 4600);
    sun.castShadow = true;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 95, 95),
      mat({ map: canvasTexture({ base: "#307b36", colors: ["#1d5f2a", "#4ba348", "#265c2f"], repeat: 520 }), roughness: 0.96 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    loadStep(28, "Placing towns and roads...");
    const wallMat = mat({ map: canvasTexture({ base: "#7b6857", colors: ["#8a7561", "#6d5a4b", "#9b8b79", "#4d3f34"], repeat: 2, pattern: "brick" }), roughness: 0.8 });
    const roofMat = mat({ map: canvasTexture({ base: "#412a1f", colors: ["#573324", "#2a1712", "#71412d"], repeat: 2, pattern: "wood" }), roughness: 0.9 });
    const metalMat = mat({ color: 0x5b6470, roughness: 0.42, metalness: 0.55, map: canvasTexture({ base: "#5b6470", colors: ["#202633", "#8b94a1", "#64748b"], repeat: 2, pattern: "metal" }) });
    const woodMat = mat({ map: canvasTexture({ base: "#6b4325", colors: ["#8a5a34", "#3f2414"], repeat: 2, pattern: "wood" }), roughness: 0.9 });
    const roadMat = mat({ color: 0x242424, roughness: 0.85 });

    const objects = [];
    const interiors = [];
    const doors = [];
    const chests = [];
    const blockers = [];
    const loot = [];
    const bots = [];
    const bullets = [];
    const pickupAnim = [];

    function addBuilding(x, z, w = 760, d = 640, h = 420) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      body.position.y = h / 2; body.castShadow = body.receiveShadow = true; b.add(body);
      const door = new THREE.Mesh(new THREE.BoxGeometry(120, 180, 8), mat({ color: 0x2b1b12, roughness: .8, map: canvasTexture({ base: "#2b1b12", colors: ["#1a0f09", "#5b341d"], repeat: 1, pattern: "wood" }) }));
      door.position.set(0, 90, -d / 2 - 5); b.add(door);
      for (let i = 0; i < 4; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(95, 78), mat({ color: 0x9bdcff, emissive: 0x14364a, emissiveIntensity: .3, roughness: .2 }));
        win.position.set(i < 2 ? -w / 2 - 1 : w / 2 + 1, h * .58, i % 2 ? -d * .22 : d * .22);
        win.rotation.y = i < 2 ? -Math.PI / 2 : Math.PI / 2; b.add(win);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 100, 4), roofMat);
      roof.rotation.y = Math.PI / 4; roof.position.y = h + 55; roof.castShadow = true; b.add(roof);
      b.position.set(x, 0, z); scene.add(b);
      objects.push({ type: "building", x, z, r: Math.max(w, d) / 2, w, d });
      const doorObj = { x, z: z - d / 2 - 5, parentX: x, parentZ: z, w, d, open: false, mesh: door };
      doors.push(doorObj);
      blockers.push({ type: "box", x, z, w, d, door: doorObj });
      interiors.push({ x, z, w, d, h, door: doorObj });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w * .82, d * .72), mat({ map: canvasTexture({ base: "#5b3b21", colors: ["#7a4d2a", "#2f1a0e"], repeat: 4, pattern: "wood" }), roughness: .9 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(x, 7, z); scene.add(floor);
      if (Math.random() < .55) addChest(x + rand(-w * .25, w * .25), z + rand(-d * .2, d * .2));
    }

    function addTree(x, z) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(20, 28, 180, 10), woodMat);
      trunk.position.y = 90; trunk.castShadow = true; g.add(trunk);
      const leafMat = mat({ color: 0x14532d, roughness: 1, map: canvasTexture({ base: "#14532d", colors: ["#0f3f25", "#1f7a3d", "#2f8f46"], repeat: 1, pattern: "leaves" }) });
      for (let i = 0; i < 3; i++) {
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(105 - i * 18, 210 - i * 32, 10), leafMat);
        leaves.position.y = 200 + i * 76; leaves.castShadow = true; g.add(leaves);
      }
      g.position.set(x, 0, z); scene.add(g); objects.push({ type: "tree", x, z, r: 95 });
    }

    function addBush(x, z) {
      const bushMat = mat({ color: 0x166534, roughness: 1, map: canvasTexture({ base: "#166534", colors: ["#052e16", "#22c55e", "#15803d"], repeat: 1, pattern: "leaves" }) });
      const m = new THREE.Mesh(new THREE.SphereGeometry(rand(55, 95), 16, 10), bushMat);
      m.scale.y = 0.48; m.position.set(x, 35, z); m.castShadow = true; scene.add(m); objects.push({ type: "bush", x, z, r: 70 });
    }

    function addRock(x, z) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(65, 135), 0), mat({ color: 0x71717a, roughness: 0.95 }));
      m.scale.y = rand(0.45, 0.95); m.position.set(x, 55, z); m.castShadow = m.receiveShadow = true; scene.add(m); objects.push({ type: "rock", x, z, r: 105 });
    }

    function addCrate(x, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(140, 105, 140), woodMat);
      m.position.set(x, 52, z); m.castShadow = m.receiveShadow = true; scene.add(m); objects.push({ type: "crate", x, z, r: 110 });
    }

    function addVehicle(x, z) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(300, 90, 150), metalMat);
      body.position.y = 82; body.castShadow = true; g.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(175, 75, 135), metalMat);
      top.position.set(-20, 145, 0); top.castShadow = true; g.add(top);
      const tireMat = mat({ color: 0x0b0b0b, roughness: .75 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 28, 16), tireMat);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * 95, 38, sz * 82); wheel.castShadow = true; g.add(wheel);
      }
      g.position.set(x, 0, z); scene.add(g); objects.push({ type: "vehicle", x, z, r: 200 });
    }

    function addChest(x, z) {
      const mesh = createChestModel();
      mesh.position.set(x, 0, z); mesh.rotation.y = rand(0, Math.PI * 2); scene.add(mesh);
      chests.push({ x, z, opened: false, mesh });
      objects.push({ type: "chest", x, z, r: 45 });
    }

    function addRoad(x1, z1, x2, z2) {
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(300, len), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -Math.atan2(dx, dz);
      road.position.set((x1 + x2) / 2, 4, (z1 + z2) / 2);
      scene.add(road);
    }

    for (let i = 0; i < POIS.length; i++) {
      const [, x, z] = POIS[i];
      const [, x2, z2] = POIS[(i + 1) % POIS.length];
      addRoad(x, z, x2, z2);
    }

    POIS.forEach(([, x, z]) => {
      for (let i = 0; i < 14; i++) addBuilding(x + rand(-1900, 1900), z + rand(-1600, 1600), rand(680, 1180), rand(540, 980), rand(360, 760));
      for (let i = 0; i < 12; i++) addCrate(x + rand(-1750, 1750), z + rand(-1450, 1450));
      for (let i = 0; i < 5; i++) addVehicle(x + rand(-1800, 1800), z + rand(-1500, 1500));
    });

    loadStep(48, "Adding forests, props and cover...");
    for (let i = 0; i < 560; i++) {
      addTree(rand(-WORLD_LIMIT, WORLD_LIMIT), rand(-WORLD_LIMIT, WORLD_LIMIT));
      if (i % 2 === 0) addBush(rand(-WORLD_LIMIT, WORLD_LIMIT), rand(-WORLD_LIMIT, WORLD_LIMIT));
      if (i % 5 === 0) addRock(rand(-WORLD_LIMIT, WORLD_LIMIT), rand(-WORLD_LIMIT, WORLD_LIMIT));
      if (i % 20 === 0) addCrate(rand(-WORLD_LIMIT, WORLD_LIMIT), rand(-WORLD_LIMIT, WORLD_LIMIT));
    }
    for (let i = 0; i < 70; i++) {
      const x = rand(-WORLD_LIMIT + 1200, WORLD_LIMIT - 1200);
      const z = rand(-WORLD_LIMIT + 1200, WORLD_LIMIT - 1200);
      addBuilding(x, z, rand(520, 760), rand(440, 660), rand(260, 420));
      addChest(x + rand(-140, 140), z + rand(-120, 120));
      if (Math.random() < .65) addLoot(x + rand(-190, 190), z + rand(-170, 170), Math.random() < .7 ? "weapon" : "medkit");
    }

    const lake = new THREE.Mesh(new THREE.CircleGeometry(2700, 72), mat({ color: 0x38bdf8, transparent: true, opacity: 0.75, roughness: 0.08, metalness: 0.15 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(0, 12, 0); scene.add(lake);

    function addLoot(x, z, type = "weapon") {
      const w = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      const mesh = type === "weapon"
        ? createLootWeapon(w)
        : createPickupModel(type);
      mesh.position.set(x, 85, z); mesh.castShadow = true; scene.add(mesh);
      loot.push({ x, z, type, weapon: w, mesh, id: Math.random() });
    }

    loadStep(66, "Spawning loot...");
    objects.forEach((o) => {
      const chance = o.type === "building" ? 0.45 : o.type === "crate" ? 0.35 : 0.02;
      if (Math.random() < chance) addLoot(o.x + rand(-160, 160), o.z + rand(-160, 160), Math.random() < 0.7 ? "weapon" : Math.random() < 0.52 ? "shield" : "medkit");
    });
    for (let i = 0; i < 120; i++) addLoot(rand(-WORLD_LIMIT + 800, WORLD_LIMIT - 800), rand(-WORLD_LIMIT + 800, WORLD_LIMIT - 800));
    chests.forEach((c) => { if (Math.random() < .25) addLoot(c.x + rand(-120, 120), c.z + rand(-120, 120), "shield"); });

    const busMat = mat({ color: 0x1e3a8a, roughness: 0.42, metalness: 0.3, map: canvasTexture({ base: "#1e3a8a", colors: ["#2563eb", "#0f172a", "#60a5fa"], repeat: 3, pattern: "metal" }) });
    const bus = createBattleBus(busMat, metalMat);
    scene.add(bus);

    const player = {
      x: -WORLD_LIMIT + 1600, z: -14000, y: BUS_HEIGHT, vy: 0,
      hp: 100, shield: 0, alive: true, phase: "bus", parachute: false, gliderOpen: false,
      weapon: null, mag: 0, ammo: 0, kills: 0, yaw: 0, pitch: 0, team: 0,
      slots: Array(6).fill(null), selected: 0, nextShot: 0, pickLock: 0, gliderAnim: 0, busCamYaw: 0, busCamPitch: 0.25,
      walkBob: 0, lastFootstep: 0, reloadAnim: 0, recoil: 0, landedOnce: false, crouching: false
    };

    const weaponHolder = new THREE.Group();
    weaponHolder.position.set(0.32, -0.22, -0.45);
    weaponHolder.rotation.order = "YXZ";
    camera.add(weaponHolder);
    scene.add(camera);
    const parachuteMesh = new THREE.Mesh(new THREE.ConeGeometry(310, 95, 4), mat({ color: 0xffffff, transparent: true, opacity: 0.9, roughness: 0.55, map: canvasTexture({ base: "#f8fafc", colors: ["#dbeafe", "#93c5fd"], repeat: 1 }) }));
    parachuteMesh.rotation.y = Math.PI / 4;
    parachuteMesh.visible = false; scene.add(parachuteMesh);

    function equipSlot(idx) {
      const item = player.slots[idx];
      player.selected = idx;
      weaponHolder.clear();
      if (item?.weapon) {
        player.weapon = item.weapon;
        player.mag = item.mag ?? item.weapon.mag;
        player.ammo = item.ammo ?? item.weapon.mag * 4;
        const wm = createWeaponModel(item.weapon, 1);
        wm.position.set(0.28, -0.24, -0.62);
        wm.rotation.x = -0.35;
        weaponHolder.add(wm);
        audio.pickup();
      } else {
        player.weapon = null; player.mag = 0; player.ammo = 0;
      }
    }

    function addToInventory(w) {
      let idx = player.slots.findIndex((x) => !x);
      if (idx < 0) idx = player.selected;
      player.slots[idx] = { weapon: w, mag: w.mag, ammo: w.mag * 4 };
      setTimeout(() => equipSlot(idx), 260);
    }

    function makeBot(id) {
      const size = teamSize(mode);
      const team = Math.floor(id / size);
      const mesh = createPlayerModel(new THREE.Color().setHSL(Math.random(), 0.65, 0.55).getHex());
      scene.add(mesh);
      const poi = POIS[id % POIS.length];
      const laneProgress = id / BOT_COUNT;
      return {
        id, team, name: `${NAMES[id % NAMES.length]}${Math.floor(rand(10, 99))}`,
        x: -WORLD_LIMIT + rand(1000, 2400), z: -14000 + rand(-500, 500), y: BUS_HEIGHT + rand(-80, 80),
        hp: 100, shield: rand(0, 55), alive: true, phase: "bus", parachute: false, gliderOpen: false,
        dropTarget: [poi[0], poi[1] + rand(-2600, 2600), poi[2] + rand(-2200, 2200)],
        jumpAt: 1.5 + laneProgress * 58 + rand(-2.2, 2.2),
        weapon: null, mag: 0, nextShot: 0, mesh, kills: 0
      };
    }

    loadStep(82, "Filling lobby with bots...");
    for (let i = 1; i <= BOT_COUNT; i++) bots.push(makeBot(i));
    bots.sort((a, b) => a.jumpAt - b.jumpAt);

    const storm = { x: 0, z: 0, r: 21000, timer: 260 };
    let safeStart = SAFE_START_SECONDS;
    let last = performance.now();
    let over = false;
    let win = false;
    let busT = 0;
    const busZ = -14000;

    function rotateCamera(dx, dy) {
      if (player.phase === "bus") {
        player.busCamYaw -= dx * 0.0022;
        player.busCamPitch = clamp(player.busCamPitch - dy * 0.0015, -0.25, 0.9);
        return;
      }
      if (player.phase !== "falling" && player.phase !== "landed") return;
      player.yaw -= dx * 0.0022;
      player.pitch = clamp(player.pitch - dy * 0.0018, -0.85, 0.85);
    }

    renderer.domElement.addEventListener("mousedown", (e) => {
      mouseLook.current.active = true;
      mouseLook.current.lastX = e.clientX;
      mouseLook.current.lastY = e.clientY;
      if (e.button === 0 && !isMouseDown.current) {
        keys.current.mouse0 = true;
        isMouseDown.current = true;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        keys.current.mouse0 = false;
        isMouseDown.current = false;
      }
    });
    window.addEventListener("mousemove", (e) => {
      const dx = mouseLook.current.lastX ? e.clientX - mouseLook.current.lastX : 0;
      const dy = mouseLook.current.lastY ? e.clientY - mouseLook.current.lastY : 0;
      mouseLook.current.lastX = e.clientX;
      mouseLook.current.lastY = e.clientY;
      if (player.phase === "bus" || player.phase === "falling" || mouseLook.current.active) rotateCamera(dx, dy);
    });

    function shoot(shooter, yaw, pitch, now) {
      if (!shooter.weapon || shooter.mag <= 0 || now < (shooter.nextShot || 0)) return;
      shooter.nextShot = now + shooter.weapon.fireRate;
      shooter.mag--;
      if (shooter === player && player.slots[player.selected]) {
        player.slots[player.selected].mag = shooter.mag;
        player.recoil = 1;
        audio.shoot(shooter.weapon.name);
      }
      const spread = shooter.weapon.name === "Shotgun" ? 0.1 : 0.025;
      const dir = new THREE.Vector3(
        Math.sin(yaw + rand(-spread, spread)) * Math.cos(pitch),
        Math.sin(pitch + rand(-spread, spread)),
        Math.cos(yaw + rand(-spread, spread)) * Math.cos(pitch)
      ).normalize();
      bullets.push({ x: shooter.x, y: (shooter.y || 0) + 82, z: shooter.z, dir, life: shooter.weapon.range, damage: shooter.weapon.damage, team: shooter.team, owner: shooter });
    }

    function damage(obj, amount, attacker) {
      if (!obj.alive || attacker?.team === obj.team) return;
      const s = Math.min(obj.shield || 0, amount);
      obj.shield -= s;
      obj.hp -= amount - s;
      if (obj === player) audio.hit();
      if (obj.hp <= 0) {
        obj.alive = false; obj.hp = 0;
        if (attacker) attacker.kills = (attacker.kills || 0) + 1;
        if (obj.mesh) obj.mesh.visible = false;
        if (obj.weapon) addLoot(obj.x, obj.z, "weapon");
      }
    }

    function openDoor() {
      let best = null;
      let bd = 220;
      for (const d of doors) {
        const dist = Math.hypot(d.x - player.x, d.z - player.z);
        if (dist < bd) { bd = dist; best = d; }
      }
      if (!best) return false;
      best.open = !best.open;
      best.mesh.rotation.y = best.open ? -Math.PI / 2 : 0;
      audio.pickup();
      return true;
    }

    function openChest() {
      let best = null, bd = 230;
      for (const c of chests) {
        if (c.opened) continue;
        const d = Math.hypot(c.x - player.x, c.z - player.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) return false;
      best.opened = true;
      audio.chest();
      best.mesh.rotation.x = -0.18;
      const w = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      addLoot(best.x + 120, best.z, "weapon");
      addLoot(best.x - 85, best.z + 55, Math.random() > .5 ? "shield" : "medkit");
      addLoot(best.x + 20, best.z - 120, Math.random() > .55 ? "mobility" : "medkit");
      return true;
    }

    function pickup() {
      if (performance.now() < player.pickLock) return;
      if (openDoor()) { player.pickLock = performance.now() + 350; return; }
      if (openChest()) { player.pickLock = performance.now() + 600; return; }
      let best = -1, bd = 240;
      for (let i = 0; i < loot.length; i++) {
        const d = Math.hypot(loot[i].x - player.x, loot[i].z - player.z);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return;
      const l = loot[best];
      player.pickLock = performance.now() + 520;
      pickupAnim.push({ mesh: l.mesh, t: 0 });
      audio.pickup();
      setTimeout(() => {
        if (l.type === "weapon") addToInventory(l.weapon);
        if (l.type === "shield") player.shield = clamp(player.shield + 35, 0, 100);
        if (l.type === "medkit") player.hp = clamp(player.hp + 40, 0, 100);
        if (l.type === "mobility") player.shield = clamp(player.shield + 20, 0, 100);
        scene.remove(l.mesh);
        const idx = loot.indexOf(l);
        if (idx >= 0) loot.splice(idx, 1);
      }, 430);
    }

    function resolveCollision(entity, oldX, oldZ) {
      for (const wall of blockers) {
        const halfW = wall.w / 2 + PLAYER_RADIUS;
        const halfD = wall.d / 2 + PLAYER_RADIUS;
        const inside = Math.abs(entity.x - wall.x) < halfW && Math.abs(entity.z - wall.z) < halfD;
        if (!inside) continue;
        const nearDoor = wall.door?.open && Math.abs(entity.x - wall.door.x) < 170 && Math.abs(entity.z - wall.door.z) < 170;
        if (nearDoor) continue;
        entity.x = oldX;
        entity.z = oldZ;
        return;
      }
      for (const obj of objects) {
        if (obj.type === "building") continue;
        const d = Math.hypot(entity.x - obj.x, entity.z - obj.z);
        const min = (obj.r || 70) + PLAYER_RADIUS * 0.35;
        if (d > 0 && d < min) {
          entity.x = obj.x + ((entity.x - obj.x) / d) * min;
          entity.z = obj.z + ((entity.z - obj.z) / d) * min;
        }
      }
    }

    function botPickup(b) {
      let best = -1, bd = 220;
      for (let i = 0; i < loot.length; i++) {
        const d = Math.hypot(loot[i].x - b.x, loot[i].z - b.z);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return;
      const l = loot[best];
      if (l.type === "weapon") { b.weapon = l.weapon; b.mag = l.weapon.mag; }
      if (l.type === "shield") b.shield = clamp(b.shield + 35, 0, 100);
      if (l.type === "medkit") b.hp = clamp(b.hp + 40, 0, 100);
      scene.remove(l.mesh); loot.splice(best, 1);
    }

    function nearestEnemy(b) {
      let best = null, bd = 1e9;
      for (const e of [player, ...bots]) {
        if (e.alive && e.team !== b.team && e.phase === "landed") {
          const d = Math.hypot(e.x - b.x, e.z - b.z);
          if (d < bd) { bd = d; best = e; }
        }
      }
      return { best, bd };
    }

    function botStep(b, dt, now) {
      if (!b.alive) return;
      if (b.phase === "bus") {
        b.x = bus.position.x + rand(-220, 220);
        b.z = bus.position.z + rand(-80, 80);
        b.y = bus.position.y - 180;
        if (busT > b.jumpAt) { b.phase = "falling"; b.parachute = true; b.gliderOpen = false; }
      } else if (b.phase === "falling") {
        const poi = b.dropTarget;
        const a = Math.atan2(poi[1] - b.x, poi[2] - b.z);
        const glide = b.y < AUTO_GLIDER_HEIGHT || b.gliderOpen;
        if (b.y < AUTO_GLIDER_HEIGHT) b.gliderOpen = true;
        b.x += Math.sin(a) * (glide ? 14 : 38) * dt;
        b.z += Math.cos(a) * (glide ? 14 : 38) * dt;
        b.y -= (glide ? GLIDER_FALL_SPEED : FREE_FALL_SPEED) * dt;
        if (b.y <= 8) { b.y = 8; b.phase = "landed"; b.parachute = false; b.gliderOpen = false; }
      } else {
        if (!b.weapon) {
          let l = loot[0], bd = 1e9;
          for (const item of loot) {
            const d = Math.hypot(item.x - b.x, item.z - b.z);
            if (d < bd) { bd = d; l = item; }
          }
          if (l) {
            const a = Math.atan2(l.x - b.x, l.z - b.z);
            const oldX = b.x, oldZ = b.z;
            b.x += Math.sin(a) * 8 * dt;
            b.z += Math.cos(a) * 8 * dt;
            resolveCollision(b, oldX, oldZ);
            botPickup(b);
          }
        } else {
          const { best, bd } = nearestEnemy(b);
          if (best && bd < b.weapon.range * 0.85) {
            const yaw = Math.atan2(best.x - b.x, best.z - b.z);
            if (bd > 260) { const oldX = b.x, oldZ = b.z; b.x += Math.sin(yaw) * 8 * dt; b.z += Math.cos(yaw) * 8 * dt; resolveCollision(b, oldX, oldZ); }
            shoot(b, yaw, 0, now);
          } else {
            const p = POIS[b.id % POIS.length];
            const a = Math.atan2(p[1] - b.x, p[2] - b.z);
            const oldX = b.x, oldZ = b.z;
            b.x += Math.sin(a) * 5 * dt;
            b.z += Math.cos(a) * 5 * dt;
            resolveCollision(b, oldX, oldZ);
          }
        }
        if (safeStart <= 0 && Math.hypot(b.x - storm.x, b.z - storm.z) > storm.r) damage(b, 0.12 * dt, null);
      }
      if (b.mesh) {
        b.mesh.visible = b.phase !== "bus" && b.alive;
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.rotation.y = Math.atan2(player.x - b.x, player.z - b.z);
      }
    }

    function justPressed(key) {
      return !!keys.current[key] && !prevKeys.current[key];
    }

    function updateCamera(dt) {
      if (player.phase === "bus") {
        player.x = bus.position.x;
        player.z = bus.position.z;
        player.y = bus.position.y + 120;
        const camYaw = player.busCamYaw;
        const camPitch = player.busCamPitch;
        camera.position.set(
          bus.position.x - Math.cos(camYaw) * BUS_CAMERA_DISTANCE,
          bus.position.y + BUS_CAMERA_HEIGHT + Math.sin(camPitch) * 420,
          bus.position.z + Math.sin(camYaw) * BUS_CAMERA_DISTANCE
        );
        camera.lookAt(bus.position.x + 200, bus.position.y + 70, bus.position.z);
        if (justPressed(" ")) {
          audio.jump();
          player.phase = "falling";
          player.parachute = true;
          player.gliderOpen = false;
          player.gliderAnim = 0;
          player.y = bus.position.y - 260;
          player.x = bus.position.x;
          player.z = bus.position.z;
          player.yaw = 0;
          player.pitch = 0;
          camera.up.set(0, 1, 0);
          camera.rotation.order = "YXZ";
          camera.rotation.z = 0;
        }
        return;
      }

      const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).normalize();
      const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw)).normalize();
      const move = new THREE.Vector3();
      if (keys.current.w) move.add(forward);
      if (keys.current.s) move.sub(forward);
      if (keys.current.d) move.add(right);
      if (keys.current.a) move.sub(right);
      if (move.length() > 0) move.normalize();

      if (player.phase === "falling") {
        if (justPressed("e")) {
          player.gliderOpen = !player.gliderOpen;
          if (player.gliderOpen) audio.gliderOpen(); else audio.gliderClose();
        }
        if (player.y < AUTO_GLIDER_HEIGHT && !player.gliderOpen) { player.gliderOpen = true; audio.gliderOpen(); }
        player.gliderAnim = THREE.MathUtils.lerp(player.gliderAnim, player.gliderOpen ? 1 : 0, 0.08 * dt);
        const glide = player.gliderOpen;
        const spd = (glide ? 12 : 24) * dt;
        player.x += move.x * spd;
        player.z += move.z * spd;
        player.y -= (glide ? GLIDER_FALL_SPEED : FREE_FALL_SPEED) * dt;
        if (player.y <= 8) { player.y = 8; player.phase = "landed"; player.parachute = false; player.gliderOpen = false; player.gliderAnim = 0; if (!player.landedOnce) { audio.land(); player.landedOnce = true; } }
        camera.up.set(0, 1, 0);
        camera.rotation.order = "YXZ";
        const fallCamBack = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
        const lookTarget = new THREE.Vector3(player.x + Math.sin(player.yaw) * 120, player.y + 90 + Math.sin(player.pitch) * 130, player.z + Math.cos(player.yaw) * 120);
        camera.position.set(player.x + fallCamBack.x * 420, player.y + 215, player.z + fallCamBack.z * 420);
        camera.lookAt(lookTarget);
        camera.rotation.z = 0;
        return;
      }

      player.crouching = !!keys.current.control;
      const moveSpeed = player.crouching ? CROUCH_SPEED : (keys.current.shift ? SPRINT_SPEED : PLAYER_SPEED);
      const spd = moveSpeed * dt;
      const oldX = player.x, oldZ = player.z;
      player.x += move.x * spd;
      player.z += move.z * spd;
      resolveCollision(player, oldX, oldZ);
      if (justPressed(" ") && player.y <= 8) { player.vy = JUMP_FORCE; audio.jump(); }
      player.vy -= GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y < 8) { player.y = 8; player.vy = 0; }

      player.x = clamp(player.x, -WORLD_LIMIT + 300, WORLD_LIMIT - 300);
      player.z = clamp(player.z, -WORLD_LIMIT + 300, WORLD_LIMIT - 300);
      const moving = move.length() > 0 && player.y <= 8;
      if (moving) {
        player.walkBob += dt * (keys.current.shift ? 0.16 : 0.11);
        if (performance.now() - player.lastFootstep > (keys.current.shift ? 270 : 420)) {
          audio.footstep();
          player.lastFootstep = performance.now();
        }
      }
      const bob = moving ? Math.sin(player.walkBob) * (player.crouching ? 1.5 : 3.5) : 0;
      player.recoil = THREE.MathUtils.lerp(player.recoil, 0, 0.18 * dt);
      player.reloadAnim = THREE.MathUtils.lerp(player.reloadAnim, 0, 0.08 * dt);
      if (weaponHolder.children[0]) {
        weaponHolder.children[0].position.y = -0.24 - player.recoil * 0.08 - player.reloadAnim * 0.22;
        weaponHolder.children[0].position.z = -0.62 + player.recoil * 0.18;
        weaponHolder.children[0].rotation.x = -0.35 - player.recoil * 0.22 + player.reloadAnim * 0.8;
        weaponHolder.children[0].rotation.z = Math.sin(player.walkBob) * 0.025;
      }
      camera.up.set(0, 1, 0);
      camera.rotation.order = "YXZ";
      const camTarget = new THREE.Vector3(
        player.x + Math.sin(player.yaw) * 100,
        player.y + (player.crouching ? 52 : 78) + bob + Math.sin(player.pitch) * 100,
        player.z + Math.cos(player.yaw) * 100
      );
      camera.position.set(player.x, player.y + (player.crouching ? 52 : 78) + bob, player.z);
      camera.lookAt(camTarget);
      camera.rotation.z = 0;
    }

    function animate(now) {
      const dt = Math.min(40, now - last) / 16.67;
      last = now;
      if (!over) {
        busT += dt / 60;
        bus.position.set(-WORLD_LIMIT + 1600 + busT * BUS_SPEED, BUS_HEIGHT, busZ);
        bus.rotation.y = 0;
        if (Math.floor(now / 900) !== Math.floor((now - 16) / 900) && player.phase === "bus") audio.bus();
        if (bus.position.x > WORLD_LIMIT - 1600 && player.phase === "bus") {
          audio.jump();
          player.phase = "falling";
          player.parachute = true;
          player.gliderOpen = false;
          player.gliderAnim = 0;
          player.yaw = 0;
          player.pitch = 0;
          camera.up.set(0, 1, 0);
          camera.rotation.order = "YXZ";
          camera.rotation.z = 0;
          player.y = bus.position.y - 240;
        }

        updateCamera(dt);
        if (keys.current.e) pickup();
        for (let i = 0; i < 6; i++) if (keys.current[String(i + 1)]) equipSlot(i);
        if (justPressed("r") && player.weapon) {
          player.reloadAnim = 1;
          audio.reload();
          setTimeout(() => {
            player.mag = player.weapon.mag;
            if (player.slots[player.selected]) player.slots[player.selected].mag = player.mag;
          }, 260);
        }
        if (keys.current.mouse0 && player.phase === "landed") {
          shoot(player, player.yaw, player.pitch, now);
          keys.current.mouse0 = false;
        }

        parachuteMesh.visible = player.phase === "falling" && player.gliderAnim > 0.02;
        if (parachuteMesh.visible) {
          parachuteMesh.position.set(player.x, player.y + 250, player.z);
          parachuteMesh.scale.setScalar(player.gliderAnim);
          parachuteMesh.rotation.y = Math.PI / 4 + Math.sin(now * 0.004) * 0.08;
        }

        if (safeStart > 0) safeStart -= dt / 60;
        else if (storm.timer > 0) storm.timer -= dt / 60;
        else storm.r = Math.max(1800, storm.r - 7 * dt);
        if (safeStart <= 0 && player.phase === "landed" && Math.hypot(player.x - storm.x, player.z - storm.z) > storm.r) damage(player, 0.14 * dt, null);

        bots.forEach((b) => botStep(b, dt, now));

        for (let i = bullets.length - 1; i >= 0; i--) {
          const bl = bullets[i];
          bl.x += bl.dir.x * 95 * dt;
          bl.y += bl.dir.y * 95 * dt;
          bl.z += bl.dir.z * 95 * dt;
          bl.life -= 95 * dt;
          let hit = false;
          const targets = bl.team === 0 ? bots : [player, ...bots.filter((x) => x.team !== bl.team)];
          for (const t of targets) {
            if (t.alive && t.phase === "landed" && Math.hypot(t.x - bl.x, t.z - bl.z) < 34 && Math.abs((t.y || 0) + 65 - bl.y) < 95) {
              damage(t, bl.damage, bl.owner); hit = true; break;
            }
          }
          if (hit || bl.life <= 0) bullets.splice(i, 1);
        }

        for (let i = pickupAnim.length - 1; i >= 0; i--) {
          const a = pickupAnim[i];
          a.t += dt * 0.05;
          if (a.mesh) {
            a.mesh.position.lerp(new THREE.Vector3(player.x, player.y + 70, player.z), 0.18);
            a.mesh.rotation.y += 0.22;
            a.mesh.scale.multiplyScalar(0.975);
          }
          if (a.t > 1) pickupAnim.splice(i, 1);
        }

        loot.forEach((l) => {
          l.mesh.rotation.y += 0.018;
          l.mesh.position.y = 85 + Math.sin(now * 0.004 + l.x) * 10;
        });

        const alive = [player, ...bots].filter((x) => x.alive);
        const teams = new Set(alive.map((x) => x.team));
        if (!player.alive || teams.size <= 1) { over = true; win = player.alive && teams.has(0); }
      }

      renderer.render(scene, camera);

      let prompt = "";
      if (player.phase === "bus") prompt = "Press SPACE to jump · move mouse to rotate bus camera";
      else if (player.phase === "falling" && !player.gliderOpen) prompt = "Press E to deploy glider · move mouse to rotate camera";
      else if (player.phase === "falling" && player.gliderOpen && player.y > AUTO_GLIDER_HEIGHT + 120) prompt = "Press E to close glider";
      else {
        let near = null, bd = 240;
        for (const l of loot) {
          const d = Math.hypot(l.x - player.x, l.z - player.z);
          if (d < bd) { bd = d; near = l; }
        }
        for (const c of chests) {
          if (!c.opened) {
            const d = Math.hypot(c.x - player.x, c.z - player.z);
            if (d < bd) { bd = d; near = { type: "chest" }; }
          }
        }
        for (const d of doors) {
          const doorDist = Math.hypot(d.x - player.x, d.z - player.z);
          if (doorDist < bd) { bd = doorDist; near = { type: d.open ? "close door" : "door" }; }
        }
        if (near) prompt = near.type === "door" ? "Press E to open door" : near.type === "close door" ? "Press E to close door" : near.type === "chest" ? "Press E to open chest" : `Press E to pick up ${near.type === "weapon" ? near.weapon.name : near.type}`;
      }

      setUi({
        phase: player.phase,
        hp: Math.round(player.hp),
        shield: Math.round(player.shield),
        weapon: player.weapon?.name || "No weapon",
        ammo: player.weapon ? player.mag : 0,
        alive: [player, ...bots].filter((x) => x.alive).length,
        kills: player.kills || 0,
        storm: Math.max(0, Math.round(storm.timer)),
        safeStart: Math.max(0, Math.round(safeStart)),
        msg: over ? (win ? "YOU WON THE ISLAND" : "DEFEAT") : "",
        team: [player, ...bots].filter((x) => x.team === 0).slice(0, teamSize(mode)),
        slots: [...player.slots],
        tab: !!keys.current.tab,
        map: !!keys.current.m,
        playerX: player.x,
        playerZ: player.z,
        gliderOpen: player.gliderOpen,
        prompt
      });

      prevKeys.current = { ...keys.current };
      requestAnimationFrame(animate);
    }

    loadStep(100, "Ready");
    setTimeout(() => setLoading({ active: false, progress: 100, text: "Ready" }), 250);
    requestAnimationFrame(animate);
  }

  if (screen === "menu") {
    return (
      <div className="min-h-screen bg-[#05070b] text-white flex">
        <aside className="w-[360px] bg-black/70 border-r border-white/10 p-7 flex flex-col justify-between">
          <div>
            <Badge className="bg-emerald-400 text-black mb-6">Playable in ChatGPT</Badge>
            <h1 className="text-5xl font-black leading-none mb-3">Island<br /><span className="text-emerald-300">Royale FPS</span></h1>
            <p className="text-slate-400 mb-8">Battle Royale original con bus, bots, loot, storm, inventario y mapa gigante optimizado.</p>
            <div className="space-y-3 mb-8">
              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">Game mode</div>
              {["solo", "duo", "trio", "squad"].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`w-full rounded-2xl p-4 border text-left transition ${mode === m ? "bg-emerald-400 text-black border-emerald-300" : "bg-white/5 border-white/10 hover:bg-white/10"}`}
                >
                  <div className="text-xl font-black capitalize">{m}</div>
                  <div className={`text-sm ${mode === m ? "text-black/70" : "text-slate-400"}`}>Team size {teamSize(m)} · 100 player lobby</div>
                </button>
              ))}
            </div>
            <Button onClick={start} className="w-full h-14 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-black font-black text-lg">Play Match</Button>
          </div>
          <div className="text-xs text-slate-500 leading-relaxed">Controls: camera always follows mouse · WASD move · CTRL crouch · Space jump from bus · E glider/loot/chest · M map · Tab inventory · 1-6 equip.</div>
        </aside>

        <main className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(16,185,129,.35),transparent_35%),radial-gradient(circle_at_30%_80%,rgba(59,130,246,.25),transparent_35%)]" />
          <div className="relative h-full p-10 flex items-center">
            <div className="max-w-4xl">
              <div className="text-sm text-emerald-300 font-bold uppercase tracking-[.3em] mb-4">Season Prototype</div>
              <h2 className="text-7xl font-black leading-none mb-6">Drop from the bus.<br />Loot. Survive.</h2>
              <p className="text-xl text-slate-300 max-w-2xl mb-8">Pantalla más clean, opciones a la izquierda y carga optimizada para evitar que la partida quede negra.</p>
              <div className="grid grid-cols-3 gap-4 max-w-3xl">
                <InfoCard icon={<Plane />} title="Battle Bus" text="Space para saltar. Click + arrastrar mueve cámara." />
                <InfoCard icon={<Backpack />} title="6-Slot Inventory" text="Tab para abrir." />
                <InfoCard icon={<MapPin />} title="Map with Cities" text="M para abrir el mapa." />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-950 text-white p-2">
      <div className="w-full h-full grid grid-cols-[1fr_320px] gap-2">
        <div className="relative h-full rounded-3xl overflow-hidden border border-white/10 bg-black shadow-2xl">
          <div ref={gameHostRef} className="absolute inset-0" />

          {ui.map && (
            <div className="absolute inset-8 z-30 rounded-3xl bg-black/85 border border-white/10 p-6 grid grid-cols-[1fr_260px] gap-5">
              <div className="relative rounded-3xl bg-emerald-950/60 border border-white/10 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,.22),transparent_18%),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:100%_100%,48px_48px,48px_48px]" />
                {POIS.map(([name, x, z]) => {
                  const px = ((x + WORLD_LIMIT) / MAP_SIZE) * 100;
                  const py = ((z + WORLD_LIMIT) / MAP_SIZE) * 100;
                  return <div key={name} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${px}%`, top: `${py}%` }}><div className="w-3 h-3 rounded-full bg-emerald-300 mx-auto shadow-lg shadow-emerald-400/40" /><div className="text-[11px] mt-1 font-bold whitespace-nowrap">{name}</div></div>;
                })}
                <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${((ui.playerX + WORLD_LIMIT) / MAP_SIZE) * 100}%`, top: `${((ui.playerZ + WORLD_LIMIT) / MAP_SIZE) * 100}%` }}>
                  <div className="w-5 h-5 rounded-full bg-blue-400 border-2 border-white shadow-lg" />
                  <div className="text-xs font-black mt-1">YOU</div>
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-black mb-3">Island Map</h2>
                <p className="text-slate-400 text-sm mb-5">Mantené presionada la M para ver tu ubicación y las 6 ciudades principales.</p>
                <div className="space-y-2">
                  {POIS.map(([name]) => <div key={name} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">{name}</div>)}
                </div>
              </div>
            </div>
          )}

          {loading.active && (
            <div className="absolute inset-0 z-40 bg-[#05070b] flex">
              <div className="w-[330px] border-r border-white/10 p-7 bg-black/60">
                <Badge className="bg-emerald-400 text-black mb-6">Loading</Badge>
                <h2 className="text-4xl font-black mb-4">Preparing<br />Island</h2>
                <p className="text-slate-400 mb-8">Estoy cargando el mapa, bots, loot y autobús sin congelar la pantalla.</p>
                <div className="space-y-3 text-sm text-slate-300">
                  <div>Mode: <b className="text-white capitalize">{mode}</b></div>
                  <div>Lobby: <b className="text-white">100 players</b></div>
                  <div>Map: <b className="text-white">Large optimized island</b></div>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-10">
                <div className="w-full max-w-xl">
                  <div className="text-emerald-300 font-bold mb-3">{loading.text}</div>
                  <div className="h-4 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-emerald-400 transition-all" style={{ width: `${loading.progress}%` }} />
                  </div>
                  <div className="mt-3 text-slate-400 text-sm">{loading.progress}%</div>
                </div>
              </div>
            </div>
          )}

          {ui.msg && (
            <div className="absolute inset-0 z-30 bg-black/65 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl font-black text-emerald-300 mb-4">{ui.msg}</div>
                <Button onClick={() => setScreen("menu")} className="rounded-xl">Back to lobby</Button>
              </div>
            </div>
          )}

          <Crosshair className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-white/90" size={30} />

          {ui.prompt && !ui.map && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 bg-black/65 border border-white/10 rounded-2xl px-5 py-3 font-bold">
              {ui.prompt}
            </div>
          )}

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {ui.slots.map((s, i) => (
              <div key={i} className="w-20 h-16 rounded-2xl bg-black/60 border border-white/15 flex flex-col items-center justify-center text-xs">
                <div className="text-slate-400">{i + 1}</div>
                <div className="font-bold truncate max-w-[70px]">{s?.weapon?.name || "Empty"}</div>
              </div>
            ))}
          </div>

          {ui.tab && !ui.map && (
            <div className="absolute inset-10 z-20 rounded-3xl bg-black/80 border border-white/10 p-6">
              <h2 className="text-3xl font-black mb-4 flex items-center gap-2"><Backpack /> Inventory</h2>
              <div className="grid grid-cols-3 gap-4">
                {ui.slots.map((s, i) => (
                  <div key={i} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                    <div className="text-slate-400 mb-2">Slot {i + 1}</div>
                    <div className="text-xl font-black">{s?.weapon?.name || "Empty"}</div>
                    <div className="text-sm text-slate-400">{s ? `${s.mag}/${s.ammo} ${s.weapon.ammo}` : "No item"}</div>
                  </div>
                ))}
              </div>
              <p className="text-slate-400 mt-5">Presioná Tab para cerrar. Usá 1-6 para equipar un slot.</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Card className="bg-black/45 border-white/10 text-white rounded-3xl">
            <CardContent className="p-4 space-y-3">
              <div className="text-sm uppercase text-emerald-300 font-bold">Phase: {ui.phase}</div>
              <div className="flex items-center gap-2 text-xl font-black"><Users /> Alive: {ui.alive}</div>
              <Stat icon={<Heart size={18} />} label="HP" value={ui.hp} color="bg-red-400" />
              <Stat icon={<Shield size={18} />} label="Shield" value={ui.shield} color="bg-blue-400" />
              <div className="font-bold">Weapon: {ui.weapon}</div>
              <div>Ammo: {ui.ammo}</div>
              <div className="flex items-center gap-2"><Skull size={18} /> Kills: {ui.kills}</div>
              <div className="flex items-center gap-2"><Zap size={18} /> Storm: {ui.safeStart > 0 ? `Safe start ${ui.safeStart}s` : `${ui.storm}s`}</div>
            </CardContent>
          </Card>

          <Card className="bg-black/45 border-white/10 text-white rounded-3xl">
            <CardContent className="p-4">
              <div className="font-black mb-2">Team</div>
              {ui.team.map((p, i) => (
                <div key={i} className="flex justify-between text-sm border-b border-white/5 py-1">
                  <span>{i === 0 ? "YOU" : p.name}</span>
                  <span className={p.alive ? "text-emerald-300" : "text-red-300"}>{p.alive ? `${Math.round(p.hp)} HP` : "Dead"}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-black/45 border-white/10 text-white rounded-3xl">
            <CardContent className="p-4 text-sm text-slate-300">
              Corregido: WASD reorientado para que W avance hacia donde mira la cámara, S retroceda, A izquierda y D derecha.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, text }) {
  return (
    <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
      <div className="text-emerald-300 mb-3">{icon}</div>
      <b>{title}</b>
      <p className="text-sm text-slate-400 mt-1">{text}</p>
    </div>
  );
}

function Stat({ icon, label, value, color }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">{icon} {label} {value}</div>
      <div className="h-3 bg-white/10 rounded">
        <div className={`h-3 ${color} rounded`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
