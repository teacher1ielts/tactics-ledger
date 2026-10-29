import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Job } from './store'

export const JOB_COL: Record<Job, number> = { Scholar: 0x00f0ff, Knight: 0xff2bd6, Monk: 0x39ff88, Merchant: 0xfcee0a }
const SKIN: Record<Job, number> = { Scholar: 0xe3b693, Knight: 0xc98d6a, Monk: 0xd8a888, Merchant: 0xb98260 }
const HAIR: Record<Job, number> = { Scholar: 0x1a1f4d, Knight: 0x2a0f2e, Monk: 0x000000, Merchant: 0x4a3524 }

export interface HeroRig {
  group: THREE.Group
  /** t = seconds since start, dt = frame time, win = celebrate (goal complete) */
  update: (t: number, dt: number, win: boolean) => void
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

/* ---------- shared textures (cached; they outlive any single scene rebuild) ---------- */
const glowCache = new Map<number, THREE.CanvasTexture>()
const circuitCache = new Map<number, { base: THREE.CanvasTexture; glow: THREE.CanvasTexture }>()
let noiseTex: THREE.CanvasTexture | undefined

export const sharedTextures = () => {
  const s = new Set<THREE.Texture>(glowCache.values())
  circuitCache.forEach((v) => (s.add(v.base), s.add(v.glow)))
  if (noiseTex) s.add(noiseTex)
  return s
}

/** Soft radial light used under feet and towers. */
export function glowTexture(color: number): THREE.CanvasTexture {
  let t = glowCache.get(color)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62)
    grd.addColorStop(0, hex(color) + 'cc')
    grd.addColorStop(0.45, hex(color) + '44')
    grd.addColorStop(1, hex(color) + '00')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    glowCache.set(color, t)
  }
  return t
}

/** Etched panel lines (base) plus glowing circuit traces (emissive) for armor surfaces. */
function circuit(color: number) {
  let t = circuitCache.get(color)
  if (!t) {
    const mk = (glow: boolean) => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const g = c.getContext('2d')!
      g.fillStyle = glow ? '#000' : '#5a50b0'
      g.fillRect(0, 0, 256, 256)
      let seed = (color % 997) + 1
      const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
      g.lineCap = 'square'
      for (let i = 0; i < (glow ? 34 : 18); i++) {
        let x = Math.floor(r() * 16) * 16
        let y = Math.floor(r() * 16) * 16
        g.beginPath()
        g.moveTo(x, y)
        for (let s = 0; s < 3 + Math.floor(r() * 3); s++) {
          if (r() < 0.5) x += (Math.floor(r() * 5) - 2) * 16
          else y += (Math.floor(r() * 5) - 2) * 16
          g.lineTo(x, y)
        }
        g.strokeStyle = glow ? hex(color) : 'rgba(10,8,30,0.8)'
        g.lineWidth = glow ? 2.5 : 1.5
        g.stroke()
        if (glow) {
          g.fillStyle = '#fff'
          g.fillRect(x - 3, y - 3, 6, 6)
        }
      }
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      return tex
    }
    t = { base: mk(false), glow: mk(true) }
    circuitCache.set(color, t)
  }
  return t
}

function noise() {
  if (!noiseTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const d = g.createImageData(64, 64)
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 120 + Math.floor(Math.random() * 90)
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v
      d.data[i + 3] = 255
    }
    g.putImageData(d, 0, 0)
    noiseTex = new THREE.CanvasTexture(c)
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping
  }
  return noiseTex
}

function holoTexture(color: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const g = c.getContext('2d')!
  g.strokeStyle = color
  g.lineWidth = 4
  g.strokeRect(3, 3, 250, 154)
  g.fillStyle = color
  for (let i = 0; i < 8; i++) {
    g.globalAlpha = 0.55 + (i % 3) * 0.15
    g.fillRect(16, 18 + i * 17, 60 + ((i * 53) % 150), 7)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Ripple a cone's silhouette so a coat or robe hangs in folds instead of a perfect cone. */
function folds(geo: THREE.BufferGeometry, amp = 0.05, freq = 7) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const k = 1 + amp * Math.sin(Math.atan2(z, x) * freq)
    p.setX(i, x * k)
    p.setZ(i, z * k)
  }
  geo.computeVertexNormals()
  return geo
}

