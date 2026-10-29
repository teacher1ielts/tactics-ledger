import * as THREE from 'three'

export interface Scenery {
  group: THREE.Group
  update: (t: number, dt: number) => void
}

/** Deterministic pseudo-random so the skyline looks the same every visit. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function windowTexture(seed: number, lit: string) {
  const r = rng(seed)
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#04030a'
  g.fillRect(0, 0, 64, 128)
  for (let y = 4; y < 124; y += 8) {
    for (let x = 4; x < 60; x += 8) {
      if (r() < 0.38) {
        g.fillStyle = r() < 0.16 ? '#ff2bd6' : lit
        g.globalAlpha = 0.45 + r() * 0.55
        g.fillRect(x, y, 4, 4)
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** A ring of dark towers with lit windows and neon signs, far enough away to read as a city. */
export function createSkyline(count = 46): Scenery {
  const group = new THREE.Group()
  const r = rng(7)
  const textures = [windowTexture(11, '#00f0ff'), windowTexture(23, '#ffd56b'), windowTexture(37, '#00f0ff')]
  const signs: THREE.Mesh[] = []

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.1
    const dist = 26 + r() * 14
    const w = 2 + r() * 3.2
    const d = 2 + r() * 3
    const h = 6 + r() * r() * 26
    const tex = textures[i % 3].clone()
    tex.needsUpdate = true
    tex.repeat.set(Math.max(1, Math.round(w / 1.4)), Math.max(1, Math.round(h / 3)))
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x0a0818, roughness: 0.6, metalness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }),
    )
    body.position.set(Math.cos(a) * dist, h / 2 - 0.2, Math.sin(a) * dist)
    body.rotation.y = -a + (r() - 0.5) * 0.3
    group.add(body)

    if (r() < 0.45) {
      const col = [0xff2bd6, 0x00f0ff, 0xfcee0a][Math.floor(r() * 3)]
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2 + r() * 3.5, 0.18), new THREE.MeshBasicMaterial({ color: col }))
      sign.position.set(0, h * (0.2 + r() * 0.3), d / 2 + 0.12)
      sign.position.x = (r() - 0.5) * w * 0.7
      body.add(sign)
      signs.push(sign)
    }
    if (r() < 0.3) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), new THREE.MeshBasicMaterial({ color: 0xff3d7f }))
      mast.position.y = h / 2 + 1.2
      body.add(mast)
      signs.push(mast)
    }
  }

  return {
    group,
    update(t) {
      signs.forEach((m, i) => {
        const on = Math.sin(t * (1.4 + (i % 5) * 0.3) + i) > -0.55
        m.visible = on
      })
    },
  }
}

/** Slanted neon rain. */
export function createRain(count = 520): Scenery {
  const group = new THREE.Group()
  const r = rng(99)
  const pos = new Float32Array(count * 6)
  const speed = new Float32Array(count)
  const BOX = 30
  for (let i = 0; i < count; i++) {
    const x = (r() - 0.5) * BOX * 2
    const y = r() * 22
    const z = (r() - 0.5) * BOX * 2
    pos.set([x, y, z, x - 0.05, y - 0.7, z], i * 6)
    speed[i] = 14 + r() * 10
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x66e8ff, transparent: true, opacity: 0.28, depthWrite: false }))
  rain.frustumCulled = false
  group.add(rain)

  return {
    group,
    update(_t, dt) {
      const a = geo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < count; i++) {
        const dy = speed[i] * dt
        a.array[i * 6 + 1] -= dy
        a.array[i * 6 + 4] -= dy
        if (a.array[i * 6 + 4] < 0) {
          a.array[i * 6 + 1] += 22.7
          a.array[i * 6 + 4] += 22.7
        }
      }
      a.needsUpdate = true
    },
  }
}

/** Slow glowing specks drifting upward, like data in the air. */
export function createMotes(count = 140): Scenery {
  const group = new THREE.Group()
  const r = rng(5)
  const pos = new Float32Array(count * 3)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos.set([(r() - 0.5) * 22, r() * 9, (r() - 0.5) * 22], i * 3)
    phase[i] = r() * 6.28
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9ff6ff, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }))
  pts.frustumCulled = false
  group.add(pts)

  return {
    group,
    update(t, dt) {
      const a = geo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < count; i++) {
        a.array[i * 3 + 1] += dt * (0.18 + (i % 4) * 0.05)
        a.array[i * 3] += Math.sin(t * 0.6 + phase[i]) * dt * 0.12
        if (a.array[i * 3 + 1] > 9) a.array[i * 3 + 1] = 0
      }
      a.needsUpdate = true
    },
  }
}

/** Dusk gradient with a magenta glow on the horizon, used as the scene background. */
export function skyTexture() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, 256)
  grd.addColorStop(0, '#05030f')
  grd.addColorStop(0.55, '#0c0626')
  grd.addColorStop(0.82, '#3a0a4d')
  grd.addColorStop(1, '#7a1466')
  g.fillStyle = grd
  g.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
