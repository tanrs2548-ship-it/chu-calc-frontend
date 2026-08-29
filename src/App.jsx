import { useState, useEffect } from 'react'
import axios from 'axios'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine } from 'recharts'
import './App.css'

// ==========================================
// GLOBAL HELPER FUNCTIONS
// ==========================================
const formatYAxis = (tickItem) => {
  if (tickItem === undefined || tickItem === null) return '0';
  return tickItem >= 10000 || tickItem <= -10000 ? (tickItem / 1000).toFixed(1) + 'k' : tickItem.toLocaleString();
};

const handlePrintPDF = () => { 
  window.print(); 
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
  const [activeTab, setActiveTab] = useState('vectors')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showFormulaModal, setShowFormulaModal] = useState(false)

  // Unit Converter State
  const [convVal, setConvVal] = useState(1)
  const [convType, setConvType] = useState('force')
  const [fromUnit, setFromUnit] = useState('kN')
  const [toUnit, setToUnit] = useState('N')

  const theme = {
    bg: '#FFFFFF',
    cardBg: '#FFFFFF',
    textMain: '#000000',
    primary: '#000000',       
    accent: '#00BFFF',        
    supportOrange: '#FFA500', 
    udlOrange: '#FFA500',
    border: '#E0E0E0',
    memberGray: '#000000',    
    lightGray: '#F9F9F9',
    disabledBg: '#F5F5F5',
    disabledText: '#A0A0A0'
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
      return <rect x={cx-6} y={cy-10} width="12" height="20" fill="none" stroke="#ccc" strokeDasharray="2,2" />;
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

  const handleConvert = () => {
    let multiplier = 1;
    if (convType === 'force') {
      const rates = { 'N': 1, 'kN': 1000, 'kgf': 9.80665, 'Ton': 9806.65 };
      multiplier = rates[fromUnit] / rates[toUnit];
    } else {
      const rates = { 'm': 1, 'cm': 0.01, 'mm': 0.001 };
      multiplier = rates[fromUnit] / rates[toUnit];
    }
    return (convVal * multiplier).toFixed(4);
  }

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
      let sumFx = 0;
      let sumFy = 0;
      const steps = [];

      vectorLoads.forEach((f, i) => {
        const { fx, fy, drawRad, isOut } = getVectorComponents(f);
        sumFx += fx;
        sumFy += fy;
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
  const [tabularResults, setTabularResults] = useState([])
  const [deflectionTable, setDeflectionTable] = useState([])
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
      setBeamSupports(lastState.supports)
      setBeamLoads(lastState.loads)
      setBeamHistory(beamHistory.slice(0, -1))
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
      setBeamLength(6)
      setBeamSupports([{ id: 1, type: "pin", x: 0, direction: "horizontal" }, { id: 2, type: "roller", x: 6, direction: "horizontal" }])
      setBeamLoads([{ id: 1, type: "point", magnitude: 10, x: 3 }])
    } else if (type === 'overhanging') {
      setBeamLength(8)
      setBeamSupports([{ id: 1, type: "pin", x: 0, direction: "horizontal" }, { id: 2, type: "roller", x: 6, direction: "horizontal" }])
      setBeamLoads([{ id: 1, type: "distributed", magnitude: 4, start_x: 0, end_x: 6 }, { id: 2, type: "point", magnitude: 8, x: 8 }])
    } else if (type === 'cantilever') {
      setBeamLength(4)
      setBeamSupports([{ id: 1, type: "fixed", x: 0, direction: "horizontal" }])
      setBeamLoads([{ id: 1, type: "distributed", magnitude: 5, start_x: 0, end_x: 4 }])
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
        ei: null,
        unit: forceUnit,
        analysis_type: "determinate"
      };
      
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze', payload);
      
      if (!response.data || !response.data.diagram_data || !response.data.diagram_data.x) {
         throw new Error("Invalid response from server");
      }

      const data = response.data.diagram_data;
      const formattedData = data.x.map((xValue, index) => {
        return { x: xValue, shear: data.shear[index], moment: data.moment[index], deflection: 0 };
      });

      setChartData(formattedData);
      setBeamReactions(response.data.reactions || []);
      setTabularResults(response.data.tabular_results || []);
      setBeamSteps(response.data.steps || []);
    } catch (error) {
      console.error("Analysis Error:", error);
      alert("Calculation Error! Please check your supports and loads to ensure stability.");
    } finally {
      setIsAnalyzing(false);
    }
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
      setNodes(lastState.nodes)
      setElements(lastState.elements)
      setTrussSupports(lastState.supports)
      setTrussLoads(lastState.loads)
      setSelectedNodeId(null)
      setTrussHistory(trussHistory.slice(0, -1))
    }
  }

  const snapToGrid = (value) => Math.round(value / PIXELS_PER_GRID) * PIXELS_PER_GRID
  
  const handleTrussNodeClick = (e, node) => {
    e.stopPropagation(); 
    if (selectedNodeId === node.id) { setSelectedNodeId(null);
    } else if (selectedNodeId) {
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
      if (value === '') {
        if (nl[nodeId]) { delete nl[nodeId][axis]; if (Object.keys(nl[nodeId]).length === 0) delete nl[nodeId]; }
      } else { nl[nodeId] = { ...(nl[nodeId] || {}), [axis]: Number(value) }; }
      return nl;
    });
  }

  const clearTrussCanvas = () => { saveTrussState(); setNodes([]); setElements([]); setTrussSupports({}); setTrussLoads({}); setSelectedNodeId(null); setTrussAnalysisResult(null); setTrussLocalData({ steps: [], rxns: {} }); }

  const calculateTrussDimensions = () => {
    if (!nodes || nodes.length === 0) return { totalWidth: 0, totalHeight: 0 };
    const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y)), maxY = Math.max(...nodes.map(n => n.y));
    return {
      totalWidth: ((maxX - minX) / PIXELS_PER_GRID) * gridScale,
      totalHeight: ((maxY - minY) / PIXELS_PER_GRID) * gridScale
    };
  };
  const trussDims = calculateTrussDimensions();

  const loadTrussPreset = (type) => {
    saveTrussState()
    if (type === 'pratt') {
      const pNodes = [
        { id: 1, name: "A", x: 200, y: 350 }, { id: 2, name: "B", x: 300, y: 350 }, { id: 3, name: "C", x: 400, y: 350 },
        { id: 4, name: "D", x: 400, y: 250 }, { id: 5, name: "E", x: 300, y: 250 }, { id: 6, name: "F", x: 200, y: 250 }
      ]
      const pElements = [
        { id: 101, n1: 1, n2: 2 }, { id: 102, n1: 2, n2: 3 }, { id: 103, n1: 6, n2: 5 }, { id: 104, n1: 5, n2: 4 },
        { id: 105, n1: 1, n2: 6 }, { id: 106, n1: 2, n2: 5 }, { id: 107, n1: 3, n2: 4 }, { id: 108, n1: 1, n2: 5 }, { id: 109, n1: 3, n2: 5 }
      ]
      setNodes(pNodes); setElements(pElements);
      setTrussSupports({ 1: { type: "pin", direction: "horizontal" }, 3: { type: "roller", direction: "horizontal" } });
      setTrussLoads({ 2: { fy: 15 } });
    } else if (type === 'warren') {
      const wNodes = [
        { id: 1, name: "A", x: 200, y: 350 }, { id: 2, name: "B", x: 350, y: 350 }, { id: 3, name: "C", x: 500, y: 350 },
        { id: 4, name: "D", x: 275, y: 220 }, { id: 5, name: "E", x: 425, y: 220 }
      ]
      const wElements = [
        { id: 201, n1: 1, n2: 2 }, { id: 202, n1: 2, n2: 3 }, { id: 203, n1: 4, n2: 5 },
        { id: 204, n1: 1, n2: 4 }, { id: 205, n1: 4, n2: 2 }, { id: 206, n1: 2, n2: 5 }, { id: 207, n1: 5, n2: 3 }
      ]
      setNodes(wNodes); setElements(wElements);
      setTrussSupports({ 1: { type: "pin", direction: "horizontal" }, 3: { type: "roller", direction: "horizontal" } });
      setTrussLoads({ 2: { fy: 20 } });
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
      if (onSeg.length === 0) { generated.push({ n1: Math.min(n1.id, n2.id), n2: Math.max(n1.id, n2.id) });
      } else {
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
      const tRxns = {}; const tSteps = [];
      tSteps.push("=== ENGINEERING STATICS : TRUSS REACTIONS ===");
      let sumFx = 0; let sumFy = 0;
      Object.entries(trussLoads).forEach(([id, f]) => { sumFx += Number(f.fx || 0); sumFy -= Number(f.fy || 0); });
      const sups = Object.entries(trussSupports);
      if(sups.length > 0) {
          const pivotId = sups[0][0]; const pivotNode = nodes.find(n => n.id == pivotId); let mPivot = 0;
          Object.entries(trussLoads).forEach(([id, f]) => {
              const n = nodes.find(x => x.id == id);
              const dx = (n.x - pivotNode.x)/PIXELS_PER_GRID * gridScale; const dy = -(n.y - pivotNode.y)/PIXELS_PER_GRID * gridScale;
              mPivot += (-Number(f.fy||0) * dx) - (Number(f.fx||0) * dy);
          });
          let unknowns = 0;
          sups.forEach(([id, data]) => {
              if(data.type==='pin') unknowns += 2; if(data.type==='roller') unknowns += 1; if(data.type==='fixed') unknowns += 3;
          });
          if (unknowns === 3 && sups.length === 2) {
              let pinId, rollerId;
              if(trussSupports[sups[0][0]].type === 'pin') { pinId = sups[0][0]; rollerId = sups[1][0]; }
              else { pinId = sups[1][0]; rollerId = sups[0][0]; }
              const pNode = nodes.find(n => n.id == pinId); const rNode = nodes.find(n => n.id == rollerId);
              let mPin = 0;
              Object.entries(trussLoads).forEach(([id, f]) => {
                  const n = nodes.find(x => x.id == id);
                  const dx = (n.x - pNode.x)/PIXELS_PER_GRID * gridScale; const dy = -(n.y - pNode.y)/PIXELS_PER_GRID * gridScale;
                  mPin += (-Number(f.fy||0) * dx) - (Number(f.fx||0) * dy);
              });
              const dxR = (rNode.x - pNode.x)/PIXELS_PER_GRID * gridScale; let r_roller_y = 0;
              if(Math.abs(dxR) > 0.001) r_roller_y = -mPin / dxR;
              const r_pin_y = -sumFy - r_roller_y; const r_pin_x = -sumFx;
              tRxns[pinId] = { fx: r_pin_x, fy: r_pin_y }; tRxns[rollerId] = { fx: 0, fy: r_roller_y };
              tSteps.push(`[Step 1] ∑Fx = 0 \n➔ R_${pNode.name}x + (${sumFx.toFixed(2)}) = 0 \n➔ R_${pNode.name}x = ${r_pin_x.toFixed(2)} ${trussUnit}`);
              tSteps.push(`\n[Step 2] ∑M_${pNode.name} = 0 \n➔ R_${rNode.name}y * (${dxR.toFixed(2)}) + (${mPin.toFixed(2)}) = 0 \n➔ R_${rNode.name}y = ${r_roller_y.toFixed(2)} ${trussUnit}`);
              tSteps.push(`\n[Step 3] ∑Fy = 0 \n➔ R_${pNode.name}y + R_${rNode.name}y + (${sumFy.toFixed(2)}) = 0 \n➔ R_${pNode.name}y = ${r_pin_y.toFixed(2)} ${trussUnit}`);
          } else {
              tSteps.push(`∑Fx(ext) = ${sumFx.toFixed(2)}, ∑Fy(ext) = ${sumFy.toFixed(2)} \nNote: Structure is statically indeterminate or has non-standard supports.`);
          }
      } else { tSteps.push("No supports defined."); }
      setTrussLocalData({ steps: tSteps, rxns: tRxns });

      const payload = {
        nodes: nodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y })),
        elements: cleanedElements.map(el => ({ id: el.id, n1: el.n1, n2: el.n2 })), 
        supports: trussSupports, loads: trussLoads, unit: trussUnit, ei: null
      };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze-truss', payload);
      if(!response.data) throw new Error("No Data from Server");
      setTrussAnalysisResult(response.data);
    } catch (error) {
      console.error("Truss Analysis Error:", error); 
      alert("Analysis Failed! Is your Truss unstable or unconstrained?");
    } finally { setIsAnalyzing(false); }
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
      setFNodes(last.fNodes)
      setFElements(last.fElements)
      setFSupports(last.fSupports)
      setFLoads(last.fLoads)
      setFDistLoads(last.fDistLoads)
      setFPointLoadsOnElement(last.fPointLoads)
      setFSelectedNodeId(null)
      setFSelectedElementId(null)
      setFrameHistory(frameHistory.slice(0, -1))
    }
  }

  const fSelectedNode = fNodes.find(n => n.id === fSelectedNodeId);
  const fSelectedElement = fElements.find(e => e.id === fSelectedElementId);

  const handleFrameNodeClick = (e, node) => {
    e.stopPropagation(); setFSelectedElementId(null);
    if (fSelectedNodeId === node.id) { setFSelectedNodeId(null);
    } else if (fSelectedNodeId) {
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
      const fNodesData = [
        { id: 1, name: "A", x: 200, y: 350 }, { id: 2, name: "B", x: 200, y: 200 },
        { id: 3, name: "C", x: 350, y: 200 }, { id: 4, name: "D", x: 350, y: 350 }
      ]
      const fElementsData = [
        { id: 11, n1: 1, n2: 2 }, { id: 12, n1: 2, n2: 3 }, { id: 13, n1: 3, n2: 4 }
      ]
      setFNodes(fNodesData); setFElements(fElementsData);
      setFSupports({ 1: { type: "pin", direction: "horizontal" }, 4: { type: "roller", direction: "horizontal" } })
      setFDistLoads({ 12: { wy: 3 } })
    }
  }

  const runFrameStaticsAnalysis = async () => {
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const fRxns = {}; const fSteps = []; fSteps.push("=== ENGINEERING STATICS : FRAME REACTIONS ===");
      let sumFx = 0; let sumFy = 0;
      const sups = Object.entries(fSupports);
      if(sups.length > 0) {
          const pivotId = sups[0][0]; const pivotNode = fNodes.find(n => n.id == pivotId); let mPivot = 0;
          Object.entries(fLoads).forEach(([id, f]) => {
              const n = fNodes.find(x => x.id == id);
              const fx = Number(f.fx||0); const fy = -Number(f.fy||0); const mz = Number(f.mz||0);
              sumFx += fx; sumFy += fy;
              const dx = (n.x - pivotNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(n.y - pivotNode.y)/PIXELS_PER_GRID * fGridScale;
              mPivot += (fy * dx) - (fx * dy) + mz;
          });
          Object.entries(fDistLoads).forEach(([elId, dist]) => {
              const el = fElements.find(e => e.id == elId); const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
              const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
              const wx = Number(dist.wx||0); const wy = -Number(dist.wy||0);
              const tfx = wx * L_m; const tfy = wy * L_m;
              sumFx += tfx; sumFy += tfy;
              const cx = (n1.x + n2.x)/2; const cy = (n1.y + n2.y)/2;
              const dx = (cx - pivotNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(cy - pivotNode.y)/PIXELS_PER_GRID * fGridScale;
              mPivot += (tfy * dx) - (tfx * dy);
          });
          Object.entries(fPointLoadsOnElement).forEach(([elId, pLoad]) => {
              const el = fElements.find(e => e.id == elId); const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
              const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
              const px = Number(pLoad.px||0); const py = -Number(pLoad.py||0);
              sumFx += px; sumFy += py;
              const ratio = L_m > 0 ? Number(pLoad.x||0) / L_m : 0;
              const lx = n1.x + (n2.x - n1.x)*ratio; const ly = n1.y + (n2.y - n1.y)*ratio;
              const dx = (lx - pivotNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(ly - pivotNode.y)/PIXELS_PER_GRID * fGridScale;
              mPivot += (py * dx) - (px * dy);
          });

          let unknowns = 0;
          sups.forEach(([id, data]) => { if(data.type==='pin') unknowns += 2; if(data.type==='roller') unknowns += 1; if(data.type==='fixed') unknowns += 3; });

          if (unknowns === 3 && sups.length === 2) {
              let pinId, rollerId;
              if(fSupports[sups[0][0]].type === 'pin') { pinId = sups[0][0]; rollerId = sups[1][0]; }
              else { pinId = sups[1][0]; rollerId = sups[0][0]; }
              const pNode = fNodes.find(n => n.id == pinId); const rNode = fNodes.find(n => n.id == rollerId);
              let mPin = mPivot; 
              if (pivotId !== pinId) {
                  mPin = 0;
                  Object.entries(fLoads).forEach(([id, f]) => {
                      const n = fNodes.find(x => x.id == id);
                      const fx = Number(f.fx||0); const fy = -Number(f.fy||0); const mz = Number(f.mz||0);
                      const dx = (n.x - pNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(n.y - pNode.y)/PIXELS_PER_GRID * fGridScale;
                      mPin += (fy * dx) - (fx * dy) + mz;
                  });
                  Object.entries(fDistLoads).forEach(([elId, dist]) => {
                      const el = fElements.find(e => e.id == elId); const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
                      const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
                      const tfx = Number(dist.wx||0) * L_m; const tfy = -Number(dist.wy||0) * L_m;
                      const cx = (n1.x + n2.x)/2; const cy = (n1.y + n2.y)/2;
                      const dx = (cx - pNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(cy - pNode.y)/PIXELS_PER_GRID * fGridScale;
                      mPin += (tfy * dx) - (tfx * dy);
                  });
                  Object.entries(fPointLoadsOnElement).forEach(([elId, pLoad]) => {
                      const el = fElements.find(e => e.id == elId); const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
                      const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
                      const px = Number(pLoad.px||0); const py = -Number(pLoad.py||0);
                      const ratio = L_m > 0 ? Number(pLoad.x||0) / L_m : 0;
                      const lx = n1.x + (n2.x - n1.x)*ratio; const ly = n1.y + (n2.y - n1.y)*ratio;
                      const dx = (lx - pNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(ly - pNode.y)/PIXELS_PER_GRID * fGridScale;
                      mPin += (py * dx) - (px * dy);
                  });
              }
              const dxR = (rNode.x - pNode.x)/PIXELS_PER_GRID * fGridScale; let r_roller_y = 0;
              if(Math.abs(dxR) > 0.001) r_roller_y = -mPin / dxR;
              const r_pin_y = -sumFy - r_roller_y; const r_pin_x = -sumFx;
              fRxns[pinId] = { fx: r_pin_x, fy: r_pin_y }; fRxns[rollerId] = { fx: 0, fy: r_roller_y };
              
              fSteps.push(`[Step 1] ∑Fx = 0 \n➔ R_${pNode.name}x + (${sumFx.toFixed(2)}) = 0 \n➔ R_${pNode.name}x = ${r_pin_x.toFixed(2)} ${fForceUnit}`);
              fSteps.push(`\n[Step 2] ∑M_${pNode.name} = 0 \n➔ R_${rNode.name}y * (${dxR.toFixed(2)}) + (${mPin.toFixed(2)}) = 0 \n➔ R_${rNode.name}y = ${r_roller_y.toFixed(2)} ${fForceUnit}`);
              fSteps.push(`\n[Step 3] ∑Fy = 0 \n➔ R_${pNode.name}y + R_${rNode.name}y + (${sumFy.toFixed(2)}) = 0 \n➔ R_${pNode.name}y = ${r_pin_y.toFixed(2)} ${fForceUnit}`);
          } else { fSteps.push(`∑Fx(ext) = ${sumFx.toFixed(2)}, ∑Fy(ext) = ${sumFy.toFixed(2)} \nNote: Structure is statically indeterminate.`); }
      } else { fSteps.push("No supports defined."); }
      setFrameLocalData({ steps: fSteps, rxns: fRxns, analyzed: true });
    } catch (error) {
      alert("Error calculating Frame Reactions");
    } finally { setIsAnalyzing(false); }
  }

  const inputStyle = { width: '80px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, marginLeft: '10px', fontFamily: '"Times New Roman", Times, serif', backgroundColor: '#fff', color: theme.textMain }

  // ==========================================
  // ENTER KEY LISTENER
  // ==========================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        if (currentView === 'statics') {
          if (activeTab === 'beam') analyzeBeam();
          else if (activeTab === 'truss' && nodes.length >= 3) runTrussAnalysis();
          else if (activeTab === 'frame' && fNodes.length >= 2) runFrameStaticsAnalysis();
          else if (activeTab === 'vectors' && vectorLoads.length > 0) analyzeVectors();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="app-bg" style={{ color: theme.textMain, fontFamily: '"Times New Roman", Times, serif' }}>
      
      {/* Global Marker Defs */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none', zIndex: -1 }}>
        <defs>
          <marker id="arrowPoint" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.accent} /></marker>
          <marker id="arrowReaction" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.supportOrange} /></marker>
          <marker id="arrowUDL_Orange" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.udlOrange} /></marker>
        </defs>
      </svg>

      {/* Loading Animation */}
      {isAnalyzing && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(255,255,255,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: '70px', height: '70px', border: `6px solid #f3f3f3`, borderTop: `6px solid ${theme.supportOrange}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h1 style={{ marginTop: '25px', color: theme.textMain, letterSpacing: '6px', fontSize: '2.2rem', fontFamily: '"Times New Roman", Times, serif', fontWeight: 'bold' }}>CHU CALC</h1>
          <p style={{ color: '#555', fontStyle: 'italic', margin: '5px 0 0 0' }}>Analyzing Structural Mechanics...</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Formula Sheet Modal */}
      {showFormulaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', maxWidth: '650px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Statics Formula Sheet</h2>
              <button onClick={() => setShowFormulaModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 'bold', color: '#000' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#000' }}>
              <h4 style={{ margin: '10px 0 5px 0' }}>1. Static Equilibrium Equations</h4>
              <p style={{ backgroundColor: theme.lightGray, padding: '10px', borderRadius: '6px', fontFamily: 'monospace' }}>
                ∑Fx = 0 (Horizontal Force Equilibrium)<br/>
                ∑Fy = 0 (Vertical Force Equilibrium)<br/>
                ∑M_z = 0 (Moment Equilibrium about Any Point)
              </p>
              <h4 style={{ margin: '15px 0 5px 0' }}>2. Beam Relations</h4>
              <p style={{ backgroundColor: theme.lightGray, padding: '10px', borderRadius: '6px', fontFamily: 'monospace' }}>
                dV/dx = -w(x)  (Slope of Shear Force Diagram = -Load)<br/>
                dM/dx = V(x)   (Slope of Bending Moment Diagram = Shear Force)<br/>
                ΔV = ∫ -w(x) dx<br/>
                ΔM = ∫ V(x) dx
              </p>
              <h4 style={{ margin: '15px 0 5px 0' }}>3. Zero-Force Member Rules (Trusses)</h4>
              <ul>
                <li>Two non-collinear members connect at an unloaded joint ➔ Both are Zero-Force members.</li>
                <li>Three members meet at a joint with two collinear and no external load ➔ The non-collinear member is Zero-Force.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <style>{`
        #root { max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; text-align: left !important; }
        body { margin: 0; padding: 0; background-color: ${theme.bg}; }
        .app-bg { background-color: ${theme.bg}; min-height: 100vh; padding: 35px 20px; }
        .report-document { width: 100%; max-width: 1600px; margin: 0 auto 40px auto; background: ${theme.cardBg}; padding: 40px; box-sizing: border-box; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border-radius: 8px; border: 1px solid #e0e0e0; }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body, html { background: #ffffff !important; padding: 0 !important; margin: 0 !important; -webkit-print-color-adjust: exact; }
          .app-bg { background-color: #ffffff !important; padding: 0 !important; min-height: auto !important; }
          .no-print { display: none !important; }
          .report-document { max-width: 100% !important; width: 100% !important; margin: 0 !important; padding: 0 !important; background: #ffffff !important; box-shadow: none !important; border: none !important; min-height: auto !important; }
          .avoid-break { page-break-inside: avoid !important; break-inside: avoid !important; margin-bottom: 20px !important; }
          .print-clean-border { border: none !important; padding: 0 !important; background: transparent !important; }
          .print-chart-container { height: 250px !important; }
          .print-expand { max-height: none !important; overflow: visible !important; background: transparent !important; }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* Top Header Navigation with Formula Button */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
          <button 
            onClick={() => { setCurrentView('home'); window.scrollTo(0,0); }} 
            style={{ padding: '8px 16px', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', border: '1px solid #000', backgroundColor: '#fff', color: '#000', position: 'relative', zIndex: 10 }}>
            ◀ Main Menu
          </button>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.8rem', letterSpacing: '2px', color: theme.textMain, margin: '0 0 5px 0' }}>Engineering Mechanics Statics</h2>
          </div>
          <button 
            onClick={() => setShowFormulaModal(true)} 
            style={{ padding: '8px 16px', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', border: '1px solid #000', backgroundColor: '#000', color: '#fff', position: 'relative', zIndex: 10 }}>
            📖 Formulas
          </button>
        </div>

        {/* Structure Selector Tabs */}
        <div className="no-print" style={{ display: 'flex', gap: '12px', marginBottom: '25px', justifyContent: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
          <button onClick={() => setActiveTab('vectors')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #000', backgroundColor: activeTab === 'vectors' ? '#000' : '#fff', color: activeTab === 'vectors' ? '#fff' : '#000' }}>Force Vectors</button>
          <button onClick={() => setActiveTab('beam')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #000', backgroundColor: activeTab === 'beam' ? '#000' : '#fff', color: activeTab === 'beam' ? '#fff' : '#000' }}>Simple Beam</button>
          <button onClick={() => setActiveTab('truss')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #000', backgroundColor: activeTab === 'truss' ? '#000' : '#fff', color: activeTab === 'truss' ? '#fff' : '#000' }}>Truss Builder</button>
          <button onClick={() => setActiveTab('frame')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #000', backgroundColor: activeTab === 'frame' ? '#000' : '#fff', color: activeTab === 'frame' ? '#fff' : '#000' }}>Frame Reactions</button>
        </div>

        {/* ======================= TAB 0: FORCE VECTORS ======================= */}
        {activeTab === 'vectors' && (
          <div className="report-document">
             <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>2D Force System Analysis</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#666' }}>Project: Vector Addition & Equilibrium</p>
              </div>
              <button onClick={handlePrintPDF} className="no-print" style={{ backgroundColor: theme.textMain, color: 'white', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>🖨️ Print A4 Report</button>
            </div>

            <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                 <h3 style={{ margin: '0', color: theme.textMain, fontSize: '1.1rem' }}>1. Force Vectors Visualization</h3>
                 <div className="no-print" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                   <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Unit:</label>
                   <select value={vectorUnit} onChange={(e) => setVectorUnit(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                     <option value="N">N</option><option value="kN">kN</option><option value="kg">kg</option><option value="t">t</option>
                   </select>
                 </div>
               </div>
               
               <div style={{ width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center', backgroundColor: '#fdfdfd', border: `1px solid ${theme.border}`, borderRadius: '6px' }}>
                 <svg width="100%" height="400" viewBox="0 0 1000 600" style={{ display: 'block' }}>
                    {/* Grid & Axes */}
                    <g opacity="0.3">
                       <line x1="500" y1="0" x2="500" y2="600" stroke="#000" strokeWidth="2" strokeDasharray="5,5" />
                       <line x1="0" y1="300" x2="1000" y2="300" stroke="#000" strokeWidth="2" strokeDasharray="5,5" />
                    </g>
                    <text x="960" y="320" fontSize="16" fontWeight="bold">X</text>
                    <text x="515" y="30" fontSize="16" fontWeight="bold">Y</text>
                    <circle cx="500" cy="300" r="5" fill="#000" />

                    {/* Scale Logic */}
                    {(() => {
                        const cx = 500; const cy = 300;
                        const vMax = vectorResult ? Math.max(...vectorLoads.map(v=>v.magnitude), vectorResult.rMag) : Math.max(10, ...vectorLoads.map(v=>v.magnitude));
                        const scaleFactor = 220 / (vMax || 1); 

                        return (
                          <>
                            {/* Input Vectors */}
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
                            
                            {/* Resultant Vector */}
                            {vectorResult && vectorResult.rMag > 0.01 && (
                                <g>
                                  <line 
                                    x1={cx} y1={cy} 
                                    x2={cx + vectorResult.rMag * Math.cos(vectorResult.rAng * Math.PI / 180) * scaleFactor} 
                                    y2={cy - vectorResult.rMag * Math.sin(vectorResult.rAng * Math.PI / 180) * scaleFactor} 
                                    stroke={theme.supportOrange} strokeWidth="5" markerEnd="url(#arrowReaction)" 
                                  />
                                  <text 
                                    x={cx + vectorResult.rMag * Math.cos(vectorResult.rAng * Math.PI / 180) * scaleFactor + 15} 
                                    y={cy - vectorResult.rMag * Math.sin(vectorResult.rAng * Math.PI / 180) * scaleFactor - 15} 
                                    fill={theme.supportOrange} fontSize="16" fontWeight="bold"
                                  >
                                    R = {vectorResult.rMag.toFixed(2)}
                                  </text>
                                </g>
                            )}
                          </>
                        )
                    })()}
                 </svg>
               </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
               <div style={{ flex: '1', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Force Inputs</h4>
                    <button onClick={addVectorLoad} style={{ backgroundColor: '#000', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Force</button>
                  </div>
                  
                  {vectorLoads.map((v, index) => (
                     <div key={v.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', paddingBottom: '10px', borderBottom: `1px dashed ${theme.border}`, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 'bold', width: '30px' }}>F{index + 1}:</span>
                        
                        <label>Mag:</label>
                        <input type="number" value={v.magnitude} onChange={(e) => updateVectorLoad(v.id, 'magnitude', e.target.value)} style={{ width: '70px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }} />
                        
                        <label>Angle:</label>
                        <input type="number" value={v.angle} onChange={(e) => updateVectorLoad(v.id, 'angle', e.target.value)} style={{ width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }} title="Angle in degrees (0-90)" />
                        
                        <select value={v.quadrant} onChange={(e) => updateVectorLoad(v.id, 'quadrant', parseInt(e.target.value))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}>
                           <option value={1}>Q1 (บนขวา)</option>
                           <option value={2}>Q2 (บนซ้าย)</option>
                           <option value={3}>Q3 (ล่างซ้าย)</option>
                           <option value={4}>Q4 (ล่างขวา)</option>
                        </select>

                        <select value={v.refAxis} onChange={(e) => updateVectorLoad(v.id, 'refAxis', e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}>
                           <option value="x">เทียบแกน X</option>
                           <option value="y">เทียบแกน Y</option>
                        </select>

                        <select value={v.direction} onChange={(e) => updateVectorLoad(v.id, 'direction', e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}>
                           <option value="out">พุ่งออก (Out)</option>
                           <option value="in">พุ่งเข้า (In)</option>
                        </select>

                        <button onClick={() => removeVectorLoad(v.id)} style={{ backgroundColor: '#fff', color: '#000', border: '1px solid #000', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                     </div>
                  ))}
               </div>
            </div>

            <div className="no-print" style={{ textAlign: 'center', marginBottom: '20px' }}>
              <button onClick={analyzeVectors} disabled={vectorLoads.length === 0} style={{ padding: '14px 30px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: vectorLoads.length === 0 ? '#ccc' : theme.textMain, color: '#fff', border: 'none', borderRadius: '8px', cursor: vectorLoads.length === 0 ? 'not-allowed' : 'pointer' }}>Resolve Force Vectors</button>
            </div>

            {vectorResult && (
               <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}` }}>
                  <h4 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '1.1rem' }}>2. Vector Component Analysis (Calculation Steps)</h4>
                  
                  <div style={{ backgroundColor: theme.lightGray, padding: '15px', borderRadius: '6px', fontSize: '0.95rem', fontFamily: 'monospace', marginBottom: '15px', border: `1px solid ${theme.border}`, overflowX: 'auto' }}>
                     <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                       <thead>
                         <tr style={{ borderBottom: '2px solid #000' }}>
                           <th style={{ padding: '8px 4px' }}>Force</th>
                           <th style={{ padding: '8px 4px' }}>Fx</th>
                           <th style={{ padding: '8px 4px' }}>Fy</th>
                         </tr>
                       </thead>
                       <tbody>
                         {vectorResult.steps.map(s => (
                           <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                             <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>{s.name}</td>
                             <td style={{ padding: '8px 4px' }}>{s.fx.toFixed(2)}</td>
                             <td style={{ padding: '8px 4px' }}>{s.fy.toFixed(2)}</td>
                           </tr>
                         ))}
                         <tr style={{ borderTop: '2px solid #000', backgroundColor: '#f0f0f0' }}>
                           <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>SUM (Σ)</td>
                           <td style={{ padding: '8px 4px', fontWeight: 'bold', color: theme.accent }}>{vectorResult.sumFx.toFixed(2)}</td>
                           <td style={{ padding: '8px 4px', fontWeight: 'bold', color: theme.accent }}>{vectorResult.sumFy.toFixed(2)}</td>
                         </tr>
                       </tbody>
                     </table>
                  </div>

                  <div style={{ display: 'flex', gap: '30px', justifyContent: 'flex-start', marginBottom: '15px', color: '#000', fontSize: '1.1rem' }}>
                     <span><strong>|R| (Resultant):</strong> {vectorResult.rMag.toFixed(2)} {vectorUnit}</span>
                     <span><strong>θ (Angle):</strong> {vectorResult.refAng.toFixed(2)}° <span style={{fontSize: '0.9rem', color: '#555'}}>({vectorResult.dirSymbol})</span></span>
                  </div>
               </div>
            )}
          </div>
        )}

        {/* ======================= TAB 1: BEAM ======================= */}
        {activeTab === 'beam' && (
          <div className="report-document" id="report-container">
            <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Beam Analysis Report</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#666' }}>Project: CHU-CALC Static Evaluation</p>
              </div>
              <button onClick={handlePrintPDF} className="no-print" style={{ backgroundColor: theme.textMain, color: 'white', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>🖨️ Print A4 Report</button>
            </div>

            {/* Presets Bar */}
            <div className="no-print" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '15px', backgroundColor: theme.lightGray, padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#000' }}>Presets:</span>
              <button onClick={() => loadBeamPreset('simply-supported')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #000', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>Simply Supported (Point Load)</button>
              <button onClick={() => loadBeamPreset('overhanging')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #000', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>Overhanging Beam (UDL + Point)</button>
              <button onClick={() => loadBeamPreset('cantilever')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #000', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>Cantilever Beam</button>
            </div>

            <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: theme.textMain, fontSize: '1.1rem' }}>1. Structural Beam Model & Loading</h3>
                <div className="no-print" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Unit:</label>
                  <select value={forceUnit} onChange={(e) => setForceUnit(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                    <option value="N">N</option><option value="kN">kN</option><option value="kg">kg</option><option value="t">t</option>
                  </select>
                </div>
              </div>
              <svg viewBox="0 0 1000 180" style={{ width: '100%', height: 'auto', backgroundColor: '#fff' }}>
                <line x1="50" y1="140" x2="950" y2="140" stroke={theme.border} strokeWidth="1" strokeDasharray="5,5" />
                <text x="500" y="165" textAnchor="middle" fill={theme.textMain} fontSize="14">L = {safeBeamLength} m</text>
                <rect x="50" y="75" width="900" height="15" fill="#EEEEEE" stroke={theme.textMain} strokeWidth="2" />
                
                {beamSupports.map(sup => {
                  const label = getBeamNodeLabel(sup.id);
                  return (
                    <g key={sup.id}>
                      <text x={getSvgX(sup.x)} y="60" textAnchor="middle" fontSize="16" fill={theme.textMain} fontWeight="bold">{label}</text>
                      <RenderSupportSVG cx={getSvgX(sup.x)} cy={90} type={sup.type} dir={sup.direction || 'horizontal'} />
                      <text x={getSvgX(sup.x)} y="132" textAnchor="middle" fontSize="13" fill={theme.textMain} fontWeight="bold">x={sup.x}</text>
                    </g>
                  )
                })}
                
                {beamLoads.map(load => {
                  if (load.type === 'point') {
                    return (
                      <g key={load.id}>
                        <line x1={getSvgX(load.x)} y1="20" x2={getSvgX(load.x)} y2="70" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                        <text x={getSvgX(load.x)} y="15" textAnchor="middle" fontSize="14" fill={theme.textMain} fontWeight="bold">P = {load.magnitude} {forceUnit}</text>
                      </g>
                    )
                  } else if (load.type === 'moment') {
                    const mx = getSvgX(load.x);
                    const isCW = load.direction === 'cw';
                    return (
                      <g key={load.id}>
                        <path d={isCW ? `M ${mx-20} 40 A 20 20 0 0 1 ${mx+20} 40` : `M ${mx+20} 40 A 20 20 0 0 0 ${mx-20} 40`} fill="none" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                        <text x={mx} y="20" textAnchor="middle" fontSize="14" fill={theme.textMain} fontWeight="bold">M = {load.magnitude} {forceUnit}.m</text>
                      </g>
                    )
                  } else {
                    return renderDistributedLoadArrows(getSvgX(load.start_x), 75, getSvgX(load.end_x), 75, 0, load.magnitude);
                  }
                })}
              </svg>
            </div>

            {beamReactions.length > 0 && (
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
                <h3 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '1.1rem' }}>2. Free Body Diagram (FBD) & Reactions</h3>
                <svg viewBox="0 0 1000 150" style={{ width: '100%', height: 'auto', backgroundColor: '#fff' }}>
                  <rect x="50" y="65" width="900" height="12" fill="#EEEEEE" stroke={theme.textMain} strokeWidth="1.5" />
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
                            <text x={textAnchorPos} y="135" textAnchor="middle" fontSize="13" fill={theme.textMain} fontWeight="bold">R_{label} = {forceVal.toFixed(2)} {forceUnit}</text>
                          </>
                        )}
                        <RenderSupportSVG cx={rx} cy={80} type={sup.type} dir={sup.direction || 'horizontal'} />
                      </g>
                    );
                  })}
                  
                  {beamLoads.map(load => {
                    if (load.type === 'point') {
                      return (
                        <g key={`fbd-load-${load.id}`}>
                          <line x1={getSvgX(load.x)} y1="15" x2={getSvgX(load.x)} y2="60" stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                          <text x={getSvgX(load.x)} y="10" textAnchor="middle" fontSize="12" fill={theme.textMain} fontWeight="bold">{load.magnitude} {forceUnit}</text>
                        </g>
                      );
                    } else if (load.type === 'moment') {
                      const mx = getSvgX(load.x);
                      const isCW = load.direction === 'cw';
                      return (
                        <g key={`fbd-load-${load.id}`}>
                          <path d={isCW ? `M ${mx-20} 30 A 20 20 0 0 1 ${mx+20} 30` : `M ${mx+20} 30 A 20 20 0 0 0 ${mx-20} 30`} fill="none" stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                          <text x={mx} y="15" textAnchor="middle" fontSize="12" fill={theme.textMain} fontWeight="bold">{load.magnitude} {forceUnit}.m</text>
                        </g>
                      );
                    } else if (load.type === 'distributed') {
                       return renderDistributedLoadArrows(getSvgX(load.start_x), 65, getSvgX(load.end_x), 65, 0, load.magnitude);
                    }
                    return null;
                  })}
                </svg>
              </div>
            )}

            {chartData.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                
                {/* Max Absolute Values (Plain text format) */}
                <div className="no-print" style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginBottom: '15px', color: '#000', fontSize: '1.1rem' }}>
                   <span><strong>|V| max:</strong> {maxAbsoluteShear.toFixed(2)} {forceUnit}</span>
                   <span><strong>|M| max:</strong> {maxAbsoluteMoment.toFixed(2)} {forceUnit}.m</span>
                </div>

                <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: theme.textMain }}>3. Shear Force Diagram (SFD)</h4>
                  <div className="print-chart-container" style={{ width: '100%', height: '250px' }}>
                    <ResponsiveContainer>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                        <XAxis dataKey="x" ticks={optimizedTicks} domain={[0, safeBeamLength]} type="number" />
                        <YAxis tickFormatter={formatYAxis} />
                        <Tooltip />
                        <Area type="stepAfter" dataKey="shear" stroke={theme.textMain} strokeWidth={2} fill={theme.lightGray} fillOpacity={0.8} />
                        {shearExtremes.max && (
                          <ReferenceDot x={shearExtremes.max.x} y={shearExtremes.max.shear} r={4} fill="#000" stroke="#fff" label={{ value: 'Max: ' + shearExtremes.max.shear.toFixed(2), position: 'top', fill: '#000', fontSize: 12, fontWeight: 'bold' }} />
                        )}
                        {shearExtremes.min && shearExtremes.min.shear !== shearExtremes.max?.shear && (
                          <ReferenceDot x={shearExtremes.min.x} y={shearExtremes.min.shear} r={4} fill="#000" stroke="#fff" label={{ value: 'Min: ' + shearExtremes.min.shear.toFixed(2), position: 'bottom', fill: '#000', fontSize: 12, fontWeight: 'bold' }} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: theme.textMain }}>4. Bending Moment Diagram (BMD)</h4>
                  <div className="print-chart-container" style={{ width: '100%', height: '250px' }}>
                    <ResponsiveContainer>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                        <XAxis dataKey="x" ticks={optimizedTicks} domain={[0, safeBeamLength]} type="number" />
                        <YAxis tickFormatter={formatYAxis} />
                        <Tooltip />
                        <Area type="linear" dataKey="moment" stroke={theme.textMain} strokeWidth={2} fill={theme.lightGray} fillOpacity={0.8} />
                        {momentExtremes.max && (
                          <ReferenceDot x={momentExtremes.max.x} y={momentExtremes.max.moment} r={4} fill="#000" stroke="#fff" label={{ value: 'Max: ' + momentExtremes.max.moment.toFixed(2), position: 'top', fill: '#000', fontSize: 12, fontWeight: 'bold' }} />
                        )}
                        {momentExtremes.min && momentExtremes.min.moment !== momentExtremes.max?.moment && (
                          <ReferenceDot x={momentExtremes.min.x} y={momentExtremes.min.moment} r={4} fill="#000" stroke="#fff" label={{ value: 'Min: ' + momentExtremes.min.moment.toFixed(2), position: 'bottom', fill: '#000', fontSize: 12, fontWeight: 'bold' }} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}` }}>
                  <h4 style={{ margin: '0 0 8px 0', color: theme.textMain }}>Equilibrium Reactions & Calculations</h4>
                  <div className="print-expand" style={{ backgroundColor: theme.lightGray, padding: '10px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', maxHeight: '150px', overflowY: 'auto', border: `1px solid ${theme.border}`, whiteSpace: 'pre-wrap' }}>
                    {beamSteps.map((step, i) => <div key={i} style={{ marginBottom: '4px' }}>{step}</div>)}
                  </div>
                </div>
              </div>
            )}

            <div className="no-print" style={{ display: 'flex', gap: '15px', marginTop: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1.3', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>Beam Length & Supports</h4>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleUndoBeam} disabled={beamHistory.length === 0} style={{ backgroundColor: '#FFFFFF', color: '#000000', border: '1px solid #000000', padding: '4px 10px', borderRadius: '4px', cursor: beamHistory.length===0?'not-allowed':'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>Undo</button>
                    <button onClick={addBeamSupport} style={{ backgroundColor: '#000', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>+ Support</button>
                  </div>
                </div>
                <div style={{ marginBottom: '10px' }}><label>Length (m): </label><input type="number" value={beamLength} onChange={(e) => setBeamLength(e.target.value)} style={inputStyle} /></div>
                
                {beamSupports.map(sup => (
                  <div key={sup.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: `1px dashed ${theme.border}` }}>
                    <select value={sup.type} onChange={(e) => updateBeamSupport(sup.id, 'type', e.target.value)} style={{ padding: '4px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="pin">Pin</option><option value="roller">Roller</option><option value="fixed">Fixed</option><option value="free">Free</option>
                    </select>
                    <select value={sup.direction || 'horizontal'} onChange={(e) => updateBeamSupport(sup.id, 'direction', e.target.value)} style={{ padding: '4px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="horizontal">Horz ➖</option><option value="vertical">Vert ⏐</option>
                    </select>
                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>x (m):</label>
                    <input type="number" value={sup.x} onChange={(e) => updateBeamSupport(sup.id, 'x', Number(e.target.value))} style={{ width: '60px', padding: '4px', borderRadius: '4px', border: `1px solid ${theme.border}` }} />
                    <button onClick={() => removeBeamSupport(sup.id)} style={{ backgroundColor: '#fff', color: '#000', border: '1px solid #000', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Del</button>
                  </div>
                ))}
              </div>

              <div style={{ flex: '1.4', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>Load Configuration</h4>
                  <div>
                    <button onClick={addBeamMomentLoad} style={{ backgroundColor: '#fff', color: '#000', border: '1px solid #000', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', marginRight: '4px' }}>+ Moment</button>
                    <button onClick={addBeamPointLoad} style={{ backgroundColor: '#000', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', marginRight: '4px' }}>+ Point</button>
                    <button onClick={addBeamDistLoad} style={{ backgroundColor: theme.textMain, color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>+ UDL</button>
                  </div>
                </div>
                {beamLoads.map(load => (
                  <div key={load.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: `1px dashed ${theme.border}`, fontSize: '0.85rem' }}>
                    {load.type === 'point' ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: theme.textMain }}>Point</span>
                        <label>P:</label><input type="number" value={load.magnitude} onChange={(e) => updateBeamLoad(load.id, 'magnitude', Number(e.target.value))} style={{ width: '60px', padding: '2px' }} />
                        <label>x:</label><input type="number" value={load.x} onChange={(e) => updateBeamLoad(load.id, 'x', Number(e.target.value))} style={{ width: '60px', padding: '2px' }} />
                        <button onClick={() => removeBeamLoad(load.id)} style={{ backgroundColor: '#fff', color: '#000', border: '1px solid #000', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : load.type === 'moment' ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: theme.textMain }}>Moment</span>
                        <label>M:</label><input type="number" value={load.magnitude} onChange={(e) => updateBeamLoad(load.id, 'magnitude', Number(e.target.value))} style={{ width: '60px', padding: '2px' }} />
                        <select value={load.direction || 'cw'} onChange={(e) => updateBeamLoad(load.id, 'direction', e.target.value)} style={{ padding: '2px', fontFamily: '"Times New Roman", Times, serif' }}>
                          <option value="cw">CW ↻</option>
                          <option value="ccw">CCW ↺</option>
                        </select>
                        <label>x:</label><input type="number" value={load.x} onChange={(e) => updateBeamLoad(load.id, 'x', Number(e.target.value))} style={{ width: '60px', padding: '2px' }} />
                        <button onClick={() => removeBeamLoad(load.id)} style={{ backgroundColor: '#fff', color: '#000', border: '1px solid #000', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 'bold', color: theme.textMain }}>UDL</span>
                        <label>w:</label><input type="number" value={load.magnitude} onChange={(e) => updateBeamLoad(load.id, 'magnitude', Number(e.target.value))} style={{ width: '50px', padding: '2px' }} />
                        <label>Start:</label><input type="number" value={load.start_x} onChange={(e) => updateBeamLoad(load.id, 'start_x', Number(e.target.value))} style={{ width: '50px', padding: '2px' }} />
                        <label>End:</label><input type="number" value={load.end_x} onChange={(e) => updateBeamLoad(load.id, 'end_x', Number(e.target.value))} style={{ width: '50px', padding: '2px' }} />
                        <button onClick={() => removeBeamLoad(load.id)} style={{ backgroundColor: '#fff', color: '#000', border: '1px solid #000', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button onClick={analyzeBeam} style={{ padding: '14px 24px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: theme.textMain, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Analyze Beam</button>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB 2: TRUSS BUILDER ======================= */}
        {activeTab === 'truss' && (
          <div className="report-document">
            <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Truss Analysis Report</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#666' }}>Project: CHU-CALC Advanced Framework Evaluation</p>
              </div>
              <button onClick={handlePrintPDF} className="no-print" style={{ backgroundColor: theme.textMain, color: 'white', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>🖨️ Print A4 Report</button>
            </div>

            {/* Truss Presets */}
            <div className="no-print" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '15px', backgroundColor: theme.lightGray, padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#000' }}>Presets:</span>
              <button onClick={() => loadTrussPreset('pratt')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #000', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>Pratt Truss</button>
              <button onClick={() => loadTrussPreset('warren')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #000', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>Warren Truss</button>
            </div>

            <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' }}>
              <div className="no-print" style={{ padding: '10px 15px', backgroundColor: theme.lightGray, borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleUndoTruss} disabled={trussHistory.length === 0} style={{ padding: '4px 10px', fontSize: '0.85rem', fontWeight: 'bold', cursor: trussHistory.length===0?'not-allowed':'pointer', backgroundColor: '#FFFFFF', color: '#000000', border: '1px solid #000000', borderRadius: '4px' }}>Undo</button>
                  <button onClick={clearTrussCanvas} style={{ padding: '4px 10px', fontSize: '0.85rem', backgroundColor: '#fff', color: '#000', border: '1px solid #000', borderRadius: '4px', fontWeight: 'bold' }}>Clear</button>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Grid: 
                    <select value={gridScale} onChange={(e) => setGridScale(Number(e.target.value))} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0].map(v => <option key={v} value={v}>{v.toFixed(1)}m</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Unit: 
                    <select value={trussUnit} onChange={(e) => setTrussUnit(e.target.value)} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="N">N</option><option value="kN">kN</option><option value="Ton">Ton</option>
                    </select>
                  </label>
                </div>
              </div>

              <div style={{ width: '100%', overflow: 'auto', backgroundColor: '#fff', display: 'flex', justifyContent: 'center' }}>
                <svg width="1400" height="600" onClick={handleTrussCanvasClick} style={{ cursor: 'crosshair', display: 'block', backgroundColor: '#fff' }}>
                  <defs>
                    <pattern id="gridT" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#e0e0e0" strokeWidth="1"/></pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#gridT)" />
                  {renderDimensions(nodes, gridScale)}
                  {elements.map(el => {
                    const n1 = nodes.find(n => n.id === el.n1), n2 = nodes.find(n => n.id === el.n2);
                    if (!n1 || !n2) return null;
                    return <line key={el.id} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={theme.memberGray} strokeWidth="4" strokeLinecap="round" />
                  })}
                  {Object.entries(trussSupports).map(([nId, supData]) => {
                    const node = nodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                    return (
                      <g key={`sup-${nId}`}>
                        <RenderSupportSVG cx={node.x} cy={node.y} type={supData.type} dir={supData.direction || 'horizontal'} />
                      </g>
                    )
                  })}
                  {Object.entries(trussLoads).map(([nId, force]) => {
                    const node = nodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                    return (
                      <g key={`load-${nId}`}>
                        {Number(force.fy) !== 0 && force.fy !== undefined && (
                          <>
                            <line x1={node.x} y1={force.fy > 0 ? node.y - 50 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 50} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                            <text x={node.x + 12} y={node.y - 25} fill={theme.textMain} fontSize="13" fontWeight="bold">{force.fy} {trussUnit}</text>
                          </>
                        )}
                        {Number(force.fx) !== 0 && force.fx !== undefined && (
                          <>
                            <line x1={force.fx > 0 ? node.x - 50 : node.x + 10} y1={node.y} x2={force.fx > 0 ? node.x - 10 : node.x + 50} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                            <text x={node.x - 20} y={node.y - 15} fill={theme.textMain} fontSize="13" fontWeight="bold">{force.fx} {trussUnit}</text>
                          </>
                        )}
                      </g>
                    )
                  })}
                  {nodes.map(node => (
                    <g key={node.id} style={{ cursor: 'pointer' }}>
                      <circle cx={node.x} cy={node.y} r={35} fill="transparent" onClick={(e) => handleTrussNodeClick(e, node)} />
                      <circle cx={node.x} cy={node.y} r={selectedNodeId === node.id ? 9 : 6} fill={selectedNodeId === node.id ? theme.accent : "#fff"} stroke="#000" strokeWidth="2" style={{ pointerEvents: 'none' }} />
                      <text x={node.x + 10} y={node.y - 10} fill={theme.textMain} fontSize="13" fontWeight="bold" style={{ pointerEvents: 'none' }}>{node.name}</text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {nodes.length > 0 && (
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
                <h3 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '1.1rem' }}>2. Free Body Diagram (FBD) & Reactions</h3>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center', backgroundColor: '#fff', overflow: 'auto' }}>
                  
                  <svg width="1400" height="600" style={{ display: 'block', backgroundColor: '#fff' }}>
                    <defs>
                      <pattern id="gridT_FBD" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#e0e0e0" strokeWidth="1"/></pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#gridT_FBD)" />
                    
                    {elements.map(el => {
                      const n1 = nodes.find(n => n.id === el.n1), n2 = nodes.find(n => n.id === el.n2);
                      if (!n1 || !n2) return null;
                      
                      // Zero-Force Member Visual Check
                      const memberName1 = `${n1.name}${n2.name}`;
                      const memberName2 = `${n2.name}${n1.name}`;
                      const resMember = trussAnalysisResult?.members?.find(m => m.name === memberName1 || m.name === memberName2);
                      const isZeroForce = resMember && resMember.status === "Zero-Force";

                      return (
                        <g key={`t-fbd-el-${el.id}`}>
                          <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={isZeroForce ? '#AAAAAA' : theme.memberGray} strokeWidth={isZeroForce ? "2.5" : "3.5"} strokeDasharray={isZeroForce ? "4,4" : "none"} strokeLinecap="round" />
                          {isZeroForce && (
                            <text x={(n1.x + n2.x)/2} y={(n1.y + n2.y)/2 - 8} fill="#888888" fontSize="11" fontWeight="bold" textAnchor="middle">0-Force</text>
                          )}
                        </g>
                      );
                    })}
                    {Object.entries(trussSupports).map(([nId, supData]) => {
                      const node = nodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                      const rxn = trussLocalData.rxns[node.id];
                      const hasRun = Object.keys(trussLocalData.rxns).length > 0;
                      const fyText = hasRun ? (rxn ? Math.abs(rxn.fy).toFixed(2) : "0.00") : `R_${node.name}y`;
                      const fxText = hasRun ? (rxn ? Math.abs(rxn.fx).toFixed(2) : "0.00") : `R_${node.name}x`;
                      const isFyPos = hasRun ? (rxn && rxn.fy >= 0) : true;
                      const isFxPos = hasRun ? (rxn && rxn.fx >= 0) : true;

                      return (
                        <g key={`t-fbd-sup-${nId}`}>
                          {supData.type !== 'free' && (
                            <>
                              <line x1={node.x} y1={isFyPos ? node.y + 45 : node.y - 45} x2={node.x} y2={isFyPos ? node.y + 10 : node.y - 10} stroke={theme.supportOrange} strokeWidth="2.5" markerEnd="url(#arrowReaction)" />
                              <text x={node.x + 12} y={isFyPos ? node.y + 30 : node.y - 30} fontSize="12" fill={theme.textMain} fontWeight="bold">{fyText}</text>
                            </>
                          )}
                          {(supData.type === 'pin' || supData.type === 'fixed') && (
                            <>
                              <line x1={isFxPos ? node.x - 45 : node.x + 45} y1={node.y} x2={isFxPos ? node.x - 10 : node.x + 10} y2={node.y} stroke={theme.supportOrange} strokeWidth="2.5" markerEnd="url(#arrowReaction)" />
                              <text x={isFxPos ? node.x - 45 : node.x + 55} y={node.y - 10} fontSize="12" fill={theme.textMain} fontWeight="bold">{fxText}</text>
                            </>
                          )}
                          <RenderSupportSVG cx={node.x} cy={node.y} type={supData.type} dir={supData.direction || 'horizontal'} />
                        </g>
                      );
                    })}
                    {Object.entries(trussLoads).map(([nId, force]) => {
                      const node = nodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                      return (
                         <g key={`t-fbd-load-${nId}`}>
                          {Number(force.fy) !== 0 && force.fy !== undefined && (
                            <>
                              <line x1={node.x} y1={force.fy > 0 ? node.y - 40 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 40} stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                              <text x={node.x + 12} y={node.y - 15} fontSize="12" fill={theme.textMain} fontWeight="bold">{force.fy} {trussUnit}</text>
                            </>
                          )}
                          {Number(force.fx) !== 0 && force.fx !== undefined && (
                            <>
                              <line x1={force.fx > 0 ? node.x - 40 : node.x + 10} y1={node.y} x2={force.fx > 0 ? node.x - 10 : node.x + 40} stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                              <text x={node.x - 20} y={node.y - 15} fontSize="12" fill={theme.textMain} fontWeight="bold">{force.fx} {trussUnit}</text>
                            </>
                          )}
                        </g>
                      );
                    })}
                    {nodes.map(node => (
                      <g key={`t-fbd-n-${node.id}`}>
                        <circle cx={node.x} cy={node.y} r={4} fill="#000" />
                        <text x={node.x + 8} y={node.y - 8} fontSize="12" fill="#000" fontWeight="bold">{node.name}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            )}

            <div className="no-print" style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'center' }}>
              <div style={{ flex: 1, backgroundColor: '#fff', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                {nodes.find(n => n.id === selectedNodeId) ? (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <strong>Node {nodes.find(n=>n.id===selectedNodeId).name}:</strong>
                    <select value={trussSupports[selectedNodeId]?.type || 'none'} onChange={(e) => handleSupportTypeChange(selectedNodeId, e.target.value)} style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="none">Support: None</option><option value="pin">Pin</option><option value="roller">Roller</option><option value="fixed">Fixed</option><option value="free">Free</option>
                    </select>
                    <select value={trussSupports[selectedNodeId]?.direction || 'horizontal'} onChange={(e) => { saveTrussState(); setTrussSupports(prev => ({ ...prev, [selectedNodeId]: { ...prev[selectedNodeId], direction: e.target.value } })) }} style={{ padding: '4px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="horizontal">Horz ➖</option><option value="vertical">Vert ⏐</option>
                    </select>
                    <input type="number" placeholder="Fx Load" value={trussLoads[selectedNodeId]?.fx || ''} onChange={(e) => handleTrussLoadChange(selectedNodeId, 'fx', e.target.value)} style={{ width: '80px', padding: '4px' }} />
                    <input type="number" placeholder="Fy Load" value={trussLoads[selectedNodeId]?.fy || ''} onChange={(e) => handleTrussLoadChange(selectedNodeId, 'fy', e.target.value)} style={{ width: '80px', padding: '4px' }} />
                  </div>
                ) : <span style={{ fontSize: '0.9rem', color: '#666' }}>Click any node on canvas to configure support & point load.</span>}
              </div>
              <button onClick={runTrussAnalysis} disabled={nodes.length < 3} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', backgroundColor: nodes.length < 3 ? '#ccc' : theme.textMain, color: '#fff', border: 'none', borderRadius: '8px', cursor: nodes.length < 3 ? 'not-allowed' : 'pointer' }}>Analyze Truss</button>
            </div>

            {trussAnalysisResult && (
              <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}` }}>
                <h4 style={{ margin: '0 0 8px 0', color: theme.textMain }}>3. Static Equilibrium & Support Reaction Steps</h4>
                <div style={{ backgroundColor: theme.lightGray, padding: '10px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: '15px', border: `1px solid ${theme.border}`, whiteSpace: 'pre-wrap' }}>
                  {trussLocalData.steps.map((step, idx) => (
                    <div key={idx} style={{ marginBottom: '4px' }}>{step}</div>
                  ))}
                </div>

                <h4 style={{ margin: '0 0 8px 0', color: theme.textMain }}>4. Truss Equilibrium & Member Forces</h4>
                <div style={{ display: 'flex', gap: '30px', marginBottom: '10px', fontSize: '0.95rem' }}>
                  <div>Max Span: <strong>{trussDims.totalWidth.toFixed(2)} m</strong></div>
                  <div>Max Height: <strong>{trussDims.totalHeight.toFixed(2)} m</strong></div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead><tr style={{ backgroundColor: theme.lightGray, borderBottom: `2px solid ${theme.textMain}` }}><th style={{ padding: '6px', textAlign: 'left' }}>Member</th><th style={{ padding: '6px', textAlign: 'right' }}>Force ({trussUnit})</th><th style={{ padding: '6px', textAlign: 'center' }}>Status</th></tr></thead>
                  <tbody>
                    {trussAnalysisResult.members.map((m, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}`, pageBreakInside: 'avoid', backgroundColor: m.status === 'Zero-Force' ? '#FFFBEA' : 'transparent' }}>
                        <td style={{ padding: '6px' }}>{m.name}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{Math.abs(m.force).toLocaleString()}</td>
                        <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold', color: m.status === 'Zero-Force' ? '#B7791F' : 'inherit' }}>{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 3: FRAME ANALYSIS (Statics Only) ======================= */}
        {activeTab === 'frame' && (
          <div className="report-document">
            <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Frame Analysis: Engineering Statics</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#666' }}>Project: Equilibrium & Reactions Evaluation</p>
              </div>
              <button onClick={handlePrintPDF} className="no-print" style={{ backgroundColor: theme.textMain, color: 'white', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>🖨️ Print A4 Report</button>
            </div>

            {/* Frame Presets */}
            <div className="no-print" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '15px', backgroundColor: theme.lightGray, padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#000' }}>Presets:</span>
              <button onClick={() => loadFramePreset('portal')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #000', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>Portal Frame (UDL on Beam)</button>
            </div>

            <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' }}>
              <div className="no-print" style={{ padding: '10px 15px', backgroundColor: theme.lightGray, borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleUndoFrame} disabled={frameHistory.length === 0} style={{ padding: '4px 10px', fontSize: '0.85rem', fontWeight: 'bold', cursor: frameHistory.length===0?'not-allowed':'pointer', backgroundColor: '#FFFFFF', color: '#000000', border: '1px solid #000000', borderRadius: '4px' }}>Undo</button>
                  <button onClick={clearFrameCanvas} style={{ padding: '4px 10px', fontSize: '0.85rem', backgroundColor: '#fff', color: '#000', border: '1px solid #000', borderRadius: '4px', fontWeight: 'bold' }}>Clear</button>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Unit: 
                    <select value={fForceUnit} onChange={(e) => setFForceUnit(e.target.value)} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="N">N</option><option value="kN">kN</option><option value="kg">kg</option><option value="t">t</option>
                    </select>
                  </label>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Grid: 
                    <select value={fGridScale} onChange={(e) => setFGridScale(Number(e.target.value))} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0].map(v => <option key={v} value={v}>{v.toFixed(1)}m</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div style={{ width: '100%', overflow: 'auto', backgroundColor: '#fff', display: 'flex', justifyContent: 'center' }}>
                <svg width="1400" height="600" onClick={handleFrameCanvasClick} style={{ cursor: 'crosshair', display: 'block', backgroundColor: '#fff' }}>
                  <defs>
                    <pattern id="gridF" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#e0e0e0" strokeWidth="1"/></pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#gridF)" />
                  {renderDimensions(fNodes, fGridScale)}
                  
                  {fElements.map(el => {
                    const n1 = fNodes.find(n => n.id === el.n1), n2 = fNodes.find(n => n.id === el.n2);
                    if (!n1 || !n2) return null;
                    const distLoad = fDistLoads[el.id];
                    const pointLoad = fPointLoadsOnElement[el.id];
                    const isSelected = fSelectedElementId === el.id;

                    let plX = n1.x, plY = n1.y;
                    if (pointLoad && pointLoad.x !== undefined) {
                      const totalLen = Math.sqrt((n2.x - n1.x)**2 + (n2.y - n1.y)**2);
                      const actualLenM = totalLen / PIXELS_PER_GRID * fGridScale;
                      const ratio = actualLenM > 0 ? Math.min(Math.max(pointLoad.x / actualLenM, 0), 1) : 0;
                      plX = n1.x + (n2.x - n1.x) * ratio;
                      plY = n1.y + (n2.y - n1.y) * ratio;
                    }

                    return (
                      <g key={el.id} onClick={(e) => handleFrameElementClick(e, el)} style={{ cursor: 'pointer' }}>
                        <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={isSelected ? theme.accent : theme.memberGray} strokeWidth={isSelected ? "6" : "4"} strokeLinecap="round" />
                        {renderDistributedLoadArrows(n1.x, n1.y, n2.x, n2.y, distLoad?.wx, distLoad?.wy)}
                        {pointLoad && (
                          <>
                            {pointLoad.py && pointLoad.py !== 0 && (
                              <g>
                                <line x1={plX} y1={plY - 45} x2={plX} y2={plY - 10} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                                <text x={plX + 12} y={plY - 20} fill={theme.textMain} fontSize="13" fontWeight="bold">P = {pointLoad.py} {fForceUnit}</text>
                              </g>
                            )}
                            {pointLoad.px && pointLoad.px !== 0 && (
                              <g>
                                <line x1={plX - 45} y1={plY} x2={plX - 10} y2={plY} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                                <text x={plX - 25} y={plY - 10} fill={theme.textMain} fontSize="13" fontWeight="bold">P = {pointLoad.px} {fForceUnit}</text>
                              </g>
                            )}
                          </>
                        )}
                      </g>
                    )
                  })}

                  {Object.entries(fSupports).map(([nId, supData]) => {
                    const node = fNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                    return (
                      <g key={`sup-${nId}`}>
                        <RenderSupportSVG cx={node.x} cy={node.y} type={supData.type} dir={supData.direction || 'horizontal'} />
                      </g>
                    )
                  })}

                  {Object.entries(fLoads).map(([nId, force]) => {
                    const node = fNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                    return (
                      <g key={`load-${nId}`}>
                        {Number(force.fy) !== 0 && (
                          <>
                            <line x1={node.x} y1={force.fy > 0 ? node.y - 50 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 50} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                            <text x={node.x + 12} y={node.y} fill={theme.textMain} fontSize="13" fontWeight="bold">Fy = {force.fy} {fForceUnit}</text>
                          </>
                        )}
                        {Number(force.fx) !== 0 && (
                          <>
                            <line x1={node.x} y1={force.fx > 0 ? node.x - 50 : node.x + 10} x2={node.x} y2={force.fx > 0 ? node.x - 10 : node.x + 50} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                            <text x={node.x - 15} y={node.y - 15} fill={theme.textMain} fontSize="13" fontWeight="bold">Fx = {force.fx} {fForceUnit}</text>
                          </>
                        )}
                        {Number(force.mz) !== 0 && (
                          <g>
                            <path d={force.mz < 0 ? `M ${node.x-20} ${node.y-20} A 20 20 0 0 1 ${node.x+20} ${node.y-20}` : `M ${node.x+20} ${node.y-20} A 20 20 0 0 0 ${node.x-20} ${node.y-20}`} fill="none" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                            <text x={node.x} y={node.y - 45} fill={theme.textMain} fontSize="13" fontWeight="bold" textAnchor="middle">M = {Math.abs(force.mz)} {fForceUnit}.m</text>
                          </g>
                        )}
                      </g>
                    )
                  })}

                  {fNodes.map(node => (
                    <g key={node.id} style={{ cursor: 'pointer' }}>
                      <circle cx={node.x} cy={node.y} r={35} fill="transparent" onClick={(e) => handleFrameNodeClick(e, node)} />
                      <circle cx={node.x} cy={node.y} r={fSelectedNodeId === node.id ? 9 : 6} fill={fSelectedNodeId === node.id ? theme.accent : "#fff"} stroke="#000" strokeWidth="2" style={{ pointerEvents: 'none' }} />
                      <text x={node.x + 10} y={node.y - 10} fill={theme.textMain} fontSize="13" fontWeight="bold" style={{ pointerEvents: 'none' }}>{node.name}</text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {fNodes.length > 0 && frameLocalData.analyzed && (
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
                <h3 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '1.1rem' }}>2. Free Body Diagram (FBD) & Reactions</h3>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center', backgroundColor: '#fff', overflow: 'auto' }}>
                  
                  <svg width="1400" height="600" style={{ display: 'block', backgroundColor: '#fff' }}>
                    <defs>
                      <pattern id="gridF_FBD" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#e0e0e0" strokeWidth="1"/></pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#gridF_FBD)" />
                    
                    {fElements.map(el => {
                      const n1 = fNodes.find(n => n.id === el.n1), n2 = fNodes.find(n => n.id === el.n2);
                      if (!n1 || !n2) return null;
                      return <line key={`f-fbd-el-${el.id}`} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={theme.memberGray} strokeWidth="3.5" strokeLinecap="round" />;
                    })}
                    
                    {fElements.map(el => {
                      const n1 = fNodes.find(n => n.id === el.n1), n2 = fNodes.find(n => n.id === el.n2);
                      if (!n1 || !n2) return null;
                      const distLoad = fDistLoads[el.id];
                      const pointLoad = fPointLoadsOnElement[el.id];
                      
                      let plX = n1.x, plY = n1.y;
                      if (pointLoad && pointLoad.x !== undefined) {
                        const totalLen = Math.sqrt((n2.x - n1.x)**2 + (n2.y - n1.y)**2);
                        const actualLenM = totalLen / PIXELS_PER_GRID * fGridScale;
                        const ratio = actualLenM > 0 ? Math.min(Math.max(pointLoad.x / actualLenM, 0), 1) : 0;
                        plX = n1.x + (n2.x - n1.x) * ratio;
                        plY = n1.y + (n2.y - n1.y) * ratio;
                      }
                      
                      return (
                        <g key={`fbd-loads-${el.id}`}>
                          {renderDistributedLoadArrows(n1.x, n1.y, n2.x, n2.y, distLoad?.wx, distLoad?.wy)}
                          {pointLoad && (
                            <>
                              {pointLoad.py && pointLoad.py !== 0 && (
                                <g>
                                  <line x1={plX} y1={plY - 45} x2={plX} y2={plY - 10} stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                                  <text x={plX + 12} y={plY - 20} fill={theme.textMain} fontSize="13" fontWeight="bold">P = {pointLoad.py} {fForceUnit}</text>
                                </g>
                              )}
                              {pointLoad.px && pointLoad.px !== 0 && (
                                <g>
                                  <line x1={plX - 45} y1={plY} x2={plX - 10} y2={plY} stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                                  <text x={plX - 25} y={plY - 10} fill={theme.textMain} fontSize="13" fontWeight="bold">P = {pointLoad.px} {fForceUnit}</text>
                                </g>
                              )}
                            </>
                          )}
                        </g>
                      )
                    })}

                    {Object.entries(fSupports).map(([nId, supData]) => {
                      const node = fNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                      const rxn = frameLocalData.rxns[node.id];
                      
                      const fyText = rxn ? Math.abs(rxn.fy).toFixed(2) : "0.00";
                      const fxText = rxn ? Math.abs(rxn.fx).toFixed(2) : "0.00";
                      const mzText = rxn && rxn.mz ? Math.abs(rxn.mz).toFixed(2) : "0.00";
                      
                      const isFyPos = rxn ? (rxn.fy >= 0) : true;
                      const isFxPos = rxn ? (rxn.fx >= 0) : true;
                      const isMzCW = rxn ? (rxn.mz < 0) : true;

                      return (
                        <g key={`f-fbd-sup-${nId}`}>
                          {(supData.type !== 'free') && (
                            <>
                              <line x1={node.x} y1={isFyPos ? node.y + 45 : node.y - 45} x2={node.x} y2={isFyPos ? node.y + 10 : node.y - 10} stroke={theme.supportOrange} strokeWidth="2.5" markerEnd="url(#arrowReaction)" />
                              <text x={node.x + 12} y={isFyPos ? node.y + 25 : node.y - 25} fontSize="12" fill="#000" fontWeight="bold">{fyText}</text>
                            </>
                          )}
                          {(supData.type === 'pin' || supData.type === 'fixed') && (
                            <>
                              <line x1={isFxPos ? node.x - 40 : node.x + 40} y1={node.y} x2={isFxPos ? node.x - 10 : node.x + 10} y2={node.y} stroke={theme.supportOrange} strokeWidth="2.5" markerEnd="url(#arrowReaction)" />
                              <text x={isFxPos ? node.x - 45 : node.x + 50} y={node.y - 8} fontSize="12" fill="#000" fontWeight="bold">{fxText}</text>
                            </>
                          )}
                          {supData.type === 'fixed' && (
                            <g>
                              <path d={isMzCW ? `M ${node.x-20} ${node.y-20} A 20 20 0 0 1 ${node.x+20} ${node.y-20}` : `M ${node.x+20} ${node.y-20} A 20 20 0 0 0 ${node.x-20} ${node.y-20}`} fill="none" stroke={theme.supportOrange} strokeWidth="2.5" markerEnd="url(#arrowReaction)" />
                              <text x={node.x} y={node.y - 45} fontSize="12" fill="#000" fontWeight="bold" textAnchor="middle">{mzText}</text>
                            </g>
                          )}
                          <RenderSupportSVG cx={node.x} cy={node.y} type={supData.type} dir={supData.direction || 'horizontal'} />
                        </g>
                      );
                    })}
                    
                    {Object.entries(fLoads).map(([nId, force]) => {
                      const node = fNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                      return (
                        <g key={`f-fbd-nload-${nId}`}>
                          {Number(force.fy) !== 0 && (
                            <>
                              <line x1={node.x} y1={force.fy > 0 ? node.y - 40 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 40} stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                              <text x={node.x + 12} y={node.y - 15} fontSize="12" fill={theme.textMain} fontWeight="bold">{force.fy} {fForceUnit}</text>
                            </>
                          )}
                          {Number(force.fx) !== 0 && (
                            <>
                              <line x1={node.x} y1={force.fx > 0 ? node.x - 40 : node.x + 10} x2={node.x} y2={force.fx > 0 ? node.x - 10 : node.x + 40} y2={node.y} stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                              <text x={node.x - 20} y={node.y - 15} fontSize="12" fill={theme.textMain} fontWeight="bold">{force.fx} {fForceUnit}</text>
                            </>
                          )}
                          {Number(force.mz) !== 0 && (
                            <g>
                              <path d={force.mz < 0 ? `M ${node.x-20} ${node.y-20} A 20 20 0 0 1 ${node.x+20} ${node.y-20}` : `M ${node.x+20} ${node.y-20} A 20 20 0 0 0 ${node.x-20} ${node.y-20}`} fill="none" stroke={theme.accent} strokeWidth="2.5" markerEnd="url(#arrowPoint)" />
                              <text x={node.x} y={node.y - 45} fontSize="12" fill={theme.textMain} fontWeight="bold" textAnchor="middle">M = {Math.abs(force.mz)}</text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                    
                    {fNodes.map(node => (
                      <g key={`f-fbd-n-${node.id}`}>
                        <circle cx={node.x} cy={node.y} r={4} fill="#000" />
                        <text x={node.x + 8} y={node.y - 8} fontSize="12" fill="#000" fontWeight="bold">{node.name}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            )}

            <div className="no-print" style={{ backgroundColor: '#fff', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
              {fSelectedNode ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: theme.textMain }}>Node {fSelectedNode.name}:</strong>
                  <select value={fSupports[fSelectedNode.id]?.type || 'none'} onChange={(e) => handleFSupportTypeChange(fSelectedNode.id, e.target.value)} style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    <option value="none">Support: None</option><option value="fixed">Fixed</option><option value="pin">Pin</option><option value="roller">Roller</option><option value="free">Free</option>
                  </select>
                  <select value={fSupports[fSelectedNode.id]?.direction || 'horizontal'} onChange={(e) => { saveFrameState(); setFSupports(prev => ({ ...prev, [fSelectedNodeId]: { ...prev[fSelectedNodeId], direction: e.target.value } })) }} style={{ padding: '4px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                    <option value="horizontal">Horz ➖</option><option value="vertical">Vert ⏐</option>
                  </select>
                  <input type="number" placeholder={`Fx (${fForceUnit})`} value={fLoads[fSelectedNode.id]?.fx !== undefined ? fLoads[fSelectedNode.id].fx : ''} onChange={(e) => handleFLoadChange(fSelectedNode.id, 'fx', e.target.value)} style={{ width: '70px', padding: '4px' }} />
                  <input type="number" placeholder={`Fy (${fForceUnit})`} value={fLoads[fSelectedNode.id]?.fy !== undefined ? fLoads[fSelectedNode.id].fy : ''} onChange={(e) => handleFLoadChange(fSelectedNode.id, 'fy', e.target.value)} style={{ width: '70px', padding: '4px' }} />
                  
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '10px' }}>
                    <label style={{ fontSize: '0.85rem' }}>Mz:</label>
                    <input type="number" value={fLoads[fSelectedNode.id]?.mz ? Math.abs(fLoads[fSelectedNode.id].mz) : ''} onChange={(e) => {
                      const val = Number(e.target.value);
                      const isCW = (fLoads[fSelectedNode.id]?.mz || 0) < 0;
                      handleFLoadChange(fSelectedNode.id, 'mz', isCW ? -val : val);
                    }} style={{ width: '60px', padding: '4px' }} />
                    <select value={(fLoads[fSelectedNode.id]?.mz || 0) < 0 ? 'cw' : 'ccw'} onChange={(e) => {
                      const isCW = e.target.value === 'cw';
                      const absMz = Math.abs(fLoads[fSelectedNode.id]?.mz || 0);
                      handleFLoadChange(fSelectedNode.id, 'mz', isCW ? -absMz : absMz);
                    }} style={{ fontSize: '0.8rem', fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="cw">CW ↻</option>
                      <option value="ccw">CCW ↺</option>
                    </select>
                  </div>
                </div>
              ) : fSelectedElement ? (
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: theme.textMain }}>Member Load:</strong>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem' }}>wx:</label>
                    <input type="number" placeholder={`${fForceUnit}/m`} value={fDistLoads[fSelectedElement.id]?.wx || ''} onChange={(e) => handleFDistLoadChange(fSelectedElement.id, 'wx', e.target.value)} style={{ width: '75px', padding: '3px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem' }}>wy:</label>
                    <input type="number" placeholder={`${fForceUnit}/m`} value={fDistLoads[fSelectedElement.id]?.wy || ''} onChange={(e) => handleFDistLoadChange(fSelectedElement.id, 'wy', e.target.value)} style={{ width: '75px', padding: '3px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem' }}>Point P:</label>
                    <input type="number" placeholder={fForceUnit} value={fPointLoadsOnElement[fSelectedElement.id]?.py !== undefined ? fPointLoadsOnElement[fSelectedElement.id].py : (fPointLoadsOnElement[fSelectedElement.id]?.px !== undefined ? fPointLoadsOnElement[fSelectedElement.id].px : '')} onChange={(e) => {
                      const val = e.target.value;
                      const isVertical = !fPointLoadsOnElement[fSelectedElement.id]?.px;
                      handleElementPointLoadChange(fSelectedElement.id, isVertical ? 'py' : 'px', val);
                      if (isVertical) handleElementPointLoadChange(fSelectedElement.id, 'px', '');
                      else handleElementPointLoadChange(fSelectedElement.id, 'py', '');
                    }} style={{ width: '60px', padding: '3px' }} />
                    <select onChange={(e) => {
                      const dir = e.target.value;
                      const currVal = fPointLoadsOnElement[fSelectedElement.id]?.py || fPointLoadsOnElement[fSelectedElement.id]?.px || 0;
                      if (dir === 'py') {
                        handleElementPointLoadChange(fSelectedElement.id, 'py', currVal);
                        handleElementPointLoadChange(fSelectedElement.id, 'px', '');
                      } else {
                        handleElementPointLoadChange(fSelectedElement.id, 'px', currVal);
                        handleElementPointLoadChange(fSelectedElement.id, 'py', '');
                      }
                    }} style={{ fontSize: '0.8rem', fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="py">Vert (Py)</option>
                      <option value="px">Side (Px)</option>
                    </select>
                    <label style={{ fontSize: '0.85rem' }}>at x:</label>
                    <input type="number" placeholder="m" value={fPointLoadsOnElement[fSelectedElement.id]?.x || ''} onChange={(e) => handleElementPointLoadChange(fSelectedElement.id, 'x', e.target.value)} style={{ width: '50px', padding: '3px' }} />
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: '0.95rem', color: '#666', fontStyle: 'italic' }}>💡 Tip: Click Node for Supports/Point/Moment Loads, or click Member for UDL/Internal Point Loads.</span>
              )}
            </div>

            <div className="no-print" style={{ textAlign: 'center', marginBottom: '20px' }}>
              <button onClick={runFrameStaticsAnalysis} disabled={fNodes.length < 2} style={{ padding: '14px 30px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: fNodes.length < 2 ? '#ccc' : theme.textMain, color: '#fff', border: 'none', borderRadius: '8px', cursor: fNodes.length < 2 ? 'not-allowed' : 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>Calculate Frame Reactions</button>
            </div>

            {frameLocalData.analyzed && (
              <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}` }}>
                <h4 style={{ margin: '0 0 8px 0', color: theme.textMain }}>3. Engineering Statics Calculation Steps</h4>
                <div style={{ backgroundColor: theme.lightGray, padding: '15px', borderRadius: '6px', fontSize: '0.95rem', fontFamily: 'monospace', marginBottom: '15px', border: `1px solid ${theme.border}`, whiteSpace: 'pre-wrap' }}>
                  {frameLocalData.steps.map((step, idx) => (
                    <div key={idx} style={{ marginBottom: '4px' }}>{step}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
