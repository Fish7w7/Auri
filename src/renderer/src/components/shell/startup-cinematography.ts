export const INTRO_PLAY_MS = 3650

const TAU = 2 * Math.PI
const IVORY = '247, 240, 218'
const GOLD = '216, 183, 106'
const mix = (from: number, to: number, t: number) => from + (to - from) * t
const clamp = (value: number) => Math.min(1, Math.max(0, value))
const smooth = (t: number) => t * t * (3 - 2 * t)
const cue = (time: number, from: number, to: number) => smooth(clamp((time - from) / (to - from)))

type Point = { x: number; y: number }
type Surface = (u: number, v: number) => Point

let seed = 1515
function sample(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}

const motes = Array.from({ length: 108 }, (_, i) => ({
  phase: sample() * TAU,
  entry: sample() * 0.76,
  depth: sample(),
  side: i % 2 ? 1 : -1,
  size: 0.38 + sample() ** 2 * 1.8
}))

// Coordinates in the viewBox of the official auri-icon.svg.
function sealPoint(index: number, fraction: number, size: number): Point {
  const dot = index % 13 === 0
  const x = dot ? 512 + Math.cos(fraction * TAU) * 20 : mix(index % 2 ? 364 : 660, 512, fraction)
  const y = dot ? 211 + Math.sin(fraction * TAU) * 20 : mix(715, 317, fraction)
  return { x: (x / 1024 - 0.5) * size, y: (y / 1024 - 0.5) * size }
}

function trace(context: CanvasRenderingContext2D, points: Point[]): void {
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y)
}

function drawLeaf(context: CanvasRenderingContext2D, surface: Surface, light: number, alpha: number, ruled: boolean): void {
  const top = Array.from({ length: 13 }, (_, i) => surface(i / 12, 0))
  const bottom = Array.from({ length: 13 }, (_, i) => surface(1 - i / 12, 1))
  const gutter = surface(0, 0.5)
  const edge = surface(1, 0.5)
  const paper = context.createLinearGradient(gutter.x, gutter.y, edge.x, edge.y)
  paper.addColorStop(0, '#212333')
  paper.addColorStop(0.18, ruled ? '#4f4840' : '#242c3e')
  paper.addColorStop(0.58, ruled ? '#857553' : '#373b42')
  paper.addColorStop(0.9, ruled ? '#b1a17b' : '#565044')
  paper.addColorStop(1, ruled ? '#625642' : '#393547')

  context.globalAlpha = alpha
  trace(context, [...top, ...bottom])
  context.closePath()
  context.fillStyle = paper
  context.fill()
  context.lineWidth = ruled ? 0.9 : 0.65
  context.strokeStyle = `rgba(${GOLD}, ${0.25 + 0.54 * light})`
  context.stroke()

  if (!ruled) return
  for (let row = 0; row < 13; row++) {
    const y = 0.19 + row * 0.051
    const end = row % 4 === 3 ? 0.63 : 0.82 + Math.sin(row * 8) * 0.04
    trace(context, Array.from({ length: 7 }, (_, i) => surface(mix(0.15, end, i / 6), y)))
    context.lineWidth = row === 0 ? 1.15 : 0.7
    context.strokeStyle = row === 0 ? `rgba(${IVORY}, .61)` : 'rgba(18, 24, 36, .63)'
    context.stroke()
  }
}

