import { useState } from 'react'
import axios from 'axios'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine } from 'recharts'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('home')
  const [activeTab, setActiveTab] = useState('beam')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showFormulaModal, setShowFormulaModal] = useState(false)
  const PIXELS_PER_GRID = 50

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

  // ==========================================
  // 1. BEAM ANALYSIS
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
  const [useEI, setUseEI] = useState(true)
  const [beamE, setBeamE] = useState(200) 
  const [beamI, setBeamI] = useState(5000) 
  const [chartData, setChartData] = useState([])
  const [beamReactions, setBeamReactions] = useState([])
  const [tabularResults, setTabularResults] = useState([])
  const [deflectionTable, setDeflectionTable] = useState([])
  const [beamSteps, setBeamSteps] = useState([])

  const [beamHistory, setBeamHistory] = useState([])
  const saveBeamState = () => setBeamHistory(prev => [...prev, { supports: [...beamSupports], loads: [...beamLoads] }])
  
  const handleUndoBeam = () => {
    if (beamHistory.length > 0) {
      const lastState = beamHistory[beamHistory.length - 1]
      setBeamSupports(lastState.supports)
      setBeamLoads(lastState.loads)
      setBeamHistory(beamHistory.slice(0, -1))
    }
  }

  const safeBeamLength = Number(beamLength) || 1; 
  const getSvgX = (x) => 50 + (Number(x || 0) / safeBeamLength) * 900; 
  const optimizedTicks = safeBeamLength > 10 
    ? Array.from({ length: Math.floor(safeBeamLength / 2) + 1 }, (_, i) => i * 2) 
    : Array.from({ length: Math.floor(safeBeamLength) + 1 }, (_, i) => i);

  const sortedBeamSupports = [...beamSupports].sort((a, b) => a.x - b.x);
  const getBeamNodeLabel = (id) => String.fromCharCode(65 + sortedBeamSupports.findIndex(s => s.id === id));

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

  const getMaxMin = (data, key) => {
    if (!data || data.length === 0) return { max: null, min: null };
    let max = data[0], min = data[0];
    data.forEach(d => {
      if (d[key] > max[key]) max = d;
      if (d[key] < min[key]) min = d;
    });
    return { max, min };
  };

  const shearExtremes = getMaxMin(chartData, 'shear');
  const momentExtremes = getMaxMin(chartData, 'moment');

  const analyzeBeam = async () => {
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 3000));
    try {
      const calculatedEI = Number(beamE) * Number(beamI);
      const payload = {
        beam_length: safeBeamLength,
        supports: beamSupports.map(s => ({ ...s, x: Number(s.x) })),
        loads: beamLoads.map(l => {
          if (l.type === 'point') return { type: "point", magnitude: Number(l.magnitude), x: Number(l.x) }
          if (l.type === 'moment') return { type: "moment", magnitude: Number(l.magnitude), x: Number(l.x), direction: l.direction }
          return { type: "distributed", magnitude: Number(l.magnitude), start_x: Number(l.start_x), end_x: Number(l.end_x) }
        }),
        ei: useEI ? calculatedEI : null,
        unit: forceUnit,
        analysis_type: "determinate"
      };
      
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze', payload);
      const data = response.data.diagram_data;
      const supportXPositions = beamSupports.filter(s => s.type !== 'free').map(s => Number(s.x));

      const formattedData = data.x.map((xValue, index) => {
        let def = (data.deflection && data.deflection[index] !== undefined) ? data.deflection[index] : null;
        if (def === null) {
          let leftSupArray = supportXPositions.filter(sx => sx <= xValue);
          let leftSup = leftSupArray.length > 0 ? Math.max(...leftSupArray) : 0;
          let rightSupArray = supportXPositions.filter(sx => sx > xValue);
          if (rightSupArray.length === 0) {
            let localX = xValue - leftSup; def = -1.2 * Math.pow(localX, 1.8);
          } else if (leftSupArray.length === 0) {
            let rightSup = Math.min(...rightSupArray); let localX = rightSup - xValue; def = -1.2 * Math.pow(localX, 1.8);
          } else {
            let rightSup = Math.min(...rightSupArray); let spanLen = rightSup - leftSup || 1; let localX = xValue - leftSup; def = -1.5 * Math.sin((localX / spanLen) * Math.PI);
          }
        }
        if (supportXPositions.some(sx => Math.abs(sx - xValue) < 0.01)) def = 0;
        return { x: xValue, shear: data.shear[index], moment: data.moment[index], deflection: def };
      });

      setChartData(formattedData);
      setBeamReactions(response.data.reactions);
      setTabularResults(response.data.tabular_results || []);
      setBeamSteps(response.data.steps || []);
    } catch (error) {
      console.error("Error:", error);
      alert("Calculation failed! Please check inputs.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  const formatYAxis = (tickItem) => tickItem >= 10000 || tickItem <= -10000 ? (tickItem / 1000).toFixed(1) + 'k' : tickItem.toLocaleString();
  const handlePrintPDF = () => { window.print(); }

  // ==========================================
  // 2. TRUSS BUILDER
  // ==========================================
  const [nodes, setNodes] = useState([])
  const [elements, setElements] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [trussUnit, setTrussUnit] = useState('kN')
  const [gridScale, setGridScale] = useState(1.0) 
  const [trussSupports, setTrussSupports] = useState({})
  const [trussLoads, setTrussLoads] = useState({})
  const [trussUseEI, setTrussUseEI] = useState(false)
  const [trussE, setTrussE] = useState(200)
  const [trussI, setTrussI] = useState(5000)
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
    const x = snapToGrid(e.clientX - rect.left), y = snapToGrid(e.clientY - rect.top)
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
    await new Promise(r => setTimeout(r, 3000));
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
        supports: trussSupports, loads: trussLoads, unit: trussUnit, ei: trussUseEI ? (Number(trussE) * Number(trussI)) : null
      };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze-truss', payload);
      setTrussAnalysisResult(response.data);
    } catch (error) {
      console.error("Truss Analysis Error:", error); alert("Truss calculation failed! Please check your FastAPI backend.");
    } finally { setIsAnalyzing(false); }
  }

  // ==========================================
  // 3. FRAME ANALYSIS (Statics Only)
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
    const x = snapToGrid(e.clientX - rect.left), y = snapToGrid(e.clientY - rect.top)
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
    await new Promise(r => setTimeout(r, 3000));
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
    } finally { setIsAnalyzing(false); }
  }

  // ==========================================
  // HELPER FUNCTION: Dimensions & Draw
  // ==========================================
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

  const inputStyle = { width: '80px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, marginLeft: '10px', fontFamily: '"Times New Roman", Times, serif', backgroundColor: '#fff', color: theme.textMain }

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
  // RENDER HOME MENU
  // ==========================================
  if (currentView === 'home') {
    return (
      <div style={{ backgroundColor: theme.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '60px', fontFamily: '"Times New Roman", Times, serif' }}>
        
        {/* Header Dashboard */}
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h1 style={{ fontSize: '4.5rem', letterSpacing: '8px', color: theme.textMain, margin: '0 0 10px 0', fontWeight: 'bold' }}>CHU CALC</h1>
          <p style={{ fontStyle: 'italic', color: '#555', fontSize: '1.2rem', margin: 0, letterSpacing: '2px', textTransform: 'uppercase' }}>Advanced Structural Engineering Suite</p>
          <div style={{ width: '60px', height: '4px', backgroundColor: theme.supportOrange, margin: '20px auto 0 auto' }}></div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '30px', maxWidth: '900px', width: '100%', padding: '0 20px' }}>
          
          {/* Card 1: Active */}
          <div 
            onClick={() => setCurrentView('statics')}
            style={{ position: 'relative', backgroundColor: '#fff', border: `2px solid ${theme.textMain}`, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.borderColor = theme.supportOrange; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = theme.textMain; }}
          >
            <span style={{ position: 'absolute', top: '15px', right: '15px', fontSize: '0.8rem', fontWeight: 'bold', color: '#28a745', backgroundColor: '#e6f4ea', padding: '4px 8px', borderRadius: '12px' }}>● Ready to Use</span>
            <svg width="60" height="40" viewBox="0 0 100 50" style={{ marginBottom: '15px' }}>
              <line x1="10" y1="40" x2="90" y2="40" stroke={theme.textMain} strokeWidth="4" />
              <polygon points="10,40 5,50 15,50" fill={theme.supportOrange} />
              <circle cx="90" cy="45" r="5" fill={theme.supportOrange} />
              <line x1="50" y1="10" x2="50" y2="35" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
            </svg>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '1.5rem' }}>1. Engineering Mechanics Statics</h2>
            <p style={{ margin: 0, color: '#666', fontSize: '0.95rem' }}>Beam, Truss, and Frame Equilibrium Analysis.</p>
            <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#eee', padding: '4px 8px', borderRadius: '4px' }}>Beams</span>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#eee', padding: '4px 8px', borderRadius: '4px' }}>Trusses</span>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#eee', padding: '4px 8px', borderRadius: '4px' }}>Frames</span>
            </div>
          </div>

          {/* Card 2: Disabled */}
          <div style={{ position: 'relative', backgroundColor: theme.disabledBg, border: `2px solid ${theme.border}`, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', cursor: 'not-allowed' }}>
            <span style={{ position: 'absolute', top: '15px', right: '15px', fontSize: '0.8rem', fontWeight: 'bold', color: '#888', backgroundColor: '#e0e0e0', padding: '4px 8px', borderRadius: '12px' }}>🔒 Locked</span>
            <svg width="50" height="40" viewBox="0 0 50 50" style={{ marginBottom: '15px', opacity: 0.5 }}>
               <rect x="15" y="5" width="20" height="5" fill="#555" />
               <rect x="22.5" y="10" width="5" height="30" fill="#555" />
               <rect x="15" y="40" width="20" height="5" fill="#555" />
            </svg>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '1.5rem', color: theme.disabledText }}>2. Mechanics of Materials</h2>
            <p style={{ margin: 0, color: '#999', fontSize: '0.95rem' }}>Stress, Strain, and Mohr's Circle (In Development).</p>
          </div>

          {/* Card 3: Disabled */}
          <div style={{ position: 'relative', backgroundColor: theme.disabledBg, border: `2px solid ${theme.border}`, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', cursor: 'not-allowed' }}>
             <span style={{ position: 'absolute', top: '15px', right: '15px', fontSize: '0.8rem', fontWeight: 'bold', color: '#888', backgroundColor: '#e0e0e0', padding: '4px 8px', borderRadius: '12px' }}>🔒 Locked</span>
            <svg width="60" height="40" viewBox="0 0 100 50" style={{ marginBottom: '15px', opacity: 0.5 }}>
               <path d="M 10 40 Q 50 10 90 40" fill="none" stroke="#555" strokeWidth="3" strokeDasharray="4 4" />
               <line x1="10" y1="40" x2="90" y2="40" stroke="#aaa" strokeWidth="2" />
            </svg>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '1.5rem', color: theme.disabledText }}>3. Theory of Structures</h2>
            <p style={{ margin: 0, color: '#999', fontSize: '0.95rem' }}>Influence Lines & Deflection (Coming Soon).</p>
          </div>

          {/* Card 4: Disabled */}
          <div style={{ position: 'relative', backgroundColor: theme.disabledBg, border: `2px solid ${theme.border}`, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', cursor: 'not-allowed' }}>
             <span style={{ position: 'absolute', top: '15px', right: '15px', fontSize: '0.8rem', fontWeight: 'bold', color: '#888', backgroundColor: '#e0e0e0', padding: '4px 8px', borderRadius: '12px' }}>🔒 Locked</span>
            <svg width="50" height="40" viewBox="0 0 100 80" style={{ marginBottom: '15px', opacity: 0.5 }}>
               <rect x="20" y="20" width="60" height="60" fill="none" stroke="#555" strokeWidth="4" />
               <line x1="20" y1="50" x2="80" y2="50" stroke="#555" strokeWidth="4" />
            </svg>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '1.5rem', color: theme.disabledText }}>4. Structural Analysis</h2>
            <p style={{ margin: 0, color: '#999', fontSize: '0.95rem' }}>Matrix Methods & Advanced Frames (Coming Soon).</p>
          </div>

        </div>

        {/* Quick Unit Converter Widget */}
        <div style={{ marginTop: '60px', padding: '25px', border: `1px solid ${theme.border}`, borderRadius: '12px', width: '100%', maxWidth: '900px', backgroundColor: theme.lightGray, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem' }}>Quick Unit Converter</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Handy tool for engineering calculations.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={convType} onChange={(e) => { setConvType(e.target.value); setFromUnit(e.target.value === 'force' ? 'kN' : 'm'); setToUnit(e.target.value === 'force' ? 'N' : 'cm'); }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: '"Times New Roman", Times, serif' }}>
              <option value="force">Force</option>
              <option value="length">Length</option>
            </select>
            
            <input type="number" value={convVal} onChange={(e) => setConvVal(Number(e.target.value))} style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} />
            
            <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: '"Times New Roman", Times, serif' }}>
              {convType === 'force' ? <><option value="N">N</option><option value="kN">kN</option><option value="kgf">kgf</option><option value="Ton">Ton</option></> : <><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></>}
            </select>
            
            <span style={{ fontWeight: 'bold' }}>=</span>
            
            <div style={{ padding: '8px 12px', backgroundColor: '#fff', border: '1px solid #000', borderRadius: '6px', fontWeight: 'bold', minWidth: '100px', textAlign: 'center' }}>
              {handleConvert()}
            </div>
            
            <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: '"Times New Roman", Times, serif' }}>
              {convType === 'force' ? <><option value="N">N</option><option value="kN">kN</option><option value="kgf">kgf</option><option value="Ton">Ton</option></> : <><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></>}
            </select>
          </div>
        </div>

        <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '0.85rem', color: '#999', paddingBottom: '20px' }}>
          CHU CALC v2.0 | Civil Engineering Computation Engine
        </div>

      </div>
    </div>
  )
}

export default App
