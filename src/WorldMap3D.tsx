import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Job } from './store'

export interface Tower {
  id: string
  name: string
  pct: number
  term: 'short' | 'long'
  job: Job
}
export interface Hero {
  job: Job
  level: number
  tier: number // 0 to 3, unlocks gear
  rank: string
}

const CYAN = 0x00f0ff
const MAGENTA = 0xff2bd6
const GOLD = 0xfcee0a
const JOB_COL: Record<Job, number> = { Scholar: CYAN, Knight: MAGENTA, Monk: 0x39ff88, Merchant: GOLD }
const H = 4
const css = (c: number) => '#' + c.toString(16).padStart(6, '0')

function label(text: string, sub: string, color: string, scale = 1) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(7,6,15,0.78)'
  g.fillRect(0, 0, 512, 128)
  g.strokeStyle = color
  g.lineWidth = 4
  g.strokeRect(2, 2, 508, 124)
  g.fillStyle = color
  g.font = 'bold 40px Consolas, monospace'
  g.fillText(text.length > 20 ? text.slice(0, 19) + '…' : text, 18, 58)
  g.fillStyle = '#d9fbff'
  g.font = '34px Consolas, monospace'
  g.fillText(sub, 18, 106)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sp.scale.set(3 * scale, 0.75 * scale, 1)
  sp.renderOrder = 10
  return sp
}

function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    ;[mat].flat().forEach((x) => {
      if (!x) return
      ;(x as THREE.SpriteMaterial).map?.dispose()
      x.dispose()
    })
  })
}

/* ---------- low-poly heroes ---------- */
interface Anim {
  arms: THREE.Object3D[] // [left, right] shoulder pivots
  spin: THREE.Object3D[]
  orbit?: THREE.Object3D
  phase: number
  won: boolean
  group: THREE.Group
}

function buildHero(job: Job, tier: number, won: boolean, phase: number): { group: THREE.Group; anim: Anim } {
  const col = JOB_COL[job]
  const body = new THREE.MeshStandardMaterial({ color: 0x1b1636, roughness: 0.55, metalness: 0.35, flatShading: true, emissive: col, emissiveIntensity: 0.12 })
  const glow = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.1, flatShading: true })
  const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    return mesh
  }

  const group = new THREE.Group()
  const rig = new THREE.Group() // everything that bobs
  group.add(rig)

  rig.add(box(0.22, 0.6, 0.25, body, -0.14, 0.3), box(0.22, 0.6, 0.25, body, 0.14, 0.3)) // legs
  rig.add(box(0.2, 0.06, 0.28, glow, -0.14, 0.04, 0.02), box(0.2, 0.06, 0.28, glow, 0.14, 0.04, 0.02)) // boot lights
  rig.add(box(0.62, 0.7, 0.36, body, 0, 0.95)) // torso
  rig.add(box(0.18, 0.5, 0.03, glow, 0, 0.97, 0.19)) // chest light
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), body)
  head.position.y = 1.5
  rig.add(head)
  rig.add(box(0.36, 0.08, 0.1, glow, 0, 1.52, 0.2)) // visor

  const arms: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(s * 0.43, 1.25, 0)
    pivot.add(box(0.14, 0.55, 0.14, body, 0, -0.27))
    pivot.add(box(0.16, 0.08, 0.16, glow, 0, -0.55))
    rig.add(pivot)
    arms.push(pivot)
  }

  const spin: THREE.Object3D[] = []
  let orbit: THREE.Object3D | undefined
  if (job === 'Scholar') {
    const book = new THREE.Group()
    book.add(box(0.2, 0.03, 0.3, glow, -0.1, 0, 0), box(0.2, 0.03, 0.3, glow, 0.1, 0, 0))
    book.children[0].rotation.z = 0.35
    book.children[1].rotation.z = -0.35
    book.position.set(0.72, 1.55, 0.1)
    rig.add(book)
    spin.push(book)
  } else if (job === 'Knight') {
    rig.add(box(0.34, 0.12, 0.34, glow, -0.43, 1.37, 0), box(0.34, 0.12, 0.34, glow, 0.43, 1.37, 0))
    const sword = box(0.06, 1.0, 0.06, glow, 0, -0.75, 0.12)
    arms[1].add(sword)
    arms[1].add(box(0.3, 0.05, 0.08, glow, 0, -0.3, 0.12))
  } else if (job === 'Monk') {
    orbit = new THREE.Group()
    orbit.position.y = 1.2
    for (let i = 0; i < 3; i++) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow)
      const a = (i / 3) * Math.PI * 2
      o.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62)
      orbit.add(o)
    }
    rig.add(orbit)
    const sash = box(0.66, 0.1, 0.4, glow, 0, 0.7)
    rig.add(sash)
  } else {
    rig.add(box(0.42, 0.5, 0.2, body, 0, 1.0, -0.3), box(0.3, 0.06, 0.04, glow, 0, 1.15, -0.41))
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 14), glow)
    coin.position.set(0, 2.0, 0)
    coin.rotation.x = Math.PI / 2
    rig.add(coin)
    spin.push(coin)
  }

  // gear unlocked by rank
  if (tier >= 1) {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 18), glow)
    belt.rotation.x = Math.PI / 2
    belt.position.y = 0.66
    rig.add(belt)
  }
  if (tier >= 2) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), glow)
    halo.rotation.x = Math.PI / 2
    halo.position.y = job === 'Merchant' ? 1.8 : 1.95
    rig.add(halo)
    spin.push(halo)
  }
  if (tier >= 3) {
    for (const s of [-1, 1]) {
      const wing = box(0.04, 0.95, 0.42, glow, s * 0.5, 1.15, -0.28)
      wing.rotation.z = s * 0.35
      wing.rotation.y = s * 0.4
      const wm = glow.clone()
      wm.transparent = true
      wm.opacity = 0.6
      wing.material = wm
      rig.add(wing)
    }
  }

  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide }))
  pad.rotation.x = -Math.PI / 2
  pad.position.y = 0.01
  group.add(pad)

  group.scale.setScalar(1 + tier * 0.05)
  return { group: group, anim: { arms, spin, orbit, phase, won, group: rig } }
}