export function createIntroScene(canvas: HTMLCanvasElement, scene: HTMLElement): ((seconds: number) => void) | undefined {
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return
  let width = 0
  let height = 0
  let pixelRatio = 1

  return (time) => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    const ratio = Math.min(devicePixelRatio, 1.5, Math.sqrt(2_000_000 / (w * h)))
    if (w !== width || h !== height || ratio !== pixelRatio) {
      width = w
      height = h
      pixelRatio = ratio
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
    }

    const focus = cue(time, 0.2, 3.45)
    const unfold = cue(time, 0.72, 1.68)
    const release = cue(time, 2.13, 3.12)
    const seal = cue(time, 2.64, 3.27)
    const scale = Math.min(w / 1060, h / 645) * mix(0.88, 1.1, focus)
    const centerY = h * 0.43
    const sealSize = Math.max(100, Math.min(174, h * 0.235))
    scene.style.setProperty('--ink', seal.toFixed(3))
    scene.style.setProperty('--title', cue(time, 2.99, 3.56).toFixed(3))
    scene.style.setProperty('--exposure', (0.24 + unfold * 0.63 - release * 0.24).toFixed(3))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, w, h)
    context.translate(w / 2, centerY)
    context.lineCap = 'round'

    const yaw = mix(-0.39, 0.15, focus)
    const pitch = mix(0.83, 0.58, focus)
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)
    const cosP = Math.cos(pitch)
    const sinP = Math.sin(pitch)
    const project = (x: number, y: number, z: number): Point => {
      const across = x * cosY - z * sinY
      const depth = x * sinY + z * cosY
      const vertical = y * cosP - depth * sinP
      const perspective = 870 / (870 - (y * sinP + depth * cosP))
      return { x: across * perspective * scale, y: vertical * perspective * scale }
    }
    const leaf = (angle: number, elevation: number, curl: number): Surface => {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      return (u, v) => project(
        cos * u * 222,
        (v - 0.5) * 290 * (1 - 0.065 * u),
        elevation + sin * u * 222 + Math.sin(u * Math.PI) * curl
      )
    }

    // Two currents of dust cross the binding. Wider motes pass closer to the lens.
    for (const mote of motes) {
      const travel = clamp((time - mote.entry) / 2.55)
      const orbit = mote.phase + travel * (2.15 + mote.depth * 2.7)
      const radius = mix(615, 25, smooth(travel)) * (0.4 + mote.depth * 0.7)
      const x = (mote.side * radius + Math.cos(orbit) * (68 + radius * 0.23)) * scale
      const y = (Math.sin(orbit) * (24 + radius * 0.38) + (mote.depth - 0.5) * 135) * scale
      const brightness = cue(time, mote.entry, mote.entry + 0.35) * (1 - release * 0.91)
      const size = mote.size * scale
      context.globalAlpha = brightness * (0.25 + mote.depth * 0.68)
      context.strokeStyle = mote.size > 1.4 ? '#f7f0da' : '#d8b76a'
      context.lineWidth = Math.max(0.65, size)
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + mote.side * size * (1 + 4 * travel), y + Math.cos(orbit) * size * 1.3)
      context.stroke()
    }

    const paperAlpha = cue(time, 0.58, 1.2) * (1 - cue(time, 2.27, 2.87))
    if (paperAlpha > 0.002) {
      const angle = mix(1.23, 0.12, unfold)
      for (let layer = 0; layer < 4; layer++) {
        const elevation = -21 + layer * 5
        drawLeaf(context, leaf(Math.PI - angle, elevation, 9), unfold, paperAlpha, layer === 3)
        drawLeaf(context, leaf(angle, elevation, 15), unfold, paperAlpha, layer === 3)
      }
      for (let turn = 0; turn < 4; turn++) {
        const start = 1.04 + turn * 0.235
        const turning = cue(time, start, start + 0.92)
        const lifted = Math.sin(turning * Math.PI)
        if (lifted < 0.01) continue
        const sweep = mix(Math.PI - angle, angle, turning)
        drawLeaf(context, leaf(sweep, 2 + turn * 3, 12 + 44 * lifted), lifted, paperAlpha * smooth(clamp(lifted * 3)), true)
      }
      const spine = leaf(angle, 0, 0)
      context.globalAlpha = paperAlpha
      trace(context, [spine(0, 0), spine(0, 1)])
      context.strokeStyle = `rgba(${GOLD}, .82)`
      context.lineWidth = 1.35
      context.stroke()
    }

    // Lines of ink lift from the sheet and gather on the two strokes and dot of the Auri seal.
    if (time > 1.94 && time < 3.45) {
      for (let line = 0; line < 32; line++) {
        const start = 1.94 + (line % 11) * 0.048
        const flight = cue(time, start, start + 0.91)
        const visibility = cue(time, start, start + 0.19) * (1 - cue(time, start + 0.76, start + 1.02))
        if (visibility < 0.005) continue
        const surface = leaf(line % 2 ? Math.PI - 0.13 : 0.13, 0, 16)
        const row = 0.15 + ((line * 7) % 28) / 39
        const filament = Array.from({ length: 9 }, (_, index) => {
          const fraction = index / 8
          const from = surface(mix(0.15, 0.89, fraction), row)
          const to = sealPoint(line, 0.12 + 0.8 * fraction, sealSize)
          const lift = Math.sin(flight * Math.PI)
          return {
            x: mix(from.x, to.x, flight) + lift * Math.sin(fraction * 2.7 + line) * 61 * scale,
            y: mix(from.y, to.y, flight) - lift * (28 + (line % 7) * 11) * scale
          }
        })
        trace(context, filament)
        context.globalAlpha = visibility * 0.17
        context.lineWidth = 5 * scale
        context.strokeStyle = '#d8b76a'
        context.stroke()
        context.globalAlpha = visibility * 0.86
        context.lineWidth = 0.92 * scale
        context.strokeStyle = line % 3 ? '#d8b76a' : '#f7f0da'
        context.stroke()
      }
    }

    context.globalAlpha = 1
  }
}
