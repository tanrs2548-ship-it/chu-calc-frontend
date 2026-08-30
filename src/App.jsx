import { useMemo, useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot
} from 'recharts'
import './App.css'

/*
  CHU CALC — Engineering Statics
  Refactored / hardened version

  Conventions
  - User-entered force values are converted to kN internally.
  - User-entered moment values are converted to kN·m internally.
  - Positive Fx = +X (right)
  - Positive Fy = +Y (up)
  - Positive Mz = CCW
  - SVG screen Y is downward, so visual force arrows are inverted where required.
  - Truss/Frame geometry: 50 px = selected gridScale metres.
*/

const PIXELS_PER_GRID = 50
const EPS = 1e-9
const API_BASE = 'https://chu-calc-backend.onrender.com'

const theme = {
  bg: '#121212',
  cardBg: '#1E1E1E',
  textMain: '#E0E0E0',
  primary: '#FFFFFF',
  accent: '#00BFFF',
  supportOrange: '#FFA500',
  border: '#333333',
  memberGray: '#FFFFFF',
  lightGray: '#252525',
}

const FORCE_TO_KN = {
  N: 0.001,
  kN: 1,
  lb: 0.0044482216152605,
  kip: 4.4482216152605,
}

const MOMENT_TO_KNM = {
  'N·m': 0.001,
  'kN·m': 1,
  'lb·ft': 0.0013558179483314,
}

const formatNumber = (value, digits = 2) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const formatYAxis = (value) => {
  if (!Number.isFinite(Number(value))) return '0'
  const n = Number(value)
  return Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString()
}

const forceToKN = (value, unit) => Number(value || 0) * (FORCE_TO_KN[unit] ?? 1)
const knToForce = (valueKN, unit) => Number(valueKN || 0) / (FORCE_TO_KN[unit] ?? 1)

const momentToKNm = (value, unit) => Number(value || 0) * (MOMENT_TO_KNM[unit] ?? 1)
const knmToMoment = (valueKNm, unit) => Number(valueKNm || 0) / (MOMENT_TO_KNM[unit] ?? 1)

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

const deepClone = (obj) => JSON.parse(JSON.stringify(obj))

const solveLinear3 = (A, b) => {
  const m = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < EPS) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]

    const p = m[col][col]
    for (let j = col; j < 4; j++) m[col][j] /= p

    for (let row = 0; row < 3; row++) {
      if (row === col) continue
      const factor = m[row][col]
      for (let j = col; j < 4; j++) m[row][j] -= factor * m[col][j]
    }
  }
  return [m[0][3], m[1][3], m[2][3]]
}

const equilibriumResidual = (loads, reactions = []) => {
  let fx = 0, fy = 0, mz = 0
  loads.forEach((f) => {
    fx += f.fx || 0
    fy += f.fy || 0
    mz += f.mz || 0
  })
  reactions.forEach((f) => {
    fx += f.fx || 0
    fy += f.fy || 0
    mz += f.mz || 0
  })
  return { fx, fy, mz }
}

const getMaxMinObj = (data, key) => {
  if (!data?.length) return { max: null, min: null }
  return data.reduce(
    (acc, item) => {
      if (item[key] > acc.max[key]) acc.max = item
      if (item[key] < acc.min[key]) acc.min = item
      return acc
    },
    { max: data[0], min: data[0] }
  )
}

const validateFinite = (value, label) => {
  if (!Number.isFinite(Number(value))) return `${label} must be a valid number.`
  return null
}

function RenderSupportSVG({ cx, cy, type, dir = 'horizontal' }) {
  const color = theme.supportOrange
  const vertical = dir === 'vertical'

  if (type === 'pin') {
    return vertical ? (
      <g>
        <polygon points={`${cx - 5},${cy} ${cx - 20},${cy - 10} ${cx - 20},${cy + 10}`} fill={color} />
        <line x1={cx - 20} y1={cy - 15} x2={cx - 20} y2={cy + 15} stroke={color} strokeWidth="2.5" />
      </g>
    ) : (
      <g>
        <polygon points={`${cx},${cy + 5} ${cx - 10},${cy + 20} ${cx + 10},${cy + 20}`} fill={color} />
        <line x1={cx - 15} y1={cy + 20} x2={cx + 15} y2={cy + 20} stroke={color} strokeWidth="2.5" />
      </g>
    )
  }

  if (type === 'roller') {
    return vertical ? (
      <g>
        <circle cx={cx - 10} cy={cy} r="6" fill={color} />
        <line x1={cx - 20} y1={cy - 15} x2={cx - 20} y2={cy + 15} stroke={color} strokeWidth="2.5" />
      </g>
    ) : (
      <g>
        <circle cx={cx} cy={cy + 10} r="6" fill={color} />
        <line x1={cx - 15} y1={cy + 18} x2={cx + 15} y2={cy + 18} stroke={color} strokeWidth="2.5" />
      </g>
    )
  }

  if (type === 'fixed') {
    return vertical
      ? <rect x={cx - 15} y={cy - 15} width="10" height="30" fill={color} />
      : <rect x={cx - 15} y={cy + 5} width="30" height="10" fill={color} />
  }

  return null
}