const tube = (pts: [number, number, number][], r: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 6)

/**
 * A chibi cyberpunk figure. `detail` adds the fine work (face, fingers, plates, cables);
 * the small workers beside towers skip it so phones stay smooth.
 * `tier` unlocks belt, halo and wings.
 */
export function buildHero(job: Job, tier: number, phase = 0, detail = true): HeroRig {
  const col = JOB_COL[job]
  const cir = circuit(col)
  const armor = new THREE.MeshStandardMaterial({ color: 0xffffff, map: cir.base, emissive: 0xffffff, emissiveMap: cir.glow, emissiveIntensity: 0.85, roughness: 0.38, metalness: 0.5 })
  const plate = new THREE.MeshPhysicalMaterial({ color: 0x5b52b4, roughness: 0.3, metalness: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.25 })
  const cloth = new THREE.MeshStandardMaterial({ color: 0x41358a, roughness: 0.85, metalness: 0.02, bumpMap: noise(), bumpScale: 0.6, side: THREE.DoubleSide })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1840, roughness: 0.6, metalness: 0.4 })
  const accent = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.1, roughness: 0.3 })
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[job], roughness: 0.62, bumpMap: noise(), bumpScale: 0.12 })
  const hair = new THREE.MeshStandardMaterial({ color: HAIR[job], roughness: 0.5, metalness: 0.2 })
  const additive = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
  const glass = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.1 })

  const group = new THREE.Group()
  const rig = new THREE.Group()
  group.add(rig)
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = rig) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }
  const rbox = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, r)
  const armored = job !== 'Monk'

  /* legs: thigh plate, knee pad, shin guard, sole with a glowing heel */
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.095, 0.34, 6, 12), dark, s * 0.14, 0.3)
    add(new THREE.SphereGeometry(0.11, 14, 10), armor, s * 0.14, 0.09, 0.04).scale.set(1, 0.62, 1.45)
    if (armored) {
      add(rbox(0.17, 0.2, 0.2, 0.05), plate, s * 0.14, 0.43, 0.01)
      add(new THREE.SphereGeometry(0.085, 12, 8), armor, s * 0.14, 0.3, 0.09)
      add(rbox(0.14, 0.2, 0.15, 0.04), plate, s * 0.14, 0.17, 0.03)
    }
    if (detail) {
      add(rbox(0.16, 0.035, 0.3, 0.012), dark, s * 0.14, 0.018, 0.06)
      add(new THREE.BoxGeometry(0.1, 0.02, 0.03), accent, s * 0.14, 0.03, -0.08)
      add(new THREE.TorusGeometry(0.1, 0.014, 6, 16), accent, s * 0.14, 0.2).rotation.x = Math.PI / 2
    }
  }

  /* torso */
  add(new THREE.CylinderGeometry(0.23, 0.21, 0.16, 14), armor, 0, 0.62)
  const torso = add(new THREE.CylinderGeometry(0.27, 0.21, 0.52, 14), job === 'Monk' ? cloth : armor, 0, 0.94)
  if (armored) {
    add(rbox(0.5, 0.34, 0.3, 0.07), plate, 0, 1.04, 0.035)
    add(new THREE.BoxGeometry(0.1, 0.3, 0.02), accent, 0, 1.04, 0.2)
    if (detail) {
      for (const y of [0.86, 0.79, 0.72]) add(rbox(0.4 - (0.86 - y) * 0.2, 0.06, 0.25, 0.02), plate, 0, y, 0.02)
      for (const s of [-1, 1]) add(rbox(0.1, 0.12, 0.1, 0.03), dark, s * 0.27, 0.6, 0.1) // hip pouches
      add(rbox(0.1, 0.07, 0.05, 0.02), accent, 0, 0.64, 0.23) // buckle
      add(rbox(0.36, 0.46, 0.16, 0.05), plate, 0, 1.0, -0.3) // power pack
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.26, 0.015, 0.02), accent, 0, 0.88 + i * 0.07, -0.385)
    } else add(rbox(0.34, 0.4, 0.14, 0.05), plate, 0, 1.0, -0.28)
    for (const s of [-1, 1]) {
      add(rbox(0.2, 0.1, 0.26, 0.04), plate, s * 0.38, 1.27, 0).rotation.z = s * -0.3
      add(new THREE.SphereGeometry(0.035, 8, 6), accent, s * 0.43, 1.31, 0.1)
    }
  } else if (detail) {
    for (const s of [-1, 1]) add(rbox(0.1, 0.5, 0.025, 0.012), cloth, s * 0.09, 0.98, 0.26) // robe flaps
  }
  add(new THREE.TorusGeometry(0.14, 0.035, 8, 20), accent, 0, 1.26).rotation.x = Math.PI / 2 // collar
  add(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 10), skin, 0, 1.22)

  /* head */
  const head = new THREE.Group()
  head.position.y = 1.46
  rig.add(head)
  add(new THREE.SphereGeometry(0.3, 28, 20), skin, 0, 0, 0, head)
  add(new THREE.CylinderGeometry(0.318, 0.318, 0.14, 24, 1, true, -0.95, 1.9), glass, 0, 0.03, 0, head) // see-through visor
  add(new THREE.CylinderGeometry(0.322, 0.322, 0.012, 24, 1, true, -0.95, 1.9), accent, 0, 0.1, 0, head)
  add(new THREE.CylinderGeometry(0.322, 0.322, 0.012, 24, 1, true, -0.95, 1.9), accent, 0, -0.04, 0, head)
  if (detail) {
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.048, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf4f0ff, emissive: 0xffffff, emissiveIntensity: 0.25 }), s * 0.1, 0.03, 0.262, head).scale.set(1, 0.8, 0.6)
      add(new THREE.SphereGeometry(0.026, 8, 6), accent, s * 0.1, 0.03, 0.285, head)
      add(new THREE.BoxGeometry(0.1, 0.012, 0.02), hair, s * 0.1, 0.1, 0.27, head).rotation.z = s * -0.12 // brows
      add(new THREE.SphereGeometry(0.052, 8, 6), skin, s * 0.3, -0.01, 0, head) // ears
      add(new THREE.TorusGeometry(0.04, 0.01, 6, 12), accent, s * 0.335, -0.01, 0, head).rotation.y = Math.PI / 2 // earpiece
    }
    add(new THREE.SphereGeometry(0.035, 8, 6), skin, 0, -0.04, 0.3, head)
    add(new THREE.BoxGeometry(0.1, 0.014, 0.02), new THREE.MeshStandardMaterial({ color: 0x3a1a1a }), 0, -0.15, 0.285, head)
  }

  /* hair, per class */
  if (job === 'Scholar') {
    add(new THREE.SphereGeometry(0.325, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.02, -0.01, head).rotation.x = -0.25
    for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.075, 0.07, 0.02), hair, i * 0.075, 0.2, 0.265, head).rotation.x = 0.4
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.03, 0.2, 4, 8), hair, s * 0.285, -0.12, 0.04, head)
    add(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), hair, 0, -0.1, -0.3, head).rotation.x = 0.4 // ponytail
    add(new THREE.BoxGeometry(0.02, 0.2, 0.2), accent, 0.2, 0.2, 0.05, head).rotation.z = -0.5 // neon streak
  } else if (job === 'Knight') {
    for (let i = 0; i < 7; i++) {
      const z = 0.22 - i * 0.075
      const c = add(new THREE.ConeGeometry(0.05, 0.2 - Math.abs(i - 3) * 0.015, 6), i % 2 ? accent : hair, 0, Math.sqrt(0.09 - z * z) + 0.07, z, head)
      c.rotation.x = -z * 2.2
    }
    add(new THREE.TorusGeometry(0.31, 0.022, 6, 28), accent, 0, 0.14, 0, head).rotation.x = Math.PI / 2 // headband
    if (detail) add(new THREE.BoxGeometry(0.014, 0.12, 0.012), new THREE.MeshStandardMaterial({ color: 0xff4a6a, emissive: 0xff2a50, emissiveIntensity: 0.6 }), 0.14, 0.0, 0.285, head).rotation.z = 0.5 // scar
  } else if (job === 'Monk') {
    for (const a of [0.0, 0.7, -0.7]) add(new THREE.TorusGeometry(0.306, 0.006, 4, 40, Math.PI), accent, 0, 0, 0, head).rotation.set(0, a, Math.PI / 2)
    add(new THREE.SphereGeometry(0.03, 10, 8), accent, 0, 0.15, 0.29, head) // third eye
  } else {
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.07, 8, 6), hair, s * 0.26, 0.06, 0.02, head)
    if (detail) {
      add(new THREE.ConeGeometry(0.05, 0.13, 8), hair, 0, -0.2, 0.25, head).rotation.x = Math.PI + 0.3 // goatee
      add(new THREE.TorusGeometry(0.065, 0.009, 6, 18), accent, 0.1, 0.03, 0.3, head)
      add(new THREE.CircleGeometry(0.058, 16), glass, 0.1, 0.03, 0.302, head)
    }
  }

  /* arms with real hands */
  const arms: THREE.Group[] = []
  const elbows: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group()
    shoulder.position.set(s * 0.37, 1.14, 0)
    rig.add(shoulder)
    add(new THREE.SphereGeometry(0.09, 12, 8), armored ? plate : cloth, 0, 0, 0, shoulder)
    add(new THREE.CapsuleGeometry(0.065, 0.2, 6, 10), armored ? dark : cloth, 0, -0.17, 0, shoulder)
    if (armored) add(rbox(0.13, 0.09, 0.14, 0.03), plate, 0, -0.14, 0, shoulder)
    const elbow = new THREE.Group()
    elbow.position.y = -0.33
    elbow.rotation.x = -0.25
    shoulder.add(elbow)
    add(new THREE.SphereGeometry(0.058, 8, 6), accent, 0, 0, 0, elbow)
    add(new THREE.CapsuleGeometry(0.06, 0.18, 6, 10), armored ? dark : cloth, 0, -0.15, 0, elbow)
    add(rbox(0.12, 0.1, 0.12, 0.03), armored ? plate : accent, 0, -0.17, 0, elbow) // bracer
    const hand = new THREE.Group()
    hand.position.y = -0.3
    elbow.add(hand)
    add(rbox(0.1, 0.045, 0.085, 0.015), skin, 0, -0.03, 0, hand)
    if (detail) {
      for (let i = 0; i < 4; i++) {
        const f = add(new THREE.CapsuleGeometry(0.014, 0.05, 3, 5), skin, -0.036 + i * 0.024, -0.09, 0.012, hand)
        f.rotation.x = 0.35
      }
      add(new THREE.CapsuleGeometry(0.015, 0.045, 3, 5), skin, s * 0.058, -0.06, 0.02, hand).rotation.z = s * 0.7 // thumb
    } else add(new THREE.SphereGeometry(0.06, 8, 6), skin, 0, -0.06, 0, hand)
    arms.push(shoulder)
    elbows.push(elbow)
  }
  const [armL, armR] = arms
  const [elbowL, elbowR] = elbows

  /* class gear */
  const spin: THREE.Object3D[] = []
  let orbit: THREE.Group | undefined
  let panel: THREE.Group | undefined
  let coin: THREE.Mesh | undefined
  let drone: THREE.Group | undefined
  let droneRing: THREE.Mesh | undefined

  if (job === 'Scholar') {
    add(folds(new THREE.ConeGeometry(0.33, 0.66, 28, 1, true), 0.07, 6), cloth, 0, 0.4, -0.04)
    for (const s of [-1, 1]) add(new THREE.PlaneGeometry(0.05, 0.4), accent, s * 0.1, 0.4, 0.28) // coat trim
    if (detail) {
      add(tube([[0.12, 1.1, -0.38], [0.2, 1.5, -0.5], [0.1, 1.72, -0.2], [0.18, 1.55, 0.05]], 0.012), accent)
      add(tube([[-0.12, 1.1, -0.38], [-0.22, 1.35, -0.45], [-0.3, 1.5, -0.1]], 0.012), accent)
      add(rbox(0.16, 0.1, 0.03, 0.01), glass, 0, -0.03, 0.06, elbowL) // forearm data-pad
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 5), accent, s * 0.12, 1.28, -0.34).rotation.z = s * 0.3 // antennae
    }
    panel = new THREE.Group()
    panel.position.set(0.8, 1.55, 0.1)
    panel.add(new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.42), new THREE.MeshBasicMaterial({ map: holoTexture(hex(col)), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })))
    rig.add(panel)
  } else if (job === 'Knight') {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) add(new THREE.ConeGeometry(0.03, 0.12 - i * 0.025, 6), accent, s * (0.42 + i * 0.05), 1.34 + i * 0.06, 0.02 * i) // shoulder spikes
    }
    add(rbox(0.05, 0.8, 0.07, 0.02), dark, -0.28, 0.55, -0.12).rotation.z = -0.9 // scabbard
    add(new THREE.BoxGeometry(0.045, 0.06, 0.95), accent, 0, -0.34, 0.5, elbowR) // blade
    add(new THREE.BoxGeometry(0.012, 0.07, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, -0.34, 0.5, elbowR) // blade edge
    add(rbox(0.2, 0.04, 0.07, 0.015), plate, 0, -0.34, 0.06, elbowR) // guard
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), dark, 0, -0.34, -0.06, elbowR).rotation.x = Math.PI / 2 // wrapped grip
    if (detail) {
      add(tube([[0.1, 1.2, -0.38], [0.3, 1.4, -0.4], [0.4, 1.3, -0.1]], 0.014), accent)
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), accent, s * 0.14, 0.3, 0.17).rotation.x = Math.PI / 2 // knee lights
    }
  } else if (job === 'Monk') {
    add(folds(new THREE.ConeGeometry(0.48, 0.74, 28, 1, true), 0.08, 8), cloth, 0, 0.42, 0)
    add(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 18), accent, 0, 0.76)
    add(new THREE.BoxGeometry(0.08, 0.34, 0.02), accent, 0.1, 0.55, 0.3).rotation.z = 0.1 // sash end
    add(new THREE.BoxGeometry(0.08, 0.3, 0.02), accent, -0.04, 0.55, 0.3).rotation.z = -0.08
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      add(new THREE.SphereGeometry(0.022, 6, 5), accent, Math.cos(a) * 0.17, 1.14 + Math.sin(a) * 0.06 - 0.05, Math.sin(a) * 0.17 + 0.08) // prayer beads
    }
    add(new THREE.RingGeometry(0.42, 0.5, 40), additive, 0, 1.5, -0.25)
    orbit = new THREE.Group()
    orbit.position.y = 1.1
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      add(new THREE.SphereGeometry(0.09, 12, 10), accent, Math.cos(a) * 0.72, Math.sin(a * 2) * 0.08, Math.sin(a) * 0.72, orbit)
      add(new THREE.TorusGeometry(0.13, 0.006, 4, 16), additive, Math.cos(a) * 0.72, Math.sin(a * 2) * 0.08, Math.sin(a) * 0.72, orbit).rotation.x = 1.2
    }
    rig.add(orbit)
  } else {
    add(folds(new THREE.ConeGeometry(0.36, 0.72, 28, 1, true), 0.06, 6), cloth, 0, 0.4, 0)
    for (const s of [-1, 1]) add(rbox(0.07, 0.34, 0.03, 0.01), plate, s * 0.1, 1.02, 0.27).rotation.z = s * 0.18 // lapels
    add(new THREE.CylinderGeometry(0.54, 0.54, 0.035, 28), dark, 0, 1.74)
    add(new THREE.CylinderGeometry(0.27, 0.31, 0.24, 18), dark, 0, 1.86)
    add(new THREE.TorusGeometry(0.3, 0.02, 6, 24), accent, 0, 1.78).rotation.x = Math.PI / 2
    if (detail) {
      add(rbox(0.12, 0.14, 0.08, 0.02), dark, 0.28, 0.58, 0.13) // pouch
      add(tube([[0.1, 0.9, -0.4], [0.35, 0.8, -0.2], [0.45, 0.7, 0.1]], 0.012), accent)
    }
    coin = add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20), accent, 0.5, 1.15, 0.28)
    coin.rotation.z = Math.PI / 2
    drone = new THREE.Group()
    drone.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), plate))
    droneRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 6, 24), accent)
    droneRing.rotation.x = Math.PI / 2
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), accent)
    eye.position.z = 0.1
    drone.add(droneRing, eye)
    rig.add(drone)
  }

  /* gear unlocked by rank */
  if (tier >= 1) {
    add(new THREE.TorusGeometry(0.27, 0.03, 8, 24), accent, 0, 0.7).rotation.x = Math.PI / 2
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.04, 8, 6), accent, s * 0.43, 1.2, 0.0)
  }
  if (tier >= 2) {
    const halo = add(new THREE.TorusGeometry(0.34, 0.025, 8, 32), accent, 0, 2.12 + (job === 'Merchant' ? 0.15 : 0))
    halo.rotation.x = Math.PI / 2
    spin.push(halo)
  }
  const wings: THREE.Mesh[] = []
  if (tier >= 3) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const f = add(new THREE.BoxGeometry(0.025, 0.85 - i * 0.12, 0.12), additive, s * (0.4 + i * 0.13), 1.22 - i * 0.07, -0.3)
        f.rotation.z = s * (0.5 + i * 0.15)
        f.rotation.y = s * 0.45
        wings.push(f)
      }
    }
  }

  const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: glowTexture(col), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }))
  pad.rotation.x = -Math.PI / 2
  pad.position.y = 0.02
  group.add(pad)
  group.scale.setScalar(1 + tier * 0.05)

  const update = (t: number, dt: number, win: boolean) => {
    const s = t * 2 + phase
    let lift = Math.sin(s) * 0.012
    if (win) lift = Math.abs(Math.sin(t * 5 + phase)) * 0.24
    if (job === 'Monk') lift += 0.16 + Math.sin(t * 1.5 + phase) * 0.05
    rig.position.y = lift
    rig.rotation.y = 0
    torso.scale.y = 1 + Math.sin(s) * 0.018
    head.rotation.y = Math.sin(t * 0.7 + phase) * 0.4
    head.rotation.x = Math.sin(t * 0.45 + phase) * 0.06

    if (win) {
      armL.rotation.z = -2.6 - Math.sin(t * 8 + phase) * 0.18
      armR.rotation.z = 2.6 + Math.sin(t * 8 + phase) * 0.18
      armL.rotation.x = armR.rotation.x = 0
    } else {
      armL.rotation.z = armR.rotation.z = 0
      armL.rotation.x = Math.sin(s) * 0.09
      armR.rotation.x = -Math.sin(s) * 0.09
    }

    if (job === 'Knight' && !win) {
      const p = ((t + phase) % 5) / 5
      const k = p < 0.14 ? Math.sin((p / 0.14) * Math.PI) : 0
      armR.rotation.x = -0.4 - k * 2.3
      rig.rotation.y = -k * 0.5
    }
    if (job === 'Scholar' && panel) {
      panel.rotation.y = Math.sin(t * 0.9 + phase) * 0.6
      panel.position.y = 1.55 + Math.sin(t * 1.6 + phase) * 0.05
      if (!win) elbowL.rotation.x = -0.9 + Math.sin(t * 9) * 0.06
    }
    if (job === 'Monk' && orbit) orbit.rotation.y += dt * 1.7
    if (job === 'Merchant') {
      if (coin) {
        coin.rotation.x += dt * 7
        coin.position.y = 1.15 + Math.abs(Math.sin(t * 2 + phase)) * 0.25
      }
      if (drone && droneRing) {
        drone.position.set(Math.cos(t * 1.1 + phase) * 0.95, 1.75 + Math.sin(t * 2) * 0.06, Math.sin(t * 1.1 + phase) * 0.95)
        drone.rotation.y = -(t * 1.1 + phase) + Math.PI / 2 // always faces where it flies
        droneRing.rotation.z += dt * 5
      }
    }
    spin.forEach((o) => (o.rotation.z += dt * 1.8))
    wings.forEach((w, i) => (w.rotation.x = Math.sin(t * 2 + i * 0.3) * 0.08))
  }

  return { group, update }
}
