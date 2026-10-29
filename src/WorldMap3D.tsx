import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { buildHero, glowTexture, JOB_COL, sharedTextures, type HeroRig } from './heroes3d'
import { createMotes, createRain, createSkyline, skyTexture } from './scenery'
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
const H = 4
const css = (c: number) => '#' + c.toString(16).padStart(6, '0')
const ease = (x: number) => 1 - Math.pow(1 - x, 3)

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

function dispose(obj: THREE.Object3D, keep: Set<THREE.Texture> = new Set()) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mats = ([] as THREE.Material[]).concat((m.material as THREE.Material | THREE.Material[] | undefined) ?? [])
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !keep.has(v)) v.dispose()
      mat.dispose()
    }
  })
}

interface Live {
  rig: HeroRig
  win: boolean
}
interface Burst {
  obj: THREE.Object3D
  age: number
  life: number
  tick: (k: number) => void
}

export default function WorldMap3D({
  towers,
  heroes,
  selected,
  onSelect,
  onFail,
  fx,
}: {
  towers: Tower[]
  heroes: Hero[]
  selected: string | null
  onSelect: (id: string) => void
  onFail: () => void
  fx: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ set: (t: Tower[], sel: string | null, h: Hero[]) => void } | null>(null)
  const pick = useRef(onSelect)
  pick.current = onSelect
  const fail = useRef(onFail)
  fail.current = onFail
  const fxRef = useRef(fx)
  fxRef.current = fx

  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      fail.current()
      return
    }
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    renderer.setPixelRatio(Math.min(devicePixelRatio, fxRef.current ? 2 : 1.5))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.85
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const sky = skyTexture()
    scene.background = sky
    scene.fog = new THREE.FogExp2(0x120826, 0.032)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160)
    camera.position.set(7, 6.5, 9)

    scene.add(new THREE.HemisphereLight(0x6a7cff, 0x2a0a3a, 0.65))
    const l1 = new THREE.PointLight(CYAN, 38, 30)
    l1.position.set(-6, 6, 5)
    const l2 = new THREE.PointLight(MAGENTA, 38, 30)
    l2.position.set(7, 5, -4)
    const l3 = new THREE.DirectionalLight(0xbfd0ff, 1.1)
    l3.position.set(4, 9, 9)
    const rim = new THREE.DirectionalLight(0x9a6bff, 1.4)
    rim.position.set(-5, 6, -9)
    scene.add(l1, l2, l3, rim)

    // glossy wet-looking floor with a neon grid on top
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x0a0716, roughness: 0.5, metalness: 0.35 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    scene.add(floor)
    const grid = new THREE.GridHelper(48, 48, MAGENTA, 0x24407a)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5
    scene.add(grid)

    const skyline = createSkyline(calm ? 30 : 46)
    const rain = createRain(calm ? 0 : 520)
    const motes = createMotes(calm ? 60 : 140)
    scene.add(skyline.group, rain.group, motes.group)

    const world = new THREE.Group()
    const fxGroup = new THREE.Group()
    scene.add(world, fxGroup)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = false
    controls.autoRotate = !calm
    controls.autoRotateSpeed = 0.55
    controls.maxPolarAngle = Math.PI / 2.15
    controls.minPolarAngle = 0.35
    controls.enableDamping = true
    renderer.domElement.style.touchAction = 'pan-y' // keep vertical page scroll working on phones
    controls.addEventListener('start', () => (controls.autoRotate = false))

    // bloom makes every emissive surface glow
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.45, 0.62)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const pulses: { m: THREE.Material; base: number; sel: boolean }[] = []
    const lives: Live[] = []
    const spinners: THREE.Object3D[] = []
    const bursts: Burst[] = []
    const towerPos = new Map<string, THREE.Vector3>()
    // remembered across visits, so a rank earned elsewhere plays out the next time you open the map
    const prevTier: Record<string, number> = (() => {
      try {
        return JSON.parse(localStorage.getItem('tl-3d-tier') ?? '{}')
      } catch {
        return {}
      }
    })()
    const center = new THREE.Vector3(0, 1.5, 0)
    const focus = new THREE.Vector3(0, 1.5, 0)
    let framed = ''
    let introLeft = 0
    let wantR = 12
    let curSel: string | null = null
    let heroFocus: Job | null = null
    const heroPos = new Map<Job, THREE.Vector3>()
    let introDist = 12

    const burst = (at: THREE.Vector3, color: number, delay = 0) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 48), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }))
      ring.rotation.x = -Math.PI / 2
      ring.position.copy(at).setY(0.05)
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }))
      pillar.position.copy(at).setY(7)
      const grp = new THREE.Group()
      grp.add(ring, pillar)
      grp.visible = false
      fxGroup.add(grp)
      bursts.push({
        obj: grp,
        age: -delay,
        life: 1.8,
        tick: (k) => {
          ring.scale.setScalar(1 + ease(k) * 9)
          ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k
          pillar.scale.set(1 + k * 1.2, 1, 1 + k * 1.2)
          ;(pillar.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k)
        },
      })
    }

    /** Where the camera looks and how close it sits: a hero close-up, a selected tower, or the whole map. */
    const applyFocus = () => {
      const hp = heroFocus ? heroPos.get(heroFocus) : undefined
      const sp = curSel ? towerPos.get(curSel) : undefined
      if (hp) focus.copy(hp).setY(1.5)
      else if (sp) focus.copy(sp).setY(1.8)
      else focus.copy(center)
      wantR = hp ? 7.4 : sp ? introDist * 0.78 : introDist
      controls.autoRotateSpeed = hp ? 1.3 : 0.55
      if (hp) controls.autoRotate = true // turntable
    }

    api.current = {
      set(ts, sel, hs) {
        world.children.slice().forEach((c) => {
          world.remove(c)
          dispose(c, sharedTextures())
        })
        pulses.length = 0
        lives.length = 0
        spinners.length = 0
        towerPos.clear()

        const cols = Math.min(3, Math.max(1, ts.length))
        const rows = Math.max(1, Math.ceil(ts.length / cols))
        ts.forEach((t, i) => {
          const x = ((i % cols) - (cols - 1) / 2) * 3.8
          const z = (Math.floor(i / cols) - (rows - 1) / 2) * 3.8
          const won = t.pct >= 1
          const col = won ? GOLD : t.term === 'long' ? MAGENTA : CYAN
          const isSel = t.id === sel
          const g = new THREE.Group()
          g.position.set(x, 0, z)
          g.userData.id = t.id
          towerPos.set(t.id, new THREE.Vector3(x, 0, z))

          const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ map: glowTexture(col), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: isSel ? 0.7 : 0.42 }))
          glow.rotation.x = -Math.PI / 2
          glow.position.y = 0.03
          g.add(glow)

          // glass shell showing the full height of the goal
          const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, H, 1.5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.03, depthWrite: false, blending: THREE.AdditiveBlending }))
          shell.position.y = H / 2
          g.add(shell)
          const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: isSel ? 0.95 : 0.4 }))
          ghost.position.y = H / 2
          g.add(ghost)

          // the progress column
          const h = Math.max(0.15, t.pct * H)
          const fillMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: isSel ? 0.95 : 0.55, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.5 })
          const fill = new THREE.Mesh(new THREE.BoxGeometry(1.3, h, 1.3), fillMat)
          fill.position.y = h / 2
          g.add(fill)
          pulses.push({ m: fillMat, base: isSel ? 0.95 : 0.55, sel: isSel })
          const edge = new THREE.LineSegments(new THREE.EdgesGeometry(fill.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }))
          edge.position.y = h / 2
          g.add(edge)
          for (let y = 0.5; y < h; y += 0.5) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.025, 1.36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))
            band.position.y = y
            g.add(band)
          }
          const cap = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.06, 1.32), new THREE.MeshBasicMaterial({ color: 0xffffff }))
          cap.position.y = h + 0.03
          g.add(cap)

          const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, isSel ? 1.5 : 1.28, 48), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }))
          ring.rotation.x = -Math.PI / 2
          ring.position.y = 0.04
          g.add(ring)

          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2 }))
          gem.position.y = H + 0.75
          g.add(gem)
          gem.userData.y = H + 0.75
          spinners.push(gem)

          if (won) {
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 16, 8), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending }))
            beam.position.y = 8 + H
            g.add(beam)
          }

          const sp = label(t.name, `${Math.round(t.pct * 100)}%  ${t.term === 'long' ? 'LONG' : 'SHORT'}${won ? '  ✔' : ''}`, css(col))
          sp.position.y = H + 1.55
          g.add(sp)

          // the job's hero works beside its tower
          const unit = buildHero(t.job, won ? 3 : 0, i * 1.3, false)
          unit.group.scale.multiplyScalar(1.25)
          unit.group.position.set(1.7, 0, 1.0)
          unit.group.rotation.y = -0.4
          g.add(unit.group)
          lives.push({ rig: unit, win: won })

          // generous invisible hit box for tapping
          const hit = new THREE.Mesh(new THREE.BoxGeometry(1.9, H + 1.2, 1.9), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
          hit.position.y = (H + 1.2) / 2
          hit.userData.id = t.id
          g.add(hit)

          world.add(g)
        })

        // the party stands at the front of the map
        const frontZ = ((rows - 1) / 2) * 3.8 + 4.6
        hs.forEach((hr, i) => {
          const u = buildHero(hr.job, hr.tier, i * 0.9)
          u.group.scale.multiplyScalar(1.7)
          const pos = new THREE.Vector3((i - (hs.length - 1) / 2) * 2.9, 0, frontZ)
          u.group.position.copy(pos)
          world.add(u.group)
          lives.push({ rig: u, win: false })
          heroPos.set(hr.job, pos.clone())
          const hh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.6, 1.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
          hh.position.set(pos.x, 1.8, pos.z)
          hh.userData.hero = hr.job
          world.add(hh)
          const tag = label(hr.job.toUpperCase(), `Lv${hr.level} ${hr.rank}`, css(JOB_COL[hr.job]), 0.62)
          tag.position.set(pos.x, 4.0, frontZ)
          world.add(tag)
          if (prevTier[hr.job] !== undefined && hr.tier > prevTier[hr.job]) burst(pos, JOB_COL[hr.job], 1.6)
          prevTier[hr.job] = hr.tier
        })

        try {
          localStorage.setItem('tl-3d-tier', JSON.stringify(prevTier))
        } catch {
          /* ignore */
        }
        const zMin = -((rows - 1) / 2) * 3.8
        center.set(0, 1.5, hs.length ? (zMin + frontZ) / 2 : 0)
        curSel = sel
        applyFocus()

        const key = `${ts.length}:${hs.length}`
        if (key !== framed) {
          framed = key
          const dist = 12 + (cols - 1) * 2.2 + (rows - 1) * 2.2 + (hs.length ? 2.8 : 0)
          introDist = dist
          introLeft = 1.4 // glide in from further back
          controls.target.copy(center)
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
      const hits = ray.intersectObjects(world.children, true).filter((h) => h.object.userData.id || h.object.userData.hero)
      const top = hits[0]?.object.userData
      if (top?.hero) {
        heroFocus = heroFocus === top.hero ? null : (top.hero as Job)
        applyFocus()
      } else if (top?.id) {
        heroFocus = null
        pick.current(top.id as string)
        applyFocus()
      } else if (heroFocus) {
        heroFocus = null
        applyFocus()
      }
    })

    const size = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      composer.setSize(w, h)
      bloom.setSize(w / 2, h / 2)
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
      lives.forEach((l) => l.rig.update(t, dt, l.win))
      spinners.forEach((s) => {
        s.rotation.y += dt * 1.6
        s.position.y = (s.userData.y as number) + Math.sin(t * 2 + s.id) * 0.1
      })
      skyline.update(t, dt)
      rain.update(t, dt)
      motes.update(t, dt)
      l1.position.x = -6 + Math.sin(t * 0.3) * 2
      l2.position.x = 7 + Math.cos(t * 0.27) * 2

      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]
        b.age += dt
        if (b.age < 0) continue
        b.obj.visible = true
        const k = Math.min(1, b.age / b.life)
        b.tick(k)
        if (k >= 1) {
          fxGroup.remove(b.obj)
          dispose(b.obj)
          bursts.splice(i, 1)
        }
      }

      controls.target.lerp(focus, 1 - Math.pow(0.001, dt)) // smooth glide
      // a hero close-up looks at eye level; the overview looks down on the map
      const kk = 1 - Math.pow(0.01, dt)
      controls.minPolarAngle += ((heroFocus ? 1.22 : 0.35) - controls.minPolarAngle) * kk
      controls.maxPolarAngle += ((heroFocus ? 1.42 : Math.PI / 2.15) - controls.maxPolarAngle) * kk
      if (introLeft <= 0) {
        const r = camera.position.distanceTo(controls.target)
        camera.position.sub(controls.target).setLength(r + (wantR - r) * (1 - Math.pow(0.004, dt))).add(controls.target)
      }
      l3.position.copy(camera.position).add(new THREE.Vector3(2, 4, 1))
      if (introLeft > 0) {
        introLeft -= dt
        const k = ease(1 - Math.max(introLeft, 0) / 1.4)
        camera.position.sub(controls.target).setLength(introDist * (1.6 - 0.6 * k)).add(controls.target)
      }
      controls.update()

      if (fxRef.current) composer.render()
      else renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      dispose(scene, new Set())
      sky.dispose()
      composer.dispose()
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