function App() {
  const [currentView, setCurrentView] = useState('home')
  const [activeTab, setActiveTab] = useState('particle')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showFormulaModal, setShowFormulaModal] = useState(false)

  // ============================================================
  // PARTICLE EQUILIBRIUM
  // ============================================================
  const [jointPos, setJointPos] = useState({ x: 500, y: 200 })
  const [pWeight, setPWeight] = useState(150)
  const [pAngle1, setPAngle1] = useState(35)
  const [pAngle2, setPAngle2] = useState(45)
  const [pUnit, setPUnit] = useState('N')
  const [particleResult, setParticleResult] = useState(null)

  const analyzeParticle = useCallback(() => {
    setErrorMessage('')
    const W = forceToKN(pWeight, pUnit)
    const a1 = Number(pAngle1)
    const a2 = Number(pAngle2)

    if (!(W >= 0)) {
      setErrorMessage('Particle weight must be zero or positive.')
      return
    }
    if (!(a1 > 0 && a1 < 180 && a2 > 0 && a2 < 180)) {
      setErrorMessage('For this two-cable model, both cable angles must be between 0° and 180°.')
      return
    }

    const denom = Math.sin((a1 + a2) * Math.PI / 180)
    if (Math.abs(denom) < 1e-10) {
      setErrorMessage('No unique equilibrium solution: the cable geometry is singular.')
      setParticleResult(null)
      return
    }

    const t1KN = W * Math.cos(a2 * Math.PI / 180) / denom
    const t2KN = W * Math.cos(a1 * Math.PI / 180) / denom

    if (t1KN < -1e-10 || t2KN < -1e-10) {
      setErrorMessage('The calculated cable force is negative. This geometry cannot be represented by two tension-only cables.')
      setParticleResult(null)
      return
    }

    const t1 = knToForce(t1KN, pUnit)
    const t2 = knToForce(t2KN, pUnit)
    const rx = t1KN * Math.cos(a1 * Math.PI / 180) - t2KN * Math.cos(a2 * Math.PI / 180)
    const ry = t1KN * Math.sin(a1 * Math.PI / 180) + t2KN * Math.sin(a2 * Math.PI / 180) - W

    setParticleResult({
      T1: t1,
      T2: t2,
      W: Number(pWeight),
      residualFx: rx,
      residualFy: ry,
      steps: [
        `1) ΣFx = 0`,
        `   T₁ cos(θ₁) − T₂ cos(θ₂) = 0`,
        `2) ΣFy = 0`,
        `   T₁ sin(θ₁) + T₂ sin(θ₂) − W = 0`,
        `3) T₁ = W cos(θ₂) / sin(θ₁ + θ₂)`,
        `   T₁ = ${formatNumber(t1)} ${pUnit}`,
        `4) T₂ = W cos(θ₁) / sin(θ₁ + θ₂)`,
        `   T₂ = ${formatNumber(t2)} ${pUnit}`,
        `5) Equilibrium residual: ΣFx = ${formatNumber(knToForce(rx, pUnit), 5)} ${pUnit}, ΣFy = ${formatNumber(knToForce(ry, pUnit), 5)} ${pUnit}`,
      ],
    })
  }, [pWeight, pUnit, pAngle1, pAngle2])

  const handleParticleCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setJointPos({
      x: clamp(e.clientX - rect.left, 90, 510),
      y: clamp(e.clientY - rect.top, 80, 260),
    })
    setParticleResult(null)
    setErrorMessage('')
  }

  // ============================================================
  // FORCE VECTORS
  // ============================================================
  const [vectorUnit, setVectorUnit] = useState('kN')
  const [vectorLoads, setVectorLoads] = useState([
    { id: 1, magnitude: 100, angle: 60, quadrant: 3, refAxis: 'x', direction: 'out' },
    { id: 2, magnitude: 50, angle: 20, quadrant: 1, refAxis: 'x', direction: 'out' },
  ])
  const [vectorResult, setVectorResult] = useState(null)

  const getVectorComponents = useCallback((v) => {
    const a = Number(v.angle)
    const q = Number(v.quadrant)
    if (!(a >= 0 && a <= 90)) return null

    let trueAngle
    if (v.refAxis === 'x') {
      trueAngle = ({ 1: a, 2: 180 - a, 3: 180 + a, 4: 360 - a })[q]
    } else {
      trueAngle = ({ 1: 90 - a, 2: 90 + a, 3: 270 - a, 4: 270 + a })[q]
    }
    if (!Number.isFinite(trueAngle)) return null

    const forceAngle = v.direction === 'in' ? (trueAngle + 180) % 360 : trueAngle
    const rad = forceAngle * Math.PI / 180
    const magKN = forceToKN(v.magnitude, vectorUnit)
    return {
      fxKN: magKN * Math.cos(rad),
      fyKN: magKN * Math.sin(rad),
      drawRad: trueAngle * Math.PI / 180,
      forceAngle,
      magnitudeKN: magKN,
    }
  }, [vectorUnit])

  const analyzeVectors = () => {
    setErrorMessage('')
    let sumFxKN = 0, sumFyKN = 0
    const steps = []

    for (let i = 0; i < vectorLoads.length; i++) {
      const f = vectorLoads[i]
      const err = validateFinite(f.magnitude, `F${i + 1} magnitude`)
      if (err) { setErrorMessage(err); return }
      const c = getVectorComponents(f)
      if (!c) {
        setErrorMessage(`F${i + 1}: reference angle must be between 0° and 90°.`)
        return
      }
      sumFxKN += c.fxKN
      sumFyKN += c.fyKN
      steps.push({
        id: f.id,
        name: `F${i + 1}`,
        fx: knToForce(c.fxKN, vectorUnit),
        fy: knToForce(c.fyKN, vectorUnit),
        drawRad: c.drawRad,
        isOut: f.direction === 'out',
        magnitude: Number(f.magnitude),
      })
    }

    const rKN = Math.hypot(sumFxKN, sumFyKN)
    const angle = (Math.atan2(sumFyKN, sumFxKN) * 180 / Math.PI + 360) % 360
    const ref = Math.atan2(Math.abs(sumFyKN), Math.abs(sumFxKN)) * 180 / Math.PI
    const dirSymbol =
      sumFxKN >= 0 && sumFyKN >= 0 ? '↗ Q1' :
      sumFxKN < 0 && sumFyKN >= 0 ? '↖ Q2' :
      sumFxKN < 0 && sumFyKN < 0 ? '↙ Q3' : '↘ Q4'

    setVectorResult({
      sumFx: knToForce(sumFxKN, vectorUnit),
      sumFy: knToForce(sumFyKN, vectorUnit),
      rMag: knToForce(rKN, vectorUnit),
      rAng: angle,
      refAng: ref,
      dirSymbol,
      steps,
    })
  }

  const updateVectorLoad = (id, field, value) => {
    setVectorLoads(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v))
    setVectorResult(null)
  }

  // ============================================================
  // BEAM
  // ============================================================
  const [beamLength, setBeamLength] = useState(4)
  const [forceUnit, setForceUnit] = useState('kN')
  const [beamSupports, setBeamSupports] = useState([
    { id: 1, type: 'pin', x: 0, direction: 'horizontal' },
    { id: 2, type: 'roller', x: 4, direction: 'horizontal' },
  ])
  const [beamLoads, setBeamLoads] = useState([
    { id: 1, type: 'point', magnitude: 2, x: 1 },
    { id: 2, type: 'distributed', magnitude: 2, start_x: 2, end_x: 4 },
  ])
  const [chartData, setChartData] = useState([])
  const [beamReactions, setBeamReactions] = useState([])
  const [beamSteps, setBeamSteps] = useState([])
  const [beamHistory, setBeamHistory] = useState([])

  const safeBeamLength = Math.max(Number(beamLength) || 1, 0.01)
  const getSvgX = x => 50 + (Number(x || 0) / safeBeamLength) * 900
  const optimizedTicks = useMemo(
    () => safeBeamLength > 10
      ? Array.from({ length: Math.floor(safeBeamLength / 2) + 1 }, (_, i) => i * 2)
      : Array.from({ length: Math.floor(safeBeamLength) + 1 }, (_, i) => i),
    [safeBeamLength]
  )

  const sortedBeamSupports = useMemo(
    () => [...beamSupports].sort((a, b) => Number(a.x) - Number(b.x)),
    [beamSupports]
  )
  const getBeamNodeLabel = id => {
    const idx = sortedBeamSupports.findIndex(s => s.id === id)
    return idx >= 0 ? String.fromCharCode(65 + idx) : '?'
  }

  const saveBeamState = () => {
    setBeamHistory(prev => [...prev, {
      length: beamLength,
      supports: deepClone(beamSupports),
      loads: deepClone(beamLoads),
    }].slice(-30))
  }

  const handleUndoBeam = () => {
    setBeamHistory(prev => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      setBeamLength(last.length)
      setBeamSupports(last.supports)
      setBeamLoads(last.loads)
      return prev.slice(0, -1)
    })
    setChartData([])
    setBeamReactions([])
  }

  const updateBeamSupport = (id, field, value) => {
    saveBeamState()
    setBeamSupports(prev => prev.map(s => s.id === id ? { ...s, [field]: field === 'x' ? Number(value) : value } : s))
    setChartData([])
  }

  const updateBeamLoad = (id, field, value) => {
    saveBeamState()
    setBeamLoads(prev => prev.map(l => l.id === id ? { ...l, [field]: field === 'magnitude' || field === 'x' || field === 'start_x' || field === 'end_x' ? Number(value) : value } : l))
    setChartData([])
  }

  const loadBeamPreset = type => {
    saveBeamState()
    if (type === 'simply-supported') {
      setBeamLength(6)
      setBeamSupports([
        { id: 1, type: 'pin', x: 0, direction: 'horizontal' },
        { id: 2, type: 'roller', x: 6, direction: 'horizontal' },
      ])
      setBeamLoads([{ id: 1, type: 'point', magnitude: 10, x: 3 }])
    } else if (type === 'overhanging') {
      setBeamLength(8)
      setBeamSupports([
        { id: 1, type: 'pin', x: 0, direction: 'horizontal' },
        { id: 2, type: 'roller', x: 6, direction: 'horizontal' },
      ])
      setBeamLoads([
        { id: 1, type: 'distributed', magnitude: 4, start_x: 0, end_x: 6 },
        { id: 2, type: 'point', magnitude: 8, x: 8 },
      ])
    } else if (type === 'cantilever') {
      setBeamLength(4)
      setBeamSupports([{ id: 1, type: 'fixed', x: 0, direction: 'horizontal' }])
      setBeamLoads([{ id: 1, type: 'distributed', magnitude: 5, start_x: 0, end_x: 4 }])
    }
    setChartData([])
    setBeamReactions([])
  }

  const analyzeBeam = async () => {
    setErrorMessage('')
    if (safeBeamLength <= 0) {
      setErrorMessage('Beam length must be positive.')
      return
    }

    for (const s of beamSupports) {
      if (Number(s.x) < 0 || Number(s.x) > safeBeamLength) {
        setErrorMessage(`Support position x=${s.x} lies outside the beam.`)
        return
      }
    }

    for (const l of beamLoads) {
      if (l.type === 'point' || l.type === 'moment') {
        if (Number(l.x) < 0 || Number(l.x) > safeBeamLength) {
          setErrorMessage('A point load or moment is outside the beam.')
          return
        }
      }
      if (l.type === 'distributed') {
        if (Number(l.start_x) < 0 || Number(l.end_x) > safeBeamLength || Number(l.end_x) <= Number(l.start_x)) {
          setErrorMessage('UDL range is invalid.')
          return
        }
      }
    }

    setIsAnalyzing(true)
    try {
      const payload = {
        beam_length: safeBeamLength,
        supports: beamSupports.map(s => ({ ...s, x: Number(s.x) })),
        loads: beamLoads.map(l => {
          if (l.type === 'point') {
            return { type: 'point', magnitude: forceToKN(l.magnitude, forceUnit), x: Number(l.x) }
          }
          if (l.type === 'moment') {
            return {
              type: 'moment',
              magnitude: momentToKNm(l.magnitude, 'kN·m'),
              x: Number(l.x),
              direction: l.direction,
            }
          }
          return {
            type: 'distributed',
            magnitude: forceToKN(l.magnitude, forceUnit),
            start_x: Number(l.start_x),
            end_x: Number(l.end_x),
          }
        }),
        ei: null,
        unit: 'kN',
        analysis_type: 'determinate',
      }

      const response = await axios.post(`${API_BASE}/api/analyze`, payload)
      if (!response.data?.diagram_data?.x) throw new Error('Invalid response from beam solver.')

      const data = response.data.diagram_data
      const formatted = data.x.map((x, i) => ({
        x,
        shear: data.shear?.[i] ?? 0,
        moment: data.moment?.[i] ?? 0,
      }))

      setChartData(formatted)

      // Backend reactions are assumed to be kN. Convert only for display.
      const reactions = (response.data.reactions || []).map(r => ({
        ...r,
        forceDisplay: knToForce(r.force_kN ?? r.force ?? 0, forceUnit),
      }))
      setBeamReactions(reactions)

      setBeamSteps(response.data.steps || [
        'Beam analysis completed.',
        'Internal solver convention: kN and kN·m.',
      ])
    } catch (err) {
      console.error(err)
      setErrorMessage(err?.response?.data?.detail || err.message || 'Beam calculation failed.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ============================================================
  // TRUSS
  // ============================================================
  const [nodes, setNodes] = useState([])
  const [elements, setElements] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [trussUnit, setTrussUnit] = useState('kN')
  const [gridScale, setGridScale] = useState(1)
  const [trussSupports, setTrussSupports] = useState({})
  const [trussLoads, setTrussLoads] = useState({})
  const [trussAnalysisResult, setTrussAnalysisResult] = useState(null)
  const [trussLocalData, setTrussLocalData] = useState({ steps: [], rxns: {}, analyzed: false })
  const [trussHistory, setTrussHistory] = useState([])

  const saveTrussState = () => {
    setTrussHistory(prev => [...prev, {
      nodes: deepClone(nodes),
      elements: deepClone(elements),
      supports: deepClone(trussSupports),
      loads: deepClone(trussLoads),
    }].slice(-30))
  }

  const handleUndoTruss = () => {
    setTrussHistory(prev => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      setNodes(last.nodes)
      setElements(last.elements)
      setTrussSupports(last.supports)
      setTrussLoads(last.loads)
      return prev.slice(0, -1)
    })
    setTrussAnalysisResult(null)
    setTrussLocalData({ steps: [], rxns: {}, analyzed: false })
  }

  const handleTrussNodeClick = (e, node) => {
    e.stopPropagation()
    if (selectedNodeId === node.id) {
      setSelectedNodeId(null)
      return
    }
    if (selectedNodeId) {
      const duplicate = elements.some(el =>
        (el.n1 === selectedNodeId && el.n2 === node.id) ||
        (el.n1 === node.id && el.n2 === selectedNodeId)
      )
      if (!duplicate && selectedNodeId !== node.id) {
        saveTrussState()
        setElements(prev => [...prev, { id: Date.now(), n1: selectedNodeId, n2: node.id }])
      }
    }
    setSelectedNodeId(node.id)
  }

  const handleTrussCanvasClick = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rawX = e.clientX - rect.left
    const rawY = e.clientY - rect.top
    const existing = nodes.find(n => Math.hypot(n.x - rawX, n.y - rawY) < 20)
    if (existing) {
      handleTrussNodeClick(e, existing)
      return
    }

    const x = Math.round(rawX / PIXELS_PER_GRID) * PIXELS_PER_GRID
    const y = Math.round(rawY / PIXELS_PER_GRID) * PIXELS_PER_GRID
    if (x < 25 || x > 1375 || y < 25 || y > 575) return

    saveTrussState()
    const id = Date.now()
    const name = nodes.length < 26 ? String.fromCharCode(65 + nodes.length) : `N${nodes.length}`
    setNodes(prev => [...prev, { id, name, x, y }])
    if (selectedNodeId) {
      setElements(prev => [...prev, { id: Date.now() + 1, n1: selectedNodeId, n2: id }])
    }
    setSelectedNodeId(id)
  }

  const handleSupportTypeChange = (nodeId, type) => {
    saveTrussState()
    setTrussSupports(prev => {
      const next = { ...prev }
      if (type === 'none' || type === 'free') delete next[nodeId]
      else next[nodeId] = { ...(next[nodeId] || {}), type, direction: next[nodeId]?.direction || 'horizontal' }
      return next
    })
  }

  const handleTrussLoadChange = (nodeId, axis, value) => {
    saveTrussState()
    setTrussLoads(prev => {
      const next = deepClone(prev)
      if (value === '') {
        if (next[nodeId]) {
          delete next[nodeId][axis]
          if (!Object.keys(next[nodeId]).length) delete next[nodeId]
        }
      } else {
        next[nodeId] = { ...(next[nodeId] || {}), [axis]: Number(value) }
      }
      return next
    })
  }

  const clearTrussCanvas = () => {
    saveTrussState()
    setNodes([])
    setElements([])
    setTrussSupports({})
    setTrussLoads({})
    setSelectedNodeId(null)
    setTrussAnalysisResult(null)
    setTrussLocalData({ steps: [], rxns: {}, analyzed: false })
  }

  const loadTrussPreset = () => {
    saveTrussState()
    setNodes([
      { id: 1, name: 'A', x: 200, y: 350 },
      { id: 2, name: 'B', x: 300, y: 350 },
      { id: 3, name: 'C', x: 400, y: 350 },
      { id: 4, name: 'D', x: 400, y: 250 },
      { id: 5, name: 'E', x: 300, y: 250 },
      { id: 6, name: 'F', x: 200, y: 250 },
    ])
    setElements([
      { id: 101, n1: 1, n2: 2 }, { id: 102, n1: 2, n2: 3 },
      { id: 103, n1: 6, n2: 5 }, { id: 104, n1: 5, n2: 4 },
      { id: 105, n1: 1, n2: 6 }, { id: 106, n1: 2, n2: 5 },
      { id: 107, n1: 3, n2: 4 }, { id: 108, n1: 1, n2: 5 },
      { id: 109, n1: 3, n2: 5 },
    ])
    setTrussSupports({
      1: { type: 'pin', direction: 'horizontal' },
      3: { type: 'roller', direction: 'horizontal' },
    })
    setTrussLoads({ 2: { fy: 15 } })
    setTrussAnalysisResult(null)
    setTrussLocalData({ steps: [], rxns: {}, analyzed: false })
  }

  const autoCleanMesh = (nds, els) => {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
    const between = (p, a, b) => Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < 0.1
    const generated = []

    els.forEach(el => {
      const a = nds.find(n => n.id === el.n1)
      const b = nds.find(n => n.id === el.n2)
      if (!a || !b || dist(a, b) < EPS) return

      const onSegment = nds
        .filter(n => n.id !== a.id && n.id !== b.id && between(n, a, b))
        .sort((p, q) => dist(a, p) - dist(a, q))

      const path = [a, ...onSegment, b]
      for (let i = 0; i < path.length - 1; i++) {
        const n1 = path[i].id
        const n2 = path[i + 1].id
        generated.push({
          n1: Math.min(n1, n2),
          n2: Math.max(n1, n2),
        })
      }
    })

    const seen = new Set()
    return generated.filter(e => {
      const key = `${e.n1}-${e.n2}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map((e, i) => ({ ...e, id: Date.now() + i }))
  }

  /*
    Reaction solver for the common determinate truss case:
    - exactly 3 scalar reaction unknowns
    - each reaction is represented by a direction vector
    - solves [Fx, Fy, M] directly
  */
  const calculateTrussReactions = () => {
    const supportRows = []

    Object.entries(trussSupports).forEach(([id, s]) => {
      const node = nodes.find(n => String(n.id) === String(id))
      if (!node) return

      if (s.type === 'pin') {
        supportRows.push({
          nodeId: node.id, component: 'fx',
          ux: 1, uy: 0, x: node.x, y: node.y,
        })
        supportRows.push({
          nodeId: node.id, component: 'fy',
          ux: 0, uy: 1, x: node.x, y: node.y,
        })
      } else if (s.type === 'roller') {
        const vertical = (s.direction || 'horizontal') === 'horizontal'
        // horizontal direction means roller reacts vertically, matching the UI symbol.
        supportRows.push({
          nodeId: node.id, component: vertical ? 'fy' : 'fx',
          ux: vertical ? 0 : 1, uy: vertical ? 1 : 0,
          x: node.x, y: node.y,
        })
      }
    })

    if (supportRows.length !== 3) {
      return {
        error: 'This reaction solver requires exactly 3 independent support reaction components.',
      }
    }

    let totalFx = 0, totalFy = 0, totalM = 0
    Object.entries(trussLoads).forEach(([id, f]) => {
      const node = nodes.find(n => String(n.id) === String(id))
      if (!node) return
      const fx = forceToKN(f.fx || 0, trussUnit)
      const fy = forceToKN(f.fy || 0, trussUnit)
      const x = (node.x / PIXELS_PER_GRID) * gridScale
      const y = -(node.y / PIXELS_PER_GRID) * gridScale
      totalFx += fx
      totalFy += fy
      totalM += x * fy - y * fx
    })

    const A = supportRows.map(r => [
      r.ux,
      r.uy,
      r.x * r.uy - r.y * r.ux,
    ])

    // Unknown vector is the 3 support components.
    const b = [-totalFx, -totalFy, -totalM]
    const sol = solveLinear3(A, b)
    if (!sol) return { error: 'Support geometry is singular; no unique reaction solution exists.' }

    const rxns = {}
    supportRows.forEach((r, i) => {
      if (!rxns[r.nodeId]) rxns[r.nodeId] = { fx: 0, fy: 0 }
      rxns[r.nodeId][r.component] = knToForce(sol[i], trussUnit)
    })

    const reactionForces = Object.values(rxns).map(r => ({
      fx: forceToKN(r.fx, trussUnit),
      fy: forceToKN(r.fy, trussUnit),
      mz: 0,
    }))
    const residual = equilibriumResidual(
      Object.entries(trussLoads).map(([id, f]) => ({
        fx: forceToKN(f.fx || 0, trussUnit),
        fy: forceToKN(f.fy || 0, trussUnit),
        mz: 0,
      })),
      reactionForces
    )

    return { rxns, residual, supportRows }
  }

  const runTrussAnalysis = async () => {
    setErrorMessage('')
    if (nodes.length < 2 || elements.length < 1) {
      setErrorMessage('Create at least two nodes and one member.')
      return
    }

    setIsAnalyzing(true)
    try {
      const cleanedElements = autoCleanMesh(nodes, elements)
      setElements(cleanedElements)

      const local = calculateTrussReactions()
      const steps = ['=== ENGINEERING STATICS : TRUSS REACTIONS ===']

      if (local.error) {
        steps.push(`⚠ ${local.error}`)
      } else {
        const fx = knToForce(local.residual.fx, trussUnit)
        const fy = knToForce(local.residual.fy, trussUnit)
        const mz = local.residual.mz
        steps.push('1) Sign convention: +Fx right, +Fy up, +Mz CCW.')
        steps.push(`2) ΣFx residual = ${formatNumber(fx, 5)} ${trussUnit}`)
        steps.push(`3) ΣFy residual = ${formatNumber(fy, 5)} ${trussUnit}`)
        steps.push(`4) ΣM residual = ${formatNumber(mz, 5)} kN·m`)
        steps.push('5) Reactions were solved from the three global equilibrium equations.')
      }

      setTrussLocalData({
        steps,
        rxns: local.rxns || {},
        analyzed: true,
      })

      const payload = {
        nodes: nodes.map(n => ({
          id: n.id, name: n.name,
          x: (n.x / PIXELS_PER_GRID) * gridScale,
          y: -(n.y / PIXELS_PER_GRID) * gridScale,
        })),
        elements: cleanedElements.map(el => ({ id: el.id, n1: el.n1, n2: el.n2 })),
        supports: trussSupports,
        loads: Object.fromEntries(Object.entries(trussLoads).map(([id, f]) => [
          id,
          {
            fx: forceToKN(f.fx || 0, trussUnit),
            fy: forceToKN(f.fy || 0, trussUnit),
          },
        ])),
        unit: 'kN',
        ei: null,
      }

      const response = await axios.post(`${API_BASE}/api/analyze-truss`, payload)
      if (!response.data) throw new Error('No data from truss solver.')

      setTrussAnalysisResult(response.data)
    } catch (err) {
      console.error(err)
      setErrorMessage(err?.response?.data?.detail || err.message || 'Truss analysis failed.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ============================================================
  // FRAME — statics reactions only
  // ============================================================
  const [fNodes, setFNodes] = useState([])
  const [fElements, setFElements] = useState([])
  const [fSelectedNodeId, setFSelectedNodeId] = useState(null)
  const [fSelectedElementId, setFSelectedElementId] = useState(null)
  const [fSupports, setFSupports] = useState({})
  const [fLoads, setFLoads] = useState({})
  const [fDistLoads, setFDistLoads] = useState({})
  const [fPointLoadsOnElement, setFPointLoadsOnElement] = useState({})
  const [fForceUnit, setFForceUnit] = useState('kN')
  const [fGridScale, setFGridScale] = useState(1)
  const [frameLocalData, setFrameLocalData] = useState({ steps: [], rxns: {}, analyzed: false })
  const [frameHistory, setFrameHistory] = useState([])

  const saveFrameState = () => {
    setFrameHistory(prev => [...prev, {
      nodes: deepClone(fNodes),
      elements: deepClone(fElements),
      supports: deepClone(fSupports),
      loads: deepClone(fLoads),
      dist: deepClone(fDistLoads),
      point: deepClone(fPointLoadsOnElement),
    }].slice(-30))
  }

  const handleUndoFrame = () => {
    setFrameHistory(prev => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      setFNodes(last.nodes)
      setFElements(last.elements)
      setFSupports(last.supports)
      setFLoads(last.loads)
      setFDistLoads(last.dist)
      setFPointLoadsOnElement(last.point)
      return prev.slice(0, -1)
    })
    setFrameLocalData({ steps: [], rxns: {}, analyzed: false })
  }

  const handleFrameNodeClick = (e, node) => {
    e.stopPropagation()
    setFSelectedElementId(null)
    if (fSelectedNodeId === node.id) {
      setFSelectedNodeId(null)
      return
    }
    if (fSelectedNodeId) {
      const duplicate = fElements.some(el =>
        (el.n1 === fSelectedNodeId && el.n2 === node.id) ||
        (el.n1 === node.id && el.n2 === fSelectedNodeId)
      )
      if (!duplicate) {
        saveFrameState()
        setFElements(prev => [...prev, { id: Date.now(), n1: fSelectedNodeId, n2: node.id }])
      }
    }
    setFSelectedNodeId(node.id)
  }

  const handleFrameElementClick = (e, el) => {
    e.stopPropagation()
    setFSelectedNodeId(null)
    setFSelectedElementId(prev => prev === el.id ? null : el.id)
  }

  const handleFrameCanvasClick = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rawX = e.clientX - rect.left
    const rawY = e.clientY - rect.top
    const existing = fNodes.find(n => Math.hypot(n.x - rawX, n.y - rawY) < 20)
    if (existing) {
      handleFrameNodeClick(e, existing)
      return
    }

    const x = Math.round(rawX / PIXELS_PER_GRID) * PIXELS_PER_GRID
    const y = Math.round(rawY / PIXELS_PER_GRID) * PIXELS_PER_GRID
    if (x < 25 || x > 1375 || y < 25 || y > 575) return

    saveFrameState()
    const id = Date.now()
    const name = fNodes.length < 26 ? String.fromCharCode(65 + fNodes.length) : `N${fNodes.length}`
    setFNodes(prev => [...prev, { id, name, x, y }])
    if (fSelectedNodeId) {
      setFElements(prev => [...prev, { id: Date.now() + 1, n1: fSelectedNodeId, n2: id }])
    }
    setFSelectedNodeId(id)
  }

  const handleFSupportTypeChange = (nodeId, type) => {
    saveFrameState()
    setFSupports(prev => {
      const next = { ...prev }
      if (type === 'none' || type === 'free') delete next[nodeId]
      else next[nodeId] = { ...(next[nodeId] || {}), type, direction: next[nodeId]?.direction || 'horizontal' }
      return next
    })
  }

  const handleFLoadChange = (nodeId, axis, value) => {
    saveFrameState()
    setFLoads(prev => {
      const next = deepClone(prev)
      if (value === '') {
        if (next[nodeId]) {
          delete next[nodeId][axis]
          if (!Object.keys(next[nodeId]).length) delete next[nodeId]
        }
      } else {
        next[nodeId] = { ...(next[nodeId] || {}), [axis]: Number(value) }
      }
      return next
    })
  }

  const handleFDistLoadChange = (elId, axis, value) => {
    saveFrameState()
    setFDistLoads(prev => {
      const next = deepClone(prev)
      if (value === '') {
        if (next[elId]) {
          delete next[elId][axis]
          if (!Object.keys(next[elId]).length) delete next[elId]
        }
      } else {
        next[elId] = { ...(next[elId] || {}), [axis]: Number(value) }
      }
      return next
    })
  }

  const handleElementPointLoadChange = (elId, field, value) => {
    saveFrameState()
    setFPointLoadsOnElement(prev => {
      const next = deepClone(prev)
      if (value === '') {
        if (next[elId]) {
          delete next[elId][field]
          if (!Object.keys(next[elId]).length) delete next[elId]
        }
      } else {
        next[elId] = { ...(next[elId] || {}), [field]: Number(value) }
      }
      return next
    })
  }

  const clearFrameCanvas = () => {
    saveFrameState()
    setFNodes([])
    setFElements([])
    setFSupports({})
    setFLoads({})
    setFDistLoads({})
    setFPointLoadsOnElement({})
    setFSelectedNodeId(null)
    setFSelectedElementId(null)
    setFrameLocalData({ steps: [], rxns: {}, analyzed: false })
  }

  const loadFramePreset = () => {
    saveFrameState()
    setFNodes([
      { id: 1, name: 'A', x: 200, y: 350 },
      { id: 2, name: 'B', x: 200, y: 200 },
      { id: 3, name: 'C', x: 350, y: 200 },
      { id: 4, name: 'D', x: 350, y: 350 },
    ])
    setFElements([
      { id: 11, n1: 1, n2: 2 },
      { id: 12, n1: 2, n2: 3 },
      { id: 13, n1: 3, n2: 4 },
    ])
    setFSupports({
      1: { type: 'pin', direction: 'horizontal' },
      4: { type: 'roller', direction: 'horizontal' },
    })
    setFDistLoads({ 12: { wy: 3 } })
    setFrameLocalData({ steps: [], rxns: {}, analyzed: false })
  }

  const framePointLocation = (el, p) => {
    const a = fNodes.find(n => n.id === el.n1)
    const b = fNodes.find(n => n.id === el.n2)
    if (!a || !b) return null
    const Lpx = Math.hypot(b.x - a.x, b.y - a.y)
    const Lm = Lpx / PIXELS_PER_GRID * fGridScale
    const ratio = Lm > EPS ? clamp(Number(p.x || 0) / Lm, 0, 1) : 0
    return {
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
      Lm,
    }
  }

  const calculateFrameReactions = () => {
    const rows = []
    Object.entries(fSupports).forEach(([id, s]) => {
      const node = fNodes.find(n => String(n.id) === String(id))
      if (!node) return

      if (s.type === 'pin') {
        rows.push({ nodeId: node.id, component: 'fx', ux: 1, uy: 0, mz: 0, x: (node.x / PIXELS_PER_GRID) * fGridScale, y: -(node.y / PIXELS_PER_GRID) * fGridScale })
        rows.push({ nodeId: node.id, component: 'fy', ux: 0, uy: 1, mz: 0, x: (node.x / PIXELS_PER_GRID) * fGridScale, y: -(node.y / PIXELS_PER_GRID) * fGridScale })
      } else if (s.type === 'roller') {
        // UI "horizontal" roller rests on a horizontal surface -> vertical reaction.
        const vertical = (s.direction || 'horizontal') === 'horizontal'
        rows.push({
          nodeId: node.id,
          component: vertical ? 'fy' : 'fx',
          ux: vertical ? 0 : 1,
          uy: vertical ? 1 : 0,
          mz: 0,
          x: (node.x / PIXELS_PER_GRID) * fGridScale,
          y: -(node.y / PIXELS_PER_GRID) * fGridScale,
        })
      } else if (s.type === 'fixed') {
        rows.push({ nodeId: node.id, component: 'fx', ux: 1, uy: 0, mz: 0, x: (node.x / PIXELS_PER_GRID) * fGridScale, y: -(node.y / PIXELS_PER_GRID) * fGridScale })
        rows.push({ nodeId: node.id, component: 'fy', ux: 0, uy: 1, mz: 0, x: (node.x / PIXELS_PER_GRID) * fGridScale, y: -(node.y / PIXELS_PER_GRID) * fGridScale })
        rows.push({ nodeId: node.id, component: 'mz', ux: 0, uy: 0, mz: 1, x: (node.x / PIXELS_PER_GRID) * fGridScale, y: -(node.y / PIXELS_PER_GRID) * fGridScale })
      }
    })

    if (rows.length !== 3) {
      return { error: 'This statics reaction solver requires exactly 3 independent reaction components. For a fixed support, use a single fixed support with no other reactions.' }
    }

    let totalFx = 0, totalFy = 0, totalM = 0
    const appliedLoads = []

    Object.entries(fLoads).forEach(([id, f]) => {
      const node = fNodes.find(n => String(n.id) === String(id))
      if (!node) return
      const fx = forceToKN(f.fx || 0, fForceUnit)
      const fy = forceToKN(f.fy || 0, fForceUnit)
      const mz = momentToKNm(f.mz || 0, 'kN·m')
      const x = (node.x / PIXELS_PER_GRID) * fGridScale
      const y = -(node.y / PIXELS_PER_GRID) * fGridScale
      totalFx += fx
      totalFy += fy
      totalM += x * fy - y * fx + mz
      appliedLoads.push({ fx, fy, mz })
    })

    Object.entries(fDistLoads).forEach(([elId, d]) => {
      const el = fElements.find(e => String(e.id) === String(elId))
      if (!el) return
      const a = fNodes.find(n => n.id === el.n1)
      const b = fNodes.find(n => n.id === el.n2)
      if (!a || !b) return

      const dx = b.x - a.x
      const dy = b.y - a.y
      const Lpx = Math.hypot(dx, dy)
      const Lm = Lpx / PIXELS_PER_GRID * fGridScale
      if (Lm < EPS) return

      const wx = forceToKN(d.wx || 0, fForceUnit)
      const wy = forceToKN(d.wy || 0, fForceUnit)
      const Fx = wx * Lm
      const Fy = wy * Lm
      const cx = ((a.x + b.x) / 2 / PIXELS_PER_GRID) * fGridScale
      const cy = -((a.y + b.y) / 2 / PIXELS_PER_GRID) * fGridScale

      totalFx += Fx
      totalFy += Fy
      totalM += cx * Fy - cy * Fx
      appliedLoads.push({ fx: Fx, fy: Fy, mz: 0 })
    })

    Object.entries(fPointLoadsOnElement).forEach(([elId, p]) => {
      const el = fElements.find(e => String(e.id) === String(elId))
      if (!el) return
      const loc = framePointLocation(el, p)
      if (!loc) return
      const x = (loc.x / PIXELS_PER_GRID) * fGridScale
      const y = -(loc.y / PIXELS_PER_GRID) * fGridScale
      const fx = forceToKN(p.px || 0, fForceUnit)
      const fy = forceToKN(p.py || 0, fForceUnit)

      totalFx += fx
      totalFy += fy
      totalM += x * fy - y * fx
      appliedLoads.push({ fx, fy, mz: 0 })
    })

    const A = rows.map(r => [
      r.ux,
      r.uy,
      r.x * r.uy - r.y * r.ux + r.mz,
    ])
    const sol = solveLinear3(A, [-totalFx, -totalFy, -totalM])
    if (!sol) return { error: 'Support geometry is singular; no unique reaction solution exists.' }

    const rxns = {}
    rows.forEach((r, i) => {
      if (!rxns[r.nodeId]) rxns[r.nodeId] = { fx: 0, fy: 0, mz: 0 }
      rxns[r.nodeId][r.component] = r.component === 'mz'
        ? knmToMoment(sol[i], 'kN·m')
        : knToForce(sol[i], fForceUnit)
    })

    const reactionForces = Object.values(rxns).map(r => ({
      fx: forceToKN(r.fx, fForceUnit),
      fy: forceToKN(r.fy, fForceUnit),
      mz: momentToKNm(r.mz, 'kN·m'),
    }))
    const residual = equilibriumResidual(appliedLoads, reactionForces)
    return { rxns, residual }
  }

  const runFrameStaticsAnalysis = () => {
    setErrorMessage('')
    setIsAnalyzing(true)
    try {
      const result = calculateFrameReactions()
      if (result.error) {
        setFrameLocalData({
          steps: [`⚠ ${result.error}`],
          rxns: {},
          analyzed: true,
        })
        setErrorMessage(result.error)
        return
      }

      const steps = [
        '=== ENGINEERING STATICS : FRAME REACTIONS ===',
        'Sign convention: +Fx right, +Fy up, +Mz CCW.',
        `ΣFx residual = ${formatNumber(knToForce(result.residual.fx, fForceUnit), 5)} ${fForceUnit}`,
        `ΣFy residual = ${formatNumber(knToForce(result.residual.fy, fForceUnit), 5)} ${fForceUnit}`,
        `ΣM residual = ${formatNumber(result.residual.mz, 5)} kN·m`,
        'Reactions were solved using the global equilibrium equations ΣFx = 0, ΣFy = 0, ΣM = 0.',
      ]

      setFrameLocalData({
        steps,
        rxns: result.rxns,
        analyzed: true,
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const fSelectedNode = fNodes.find(n => n.id === fSelectedNodeId)
  const fSelectedElement = fElements.find(e => e.id === fSelectedElementId)

  // ============================================================
  // GLOBAL
  // ============================================================
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Enter' || currentView !== 'statics') return
      if (activeTab === 'particle') analyzeParticle()
      else if (activeTab === 'vectors') analyzeVectors()
      else if (activeTab === 'beam') analyzeBeam()
      else if (activeTab === 'truss') runTrussAnalysis()
      else if (activeTab === 'frame') runFrameStaticsAnalysis()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const inputStyle = {
    backgroundColor: '#2A2A2A',
    color: '#E0E0E0',
    border: '1px solid #444',
    padding: '7px',
    borderRadius: '5px',
  }

  const buttonStyle = {
    padding: '9px 14px',
    borderRadius: '6px',
    border: '1px solid #555',
    backgroundColor: '#2A2A2A',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
  }

  const chartShear = getMaxMinObj(chartData, 'shear')
  const chartMoment = getMaxMinObj(chartData, 'moment')
  const maxAbsoluteShear = chartData.length ? Math.max(...chartData.map(d => Math.abs(d.shear || 0))) : 0
  const maxAbsoluteMoment = chartData.length ? Math.max(...chartData.map(d => Math.abs(d.moment || 0))) : 0

  const renderDimensions = (nodeList, scale) => {
    if (!nodeList || nodeList.length < 2) return null
    const xs = [...new Set(nodeList.map(n => n.x))].sort((a, b) => a - b)
    const y = Math.max(...nodeList.map(n => n.y)) + 45
    return (
      <g style={{ pointerEvents: 'none' }}>
        {xs.slice(0, -1).map((x, i) => {
          const next = xs[i + 1]
          const dist = (next - x) / PIXELS_PER_GRID * scale
          return (
            <g key={`${x}-${next}`}>
              <line x1={x} y1={y} x2={next} y2={y} stroke="#aaa" />
              <line x1={x} y1={y - 7} x2={x} y2={y + 7} stroke="#aaa" />
              <line x1={next} y1={y - 7} x2={next} y2={y + 7} stroke="#aaa" />
              <text x={(x + next) / 2} y={y + 18} fill="#ddd" fontSize="12" textAnchor="middle">
                {formatNumber(dist, 2)} m
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  const renderDistributedLoadArrows = (x1, y1, x2, y2, wx, wy, unit) => {
    const hasY = Number(wy) !== 0
    const hasX = Number(wx) !== 0
    if (!hasX && !hasY) return null
    const count = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 25))
    const arrows = []
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const ax = x1 + (x2 - x1) * t
      const ay = y1 + (y2 - y1) * t
      if (hasY) {
        const positiveUp = Number(wy) > 0
        arrows.push(
          <line
            key={`wy-${i}`}
            x1={ax}
            y1={positiveUp ? ay + 35 : ay - 35}
            x2={ax}
            y2={positiveUp ? ay + 5 : ay - 5}
            stroke={theme.supportOrange}
            strokeWidth="2.2"
            markerEnd="url(#arrowUDL)"
          />
        )
      }
    }
    return (
      <g style={{ pointerEvents: 'none' }}>
        {arrows}
        {hasY && (
          <text x={(x1 + x2) / 2} y={Math.min(y1, y2) - 42} fill="#fff" fontSize="12" textAnchor="middle">
            w = {Math.abs(wy)} {unit}/m
          </text>
        )}
      </g>
    )
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="app-bg" style={{ color: theme.textMain, fontFamily: '"Times New Roman", Times, serif' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <marker id="arrowPoint" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={theme.accent} />
          </marker>
          <marker id="arrowReaction" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={theme.supportOrange} />
          </marker>
          <marker id="arrowUDL" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={theme.supportOrange} />
          </marker>
        </defs>
      </svg>

      {isAnalyzing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(18,18,18,.9)',
          zIndex: 9999, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            width: 60, height: 60, border: '6px solid #333',
            borderTop: `6px solid ${theme.supportOrange}`,
            borderRadius: '50%', animation: 'spin 1s linear infinite'
          }} />
          <h2 style={{ letterSpacing: 4 }}>CHU CALC</h2>
          <p style={{ color: '#aaa' }}>Analyzing Engineering Statics...</p>
        </div>
      )}

      {errorMessage && (
        <div style={{
          maxWidth: 1300, margin: '0 auto 15px', padding: '12px 16px',
          background: '#2a1717', border: '1px solid #7f3333',
          borderRadius: 7, color: '#ffb4b4', fontWeight: 'bold'
        }}>
          ⚠ {errorMessage}
          <button
            onClick={() => setErrorMessage('')}
            style={{ ...buttonStyle, float: 'right', padding: '3px 8px' }}
          >
            ×
          </button>
        </div>
      )}

      {showFormulaModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
          zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            width: 'min(700px, 92vw)', maxHeight: '82vh', overflow: 'auto',
            background: theme.cardBg, border: '1px solid #444',
            borderRadius: 10, padding: 25
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2>Statics Formula Sheet</h2>
              <button onClick={() => setShowFormulaModal(false)} style={buttonStyle}>×</button>
            </div>
            <hr style={{ borderColor: '#333' }} />
            <h3>2D Equilibrium</h3>
            <p>ΣFx = 0</p>
            <p>ΣFy = 0</p>
            <p>ΣMz = 0</p>
            <h3>Force Components</h3>
            <p>Fx = F cos θ</p>
            <p>Fy = F sin θ</p>
            <h3>Particle with Two Cables</h3>
            <p>T₁ = W cos θ₂ / sin(θ₁ + θ₂)</p>
            <p>T₂ = W cos θ₁ / sin(θ₁ + θ₂)</p>
            <h3>Important</h3>
            <p>All calculations use a consistent sign convention and SI-derived force units internally.</p>
          </div>
        </div>
      )}

      <style>{`
        #root { max-width:100% !important; margin:0 !important; padding:0 !important; width:100% !important; text-align:left !important; }
        body { margin:0; background:${theme.bg}; color:${theme.textMain}; overflow-x:hidden; }
        .app-bg { min-height:100vh; padding:20px 25px; box-sizing:border-box; background:${theme.bg}; }
        .report-document { width:100%; background:${theme.cardBg}; padding:30px; box-sizing:border-box; box-shadow:0 4px 20px rgba(0,0,0,.25); border:1px solid #333; border-radius:8px; }
        select, input { background:#2A2A2A !important; color:#E0E0E0 !important; border:1px solid #444 !important; }
        button:disabled { opacity:.45; cursor:not-allowed !important; }
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @media print {
          .app-bg { padding:0; background:#fff; color:#111; }
          .report-document { box-shadow:none; border:none; background:#fff; }
          button, select, input { display:none !important; }
        }
      `}</style>

      {currentView === 'home' ? (
        <div style={{ width: '100%', maxWidth: 1300, margin: '50px auto', textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', background: 'rgba(0,191,255,.1)', color: theme.accent,
            padding: '7px 16px', borderRadius: 20, border: '1px solid rgba(0,191,255,.3)',
            fontWeight: 'bold', marginBottom: 20
          }}>
            ⚡ Interactive Engineering Calculation Platform
          </div>
          <h1 style={{ fontSize: '3.2rem', margin: 0 }}>CHU CALC</h1>
          <p style={{ color: '#aaa', fontSize: '1.2rem', marginBottom: 40 }}>
            Engineering Mechanics & Structural Statics
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
            {[
              ['Engineering Statics', 'Particle equilibrium, force vectors, beams, trusses and frame reactions.', 'statics'],
              ['Mechanics of Materials', 'Stress, strain, bending and torsion analysis.', null],
              ['Theory of Structures', 'Indeterminate structures, influence lines and energy methods.', null],
              ['Structural Analysis', 'Matrix methods, stiffness method and finite-element models.', null],
            ].map(([title, desc, view]) => (
              <div
                key={title}
                onClick={() => view ? setCurrentView(view) : null}
                style={{
                  background: view ? '#1E1E1E' : '#181818',
                  border: `1px solid ${view ? '#333' : '#292929'}`,
                  borderRadius: 12, padding: 28, textAlign: 'left',
                  cursor: view ? 'pointer' : 'default', opacity: view ? 1 : .55
                }}
              >
                <h3 style={{ color: view ? theme.accent : '#888' }}>{title}</h3>
                <p style={{ color: '#aaa', lineHeight: 1.5 }}>{desc}</p>
                {!view && <small style={{ color: '#666' }}>Coming soon</small>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 20, gap: 10, flexWrap: 'wrap'
          }}>
            <button style={buttonStyle} onClick={() => setCurrentView('home')}>◀ Main Menu</button>
            <h2 style={{ margin: 0, letterSpacing: 2 }}>Engineering Mechanics — Statics</h2>
            <button style={buttonStyle} onClick={() => setShowFormulaModal(true)}>📖 Formulas</button>
          </div>

          <div style={{
            display: 'flex', gap: 10, justifyContent: 'center',
            flexWrap: 'wrap', marginBottom: 20
          }}>
            {[
              ['particle', 'Particle Equilibrium'],
              ['vectors', 'Force Vectors'],
              ['beam', 'Beam Analysis'],
              ['truss', 'Truss Analysis'],
              ['frame', 'Frame Reactions'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id); setErrorMessage('') }}
                style={{
                  ...buttonStyle,
                  background: activeTab === id ? '#333' : '#1E1E1E',
                  padding: '11px 18px'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ================= PARTICLE ================= */}
          {activeTab === 'particle' && (
            <div className="report-document">
              <h1>Equilibrium of a Particle</h1>
              <p style={{ color: '#888' }}>Two-cable equilibrium with an interactive joint position.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 20 }}>
                <div style={{ background: '#151515', padding: 15, borderRadius: 8 }}>
                  <h3 style={{ color: theme.accent }}>Problem Diagram</h3>
                  <svg width="100%" height="320" viewBox="0 0 600 350" onClick={handleParticleCanvasClick} style={{ cursor: 'crosshair' }}>
                    <defs>
                      <pattern id="particleGrid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M50 0 L0 0 0 50" fill="none" stroke="#2a2a2a" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#particleGrid)" />
                    <rect x="50" y="70" width="15" height="120" fill="#8a674e" />
                    <rect x="535" y="70" width="15" height="120" fill="#8a674e" />
                    <polygon points="65,100 50,90 50,110" fill={theme.supportOrange} />
                    <polygon points="535,100 550,90 550,110" fill={theme.supportOrange} />
                    <line x1="65" y1="100" x2={jointPos.x} y2={jointPos.y} stroke={theme.accent} strokeWidth="4" />
                    <line x1="535" y1="100" x2={jointPos.x} y2={jointPos.y} stroke={theme.accent} strokeWidth="4" />
                    <line x1={jointPos.x} y1={jointPos.y} x2={jointPos.x} y2={jointPos.y + 70} stroke={theme.accent} strokeWidth="4" />
                    <circle cx={jointPos.x} cy={jointPos.y} r="7" fill="#fff" />
                    <text x={jointPos.x + 10} y={jointPos.y - 15} fill={theme.accent}>Joint</text>
                    <text x={jointPos.x - 75} y={jointPos.y - 20} fill={theme.supportOrange}>θ₁={pAngle1}°</text>
                    <text x={jointPos.x + 25} y={jointPos.y - 20} fill={theme.supportOrange}>θ₂={pAngle2}°</text>
                    <text x={jointPos.x - 25} y={jointPos.y + 100} fill={theme.supportOrange}>W={pWeight} {pUnit}</text>
                  </svg>
                </div>

                <div style={{ background: '#151515', padding: 15, borderRadius: 8 }}>
                  <h3 style={{ color: theme.supportOrange }}>Free-Body Diagram</h3>
                  <svg width="100%" height="320" viewBox="0 0 600 350">
                    <line x1="300" y1="30" x2="300" y2="320" stroke="#555" strokeDasharray="4 4" />
                    <line x1="60" y1="180" x2="540" y2="180" stroke="#555" strokeDasharray="4 4" />
                    <circle cx="300" cy="180" r="5" fill="#fff" />
                    <line x1="300" y1="180" x2="180" y2="90" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                    <line x1="300" y1="180" x2="420" y2="90" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                    <line x1="300" y1="180" x2="300" y2="275" stroke={theme.supportOrange} strokeWidth="3" markerEnd="url(#arrowReaction)" />
                    <text x="185" y="110" fill={theme.accent}>T₁</text>
                    <text x="420" y="110" fill={theme.accent}>T₂</text>
                    <text x="315" y="240" fill={theme.supportOrange}>W</text>
                    <text x="515" y="170" fill="#aaa">+x</text>
                    <text x="310" y="45" fill="#aaa">+y</text>
                  </svg>
                </div>
              </div>

              <div style={{ marginTop: 20, padding: 20, background: '#1A1A1A', borderRadius: 8 }}>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'end' }}>
                  <label>W
                    <input type="number" value={pWeight} onChange={e => setPWeight(e.target.value)} style={{ ...inputStyle, display: 'block' }} />
                  </label>
                  <label>θ₁ (deg)
                    <input type="number" min="0" max="180" value={pAngle1} onChange={e => setPAngle1(e.target.value)} style={{ ...inputStyle, display: 'block' }} />
                  </label>
                  <label>θ₂ (deg)
                    <input type="number" min="0" max="180" value={pAngle2} onChange={e => setPAngle2(e.target.value)} style={{ ...inputStyle, display: 'block' }} />
                  </label>
                  <label>Force unit
                    <select value={pUnit} onChange={e => setPUnit(e.target.value)} style={{ ...inputStyle, display: 'block' }}>
                      <option>N</option><option>kN</option><option>lb</option>
                    </select>
                  </label>
                  <button style={buttonStyle} onClick={analyzeParticle}>Calculate Equilibrium</button>
                </div>
              </div>

              {particleResult && (
                <div style={{ marginTop: 20, padding: 20, borderLeft: `5px solid ${theme.accent}`, background: '#1A1A1A' }}>
                  <h3>Solution</h3>
                  <pre style={{ whiteSpace: 'pre-wrap', color: '#ccc' }}>{particleResult.steps.join('\n')}</pre>
                  <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', fontSize: '1.1rem' }}>
                    <b>T₁ = {formatNumber(particleResult.T1)} {pUnit}</b>
                    <b>T₂ = {formatNumber(particleResult.T2)} {pUnit}</b>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= VECTORS ================= */}
          {activeTab === 'vectors' && (
            <div className="report-document">
              <h1>2D Force Vector Analysis</h1>
              <div style={{ marginBottom: 15 }}>
                <label>Unit&nbsp;
                  <select value={vectorUnit} onChange={e => { setVectorUnit(e.target.value); setVectorResult(null) }} style={inputStyle}>
                    <option>N</option><option>kN</option><option>lb</option><option>kip</option>
                  </select>
                </label>
              </div>

              <div style={{ background: '#151515', borderRadius: 8, overflow: 'hidden' }}>
                <svg width="100%" height="420" viewBox="0 0 1000 600">
                  <line x1="500" y1="0" x2="500" y2="600" stroke="#555" strokeDasharray="5 5" />
                  <line x1="0" y1="300" x2="1000" y2="300" stroke="#555" strokeDasharray="5 5" />
                  <circle cx="500" cy="300" r="5" fill="#fff" />
                  {vectorLoads.map((v, i) => {
                    const c = getVectorComponents(v)
                    if (!c) return null
                    const vmax = vectorResult
                      ? Math.max(1, ...vectorLoads.map(x => Math.abs(Number(x.magnitude) || 0)), Math.abs(vectorResult.rMag))
                      : Math.max(1, ...vectorLoads.map(x => Math.abs(Number(x.magnitude) || 0)))
                    const sf = 210 / vmax
                    const x2 = 500 + Number(v.magnitude) * Math.cos(c.drawRad) * sf
                    const y2 = 300 - Number(v.magnitude) * Math.sin(c.drawRad) * sf
                    return (
                      <g key={v.id}>
                        {v.direction === 'out'
                          ? <line x1="500" y1="300" x2={x2} y2={y2} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                          : <line x1={x2} y1={y2} x2="500" y2="300" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />}
                        <text x={x2 + 10} y={y2 - 8} fill={theme.accent} fontWeight="bold">F{i + 1}</text>
                      </g>
                    )
                  })}
                  {vectorResult?.rMag > 1e-8 && (
                    <line
                      x1="500" y1="300"
                      x2={500 + vectorResult.rMag * Math.cos(vectorResult.rAng * Math.PI / 180) * (210 / Math.max(1, ...vectorLoads.map(v => Math.abs(Number(v.magnitude) || 0))))}
                      y2={300 - vectorResult.rMag * Math.sin(vectorResult.rAng * Math.PI / 180) * (210 / Math.max(1, ...vectorLoads.map(v => Math.abs(Number(v.magnitude) || 0))))}
                      stroke={theme.supportOrange} strokeWidth="5" markerEnd="url(#arrowReaction)"
                    />
                  )}
                </svg>
              </div>

              <div style={{ marginTop: 20, background: '#1A1A1A', padding: 15, borderRadius: 8 }}>
                <button
                  style={{ ...buttonStyle, marginBottom: 15 }}
                  onClick={() => setVectorLoads(prev => [...prev, {
                    id: Date.now(), magnitude: 50, angle: 0,
                    quadrant: 1, refAxis: 'x', direction: 'out'
                  }])}
                >
                  + Add Force
                </button>

                {vectorLoads.map((v, i) => (
                  <div key={v.id} style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px dashed #333'
                  }}>
                    <b>F{i + 1}</b>
                    <label>Mag <input type="number" value={v.magnitude} onChange={e => updateVectorLoad(v.id, 'magnitude', e.target.value)} style={{ ...inputStyle, width: 70 }} /></label>
                    <label>θ <input type="number" min="0" max="90" value={v.angle} onChange={e => updateVectorLoad(v.id, 'angle', e.target.value)} style={{ ...inputStyle, width: 60 }} /></label>
                    <select value={v.quadrant} onChange={e => updateVectorLoad(v.id, 'quadrant', Number(e.target.value))} style={inputStyle}>
                      <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
                    </select>
                    <select value={v.refAxis} onChange={e => updateVectorLoad(v.id, 'refAxis', e.target.value)} style={inputStyle}>
                      <option value="x">from X</option><option value="y">from Y</option>
                    </select>
                    <select value={v.direction} onChange={e => updateVectorLoad(v.id, 'direction', e.target.value)} style={inputStyle}>
                      <option value="out">Out</option><option value="in">In</option>
                    </select>
                    <button style={buttonStyle} onClick={() => setVectorLoads(prev => prev.filter(x => x.id !== v.id))}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <button style={buttonStyle} onClick={analyzeVectors} disabled={!vectorLoads.length}>Resolve Force Vectors</button>
              </div>

              {vectorResult && (
                <div style={{ marginTop: 20, padding: 15, borderLeft: `5px solid ${theme.accent}`, background: '#1A1A1A' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={{ textAlign: 'left' }}>Force</th><th>Fx</th><th>Fy</th></tr></thead>
                    <tbody>
                      {vectorResult.steps.map(s => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(s.fx)} {vectorUnit}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(s.fy)} {vectorUnit}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #555' }}>
                        <td><b>Σ</b></td>
                        <td style={{ textAlign: 'right' }}><b>{formatNumber(vectorResult.sumFx)} {vectorUnit}</b></td>
                        <td style={{ textAlign: 'right' }}><b>{formatNumber(vectorResult.sumFy)} {vectorUnit}</b></td>
                      </tr>
                    </tbody>
                  </table>
                  <p><b>|R| = {formatNumber(vectorResult.rMag)} {vectorUnit}</b></p>
                  <p><b>Direction = {formatNumber(vectorResult.rAng)}° ({vectorResult.dirSymbol})</b></p>
                </div>
              )}
            </div>
          )}

          {/* ================= BEAM ================= */}
          {activeTab === 'beam' && (
            <div className="report-document">
              <h1>Beam Analysis</h1>
              <p style={{ color: '#888' }}>Reactions, SFD and BMD are obtained from the configured beam solver.</p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 15 }}>
                <button style={buttonStyle} onClick={() => loadBeamPreset('simply-supported')}>Simply Supported</button>
                <button style={buttonStyle} onClick={() => loadBeamPreset('overhanging')}>Overhanging</button>
                <button style={buttonStyle} onClick={() => loadBeamPreset('cantilever')}>Cantilever</button>
                <button style={buttonStyle} onClick={handleUndoBeam} disabled={!beamHistory.length}>Undo</button>
              </div>

              <div style={{ background: '#151515', padding: 15, borderRadius: 8 }}>
                <svg viewBox="0 0 1000 190" style={{ width: '100%' }}>
                  <rect x="50" y="80" width="900" height="15" fill="#444" />
                  {beamSupports.map(s => {
                    const x = getSvgX(s.x)
                    return (
                      <g key={s.id}>
                        <text x={x} y="60" fill="#fff" textAnchor="middle" fontWeight="bold">{getBeamNodeLabel(s.id)}</text>
                        <RenderSupportSVG cx={x} cy={95} type={s.type} dir={s.direction} />
                        <text x={x} y="135" fill="#aaa" textAnchor="middle" fontSize="12">x={s.x} m</text>
                      </g>
                    )
                  })}
                  {beamLoads.map(l => {
                    if (l.type === 'point') {
                      const x = getSvgX(l.x)
                      return <g key={l.id}>
                        <line x1={x} y1="20" x2={x} y2="75" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                        <text x={x} y="16" fill={theme.accent} textAnchor="middle" fontSize="12">P={l.magnitude} {forceUnit}</text>
                      </g>
                    }
                    if (l.type === 'moment') {
                      const x = getSvgX(l.x)
                      return <g key={l.id}>
                        <circle cx={x} cy="50" r="18" fill="none" stroke={theme.accent} strokeWidth="3" />
                        <text x={x} y="20" fill={theme.accent} textAnchor="middle" fontSize="12">M={l.magnitude} kN·m</text>
                      </g>
                    }
                    return <g key={l.id}>{renderDistributedLoadArrows(getSvgX(l.start_x), 80, getSvgX(l.end_x), 80, 0, l.magnitude, forceUnit)}</g>
                  })}
                  <text x="500" y="170" fill="#aaa" textAnchor="middle">L = {safeBeamLength} m</text>
                </svg>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 15, marginTop: 20 }}>
                <div style={{ background: '#1A1A1A', padding: 15, borderRadius: 8 }}>
                  <h3>Beam & Supports</h3>
                  <label>Length (m)
                    <input type="number" min="0.01" value={beamLength} onChange={e => setBeamLength(e.target.value)} style={{ ...inputStyle, display: 'block' }} />
                  </label>
                  <div style={{ marginTop: 12 }}>
                    {beamSupports.map(s => (
                      <div key={s.id} style={{ display: 'flex', gap: 5, marginBottom: 7, flexWrap: 'wrap' }}>
                        <select value={s.type} onChange={e => updateBeamSupport(s.id, 'type', e.target.value)} style={inputStyle}>
                          <option value="pin">Pin</option><option value="roller">Roller</option><option value="fixed">Fixed</option>
                        </select>
                        <input type="number" value={s.x} onChange={e => updateBeamSupport(s.id, 'x', e.target.value)} style={{ ...inputStyle, width: 65 }} />
                        <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamSupports(prev => prev.filter(x => x.id !== s.id)) }}>✕</button>
                      </div>
                    ))}
                    <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamSupports(prev => [...prev, { id: Date.now(), type: 'roller', x: safeBeamLength / 2, direction: 'horizontal' }]) }}>+ Support</button>
                  </div>
                </div>

                <div style={{ background: '#1A1A1A', padding: 15, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <h3>Loads</h3>
                    <select value={forceUnit} onChange={e => setForceUnit(e.target.value)} style={inputStyle}>
                      <option>N</option><option>kN</option><option>lb</option><option>kip</option>
                    </select>
                  </div>
                  {beamLoads.map(l => (
                    <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px dashed #333' }}>
                      {l.type === 'point' && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <b>Point</b>
                          <input type="number" value={l.magnitude} onChange={e => updateBeamLoad(l.id, 'magnitude', e.target.value)} style={{ ...inputStyle, width: 65 }} />
                          <input type="number" value={l.x} onChange={e => updateBeamLoad(l.id, 'x', e.target.value)} style={{ ...inputStyle, width: 65 }} />
                          <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamLoads(prev => prev.filter(x => x.id !== l.id)) }}>✕</button>
                        </div>
                      )}
                      {l.type === 'moment' && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <b>Moment</b>
                          <input type="number" value={l.magnitude} onChange={e => updateBeamLoad(l.id, 'magnitude', e.target.value)} style={{ ...inputStyle, width: 65 }} />
                          <select value={l.direction} onChange={e => updateBeamLoad(l.id, 'direction', e.target.value)} style={inputStyle}>
                            <option value="cw">CW</option><option value="ccw">CCW</option>
                          </select>
                          <input type="number" value={l.x} onChange={e => updateBeamLoad(l.id, 'x', e.target.value)} style={{ ...inputStyle, width: 65 }} />
                          <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamLoads(prev => prev.filter(x => x.id !== l.id)) }}>✕</button>
                        </div>
                      )}
                      {l.type === 'distributed' && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <b>UDL</b>
                          <input type="number" value={l.magnitude} onChange={e => updateBeamLoad(l.id, 'magnitude', e.target.value)} style={{ ...inputStyle, width: 60 }} />
                          <input type="number" value={l.start_x} onChange={e => updateBeamLoad(l.id, 'start_x', e.target.value)} style={{ ...inputStyle, width: 60 }} />
                          <input type="number" value={l.end_x} onChange={e => updateBeamLoad(l.id, 'end_x', e.target.value)} style={{ ...inputStyle, width: 60 }} />
                          <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamLoads(prev => prev.filter(x => x.id !== l.id)) }}>✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ marginTop: 10 }}>
                    <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamLoads(prev => [...prev, { id: Date.now(), type: 'point', magnitude: 5, x: safeBeamLength / 2 }]) }}>+ Point</button>{' '}
                    <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamLoads(prev => [...prev, { id: Date.now(), type: 'distributed', magnitude: 2, start_x: 0, end_x: safeBeamLength / 2 }]) }}>+ UDL</button>{' '}
                    <button style={buttonStyle} onClick={() => { saveBeamState(); setBeamLoads(prev => [...prev, { id: Date.now(), type: 'moment', magnitude: 10, x: safeBeamLength / 2, direction: 'cw' }]) }}>+ Moment</button>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'center', margin: 20 }}>
                <button style={{ ...buttonStyle, padding: '13px 25px' }} onClick={analyzeBeam}>Analyze Beam</button>
              </div>

              {beamReactions.length > 0 && (
                <div style={{ padding: 15, background: '#1A1A1A', borderLeft: `5px solid ${theme.supportOrange}` }}>
                  <h3>Support Reactions</h3>
                  {beamReactions.map((r, i) => (
                    <span key={i} style={{ marginRight: 25 }}>
                      R @ x={r.support_x}: <b>{formatNumber(r.forceDisplay)} {forceUnit}</b>
                    </span>
                  ))}
                </div>
              )}

              {chartData.length > 0 && (
                <div style={{ marginTop: 20, display: 'grid', gap: 15 }}>
                  <div style={{ padding: 15, background: '#1A1A1A' }}>
                    <b>Maximum |V| = {formatNumber(maxAbsoluteShear)} kN</b>
                    <div style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                          <XAxis dataKey="x" type="number" domain={[0, safeBeamLength]} ticks={optimizedTicks} />
                          <YAxis tickFormatter={formatYAxis} />
                          <Tooltip />
                          <Area type="stepAfter" dataKey="shear" stroke={theme.accent} fill="#252525" fillOpacity=".8" />
                          {chartShear.max && <ReferenceDot x={chartShear.max.x} y={chartShear.max.shear} r={4} label={`Max ${formatNumber(chartShear.max.shear)}`} />}
                          {chartShear.min && <ReferenceDot x={chartShear.min.x} y={chartShear.min.shear} r={4} label={`Min ${formatNumber(chartShear.min.shear)}`} />}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div style={{ padding: 15, background: '#1A1A1A' }}>
                    <b>Maximum |M| = {formatNumber(maxAbsoluteMoment)} kN·m</b>
                    <div style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                          <XAxis dataKey="x" type="number" domain={[0, safeBeamLength]} ticks={optimizedTicks} />
                          <YAxis tickFormatter={formatYAxis} />
                          <Tooltip />
                          <Area type="linear" dataKey="moment" stroke={theme.supportOrange} fill="#252525" fillOpacity=".8" />
                          {chartMoment.max && <ReferenceDot x={chartMoment.max.x} y={chartMoment.max.moment} r={4} label={`Max ${formatNumber(chartMoment.max.moment)}`} />}
                          {chartMoment.min && <ReferenceDot x={chartMoment.min.x} y={chartMoment.min.moment} r={4} label={`Min ${formatNumber(chartMoment.min.moment)}`} />}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#151515', padding: 15 }}>{beamSteps.join('\n')}</pre>
                </div>
              )}
            </div>
          )}

          {/* ================= TRUSS ================= */}
          {activeTab === 'truss' && (
            <div className="report-document">
              <h1>Truss Analysis</h1>
              <p style={{ color: '#888' }}>
                Build a planar truss, define supports and nodal loads, then solve reactions and member forces.
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button style={buttonStyle} onClick={loadTrussPreset}>Pratt Truss</button>
                <button style={buttonStyle} onClick={handleUndoTruss} disabled={!trussHistory.length}>Undo</button>
                <button style={buttonStyle} onClick={clearTrussCanvas}>Clear</button>
                <label style={{ marginLeft: 'auto' }}>Grid
                  <select value={gridScale} onChange={e => setGridScale(Number(e.target.value))} style={{ ...inputStyle, marginLeft: 5 }}>
                    {Array.from({ length: 30 }, (_, i) => (i + 1) / 10).map(v => <option key={v} value={v}>{v.toFixed(1)} m</option>)}
                  </select>
                </label>
                <label>Unit
                  <select value={trussUnit} onChange={e => setTrussUnit(e.target.value)} style={{ ...inputStyle, marginLeft: 5 }}>
                    <option>N</option><option>kN</option><option>lb</option><option>kip</option>
                  </select>
                </label>
              </div>

              <div style={{ overflow: 'auto', background: '#151515', borderRadius: 8 }}>
                <svg width="1400" height="600" onClick={handleTrussCanvasClick}>
                  <defs>
                    <pattern id="trussGrid" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse">
                      <path d={`M${PIXELS_PER_GRID} 0 L0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#2a2a2a" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#trussGrid)" />
                  {renderDimensions(nodes, gridScale)}
                  {elements.map(el => {
                    const a = nodes.find(n => n.id === el.n1), b = nodes.find(n => n.id === el.n2)
                    return a && b ? <line key={el.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth="4" /> : null
                  })}
                  {Object.entries(trussSupports).map(([id, s]) => {
                    const n = nodes.find(x => String(x.id) === id)
                    return n ? <RenderSupportSVG key={id} cx={n.x} cy={n.y} type={s.type} dir={s.direction} /> : null
                  })}
                  {Object.entries(trussLoads).map(([id, f]) => {
                    const n = nodes.find(x => String(x.id) === id)
                    if (!n) return null
                    return <g key={id}>
                      {Number(f.fy) !== 0 && <line x1={n.x} y1={Number(f.fy) > 0 ? n.y + 50 : n.y - 50} x2={n.x} y2={Number(f.fy) > 0 ? n.y + 10 : n.y - 10} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />}
                      {Number(f.fx) !== 0 && <line x1={Number(f.fx) > 0 ? n.x - 50 : n.x + 50} y1={n.y} x2={Number(f.fx) > 0 ? n.x - 10 : n.x + 10} y2={n.y} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />}
                    </g>
                  })}
                  {nodes.map(n => (
                    <g key={n.id}>
                      <circle cx={n.x} cy={n.y} r="30" fill="transparent" onClick={e => handleTrussNodeClick(e, n)} />
                      <circle cx={n.x} cy={n.y} r={selectedNodeId === n.id ? 9 : 6} fill={selectedNodeId === n.id ? theme.accent : '#222'} stroke="#fff" strokeWidth="2" pointerEvents="none" />
                      <text x={n.x + 10} y={n.y - 10} fill="#fff" pointerEvents="none">{n.name}</text>
                    </g>
                  ))}
                </svg>
              </div>

              <div style={{ marginTop: 15, padding: 15, background: '#1A1A1A', borderRadius: 8 }}>
                {selectedNodeId ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <b>Node {nodes.find(n => n.id === selectedNodeId)?.name}</b>
                    <select value={trussSupports[selectedNodeId]?.type || 'none'} onChange={e => handleSupportTypeChange(selectedNodeId, e.target.value)} style={inputStyle}>
                      <option value="none">None</option><option value="pin">Pin</option><option value="roller">Roller</option>
                    </select>
                    <select
                      value={trussSupports[selectedNodeId]?.direction || 'horizontal'}
                      onChange={e => {
                        saveTrussState()
                        setTrussSupports(prev => ({
                          ...prev,
                          [selectedNodeId]: { ...(prev[selectedNodeId] || {}), direction: e.target.value }
                        }))
                      }}
                      style={inputStyle}
                    >
                      <option value="horizontal">Horizontal surface</option>
                      <option value="vertical">Vertical surface</option>
                    </select>
                    <input placeholder={`Fx (${trussUnit})`} type="number" value={trussLoads[selectedNodeId]?.fx ?? ''} onChange={e => handleTrussLoadChange(selectedNodeId, 'fx', e.target.value)} style={{ ...inputStyle, width: 85 }} />
                    <input placeholder={`Fy (${trussUnit})`} type="number" value={trussLoads[selectedNodeId]?.fy ?? ''} onChange={e => handleTrussLoadChange(selectedNodeId, 'fy', e.target.value)} style={{ ...inputStyle, width: 85 }} />
                  </div>
                ) : (
                  <span style={{ color: '#888' }}>Click a node to set supports or nodal loads. Click two nodes to create a member.</span>
                )}
              </div>

              <div style={{ textAlign: 'center', margin: 18 }}>
                <button style={buttonStyle} disabled={nodes.length < 2 || !elements.length} onClick={runTrussAnalysis}>Analyze Truss</button>
              </div>

              {trussLocalData.analyzed && (
                <pre style={{ whiteSpace: 'pre-wrap', background: '#151515', padding: 15, borderLeft: `5px solid ${theme.accent}` }}>
                  {trussLocalData.steps.join('\n')}
                </pre>
              )}

              {trussAnalysisResult?.members && (
                <div style={{ marginTop: 15, overflowX: 'auto' }}>
                  <h3>Member Forces</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr><th style={{ textAlign: 'left' }}>Member</th><th>Force</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {trussAnalysisResult.members.map((m, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #333' }}>
                          <td>{m.name}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(knToForce(m.force, trussUnit))} {trussUnit}</td>
                          <td style={{ textAlign: 'center' }}>{m.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================= FRAME ================= */}
          {activeTab === 'frame' && (
            <div className="report-document">
              <h1>Frame Reactions — Engineering Statics</h1>
              <p style={{ color: '#888' }}>
                This module calculates global support reactions only. It is not a stiffness-method/internal-force frame solver.
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button style={buttonStyle} onClick={loadFramePreset}>Portal Frame</button>
                <button style={buttonStyle} onClick={handleUndoFrame} disabled={!frameHistory.length}>Undo</button>
                <button style={buttonStyle} onClick={clearFrameCanvas}>Clear</button>
                <label>Force
                  <select value={fForceUnit} onChange={e => setFForceUnit(e.target.value)} style={{ ...inputStyle, marginLeft: 5 }}>
                    <option>N</option><option>kN</option><option>lb</option><option>kip</option>
                  </select>
                </label>
                <label>Grid
                  <select value={fGridScale} onChange={e => setFGridScale(Number(e.target.value))} style={{ ...inputStyle, marginLeft: 5 }}>
                    {Array.from({ length: 30 }, (_, i) => (i + 1) / 10).map(v => <option key={v} value={v}>{v.toFixed(1)} m</option>)}
                  </select>
                </label>
              </div>

              <div style={{ overflow: 'auto', background: '#151515', borderRadius: 8 }}>
                <svg width="1400" height="600" onClick={handleFrameCanvasClick}>
                  <defs>
                    <pattern id="frameGrid" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse">
                      <path d={`M${PIXELS_PER_GRID} 0 L0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#2a2a2a" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#frameGrid)" />
                  {renderDimensions(fNodes, fGridScale)}
                  {fElements.map(el => {
                    const a = fNodes.find(n => n.id === el.n1), b = fNodes.find(n => n.id === el.n2)
                    if (!a || !b) return null
                    const selected = fSelectedElementId === el.id
                    const d = fDistLoads[el.id]
                    const p = fPointLoadsOnElement[el.id]
                    const loc = p ? framePointLocation(el, p) : null
                    return (
                      <g key={el.id} onClick={e => handleFrameElementClick(e, el)}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? theme.accent : '#fff'} strokeWidth={selected ? 6 : 4} />
                        {renderDistributedLoadArrows(a.x, a.y, b.x, b.y, d?.wx, d?.wy, fForceUnit)}
                        {loc && p?.py && <line x1={loc.x} y1={loc.y - 45} x2={loc.x} y2={loc.y - 10} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />}
                        {loc && p?.px && <line x1={loc.x - 45} y1={loc.y} x2={loc.x - 10} y2={loc.y} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />}
                      </g>
                    )
                  })}
                  {Object.entries(fSupports).map(([id, s]) => {
                    const n = fNodes.find(x => String(x.id) === id)
                    return n ? <RenderSupportSVG key={id} cx={n.x} cy={n.y} type={s.type} dir={s.direction} /> : null
                  })}
                  {Object.entries(fLoads).map(([id, f]) => {
                    const n = fNodes.find(x => String(x.id) === id)
                    if (!n) return null
                    return (
                      <g key={id}>
                        {Number(f.fy) !== 0 && <line x1={n.x} y1={Number(f.fy) > 0 ? n.y + 45 : n.y - 45} x2={n.x} y2={Number(f.fy) > 0 ? n.y + 10 : n.y - 10} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />}
                        {Number(f.fx) !== 0 && <line x1={Number(f.fx) > 0 ? n.x - 45 : n.x + 45} y1={n.y} x2={Number(f.fx) > 0 ? n.x - 10 : n.x + 10} y2={n.y} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />}
                      </g>
                    )
                  })}
                  {fNodes.map(n => (
                    <g key={n.id}>
                      <circle cx={n.x} cy={n.y} r="30" fill="transparent" onClick={e => handleFrameNodeClick(e, n)} />
                      <circle cx={n.x} cy={n.y} r={fSelectedNodeId === n.id ? 9 : 6} fill={fSelectedNodeId === n.id ? theme.accent : '#222'} stroke="#fff" pointerEvents="none" />
                      <text x={n.x + 10} y={n.y - 10} fill="#fff" pointerEvents="none">{n.name}</text>
                    </g>
                  ))}
                </svg>
              </div>

              <div style={{ marginTop: 15, padding: 15, background: '#1A1A1A', borderRadius: 8 }}>
                {fSelectedNode ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <b>Node {fSelectedNode.name}</b>
                    <select value={fSupports[fSelectedNode.id]?.type || 'none'} onChange={e => handleFSupportTypeChange(fSelectedNode.id, e.target.value)} style={inputStyle}>
                      <option value="none">None</option><option value="pin">Pin</option><option value="roller">Roller</option><option value="fixed">Fixed</option>
                    </select>
                    <select
                      value={fSupports[fSelectedNode.id]?.direction || 'horizontal'}
                      onChange={e => {
                        saveFrameState()
                        setFSupports(prev => ({
                          ...prev,
                          [fSelectedNode.id]: { ...(prev[fSelectedNode.id] || {}), direction: e.target.value }
                        }))
                      }}
                      style={inputStyle}
                    >
                      <option value="horizontal">Horizontal surface</option>
                      <option value="vertical">Vertical surface</option>
                    </select>
                    <input type="number" placeholder={`Fx (${fForceUnit})`} value={fLoads[fSelectedNode.id]?.fx ?? ''} onChange={e => handleFLoadChange(fSelectedNode.id, 'fx', e.target.value)} style={{ ...inputStyle, width: 80 }} />
                    <input type="number" placeholder={`Fy (${fForceUnit})`} value={fLoads[fSelectedNode.id]?.fy ?? ''} onChange={e => handleFLoadChange(fSelectedNode.id, 'fy', e.target.value)} style={{ ...inputStyle, width: 80 }} />
                    <input type="number" placeholder="Mz (kN·m)" value={fLoads[fSelectedNode.id]?.mz ?? ''} onChange={e => handleFLoadChange(fSelectedNode.id, 'mz', e.target.value)} style={{ ...inputStyle, width: 90 }} />
                  </div>
                ) : fSelectedElement ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <b>Member {fNodes.find(n => n.id === fSelectedElement.n1)?.name}{fNodes.find(n => n.id === fSelectedElement.n2)?.name}</b>
                    <input type="number" placeholder={`wx (${fForceUnit}/m)`} value={fDistLoads[fSelectedElement.id]?.wx ?? ''} onChange={e => handleFDistLoadChange(fSelectedElement.id, 'wx', e.target.value)} style={{ ...inputStyle, width: 110 }} />
                    <input type="number" placeholder={`wy (${fForceUnit}/m)`} value={fDistLoads[fSelectedElement.id]?.wy ?? ''} onChange={e => handleFDistLoadChange(fSelectedElement.id, 'wy', e.target.value)} style={{ ...inputStyle, width: 110 }} />
                    <input type="number" placeholder={`P (${fForceUnit})`} value={fPointLoadsOnElement[fSelectedElement.id]?.py ?? fPointLoadsOnElement[fSelectedElement.id]?.px ?? ''} onChange={e => handleElementPointLoadChange(fSelectedElement.id, 'py', e.target.value)} style={{ ...inputStyle, width: 90 }} />
                    <input type="number" placeholder="a from Node i (m)" value={fPointLoadsOnElement[fSelectedElement.id]?.x ?? ''} onChange={e => handleElementPointLoadChange(fSelectedElement.id, 'x', e.target.value)} style={{ ...inputStyle, width: 120 }} />
                  </div>
                ) : (
                  <span style={{ color: '#888' }}>Click a node for supports/nodal loads or click a member for distributed/member point loads.</span>
                )}
              </div>

              <div style={{ textAlign: 'center', margin: 18 }}>
                <button style={buttonStyle} disabled={fNodes.length < 2} onClick={runFrameStaticsAnalysis}>Calculate Frame Reactions</button>
              </div>

              {frameLocalData.analyzed && (
                <pre style={{ whiteSpace: 'pre-wrap', background: '#151515', padding: 15, borderLeft: `5px solid ${theme.accent}` }}>
                  {frameLocalData.steps.join('\n')}
                </pre>
              )}

              {frameLocalData.analyzed && Object.keys(frameLocalData.rxns).length > 0 && (
                <div style={{ marginTop: 15, padding: 15, background: '#1A1A1A' }}>
                  <h3>Support Reactions</h3>
                  {Object.entries(frameLocalData.rxns).map(([id, r]) => (
                    <div key={id} style={{ marginBottom: 8 }}>
                      <b>{fNodes.find(n => String(n.id) === String(id))?.name}</b>:
                      &nbsp;Rx = {formatNumber(r.fx)} {fForceUnit},
                      &nbsp;Ry = {formatNumber(r.fy)} {fForceUnit},
                      &nbsp;M = {formatNumber(r.mz)} kN·m
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
