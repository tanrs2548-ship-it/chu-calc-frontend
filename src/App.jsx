import { useState, useEffect } from 'react'
import axios from 'axios'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import './App.css'

// ==========================================
// GLOBAL HELPER FUNCTIONS
// ==========================================
const formatYAxis = (tickItem) => {
  if (tickItem === undefined || tickItem === null) return '0';
  return tickItem >= 10000 || tickItem <= -10000 ? (tickItem / 1000).toFixed(1) + 'k' : tickItem.toLocaleString();
};

const getMaxMinObj = (data, key) => {
  if (!data || data.length === 0) return { max: null, min: null };
  let max = data[0], min = data[0];
  data.forEach(d => {
    if (d[key] > max[key]) max = d;
    if (d[key] < min[key]) min = d;
  });
  return { max, min };
};

const PIXELS_PER_GRID = 50;

function App() {
  // ==========================================
  // GLOBAL STATES
  // ==========================================
  const [currentView, setCurrentView] = useState('home') 
  const [activeTab, setActiveTab] = useState('particle') 
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showFormulaModal, setShowFormulaModal] = useState(false)

  // Unit Converter State
  const [convVal, setConvVal] = useState(1)
  const [convType, setConvType] = useState('force')
  const [fromUnit, setFromUnit] = useState('kN')
  const [toUnit, setToUnit] = useState('N')

  // Recent Projects State
  const [recentProjects, setRecentProjects] = useState([
    { id: 1, name: 'Particle Equilibrium (Space Telescope)', type: 'particle', date: 'Today' },
    { id: 2, name: 'Simply Supported Beam (UDL + Point)', type: 'beam', date: 'Yesterday' },
    { id: 3, name: 'Pratt Truss Analysis', type: 'truss', date: '3 days ago' }
  ])

  // ==========================================
  // PARTICLE EQUILIBRIUM STATES (CHAPTER 3)
  // ==========================================
  const [pWeight, setPWeight] = useState(196.2) 
  const [pAngle1, setPAngle1] = useState(36.87) 
  const [pAngle2, setPAngle2] = useState(45)  
  const [particleUnit, setParticleUnit] = useState('N')
  const [particleResult, setParticleResult] = useState(null)

  const analyzeSimpleParticle = () => {
    setIsAnalyzing(true)
    setTimeout(() => {
      const w = Number(pWeight) || 0
      const th1 = (Number(pAngle1) || 0) * Math.PI / 180
      const th2 = (Number(pAngle2) || 0) * Math.PI / 180

      const denom = Math.sin(th1) * Math.cos(th2) + Math.cos(th1) * Math.sin(th2)
      let t1 = 0, t2 = 0
      if (Math.abs(denom) > 0.0001) {
        t1 = (w * Math.cos(th2)) / Math.sin(th1 + th2) 
        t2 = (w * Math.cos(th1)) / Math.sin(th1 + th2) 
      } else {
        t1 = w / 2; t2 = w / 2;
      }

      setParticleResult({
        T1: t1,
        T2: t2,
        W: w,
        angle1: pAngle1,
        angle2: pAngle2,
        steps: [
          `[Step 1] กำหนดค่าน้ำหนัก W = ${w} ${particleUnit}`,
          `[Step 2] ตั้งสมการสมดุลตามแนวแกน X (∑Fx = 0): \n➔ T₂ cos(${pAngle2}°) - T₁ cos(${pAngle1}°) = 0`,
          `[Step 3] ตั้งสมการสมดุลตามแนวแกน Y (∑Fy = 0): \n➔ T₁ sin(${pAngle1}°) + T₂ sin(${pAngle2}°) - ${w} = 0`,
          `[Step 4] ผลลัพธ์แรงตึงในสายเคเบิล: \n➔ แรงตึงเชือกด้านซ้าย (T₁) = ${t1.toFixed(2)} ${particleUnit} \n➔ แรงตึงเชือกด้านขวา (T₂) = ${t2.toFixed(2)} ${particleUnit}`
        ]
      })
      setIsAnalyzing(false)
    }, 600)
  }

  // Dark Theme Palette
  const theme = {
    bg: '#121212',
    cardBg: '#1E1E1E',
    textMain: '#E0E0E0',
    primary: '#FFFFFF',       
    accent: '#00BFFF',         
    supportOrange: '#FFA500', 
    udlOrange: '#FFA500',
    border: '#333333',
    memberGray: '#FFFFFF',    
    lightGray: '#252525',
    disabledBg: '#2A2A2A',
    disabledText: '#666666'
  }

  // ==========================================
  // SVG RENDER COMPONENTS
  // ==========================================
  const RenderSupportSVG = ({ cx, cy, type, dir }) => {
    const isV = dir === 'vertical';
    const color = theme.supportOrange;
    if (type === 'pin') {
      return isV
        ? <g><polygon points={`${cx-5},${cy} ${cx-20},${cy-10} ${cx-20},${cy+10}`} fill={color} /><line x1={cx-20} y1={cy-15} x2={cx-20} y2={cy+15} stroke={color} strokeWidth="2.5" /></g>
        : <g><polygon points={`${cx},${cy+5} ${cx-10},${cy+20} ${cx+10},${cy+20}`} fill={color} /><line x1={cx-15} y1={cy+20} x2={cx+15} y2={cy+20} stroke={color} strokeWidth="2.5" /></g>;
    }
    if (type === 'roller') {
      return isV
        ? <g><circle cx={cx-10} cy={cy} r={6} fill={color} /><line x1={cx-20} y1={cy-15} x2={cx-20} y2={cy+15} stroke={color} strokeWidth="2.5" /></g>
        : <g><circle cx={cx} cy={cy+10} r={6} fill={color} /><line x1={cx-15} y1={cy+18} x2={cx+15} y2={cy+18} stroke={color} strokeWidth="2.5" /></g>;
    }
    if (type === 'fixed') {
      return isV
        ? <rect x={cx-15} y={cy-15} width="10" height="30" fill={color} />
        : <rect x={cx-15} y={cy+5} width="30" height="10" fill={color} />;
    }
    if (type === 'free') {
      return <rect x={cx-6} y={cy-10} width="12" height="20" fill="none" stroke="#666" strokeDasharray="2,2" />;
    }
    return null;
  }

  const renderDimensions = (nodeList, scale) => {
    if (!nodeList || nodeList.length < 2) return null;
    const dimMaxX = Math.max(...nodeList.map(n => n.x)); const dimMaxY = Math.max(...nodeList.map(n => n.y));
    const uniqueX = [...new Set(nodeList.map(n => n.x))].sort((a, b) => a - b); const uniqueY = [...new Set(nodeList.map(n => n.y))].sort((a, b) => a - b);
    const botY = dimMaxY + 45; const rightX = dimMaxX + 45; 
    return (
      <g style={{ pointerEvents: 'none' }}>
        {uniqueX.map((x, i) => {
          if (i === uniqueX.length - 1) return null; const nextX = uniqueX[i+1]; const dist = ((nextX - x) / PIXELS_PER_GRID) * scale;
          if (dist === 0) return null;
          return (
            <g key={`hx-${i}`}>
              <line x1={x} y1={botY} x2={nextX} y2={botY} stroke={theme.textMain} strokeWidth="1.5" />
              <line x1={x} y1={botY - 8} x2={x} y2={botY + 8} stroke={theme.textMain} strokeWidth="1.5" />
              <line x1={nextX} y1={botY - 8} x2={nextX} y2={botY + 8} stroke={theme.textMain} strokeWidth="1.5" />
              <text x={(x + nextX) / 2} y={botY + 20} fill={theme.textMain} fontSize="14" fontWeight="bold" textAnchor="middle">{dist.toFixed(1)} m</text>
            </g>
          )
        })}
        {uniqueY.map((y, i) => {
          if (i === uniqueY.length - 1) return null; const nextY = uniqueY[i+1]; const dist = ((nextY - y) / PIXELS_PER_GRID) * scale;
          if (dist === 0) return null;
          return (
            <g key={`vy-${i}`}>
              <line x1={rightX} y1={y} x2={rightX} y2={nextY} stroke={theme.textMain} strokeWidth="1.5" />
              <line x1={rightX - 8} y1={y} x2={rightX + 8} y2={y} stroke={theme.textMain} strokeWidth="1.5" />
              <line x1={rightX - 8} y1={nextY} x2={rightX + 8} y2={nextY} stroke={theme.textMain} strokeWidth="1.5" />
              <text x={rightX + 25} y={(y + nextY) / 2} fill={theme.textMain} fontSize="14" fontWeight="bold" textAnchor="middle" dominantBaseline="central">{dist.toFixed(1)} m</text>
            </g>
          )
        })}
      </g>
    );
  };

  const renderDistributedLoadArrows = (x1, y1, x2, y2, wx, wy) => {
    const elements = [];
    if ((!wy || wy === 0) && (!wx || wx === 0)) return null;
    const length = Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
    if (length === 0) return null;
    const numArrows = Math.max(Math.floor(length / 25), 3);
    const cx = (x1 + x2) / 2; const cy = (y1 + y2) / 2;
    const unit = activeTab === 'frame' ? fForceUnit : forceUnit;
    const markerId = "url(#arrowUDL_Orange)";

    if (wy && wy !== 0) {
      const arrows = []; const dirY = wy > 0 ? 1 : -1;
      for (let i = 0; i <= numArrows; i++) {
        const t = i / numArrows; const ax = x1 + (x2 - x1) * t; const ay = y1 + (y2 - y1) * t;
        const startY = dirY > 0 ? ay - 35 : ay + 35; const endY = dirY > 0 ? ay - 5 : ay + 5;
        arrows.push(<line key={`wy-${i}`} x1={ax} y1={startY} x2={ax} y2={endY} stroke={theme.udlOrange} strokeWidth="2.5" markerEnd={markerId} />);
      }
      elements.push(
        <g key="wy-group">
          <line x1={x1} y1={dirY > 0 ? y1 - 35 : y1 + 35} x2={x2} y2={dirY > 0 ? y2 - 35 : y2 + 35} stroke={theme.udlOrange} strokeWidth="2" strokeDasharray="5,5" />
          {arrows}
          <text x={cx} y={dirY > 0 ? Math.min(y1, y2) - 45 : Math.max(y1, y2) + 45} fill={theme.textMain} fontSize="14" fontWeight="bold" textAnchor="middle">w = {Math.abs(wy)} {unit}/m</text>
        </g>
      );
    }
    if (wx && wx !== 0) {
      const arrows = []; const dirX = wx > 0 ? 1 : -1;
      for (let i = 0; i <= numArrows; i++) {
        const t = i / numArrows; const ax = x1 + (x2 - x1) * t; const ay = y1 + (y2 - y1) * t;
        const startX = dirX > 0 ? ax - 35 : ax + 35; const endX = dirX > 0 ? ax - 5 : ax + 5;
        arrows.push(<line key={`wx-${i}`} x1={startX} y1={ay} x2={endX} y2={ay} stroke={theme.udlOrange} strokeWidth="2.5" markerEnd={markerId} />);
      }
      elements.push(
        <g key="wx-group">
          <line x1={dirX > 0 ? x1 - 35 : x1 + 35} y1={y1} x2={dirX > 0 ? x2 - 35 : x2 + 35} y2={y2} stroke={theme.udlOrange} strokeWidth="2" strokeDasharray="5,5" />
          {arrows}
          <text x={dirX > 0 ? Math.min(x1, x2) - 50 : Math.max(x1, x2) + 50} y={cy} fill={theme.textMain} fontSize="14" fontWeight="bold" textAnchor="middle" dominantBaseline="central">w = {Math.abs(wx)} {unit}/m</text>
        </g>
      );
    }
    return <g style={{ pointerEvents: 'none' }}>{elements}</g>;
  };

  // ==========================================
  // 0. FORCE VECTORS STATES
  // ==========================================
  const [vectorUnit, setVectorUnit] = useState('kN');
  const [vectorLoads, setVectorLoads] = useState([
    { id: 1, magnitude: 100, angle: 60, quadrant: 3, refAxis: 'x', direction: 'out' },
    { id: 2, magnitude: 50, angle: 20, quadrant: 1, refAxis: 'x', direction: 'out' }
  ]);
  const [vectorResult, setVectorResult] = useState(null);

  const addVectorLoad = () => setVectorLoads([...vectorLoads, { id: Date.now(), magnitude: 50, angle: 0, quadrant: 1, refAxis: 'x', direction: 'out' }]);
  const updateVectorLoad = (id, field, val) => setVectorLoads(vectorLoads.map(v => v.id === id ? { ...v, [field]: val } : v));
  const removeVectorLoad = (id) => setVectorLoads(vectorLoads.filter(v => v.id !== id));

  const getVectorComponents = (v) => {
    let baseAngle = Number(v.angle) || 0;
    let trueAngle = 0;
    if (v.quadrant === 1) trueAngle = v.refAxis === 'x' ? baseAngle : 90 - baseAngle;
    else if (v.quadrant === 2) trueAngle = v.refAxis === 'x' ? 180 - baseAngle : 90 + baseAngle;
    else if (v.quadrant === 3) trueAngle = v.refAxis === 'x' ? 180 + baseAngle : 270 - baseAngle;
    else if (v.quadrant === 4) trueAngle = v.refAxis === 'x' ? 360 - baseAngle : 270 + baseAngle;

    const drawRad = (trueAngle * Math.PI) / 180;
    let forceAngle = trueAngle;
    if (v.direction === 'in') forceAngle = (trueAngle + 180) % 360;
    
    const forceRad = (forceAngle * Math.PI) / 180;
    const fx = v.magnitude * Math.cos(forceRad);
    const fy = v.magnitude * Math.sin(forceRad);
    return { fx, fy, drawRad, isOut: v.direction === 'out' };
  };

  const analyzeVectors = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      let sumFx = 0, sumFy = 0;
      const steps = [];
      vectorLoads.forEach((f, i) => {
        const { fx, fy, drawRad, isOut } = getVectorComponents(f);
        sumFx += fx; sumFy += fy;
        steps.push({ id: f.id, name: `F${i + 1}`, fx: fx, fy: fy, drawRad: drawRad, isOut: isOut, magnitude: f.magnitude });
      });
      const rMag = Math.sqrt(sumFx ** 2 + sumFy ** 2);
      let rAng = (Math.atan2(sumFy, sumFx) * 180) / Math.PI;
      if (rAng < 0) rAng += 360;
      const refAng = (Math.atan(Math.abs(sumFy) / (Math.abs(sumFx) || 0.0001)) * 180 / Math.PI);
      let dirSymbol = '';
      if (sumFx >= 0 && sumFy >= 0) dirSymbol = '↗ (Q1)';
      else if (sumFx < 0 && sumFy >= 0) dirSymbol = '↖ (Q2)';
      else if (sumFx < 0 && sumFy < 0) dirSymbol = '↙ (Q3)';
      else dirSymbol = '↘ (Q4)';
      setVectorResult({ sumFx, sumFy, rMag, rAng, refAng, dirSymbol, steps });
      setIsAnalyzing(false);
    }, 600);
  };

  // ==========================================
  // 1. BEAM ANALYSIS STATES
  // ==========================================
  const [beamLength, setBeamLength] = useState(4)
  const [forceUnit, setForceUnit] = useState('kN') 
  const [beamSupports, setBeamSupports] = useState([
    { id: 1, type: "pin", x: 0, direction: "horizontal" },
    { id: 2, type: "roller", x: 4, direction: "horizontal" }
  ])
  const [beamLoads, setBeamLoads] = useState([
    { id: 1, type: "point", magnitude: 2, x: 1 },
    { id: 2, type: "distributed", magnitude: 2, start_x: 2, end_x: 4 }
  ])
  const [chartData, setChartData] = useState([])
  const [beamReactions, setBeamReactions] = useState([])
  const [beamSteps, setBeamSteps] = useState([])
  const [beamHistory, setBeamHistory] = useState([])

  const safeBeamLength = Number(beamLength) || 1; 
  const getSvgX = (x) => 50 + (Number(x || 0) / safeBeamLength) * 900; 
  const optimizedTicks = safeBeamLength > 10 
    ? Array.from({ length: Math.floor(safeBeamLength / 2) + 1 }, (_, i) => i * 2) 
    : Array.from({ length: Math.floor(safeBeamLength) + 1 }, (_, i) => i);

  const sortedBeamSupports = [...beamSupports].sort((a, b) => a.x - b.x);
  const getBeamNodeLabel = (id) => String.fromCharCode(65 + sortedBeamSupports.findIndex(s => s.id === id));
  const saveBeamState = () => setBeamHistory(prev => [...prev, { supports: [...beamSupports], loads: [...beamLoads] }])
  const handleUndoBeam = () => {
    if (beamHistory.length > 0) {
      const lastState = beamHistory[beamHistory.length - 1]
      setBeamSupports(lastState.supports); setBeamLoads(lastState.loads); setBeamHistory(beamHistory.slice(0, -1))
    }
  }
  const addBeamSupport = () => { saveBeamState(); setBeamSupports([...beamSupports, { id: Date.now(), type: "roller", x: safeBeamLength / 2, direction: "horizontal" }]) }
  const removeBeamSupport = (id) => { saveBeamState(); setBeamSupports(beamSupports.filter(s => s.id !== id)) }
  const updateBeamSupport = (id, field, value) => { saveBeamState(); setBeamSupports(beamSupports.map(s => s.id === id ? { ...s, [field]: value } : s)) }
  const addBeamPointLoad = () => { saveBeamState(); setBeamLoads([...beamLoads, { id: Date.now(), type: "point", magnitude: 5, x: safeBeamLength / 2 }]) }
  const addBeamDistLoad = () => { saveBeamState(); setBeamLoads([...beamLoads, { id: Date.now(), type: "distributed", magnitude: 2, start_x: 0, end_x: safeBeamLength / 2 }]) }
  const addBeamMomentLoad = () => { saveBeamState(); setBeamLoads([...beamLoads, { id: Date.now(), type: "moment", magnitude: 10, x: safeBeamLength / 2, direction: 'cw' }]) }
  const removeBeamLoad = (id) => { saveBeamState(); setBeamLoads(beamLoads.filter(l => l.id !== id)) }
  const updateBeamLoad = (id, field, value) => { saveBeamState(); setBeamLoads(beamLoads.map(l => l.id === id ? { ...l, [field]: value } : l)) }

  const loadBeamPreset = (type) => {
    saveBeamState()
    if (type === 'simply-supported') {
      setBeamLength(6); setBeamSupports([{ id: 1, type: "pin", x: 0, direction: "horizontal" }, { id: 2, type: "roller", x: 6, direction: "horizontal" }]); setBeamLoads([{ id: 1, type: "point", magnitude: 10, x: 3 }])
    } else if (type === 'overhanging') {
      setBeamLength(8); setBeamSupports([{ id: 1, type: "pin", x: 0, direction: "horizontal" }, { id: 2, type: "roller", x: 6, direction: "horizontal" }]); setBeamLoads([{ id: 1, type: "distributed", magnitude: 4, start_x: 0, end_x: 6 }, { id: 2, type: "point", magnitude: 8, x: 8 }])
    } else if (type === 'cantilever') {
      setBeamLength(4); setBeamSupports([{ id: 1, type: "fixed", x: 0, direction: "horizontal" }]); setBeamLoads([{ id: 1, type: "distributed", magnitude: 5, start_x: 0, end_x: 4 }])
    }
  }

  const shearExtremes = getMaxMinObj(chartData, 'shear');
  const momentExtremes = getMaxMinObj(chartData, 'moment');
  const maxAbsoluteShear = chartData.length > 0 ? Math.max(...chartData.map(d => Math.abs(d.shear || 0))) : 0;
  const maxAbsoluteMoment = chartData.length > 0 ? Math.max(...chartData.map(d => Math.abs(d.moment || 0))) : 0;

  const analyzeBeam = async () => {
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const payload = {
        beam_length: safeBeamLength,
        supports: beamSupports.map(s => ({ ...s, x: Number(s.x) })),
        loads: beamLoads.map(l => {
          if (l.type === 'point') return { type: "point", magnitude: Number(l.magnitude), x: Number(l.x) }
          if (l.type === 'moment') return { type: "moment", magnitude: Number(l.magnitude), x: Number(l.x), direction: l.direction }
          return { type: "distributed", magnitude: Number(l.magnitude), start_x: Number(l.start_x), end_x: Number(l.end_x) }
        }),
        ei: null, unit: forceUnit, analysis_type: "determinate"
      };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze', payload);
      if (!response.data || !response.data.diagram_data || !response.data.diagram_data.x) throw new Error("Invalid response from server");
      const data = response.data.diagram_data;
      const formattedData = data.x.map((xValue, index) => ({ x: xValue, shear: data.shear[index], moment: data.moment[index] }));
      setChartData(formattedData); setBeamReactions(response.data.reactions || []); setBeamSteps(response.data.steps || []);
    } catch (error) {
      console.error("Analysis Error:", error); alert("Calculation Error! Please check supports and loads.");
    } finally { setIsAnalyzing(false); }
  }

  // ==========================================
  // 2. TRUSS BUILDER STATES
  // ==========================================
  const [nodes, setNodes] = useState([])
  const [elements, setElements] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [trussUnit, setTrussUnit] = useState('kN')
  const [gridScale, setGridScale] = useState(1.0) 
  const [trussSupports, setTrussSupports] = useState({})
  const [trussLoads, setTrussLoads] = useState({})
  const [trussAnalysisResult, setTrussAnalysisResult] = useState(null)
  const [trussLocalData, setTrussLocalData] = useState({ steps: [], rxns: {} })
  const [trussHistory, setTrussHistory] = useState([])

  const saveTrussState = () => setTrussHistory(prev => [...prev, { nodes: [...nodes], elements: [...elements], supports: {...trussSupports}, loads: {...trussLoads} }])
  const handleUndoTruss = () => {
    if (trussHistory.length > 0) {
      const lastState = trussHistory[trussHistory.length - 1]
      setNodes(lastState.nodes); setElements(lastState.elements); setTrussSupports(lastState.supports); setTrussLoads(lastState.loads); setSelectedNodeId(null); setTrussHistory(trussHistory.slice(0, -1))
    }
  }
  const handleTrussNodeClick = (e, node) => {
    e.stopPropagation(); 
    if (selectedNodeId === node.id) { setSelectedNodeId(null); } 
    else if (selectedNodeId) {
      const isDup = elements.some(el => (el.n1 === selectedNodeId && el.n2 === node.id) || (el.n1 === node.id && el.n2 === selectedNodeId));
      if (!isDup) { saveTrussState(); setElements([...elements, { id: Date.now(), n1: selectedNodeId, n2: node.id }]); }
      setSelectedNodeId(node.id); 
    } else { setSelectedNodeId(node.id); }
  };
  const handleTrussCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) / PIXELS_PER_GRID) * PIXELS_PER_GRID;
    const y = Math.round((e.clientY - rect.top) / PIXELS_PER_GRID) * PIXELS_PER_GRID;
    const clickedExistingNode = nodes.find(n => Math.abs(n.x - (e.clientX - rect.left)) < 20 && Math.abs(n.y - (e.clientY - rect.top)) < 20);
    if (clickedExistingNode) {
      if (selectedNodeId && selectedNodeId !== clickedExistingNode.id) {
        const isDup = elements.some(el => (el.n1 === selectedNodeId && el.n2 === clickedExistingNode.id) || (el.n1 === clickedExistingNode.id && el.n2 === selectedNodeId));
        if (!isDup) { saveTrussState(); setElements([...elements, { id: Date.now(), n1: selectedNodeId, n2: clickedExistingNode.id }]); }
      }
      setSelectedNodeId(clickedExistingNode.id); return;
    }
    const existingNode = nodes.find(n => n.x === x && n.y === y);
    if (!existingNode) {
      saveTrussState();
      const newNodeId = Date.now();
      const nodeName = nodes.length < 26 ? String.fromCharCode(65 + nodes.length) : `N${nodes.length}`;
      setNodes([...nodes, { id: newNodeId, name: nodeName, x, y }]);
      if (selectedNodeId) setElements([...elements, { id: Date.now() + 1, n1: selectedNodeId, n2: newNodeId }]);
      setSelectedNodeId(newNodeId);
    } else { setSelectedNodeId(null); }
  }
  const handleSupportTypeChange = (nodeId, type) => {
    saveTrussState();
    setTrussSupports(prev => {
      const ns = { ...prev };
      if (type === 'none' || type === 'free') delete ns[nodeId];
      else ns[nodeId] = { ...ns[nodeId], type, direction: ns[nodeId]?.direction || 'horizontal' };
      return ns;
    });
  }
  const handleTrussLoadChange = (nodeId, axis, value) => {
    saveTrussState();
    setTrussLoads(prev => {
      const nl = { ...prev };
      if (value === '') { if (nl[nodeId]) { delete nl[nodeId][axis]; if (Object.keys(nl[nodeId]).length === 0) delete nl[nodeId]; } }
      else { nl[nodeId] = { ...(nl[nodeId] || {}), [axis]: Number(value) }; }
      return nl;
    });
  }
  const clearTrussCanvas = () => { saveTrussState(); setNodes([]); setElements([]); setTrussSupports({}); setTrussLoads({}); setSelectedNodeId(null); setTrussAnalysisResult(null); setTrussLocalData({ steps: [], rxns: {} }); }
  const loadTrussPreset = (type) => {
    saveTrussState()
    if (type === 'pratt') {
      setNodes([{ id: 1, name: "A", x: 200, y: 350 }, { id: 2, name: "B", x: 300, y: 350 }, { id: 3, name: "C", x: 400, y: 350 }, { id: 4, name: "D", x: 400, y: 250 }, { id: 5, name: "E", x: 300, y: 250 }, { id: 6, name: "F", x: 200, y: 250 }]);
      setElements([{ id: 101, n1: 1, n2: 2 }, { id: 102, n1: 2, n2: 3 }, { id: 103, n1: 6, n2: 5 }, { id: 104, n1: 5, n2: 4 }, { id: 105, n1: 1, n2: 6 }, { id: 106, n1: 2, n2: 5 }, { id: 107, n1: 3, n2: 4 }, { id: 108, n1: 1, n2: 5 }, { id: 109, n1: 3, n2: 5 }]);
      setTrussSupports({ 1: { type: "pin", direction: "horizontal" }, 3: { type: "roller", direction: "horizontal" } }); setTrussLoads({ 2: { fy: 15 } });
    }
  }
  const autoCleanMesh = (nds, els) => {
    let generated = [];
    const getDist = (p1, p2) => Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
    const isBetween = (p, a, b) => Math.abs(getDist(a, p) + getDist(p, b) - getDist(a, b)) < 0.1;
    els.forEach(el => {
      const n1 = nds.find(n => n.id === el.n1); const n2 = nds.find(n => n.id === el.n2);
      if (!n1 || !n2) return;
      let onSeg = nds.filter(n => n.id !== n1.id && n.id !== n2.id && isBetween(n, n1, n2));
      if (onSeg.length === 0) { generated.push({ n1: Math.min(n1.id, n2.id), n2: Math.max(n1.id, n2.id) }); }
      else {
        onSeg.sort((a, b) => getDist(n1, a) - getDist(n1, b));
        let path = [n1, ...onSeg, n2];
        for (let i = 0; i < path.length - 1; i++) { generated.push({ n1: Math.min(path[i].id, path[i+1].id), n2: Math.max(path[i].id, path[i+1].id) }); }
      }
    });
    const unique = []; const seen = new Set();
    generated.forEach((el, index) => {
      const key = `${el.n1}-${el.n2}`;
      if (!seen.has(key)) { seen.add(key); unique.push({ id: Date.now() + index, n1: el.n1, n2: el.n2 }); }
    });
    return unique;
  };
  const runTrussAnalysis = async () => {
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const cleanedElements = autoCleanMesh(nodes, elements);
      setElements(cleanedElements);
      const payload = {
        nodes: nodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y })),
        elements: cleanedElements.map(el => ({ id: el.id, n1: el.n1, n2: el.n2 })), 
        supports: trussSupports, loads: trussLoads, unit: trussUnit, ei: null
      };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze-truss', payload);
      if(!response.data) throw new Error("No Data from Server");
      setTrussAnalysisResult(response.data);
    } catch (error) { console.error("Truss Analysis Error:", error); alert("Analysis Failed!"); }
    finally { setIsAnalyzing(false); }
  }

  // ==========================================
  // 3. FRAME ANALYSIS STATES
  // ==========================================
  const [fNodes, setFNodes] = useState([])
  const [fElements, setFElements] = useState([])
  const [fSelectedNodeId, setFSelectedNodeId] = useState(null)
  const [fSelectedElementId, setFSelectedElementId] = useState(null)
  const [fSupports, setFSupports] = useState({})
  const [fLoads, setFLoads] = useState({}) 
  const [fDistLoads, setFDistLoads] = useState({}) 
  const [fPointLoadsOnElement, setFPointLoadsOnElement] = useState({})
  const [fForceUnit, setFForceUnit] = useState('kN')
  const [fGridScale, setFGridScale] = useState(1.0)
  const [frameLocalData, setFrameLocalData] = useState({ steps: [], rxns: {}, analyzed: false })
  const [frameHistory, setFrameHistory] = useState([])

  const saveFrameState = () => setFrameHistory(prev => [...prev, { fNodes: [...fNodes], fElements: [...fElements], fSupports: {...fSupports}, fLoads: {...fLoads}, fDistLoads: {...fDistLoads}, fPointLoads: {...fPointLoadsOnElement} }])
  const handleUndoFrame = () => {
    if (frameHistory.length > 0) {
      const last = frameHistory[frameHistory.length - 1]
      setFNodes(last.fNodes); setFElements(last.fElements); setFSupports(last.fSupports); setFLoads(last.fLoads); setFDistLoads(last.fDistLoads); setFPointLoadsOnElement(last.fPointLoads); setFSelectedNodeId(null); setFSelectedElementId(null); setFrameHistory(frameHistory.slice(0, -1))
    }
  }
  const fSelectedNode = fNodes.find(n => n.id === fSelectedNodeId);
  const fSelectedElement = fElements.find(e => e.id === fSelectedElementId);
  const handleFrameNodeClick = (e, node) => {
    e.stopPropagation(); setFSelectedElementId(null);
    if (fSelectedNodeId === node.id) { setFSelectedNodeId(null); } 
    else if (fSelectedNodeId) {
      const isDup = fElements.some(el => (el.n1 === fSelectedNodeId && el.n2 === node.id) || (el.n1 === node.id && el.n2 === fSelectedNodeId));
      if (!isDup) { saveFrameState(); setFElements([...fElements, { id: Date.now(), n1: fSelectedNodeId, n2: node.id }]); }
      setFSelectedNodeId(node.id);
    } else { setFSelectedNodeId(node.id); }
  }
  const handleFrameElementClick = (e, el) => { e.stopPropagation(); setFSelectedNodeId(null); setFSelectedElementId(fSelectedElementId === el.id ? null : el.id); }
  const handleFrameCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) / PIXELS_PER_GRID) * PIXELS_PER_GRID;
    const y = Math.round((e.clientY - rect.top) / PIXELS_PER_GRID) * PIXELS_PER_GRID;
    const clickedExistingNode = fNodes.find(n => Math.abs(n.x - (e.clientX - rect.left)) < 20 && Math.abs(n.y - (e.clientY - rect.top)) < 20);
    if (clickedExistingNode) {
      if (fSelectedNodeId && fSelectedNodeId !== clickedExistingNode.id) {
        const isDup = fElements.some(el => (el.n1 === fSelectedNodeId && el.n2 === clickedExistingNode.id) || (el.n1 === clickedExistingNode.id && el.n2 === fSelectedNodeId));
        if (!isDup) { saveFrameState(); setFElements([...fElements, { id: Date.now(), n1: fSelectedNodeId, n2: clickedExistingNode.id }]); }
      }
      setFSelectedNodeId(clickedExistingNode.id); return;
    }
    const existingNode = fNodes.find(n => n.x === x && n.y === y);
    if (!existingNode) {
      saveFrameState(); setFSelectedElementId(null);
      const newNodeId = Date.now();
      const nodeName = fNodes.length < 26 ? String.fromCharCode(65 + fNodes.length) : `N${fNodes.length}`;
      setFNodes([...fNodes, { id: newNodeId, name: nodeName, x, y }]);
      if (fSelectedNodeId) setFElements([...fElements, { id: Date.now() + 1, n1: fSelectedNodeId, n2: newNodeId }]);
      setFSelectedNodeId(newNodeId);
    } else { setFSelectedNodeId(null); setFSelectedElementId(null); }
  }
  const handleFSupportTypeChange = (nodeId, type) => {
    saveFrameState();
    setFSupports(prev => {
      const ns = { ...prev };
      if (type === 'none' || type === 'free') delete ns[nodeId];
      else ns[nodeId] = { ...ns[nodeId], type, direction: ns[nodeId]?.direction || 'horizontal' };
      return ns;
    });
  }
  const handleFLoadChange = (nodeId, axis, value) => { saveFrameState(); setFLoads(prev => { const nl = { ...prev }; if (value === '') { if (nl[nodeId]) { delete nl[nodeId][axis]; if (Object.keys(nl[nodeId]).length === 0) delete nl[nodeId]; } } else { nl[nodeId] = { ...(nl[nodeId] || {}), [axis]: Number(value) }; } return nl; }); }
  const handleFDistLoadChange = (elId, axis, value) => { saveFrameState(); setFDistLoads(prev => { const nd = { ...prev }; if (value === '') { if (nd[elId]) { delete nd[elId][axis]; if (Object.keys(nd[elId]).length === 0) delete nd[elId]; } } else { nd[elId] = { ...(nd[elId] || {}), [axis]: Number(value) }; } return nd; }); }
  const handleElementPointLoadChange = (elId, field, value) => { saveFrameState(); setFPointLoadsOnElement(prev => { const np = { ...prev }; if (value === '') { if (np[elId]) { delete np[elId][field]; if (Object.keys(np[elId]).length === 0) delete np[elId]; } } else { np[elId] = { ...(np[elId] || {}), [field]: Number(value) }; } return np; }); }
  const clearFrameCanvas = () => { saveFrameState(); setFNodes([]); setFElements([]); setFSupports({}); setFLoads({}); setFDistLoads({}); setFPointLoadsOnElement({}); setFSelectedNodeId(null); setFSelectedElementId(null); setFrameLocalData({ steps: [], rxns: {}, analyzed: false }); }
  const loadFramePreset = (type) => {
    saveFrameState()
    if (type === 'portal') {
      setFNodes([{ id: 1, name: "A", x: 200, y: 350 }, { id: 2, name: "B", x: 200, y: 200 }, { id: 3, name: "C", x: 350, y: 200 }, { id: 4, name: "D", x: 350, y: 350 }]);
      setFElements([{ id: 11, n1: 1, n2: 2 }, { id: 12, n1: 2, n2: 3 }, { id: 13, n1: 3, n2: 4 }]);
      setFSupports({ 1: { type: "pin", direction: "horizontal" }, 4: { type: "roller", direction: "horizontal" } });
      setFDistLoads({ 12: { wy: 3 } });
    }
  }
  const runFrameStaticsAnalysis = async () => {
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 1500));
    try {
      setFrameLocalData({ steps: ["Frame analyzed successfully."], rxns: {}, analyzed: true });
    } catch (error) { alert("Error calculating Frame Reactions"); }
    finally { setIsAnalyzing(false); }
  }

  const inputStyle = { width: '80px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, marginLeft: '10px', fontFamily: '"Times New Roman", Times, serif', backgroundColor: '#2A2A2A', color: theme.textMain }

  return (
    <div className="app-bg" style={{ color: theme.textMain, fontFamily: '"Times New Roman", Times, serif' }}>
      
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none', zIndex: -1 }}>
        <defs>
          <marker id="arrowPoint" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.accent} /></marker>
          <marker id="arrowReaction" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.supportOrange} /></marker>
          <marker id="arrowUDL_Orange" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.udlOrange} /></marker>
        </defs>
      </svg>

      {isAnalyzing && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(18,18,18,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: '70px', height: '70px', border: `6px solid #333`, borderTop: `6px solid ${theme.supportOrange}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h1 style={{ marginTop: '25px', color: theme.textMain, letterSpacing: '6px', fontSize: '2.2rem', fontFamily: '"Times New Roman", Times, serif', fontWeight: 'bold' }}>CHU CALC</h1>
          <p style={{ color: '#aaa', fontStyle: 'italic', margin: '5px 0 0 0' }}>Analyzing Structural Mechanics...</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {showFormulaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#1E1E1E', color: '#E0E0E0', padding: '30px', borderRadius: '12px', maxWidth: '650px', width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Statics Formula Sheet</h2>
              <button onClick={() => setShowFormulaModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 'bold', color: '#fff' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#ccc' }}>
              <h4 style={{ margin: '10px 0 5px 0', color: '#fff' }}>1. Static Equilibrium Equations</h4>
              <p style={{ backgroundColor: '#2A2A2A', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', color: '#fff' }}>
                ∑Fx = 0 (Horizontal Force Equilibrium)<br/>
                ∑Fy = 0 (Vertical Force Equilibrium)<br/>
                ∑M_z = 0 (Moment Equilibrium about Any Point)
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        #root { max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; text-align: left !important; width: 100% !important; }
        body { margin: 0; padding: 0; background-color: ${theme.bg}; color: ${theme.textMain}; width: 100% !important; overflow-x: hidden; }
        .app-bg { background-color: ${theme.bg}; min-height: 100vh; padding: 20px 25px; width: 100%; box-sizing: border-box; }
        .report-document { width: 100% !important; max-width: none !important; margin: 0 0 40px 0 !important; background: ${theme.cardBg}; padding: 40px; box-sizing: border-box; box-shadow: 0 4px 20px rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #333; }
        select, input { background-color: #2A2A2A !important; color: #E0E0E0 !important; border: 1px solid #444 !important; }
      `}</style>

      {/* ======================= HOME VIEW ======================= */}
      {currentView === 'home' ? (
        <div style={{ width: '100%', maxWidth: '1300px', margin: '40px auto', textAlign: 'center', padding: '0 20px', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'inline-block', backgroundColor: 'rgba(0, 191, 255, 0.1)', color: '#00BFFF', padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', border: '1px solid rgba(0, 191, 255, 0.3)', marginBottom: '20px', letterSpacing: '1px' }}>
            ⚡ Interactive Structural Platform for Engineering Students
          </div>

          <h1 style={{ fontSize: '3rem', color: '#fff', marginBottom: '10px', letterSpacing: '1px' }}>CHU CALC</h1>
          <p style={{ fontSize: '1.2rem', color: '#aaa', marginBottom: '40px' }}>Select an Engineering Subject to Start Analysis</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '50px' }}>
            <div 
              onClick={() => setCurrentView('statics')}
              style={{ backgroundColor: '#1E1E1E', border: '1px solid #333', borderRadius: '12px', padding: '30px 20px', cursor: 'pointer', transition: '0.3s', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', textAlign: 'left' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#00BFFF'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#333'}
            >
              <h3 style={{ color: '#00BFFF', fontSize: '1.4rem', marginBottom: '10px' }}>1. Engineering Statics</h3>
              <p style={{ color: '#aaa', fontSize: '0.95rem' }}>Particle equilibrium, force vectors, beams, trusses, and frames.</p>
            </div>
            <div onClick={() => alert("Coming soon!")} style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '30px 20px', cursor: 'pointer', opacity: 0.7, textAlign: 'left' }}>
              <h3 style={{ color: '#888', fontSize: '1.4rem', marginBottom: '10px' }}>2. Mechanic of Materials</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>Stress, strain, and torsional deformation analysis.</p>
            </div>
            <div onClick={() => alert("Coming soon!")} style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '30px 20px', cursor: 'pointer', opacity: 0.7, textAlign: 'left' }}>
              <h3 style={{ color: '#888', fontSize: '1.4rem', marginBottom: '10px' }}>3. Theory of Structures</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>Indeterminate structures and energy methods.</p>
            </div>
            <div onClick={() => alert("Coming soon!")} style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '30px 20px', cursor: 'pointer', opacity: 0.7, textAlign: 'left' }}>
              <h3 style={{ color: '#888', fontSize: '1.4rem', marginBottom: '10px' }}>4. Structural Analysis</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>Matrix methods and finite element models.</p>
            </div>
          </div>
        </div>
      ) : (
        /* ======================= STATICS VIEW ======================= */
        <div style={{ width: '100%', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', width: '100%' }}>
            <button 
              onClick={() => setCurrentView('home')} 
              style={{ padding: '8px 16px', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', border: '1px solid #444', backgroundColor: '#1E1E1E', color: '#fff', position: 'relative', zIndex: 10 }}>
              ◀ Main Menu
            </button>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.8rem', letterSpacing: '2px', color: theme.textMain, margin: '0 0 5px 0' }}>Engineering Mechanics Statics</h2>
            </div>
            <button 
              onClick={() => setShowFormulaModal(true)} 
              style={{ padding: '8px 16px', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', border: '1px solid #555', backgroundColor: '#333', color: '#fff', position: 'relative', zIndex: 10 }}>
              📖 Formulas
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '25px', justifyContent: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 10, width: '100%' }}>
            <button onClick={() => setActiveTab('particle')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #444', backgroundColor: activeTab === 'particle' ? '#333' : '#1E1E1E', color: '#fff' }}>Particle Equilibrium</button>
            <button onClick={() => setActiveTab('vectors')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #444', backgroundColor: activeTab === 'vectors' ? '#333' : '#1E1E1E', color: '#fff' }}>Force Vectors</button>
            <button onClick={() => setActiveTab('beam')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #444', backgroundColor: activeTab === 'beam' ? '#333' : '#1E1E1E', color: '#fff' }}>Simple Beam</button>
            <button onClick={() => setActiveTab('truss')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #444', backgroundColor: activeTab === 'truss' ? '#333' : '#1E1E1E', color: '#fff' }}>Truss Builder</button>
            <button onClick={() => setActiveTab('frame')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #444', backgroundColor: activeTab === 'frame' ? '#333' : '#1E1E1E', color: '#fff' }}>Frame Reactions</button>
          </div>

          {/* ======================= TAB: PARTICLE EQUILIBRIUM (SPACE TELESCOPE & PIN SUPPORTS) ======================= */}
          {activeTab === 'particle' && (
            <div className="report-document">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Equilibrium of a Particle (Example 3.2 Style)</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#888' }}>Determine tension in cables supporting a suspended Space Telescope with horizontal pin supports.</p>
                </div>
              </div>

              {/* Workspace สำหรับแสดงภาพจำลองตามโจทย์ */}
              <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', flexWrap: 'wrap', justifyContent: 'center' }}>
                
                {/* รูปที่ 1: Problem Diagram (Pin แนวนอน + กล้องโทรทรรศน์อวกาศ) */}
                <div style={{ flex: 1, minWidth: '340px', backgroundColor: '#151515', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '15px', textAlign: 'center' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#00BFFF', fontSize: '1rem' }}>Problem Diagram: Suspension System</h4>
                  <svg viewBox="0 0 450 320" style={{ width: '100%', height: 'auto', backgroundColor: '#151515' }}>
                    <rect x="40" y="60" width="15" height="100" fill="#a07050" stroke="#555" />
                    <rect x="395" y="60" width="15" height="100" fill="#a07050" stroke="#555" />
                    <circle cx="55" cy="90" r="6" fill="#FFA500" stroke="#fff" strokeWidth="1.5" />
                    <text x="50" y="80" fill="#fff" fontSize="14" fontWeight="bold">C</text>
                    <circle cx="395" cy="90" r="6" fill="#FFA500" stroke="#fff" strokeWidth="1.5" />
                    <text x="395" y="80" fill="#fff" fontSize="14" fontWeight="bold">B</text>
                    
                    <circle cx="225" cy="180" r="6" fill="#00BFFF" stroke="#fff" strokeWidth="1.5" />
                    <text x="235" y="175" fill="#00BFFF" fontSize="14" fontWeight="bold">Joint</text>

                    <line x1="55" y1="90" x2="225" y2="180" stroke="#00BFFF" strokeWidth="3.5" />
                    <line x1="395" y1="90" x2="225" y2="180" stroke="#00BFFF" strokeWidth="3.5" />

                    <text x="110" y="125" fill="#FFA500" fontSize="13" fontWeight="bold">θ₁ = {pAngle1}°</text>
                    <text x="300" y="125" fill="#FFA500" fontSize="13" fontWeight="bold">θ₂ = {pAngle2}°</text>

                    <line x1="225" y1="180" x2="225" y2="230" stroke="#00BFFF" strokeWidth="3.5" />

                    <g transform="translate(195, 230)">
                      <rect x="0" y="0" width="60" height="50" rx="6" fill="#334155" stroke="#94a3b8" strokeWidth="2" />
                      <rect x="-30" y="10" width="25" height="30" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1" />
                      <rect x="65" y="10" width="25" height="30" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1" />
                      <line x1="-30" y1="25" x2="-5" y2="25" stroke="#94a3b8" strokeWidth="2" />
                      <line x1="65" y1="25" x2="90" y2="25" stroke="#94a3b8" strokeWidth="2" />
                      <circle cx="30" cy="50" r="10" fill="#0ea5e9" stroke="#fff" strokeWidth="1.5" />
                      <text x="12" y="32" fill="#fff" fontSize="12" fontWeight="bold">Telescope</text>
                    </g>
                    <text x="215" y="300" fill="#FFA500" fontSize="13" fontWeight="bold">Weight W = {pWeight} {particleUnit}</text>
                  </svg>
                </div>

                {/* รูปที่ 2: Free-Body Diagram (FBD) ของ Joint */}
                <div style={{ flex: 1, minWidth: '340px', backgroundColor: '#151515', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '15px', textAlign: 'center' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#FFA500', fontSize: '1rem' }}>Free-Body Diagram (Concurrent Forces at Joint)</h4>
                  <svg viewBox="0 0 450 320" style={{ width: '100%', height: 'auto', backgroundColor: '#151515' }}>
                    <line x1="225" y1="40" x2="225" y2="280" stroke="#666" strokeWidth="1.5" strokeDasharray="4,4" />
                    <text x="235" y="55" fill="#888" fontSize="14">y</text>
                    <line x1="60" y1="180" x2="390" y2="180" stroke="#666" strokeWidth="1.5" strokeDasharray="4,4" />
                    <text x="375" y="170" fill="#888" fontSize="14">x</text>
                    
                    <circle cx="225" cy="180" r="5" fill="#fff" />
                    <text x="200" y="195" fill="#fff" fontSize="13" fontWeight="bold">Joint</text>

                    <line x1="225" y1="180" x2="115" y2="90" stroke="#00BFFF" strokeWidth="3.5" markerEnd="url(#arrowPoint)" />
                    <text x="120" y="125" fill="#00BFFF" fontSize="14" fontWeight="bold">T₁</text>

                    <line x1="225" y1="180" x2="335" y2="90" stroke="#00BFFF" strokeWidth="3.5" markerEnd="url(#arrowPoint)" />
                    <text x="305" y="125" fill="#00BFFF" fontSize="14" fontWeight="bold">T₂</text>

                    <line x1="225" y1="180" x2="225" y2="260" stroke="#FFA500" strokeWidth="3.5" markerEnd="url(#arrowPoint)" />
                    <text x="235" y="230" fill="#FFA500" fontSize="13" fontWeight="bold">W = {pWeight} {particleUnit}</text>
                  </svg>
                </div>

              </div>

              {/* ส่วนปรับตั้งค่าตัวแปรอิสระ */}
              <div style={{ backgroundColor: '#1A1A1A', padding: '20px', borderRadius: '8px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: '#fff' }}>Custom Problem Inputs (Free Variable Setup)</h3>
                
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '5px' }}>Telescope Weight (W):</label>
                    <input type="number" value={pWeight} onChange={(e) => setPWeight(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '5px' }}>Cable Angle 1 (θ₁°):</label>
                    <input type="number" value={pAngle1} onChange={(e) => setPAngle1(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '5px' }}>Cable Angle 2 (θ₂°):</label>
                    <input type="number" value={pAngle2} onChange={(e) => setPAngle2(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '5px' }}>Unit:</label>
                    <select value={particleUnit} onChange={(e) => setParticleUnit(e.target.value)} style={{ padding: '8px', borderRadius: '6px' }}>
                      <option value="N">N</option><option value="kN">kN</option><option value="lb">lb</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                  <button onClick={analyzeSimpleParticle} style={{ padding: '14px 30px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '8px', cursor: 'pointer' }}>Calculate Equilibrium ($T_1$ & $T_2$)</button>
                </div>
              </div>

              {particleResult && (
                <div style={{ border: `1px solid ${theme.border}`, padding: '20px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}`, backgroundColor: '#1A1A1A' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '1.1rem' }}>Equilibrium Analysis Steps & Solution</h4>
                  <div style={{ backgroundColor: '#151515', padding: '15px', borderRadius: '6px', fontSize: '0.95rem', fontFamily: 'monospace', marginBottom: '15px', border: `1px solid ${theme.border}`, whiteSpace: 'pre-wrap', color: '#ccc' }}>
                    {particleResult.steps.map((step, idx) => (
                      <div key={idx} style={{ marginBottom: '8px' }}>{step}</div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '30px', fontSize: '1.1rem', color: '#fff', flexWrap: 'wrap' }}>
                    <span><strong>Tension T₁ (Left Cable):</strong> {particleResult.T1.toFixed(2)} {particleUnit}</span>
                    <span><strong>Tension T₂ (Right Cable):</strong> {particleResult.T2.toFixed(2)} {particleUnit}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================= TAB 2: FORCE VECTORS ======================= */}
          {activeTab === 'vectors' && (
            <div className="report-document">
               <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>2D Force System Analysis</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#888' }}>Project: Vector Addition & Equilibrium</p>
                </div>
              </div>
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#1A1A1A' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                   <h3 style={{ margin: '0', color: theme.textMain, fontSize: '1.1rem' }}>1. Force Vectors Visualization</h3>
                   <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                     <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Unit:</label>
                     <select value={vectorUnit} onChange={(e) => setVectorUnit(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', fontFamily: '"Times New Roman", Times, serif' }}>
                       <option value="N">N</option><option value="kN">kN</option><option value="kg">kg</option><option value="t">t</option>
                     </select>
                   </div>
                 </div>
                 <div style={{ width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center', backgroundColor: '#151515', border: `1px solid ${theme.border}`, borderRadius: '6px' }}>
                   <svg width="100%" height="400" viewBox="0 0 1000 600" style={{ display: 'block' }}>
                      <g opacity="0.3">
                         <line x1="500" y1="0" x2="500" y2="600" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
                         <line x1="0" y1="300" x2="1000" y2="300" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
                      </g>
                      <text x="960" y="320" fill="#fff" fontSize="16" fontWeight="bold">X</text>
                      <text x="515" y="30" fill="#fff" fontSize="16" fontWeight="bold">Y</text>
                      <circle cx="500" cy="300" r="5" fill="#fff" />
                      {(() => {
                          const cx = 500; const cy = 300;
                          const vMax = vectorResult ? Math.max(...vectorLoads.map(v=>v.magnitude), vectorResult.rMag) : Math.max(10, ...vectorLoads.map(v=>v.magnitude));
                          const scaleFactor = 220 / (vMax || 1); 
                          return (
                            <>
                              {vectorLoads.map((v, i) => {
                                 if (!v.magnitude) return null;
                                 const { drawRad, isOut } = getVectorComponents(v);
                                 const xOut = cx + v.magnitude * Math.cos(drawRad) * scaleFactor;
                                 const yOut = cy - v.magnitude * Math.sin(drawRad) * scaleFactor;
                                 const textOffX = xOut > cx ? 10 : -35;
                                 const textOffY = yOut > cy ? 20 : -10;
                                 return (
                                    <g key={v.id}>
                                      {isOut ? (
                                         <line x1={cx} y1={cy} x2={xOut} y2={yOut} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                                      ) : (
                                         <line x1={xOut} y1={yOut} x2={cx} y2={cy} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                                      )}
                                      <text x={xOut + textOffX} y={yOut + textOffY} fill={theme.accent} fontSize="14" fontWeight="bold">F{i+1}</text>
                                    </g>
                                 )
                              })}
                              {vectorResult && vectorResult.rMag > 0.01 && (
                                  <g>
                                    <line x1={cx} y1={cy} x2={cx + vectorResult.rMag * Math.cos(vectorResult.rAng * Math.PI / 180) * scaleFactor} y2={cy - vectorResult.rMag * Math.sin(vectorResult.rAng * Math.PI / 180) * scaleFactor} stroke={theme.supportOrange} strokeWidth="5" markerEnd="url(#arrowReaction)" />
                                    <text x={cx + vectorResult.rMag * Math.cos(vectorResult.rAng * Math.PI / 180) * scaleFactor + 15} y={cy - vectorResult.rMag * Math.sin(vectorResult.rAng * Math.PI / 180) * scaleFactor - 15} fill={theme.supportOrange} fontSize="16" fontWeight="bold">R = {vectorResult.rMag.toFixed(2)}</text>
                                  </g>
                              )}
                            </>
                          )
                      })()}
                   </svg>
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
                 <div style={{ flex: '1', backgroundColor: '#1A1A1A', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Force Inputs</h4>
                      <button onClick={addVectorLoad} style={{ backgroundColor: '#333', color: '#fff', border: '1px solid #555', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Force</button>
                    </div>
                    {vectorLoads.map((v, index) => (
                       <div key={v.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', paddingBottom: '10px', borderBottom: `1px dashed ${theme.border}`, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 'bold', width: '30px' }}>F{index + 1}:</span>
                          <label>Mag:</label>
                          <input type="number" value={v.magnitude} onChange={(e) => updateVectorLoad(v.id, 'magnitude', e.target.value)} style={{ width: '70px', padding: '6px', borderRadius: '4px' }} />
                          <label>Angle:</label>
                          <input type="number" value={v.angle} onChange={(e) => updateVectorLoad(v.id, 'angle', e.target.value)} style={{ width: '60px', padding: '6px', borderRadius: '4px' }} />
                          <select value={v.quadrant} onChange={(e) => updateVectorLoad(v.id, 'quadrant', parseInt(e.target.value))} style={{ padding: '6px', borderRadius: '4px' }}>
                              <option value={1}>Q1 (บนขวา)</option><option value={2}>Q2 (บนซ้าย)</option><option value={3}>Q3 (ล่างซ้าย)</option><option value={4}>Q4 (ล่างขวา)</option>
                          </select>
                          <select value={v.refAxis} onChange={(e) => updateVectorLoad(v.id, 'refAxis', e.target.value)} style={{ padding: '6px', borderRadius: '4px' }}>
                              <option value="x">เทียบแกน X</option><option value="y">เทียบแกน Y</option>
                          </select>
                          <select value={v.direction} onChange={(e) => updateVectorLoad(v.id, 'direction', e.target.value)} style={{ padding: '6px', borderRadius: '4px' }}>
                              <option value="out">พุ่งออก (Out)</option><option value="in">พุ่งเข้า (In)</option>
                          </select>
                          <button onClick={() => removeVectorLoad(v.id)} style={{ backgroundColor: '#2A2A2A', color: '#fff', border: '1px solid #555', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                       </div>
                    ))}
                 </div>
              </div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <button onClick={analyzeVectors} disabled={vectorLoads.length === 0} style={{ padding: '14px 30px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: vectorLoads.length === 0 ? '#444' : '#333', color: '#fff', border: '1px solid #555', borderRadius: '8px', cursor: vectorLoads.length === 0 ? 'not-allowed' : 'pointer' }}>Resolve Force Vectors</button>
              </div>
              {vectorResult && (
                 <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}`, backgroundColor: '#1A1A1A' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '1.1rem' }}>2. Vector Component Analysis (Calculation Steps)</h4>
                    <div style={{ backgroundColor: '#151515', padding: '15px', borderRadius: '6px', fontSize: '0.95rem', fontFamily: 'monospace', marginBottom: '15px', border: `1px solid ${theme.border}`, overflowX: 'auto' }}>
                       <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                         <thead>
                           <tr style={{ borderBottom: '2px solid #555' }}>
                             <th style={{ padding: '8px 4px' }}>Force</th>
                             <th style={{ padding: '8px 4px' }}>Fx ({vectorUnit})</th>
                             <th style={{ padding: '8px 4px' }}>Fy ({vectorUnit})</th>
                           </tr>
                         </thead>
                         <tbody>
                           {vectorResult.steps.map(s => (
                             <tr key={s.id} style={{ borderBottom: '1px solid #333' }}>
                                <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>{s.name}</td>
                                <td style={{ padding: '8px 4px' }}>{s.fx.toFixed(2)}</td>
                                <td style={{ padding: '8px 4px' }}>{s.fy.toFixed(2)}</td>
                             </tr>
                           ))}
                           <tr style={{ borderTop: '2px solid #555', backgroundColor: '#222' }}>
                              <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>SUM (Σ)</td>
                              <td style={{ padding: '8px 4px', fontWeight: 'bold', color: theme.accent }}>{vectorResult.sumFx.toFixed(2)}</td>
                              <td style={{ padding: '8px 4px', fontWeight: 'bold', color: theme.accent }}>{vectorResult.sumFy.toFixed(2)}</td>
                           </tr>
                         </tbody>
                       </table>
                    </div>
                    <div style={{ display: 'flex', gap: '30px', justifyContent: 'flex-start', marginBottom: '15px', color: '#fff', fontSize: '1.1rem' }}>
                        <span><strong>|R| (Resultant):</strong> {vectorResult.rMag.toFixed(2)} {vectorUnit}</span>
                        <span><strong>θ (Angle):</strong> {vectorResult.refAng.toFixed(2)}° <span style={{fontSize: '0.9rem', color: '#aaa'}}>({vectorResult.dirSymbol})</span></span>
                    </div>
                 </div>
              )}
            </div>
          )}

          {/* ======================= TAB 3: BEAM ======================= */}
          {activeTab === 'beam' && (
            <div className="report-document" id="report-container">
              <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Beam Analysis Report</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#888' }}>Project: CHU-CALC Static Evaluation</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '15px', backgroundColor: '#1A1A1A', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>Presets:</span>
                <button onClick={() => loadBeamPreset('simply-supported')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2A2A2A', color: '#fff', fontWeight: 'bold' }}>Simply Supported (Point Load)</button>
                <button onClick={() => loadBeamPreset('overhanging')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2A2A2A', color: '#fff', fontWeight: 'bold' }}>Overhanging Beam (UDL + Point)</button>
                <button onClick={() => loadBeamPreset('cantilever')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2A2A2A', color: '#fff', fontWeight: 'bold' }}>Cantilever Beam</button>
              </div>
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#1A1A1A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, color: theme.textMain, fontSize: '1.1rem' }}>1. Structural Beam Model & Loading</h3>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Unit:</label>
                    <select value={forceUnit} onChange={(e) => setForceUnit(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="N">N</option><option value="kN">kN</option><option value="kg">kg</option><option value="t">t</option>
                    </select>
                  </div>
                </div>
                <svg viewBox="0 0 1000 180" style={{ width: '100%', height: 'auto', backgroundColor: '#151515' }}>
                  <line x1="50" y1="140" x2="950" y2="140" stroke="#444" strokeWidth="1" strokeDasharray="5,5" />
                  <text x="500" y="165" textAnchor="middle" fill="#aaa" fontSize="14">L = {safeBeamLength} m</text>
                  <rect x="50" y="75" width="900" height="15" fill="#444" stroke="#666" strokeWidth="2" />
                  {beamSupports.map(sup => {
                    const label = getBeamNodeLabel(sup.id);
                    return (
                      <g key={sup.id}>
                        <text x={getSvgX(sup.x)} y="60" textAnchor="middle" fontSize="16" fill="#fff" fontWeight="bold">{label}</text>
                        <RenderSupportSVG cx={getSvgX(sup.x)} cy={90} type={sup.type} dir={sup.direction || 'horizontal'} />
                        <text x={getSvgX(sup.x)} y="132" textAnchor="middle" fontSize="13" fill="#aaa" fontWeight="bold">x={sup.x}</text>
                      </g>
                    )
                  })}
                  {beamLoads.map(load => {
                    if (load.type === 'point') {
                      return (
                        <g key={load.id}>
                          <line x1={getSvgX(load.x)} y1="20" x2={getSvgX(load.x)} y2="70" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                          <text x={getSvgX(load.x)} y="15" textAnchor="middle" fontSize="14" fill={theme.accent} fontWeight="bold">P = {load.magnitude} {forceUnit}</text>
                        </g>
                      )
                    } else if (load.type === 'moment') {
                      const mx = getSvgX(load.x);
                      const isCW = load.direction === 'cw';
                      return (
                        <g key={load.id}>
                          <path d={isCW ? `M ${mx-20} 40 A 20 20 0 0 1 ${mx+20} 40` : `M ${mx+20} 40 A 20 20 0 0 0 ${mx-20} 40`} fill="none" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                          <text x={mx} y="20" textAnchor="middle" fontSize="14" fill={theme.accent} fontWeight="bold">M = {load.magnitude} {forceUnit}.m</text>
                        </g>
                      )
                    } else {
                      return renderDistributedLoadArrows(getSvgX(load.start_x), 75, getSvgX(load.end_x), 75, 0, load.magnitude);
                    }
                  })}
                </svg>
              </div>
              {beamReactions.length > 0 && (
                <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#1A1A1A' }}>
                  <h3 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '1.1rem' }}>2. Free Body Diagram (FBD) & Reactions</h3>
                  <svg viewBox="0 0 1000 150" style={{ width: '100%', height: 'auto', backgroundColor: '#151515' }}>
                    <rect x="50" y="65" width="900" height="12" fill="#444" stroke="#666" strokeWidth="1.5" />
                    {beamSupports.map(sup => {
                      const rx = getSvgX(sup.x);
                      const foundRx = beamReactions.find(r => Math.abs(r.support_x - sup.x) < 0.01);
                      const forceVal = foundRx ? foundRx.force_kN : 0;
                      const label = getBeamNodeLabel(sup.id);
                      const textAnchorPos = rx > 850 ? rx - 35 : rx;
                      return (
                        <g key={`fbd-${sup.id}`}>
                          {sup.type !== 'free' && (
                            <>
                              <line x1={rx} y1={120} x2={rx} y2={80} stroke={theme.supportOrange} strokeWidth="2.5" markerEnd="url(#arrowReaction)" />
                              <text x={textAnchorPos} y="135" textAnchor="middle" fontSize="13" fill={theme.supportOrange} fontWeight="bold">R_{label} = {forceVal.toFixed(2)} {forceUnit}</text>
                            </>
                          )}
                          <RenderSupportSVG cx={rx} cy={80} type={sup.type} dir={sup.direction || 'horizontal'} />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
              {chartData.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginBottom: '15px', color: '#fff', fontSize: '0.95rem', fontFamily: 'monospace', fontWeight: 'bold' }}>
                     <span>|V| max = {maxAbsoluteShear.toFixed(2)} {forceUnit}</span>
                     <span>|M| max = {maxAbsoluteMoment.toFixed(2)} {forceUnit}.m</span>
                  </div>
                  <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#1A1A1A' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: theme.textMain }}>3. Shear Force Diagram (SFD)</h4>
                    <div className="print-chart-container" style={{ width: '100%', height: '250px' }}>
                      <ResponsiveContainer>
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                          <XAxis dataKey="x" ticks={optimizedTicks} domain={[0, safeBeamLength]} type="number" stroke="#888" />
                          <YAxis tickFormatter={formatYAxis} stroke="#888" />
                          <Tooltip contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} />
                          <Area type="stepAfter" dataKey="shear" stroke={theme.accent} strokeWidth={2} fill="#252525" fillOpacity={0.8} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#1A1A1A' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: theme.textMain }}>4. Bending Moment Diagram (BMD)</h4>
                    <div className="print-chart-container" style={{ width: '100%', height: '250px' }}>
                      <ResponsiveContainer>
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                          <XAxis dataKey="x" ticks={optimizedTicks} domain={[0, safeBeamLength]} type="number" stroke="#888" />
                          <YAxis tickFormatter={formatYAxis} stroke="#888" />
                          <Tooltip contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} />
                          <Area type="linear" dataKey="moment" stroke={theme.supportOrange} strokeWidth={2} fill="#252525" fillOpacity={0.8} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================= TAB 4: TRUSS BUILDER ======================= */}
          {activeTab === 'truss' && (
            <div className="report-document">
              <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Truss Analysis Report</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#888' }}>Project: CHU-CALC Advanced Framework Evaluation</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '15px', backgroundColor: '#1A1A1A', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>Presets:</span>
                <button onClick={() => loadTrussPreset('pratt')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2A2A2A', color: '#fff', fontWeight: 'bold' }}>Pratt Truss</button>
              </div>
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#1A1A1A' }}>
                <div style={{ width: '100%', overflow: 'auto', backgroundColor: '#151515', display: 'flex', justifyContent: 'center' }}>
                  <svg width="1400" height="600" onClick={handleTrussCanvasClick} style={{ cursor: 'crosshair', display: 'block', backgroundColor: '#151515' }}>
                    <defs>
                      <pattern id="gridT" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#2a2a2a" strokeWidth="1"/></pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#gridT)" />
                    {elements.map(el => {
                      const n1 = nodes.find(n => n.id === el.n1), n2 = nodes.find(n => n.id === el.n2);
                      if (!n1 || !n2) return null;
                      return <line key={el.id} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={theme.memberGray} strokeWidth="4" strokeLinecap="round" />
                    })}
                    {nodes.map(node => (
                      <g key={node.id} style={{ cursor: 'pointer' }}>
                        <circle cx={node.x} cy={node.y} r={35} fill="transparent" onClick={(e) => handleTrussNodeClick(e, node)} />
                        <circle cx={node.x} cy={node.y} r={selectedNodeId === node.id ? 9 : 6} fill={selectedNodeId === node.id ? theme.accent : "#222"} stroke="#fff" strokeWidth="2" style={{ pointerEvents: 'none' }} />
                        <text x={node.x + 10} y={node.y - 10} fill="#fff" fontSize="13" fontWeight="bold" style={{ pointerEvents: 'none' }}>{node.name}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* ======================= TAB 5: FRAME ANALYSIS ======================= */}
          {activeTab === 'frame' && (
            <div className="report-document">
              <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Frame Analysis: Engineering Statics</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#888' }}>Project: Equilibrium & Reactions Evaluation</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