export default function WorldMap3D({
  towers,
  heroes,
  selected,
  onSelect,
  onFail,
}: {
  towers: Tower[]
  heroes: Hero[]
  selected: string | null
  onSelect: (id: string) => void
  onFail: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ set: (t: Tower[], sel: string | null, h: Hero[]) => void } | null>(null)
  const pick = useRef(onSelect)
  pick.current = onSelect
  const fail = useRef(onFail)
  fail.current = onFail

  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      fail.current()
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x07060f, 0.04)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(7, 6.5, 9)

    scene.add(new THREE.AmbientLight(0x6070a0, 0.9))
    const l1 = new THREE.PointLight(CYAN, 70, 34)
    l1.position.set(-5, 6, 4)
    const l2 = new THREE.PointLight(MAGENTA, 70, 34)
    l2.position.set(6, 5, -3)
    const l3 = new THREE.DirectionalLight(0xffffff, 0.8)
    l3.position.set(3, 8, 8)
    scene.add(l1, l2, l3)

    const grid = new THREE.GridHelper(40, 40, MAGENTA, 0x1a3a66)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.55
    scene.add(grid)

    const world = new THREE.Group()
    scene.add(world)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = false
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.maxPolarAngle = Math.PI / 2.15
    controls.minPolarAngle = 0.35
    controls.enableDamping = true
    renderer.domElement.style.touchAction = 'pan-y' // keep vertical page scroll working on phones
    controls.addEventListener('start', () => (controls.autoRotate = false))

    const pulses: { m: THREE.Material; base: number; sel: boolean }[] = []
    const anims: Anim[] = []
    let framed = ''

    api.current = {
      set(ts, sel, hs) {
        world.children.slice().forEach((c) => {
          world.remove(c)
          dispose(c)
        })
        pulses.length = 0
        anims.length = 0
        const cols = Math.min(3, Math.max(1, ts.length))
        const rows = Math.max(1, Math.ceil(ts.length / cols))
        ts.forEach((t, i) => {
          const x = ((i % cols) - (cols - 1) / 2) * 3.6
          const z = (Math.floor(i / cols) - (rows - 1) / 2) * 3.6
          const won = t.pct >= 1
          const col = won ? GOLD : t.term === 'long' ? MAGENTA : CYAN
          const isSel = t.id === sel
          const g = new THREE.Group()
          g.position.set(x, 0, z)
          g.userData.id = t.id

          const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, H, 1.5)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: isSel ? 0.9 : 0.35 }))
          ghost.position.y = H / 2
          g.add(ghost)

          const h = Math.max(0.15, t.pct * H)
          const fillMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: isSel ? 1.1 : 0.6, transparent: true, opacity: 0.82, roughness: 0.3, metalness: 0.4 })
          const fill = new THREE.Mesh(new THREE.BoxGeometry(1.3, h, 1.3), fillMat)
          fill.position.y = h / 2
          g.add(fill)
          pulses.push({ m: fillMat, base: isSel ? 1.1 : 0.6, sel: isSel })
          const edge = new THREE.LineSegments(new THREE.EdgesGeometry(fill.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }))
          edge.position.y = h / 2
          g.add(edge)

          const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, isSel ? 1.45 : 1.25, 40), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }))
          ring.rotation.x = -Math.PI / 2
          ring.position.y = 0.02
          g.add(ring)

          if (won) {
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 12, 8), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7 }))
            beam.position.y = 6 + H
            g.add(beam)
          }

          const sp = label(t.name, `${Math.round(t.pct * 100)}%  ${t.term === 'long' ? 'LONG' : 'SHORT'}${won ? '  ✔' : ''}`, css(col))
          sp.position.y = H + 0.9
          g.add(sp)

          // the job's hero works beside its tower
          const unit = buildHero(t.job, won ? 3 : 0, won, i * 1.3)
          unit.group.scale.multiplyScalar(1.05)
          unit.group.position.set(1.55, 0, 0.9)
          unit.group.rotation.y = -0.35
          g.add(unit.group)
          anims.push(unit.anim)

          // invisible, generously sized hit box for tapping
          const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, H + 1.2, 1.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
          hit.position.y = (H + 1.2) / 2
          hit.userData.id = t.id
          g.add(hit)

          world.add(g)
        })

        // the party stands at the front of the map
        const frontZ = ((rows - 1) / 2) * 3.6 + 3.8
        hs.forEach((hr, i) => {
          const u = buildHero(hr.job, hr.tier, false, i * 0.9)
          u.group.scale.multiplyScalar(1.45)
          u.group.position.set((i - (hs.length - 1) / 2) * 2.5, 0, frontZ)
          world.add(u.group)
          anims.push(u.anim)
          const tag = label(hr.job.toUpperCase(), `Lv${hr.level} ${hr.rank}`, css(JOB_COL[hr.job]), 0.62)
          tag.position.set(u.group.position.x, 3.5, frontZ)
          world.add(tag)
        })

        const zMin = -((rows - 1) / 2) * 3.6
        const center = new THREE.Vector3(0, 1.5, hs.length ? (zMin + frontZ) / 2 : 0)
        controls.target.copy(center)
        const key = `${ts.length}:${hs.length}`
        if (key !== framed) {
          // pull the camera back as the map grows, keeping the user's current viewing angle
          framed = key
          const dist = 10 + (cols - 1) * 1.8 + (rows - 1) * 1.9 + (hs.length ? 2.5 : 0)
          camera.position.sub(center).setLength(dist).add(center)
        }
      },
    }

    const ray = new THREE.Raycaster()
    let down: { x: number; y: number } | null = null
    const dom = renderer.domElement
    dom.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }))
    dom.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
      const r = dom.getBoundingClientRect()
      const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(v, camera)
      const hits = ray.intersectObjects(world.children, true).filter((h) => h.object.userData.id)
      if (hits[0]) pick.current(hits[0].object.userData.id as string)
    })

    const size = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(size)
    ro.observe(el)
    size()

    let raf = 0
    let last = performance.now()
    const t0 = last
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const t = (now - t0) / 1000
      pulses.forEach((p) => {
        ;(p.m as THREE.MeshStandardMaterial).emissiveIntensity = p.base + Math.sin(t * (p.sel ? 4 : 2)) * 0.25
      })
      anims.forEach((a) => {
        a.group.position.y = Math.abs(Math.sin(t * (a.won ? 5 : 2) + a.phase)) * (a.won ? 0.18 : 0.05)
        const [l, r] = a.arms
        if (a.won) {
          l.rotation.z = 2.7 + Math.sin(t * 7 + a.phase) * 0.2
          r.rotation.z = -2.7 - Math.sin(t * 7 + a.phase) * 0.2
        } else {
          l.rotation.x = Math.sin(t * 2 + a.phase) * 0.25
          r.rotation.x = -Math.sin(t * 2 + a.phase) * 0.25
        }
        a.spin.forEach((s) => (s.rotation.y += dt * 1.8))
        if (a.orbit) a.orbit.rotation.y += dt * 1.6
      })
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      dispose(scene)
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
  }, [])

  const sig =
    towers.map((t) => `${t.id}:${t.name}:${t.pct}:${t.term}:${t.job}`).join('|') + '#' + selected + '#' + heroes.map((h) => `${h.job}${h.level}${h.tier}`).join(',')
  useEffect(() => {
    api.current?.set(towers, selected, heroes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return <div ref={host} className="map3d" role="img" aria-label="3D map of goals with your party: tower height shows progress" />
}
