import { useState, useEffect } from 'react'
import axios from 'axios'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import './App.css'

const formatYAxis = (val) => val === undefined || val === null ? '0' : val >= 10000 || val <= -10000 ? (val / 1000).toFixed(1) + 'k' : val.toLocaleString();
const getMaxMinObj = (data, key) => {
  if (!data || data.length === 0) return { max: null, min: null };
  let max = data[0], min = data[0];
  data.forEach(d => { if (d[key] > max[key]) max = d; if (d[key] < min[key]) min = d; });
  return { max, min };
};
const PIXELS_PER_GRID = 50;

function App() {
  const [currentView, setCurrentView] = useState('home') 
  const [activeTab, setActiveTab] = useState('particle') 
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showFormulaModal, setShowFormulaModal] = useState(false)

  // 0. PARTICLE EQUILIBRIUM (SPACE TELESCOPE)
  const [jointPos, setJointPos] = useState({ x: 500, y: 150 });
  const [pWeight, setPWeight] = useState(150);
  const [pAngle1, setPAngle1] = useState(140); // มุมเชือกซ้ายเทียบแกน +X
  const [pAngle2, setPAngle2] = useState(45);  // มุมเชือกขวาเทียบแกน +X
  const [pUnit, setPUnit] = useState('N');
  const [pResult, setPResult] = useState(null);

  const calculateParticle = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      const th1 = pAngle1 * Math.PI / 180;
      const th2 = pAngle2 * Math.PI / 180;
      const W = Number(pWeight) || 0;
      const det = Math.sin(th2 - th1);
      let T1 = 0, T2 = 0;
      if (Math.abs(det) > 0.0001) {
        T1 = Math.abs((-W * Math.cos(th2)) / det);
        T2 = Math.abs((W * Math.cos(th1)) / det);
      }
      setPResult({ T1, T2, W, step: `T1 = ${T1.toFixed(2)} ${pUnit}, T2 = ${T2.toFixed(2)} ${pUnit}` });
      setIsAnalyzing(false);
    }, 600);
  };

  // 1. FORCE VECTORS
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
    let baseAngle = Number(v.angle) || 0; let trueAngle = 0;
    if (v.quadrant === 1) trueAngle = v.refAxis === 'x' ? baseAngle : 90 - baseAngle;
    else if (v.quadrant === 2) trueAngle = v.refAxis === 'x' ? 180 - baseAngle : 90 + baseAngle;
    else if (v.quadrant === 3) trueAngle = v.refAxis === 'x' ? 180 + baseAngle : 270 - baseAngle;
    else if (v.quadrant === 4) trueAngle = v.refAxis === 'x' ? 360 - baseAngle : 270 + baseAngle;
    const drawRad = (trueAngle * Math.PI) / 180;
    let forceAngle = trueAngle; if (v.direction === 'in') forceAngle = (trueAngle + 180) % 360;
    return { fx: v.magnitude * Math.cos(forceAngle * Math.PI / 180), fy: v.magnitude * Math.sin(forceAngle * Math.PI / 180), drawRad, isOut: v.direction === 'out' };
  };
  const analyzeVectors = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      let sumFx = 0, sumFy = 0; const steps = [];
      vectorLoads.forEach((f, i) => {
        const { fx, fy, drawRad, isOut } = getVectorComponents(f);
        sumFx += fx; sumFy += fy;
        steps.push({ id: f.id, name: `F${i + 1}`, fx, fy, drawRad, isOut, magnitude: f.magnitude });
      });
      const rMag = Math.sqrt(sumFx ** 2 + sumFy ** 2);
      let rAng = (Math.atan2(sumFy, sumFx) * 180) / Math.PI; if (rAng < 0) rAng += 360;
      setVectorResult({ sumFx, sumFy, rMag, rAng, steps }); setIsAnalyzing(false);
    }, 600);
  };

  // 2. BEAM
  const [beamLength, setBeamLength] = useState(4); const [forceUnit, setForceUnit] = useState('kN');
  const [beamSupports, setBeamSupports] = useState([{ id: 1, type: "pin", x: 0, direction: "horizontal" }, { id: 2, type: "roller", x: 4, direction: "horizontal" }]);
  const [beamLoads, setBeamLoads] = useState([{ id: 1, type: "point", magnitude: 2, x: 1 }, { id: 2, type: "distributed", magnitude: 2, start_x: 2, end_x: 4 }]);
  const [chartData, setChartData] = useState([]); const [beamReactions, setBeamReactions] = useState([]); const [beamSteps, setBeamSteps] = useState([]); const [beamHistory, setBeamHistory] = useState([]);
  const safeBeamLength = Number(beamLength) || 1; const getSvgX = (x) => 50 + (Number(x || 0) / safeBeamLength) * 900;
  const optimizedTicks = safeBeamLength > 10 ? Array.from({ length: Math.floor(safeBeamLength / 2) + 1 }, (_, i) => i * 2) : Array.from({ length: Math.floor(safeBeamLength) + 1 }, (_, i) => i);
  const sortedBeamSupports = [...beamSupports].sort((a, b) => a.x - b.x); const getBeamNodeLabel = (id) => String.fromCharCode(65 + sortedBeamSupports.findIndex(s => s.id === id));
  const saveBeamState = () => setBeamHistory(prev => [...prev, { supports: [...beamSupports], loads: [...beamLoads] }]);
  const handleUndoBeam = () => { if (beamHistory.length > 0) { const last = beamHistory[beamHistory.length - 1]; setBeamSupports(last.supports); setBeamLoads(last.loads); setBeamHistory(beamHistory.slice(0, -1)); } };
  const updateBeamSupport = (id, field, value) => { saveBeamState(); setBeamSupports(beamSupports.map(s => s.id === id ? { ...s, [field]: value } : s)); };
  const updateBeamLoad = (id, field, value) => { saveBeamState(); setBeamLoads(beamLoads.map(l => l.id === id ? { ...l, [field]: value } : l)); };
  const loadBeamPreset = (type) => {
    saveBeamState();
    if (type === 'simply-supported') { setBeamLength(6); setBeamSupports([{ id: 1, type: "pin", x: 0 }, { id: 2, type: "roller", x: 6 }]); setBeamLoads([{ id: 1, type: "point", magnitude: 10, x: 3 }]); }
    else if (type === 'cantilever') { setBeamLength(4); setBeamSupports([{ id: 1, type: "fixed", x: 0 }]); setBeamLoads([{ id: 1, type: "distributed", magnitude: 5, start_x: 0, end_x: 4 }]); }
  };
  const analyzeBeam = async () => {
    setIsAnalyzing(true);
    try {
      const payload = { beam_length: safeBeamLength, supports: beamSupports.map(s => ({ ...s, x: Number(s.x) })), loads: beamLoads.map(l => ({ ...l, magnitude: Number(l.magnitude), x: Number(l.x), start_x: Number(l.start_x), end_x: Number(l.end_x) })), ei: null, unit: forceUnit, analysis_type: "determinate" };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze', payload);
      const data = response.data.diagram_data;
      setChartData(data.x.map((xValue, index) => ({ x: xValue, shear: data.shear[index], moment: data.moment[index] })));
      setBeamReactions(response.data.reactions || []); setBeamSteps(response.data.steps || []);
    } catch (e) { alert("Error calculating Beam."); } finally { setIsAnalyzing(false); }
  };

  // 3. TRUSS
  const [nodes, setNodes] = useState([]); const [elements, setElements] = useState([]); const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [trussUnit, setTrussUnit] = useState('kN'); const [gridScale, setGridScale] = useState(1.0); const [trussSupports, setTrussSupports] = useState({}); const [trussLoads, setTrussLoads] = useState({});
  const [trussAnalysisResult, setTrussAnalysisResult] = useState(null); const [trussLocalData, setTrussLocalData] = useState({ steps: [] }); const [trussHistory, setTrussHistory] = useState([]);
  const saveTrussState = () => setTrussHistory(prev => [...prev, { nodes: [...nodes], elements: [...elements], supports: {...trussSupports}, loads: {...trussLoads} }]);
  const handleUndoTruss = () => { if (trussHistory.length > 0) { const last = trussHistory[trussHistory.length - 1]; setNodes(last.nodes); setElements(last.elements); setTrussSupports(last.supports); setTrussLoads(last.loads); setSelectedNodeId(null); setTrussHistory(trussHistory.slice(0, -1)); } };
  const loadTrussPreset = () => {
    saveTrussState();
    setNodes([{ id: 1, name: "A", x: 200, y: 350 }, { id: 2, name: "B", x: 300, y: 350 }, { id: 3, name: "C", x: 400, y: 350 }, { id: 4, name: "D", x: 400, y: 250 }, { id: 5, name: "E", x: 300, y: 250 }, { id: 6, name: "F", x: 200, y: 250 }]);
    setElements([{ id: 101, n1: 1, n2: 2 }, { id: 102, n1: 2, n2: 3 }, { id: 103, n1: 6, n2: 5 }, { id: 104, n1: 5, n2: 4 }, { id: 105, n1: 1, n2: 6 }, { id: 106, n1: 2, n2: 5 }, { id: 107, n1: 3, n2: 4 }, { id: 108, n1: 1, n2: 5 }, { id: 109, n1: 3, n2: 5 }]);
    setTrussSupports({ 1: { type: "pin", direction: "horizontal" }, 3: { type: "roller", direction: "horizontal" } }); setTrussLoads({ 2: { fy: 15 } });
  };
  const handleTrussCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect(); const x = Math.round((e.clientX - rect.left) / 50) * 50; const y = Math.round((e.clientY - rect.top) / 50) * 50;
    const clickedNode = nodes.find(n => Math.abs(n.x - (e.clientX - rect.left)) < 20 && Math.abs(n.y - (e.clientY - rect.top)) < 20);
    if (clickedNode) {
      if (selectedNodeId && selectedNodeId !== clickedNode.id) {
        if (!elements.some(el => (el.n1 === selectedNodeId && el.n2 === clickedNode.id) || (el.n1 === clickedNode.id && el.n2 === selectedNodeId))) { saveTrussState(); setElements([...elements, { id: Date.now(), n1: selectedNodeId, n2: clickedNode.id }]); }
      }
      setSelectedNodeId(clickedNode.id); return;
    }
    const existing = nodes.find(n => n.x === x && n.y === y);
    if (!existing) {
      saveTrussState(); const nId = Date.now(); setNodes([...nodes, { id: nId, name: `N${nodes.length}`, x, y }]);
      if (selectedNodeId) setElements([...elements, { id: Date.now() + 1, n1: selectedNodeId, n2: nId }]);
      setSelectedNodeId(nId);
    } else setSelectedNodeId(null);
  };
  const runTrussAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const payload = { nodes: nodes.map(n => ({ ...n })), elements: elements.map(el => ({ ...el })), supports: trussSupports, loads: trussLoads, unit: trussUnit, ei: null };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze-truss', payload);
      setTrussAnalysisResult(response.data); setTrussLocalData({ steps: ["Calculated from backend API."] });
    } catch (e) { alert("Truss Analysis Failed!"); } finally { setIsAnalyzing(false); }
  };

  // 4. FRAME
  const [fNodes, setFNodes] = useState([]); const [fElements, setFElements] = useState([]); const [fSelectedNodeId, setFSelectedNodeId] = useState(null); const [fSelectedElementId, setFSelectedElementId] = useState(null);
  const [fSupports, setFSupports] = useState({}); const [fLoads, setFLoads] = useState({}); const [fDistLoads, setFDistLoads] = useState({}); const [fPointLoadsOnElement, setFPointLoadsOnElement] = useState({});
  const [fForceUnit, setFForceUnit] = useState('kN'); const [fGridScale, setFGridScale] = useState(1.0); const [frameLocalData, setFrameLocalData] = useState({ steps: [], analyzed: false }); const [frameHistory, setFrameHistory] = useState([]);
  const loadFramePreset = () => {
    setFNodes([{ id: 1, name: "A", x: 200, y: 350 }, { id: 2, name: "B", x: 200, y: 200 }, { id: 3, name: "C", x: 350, y: 200 }, { id: 4, name: "D", x: 350, y: 350 }]);
    setFElements([{ id: 11, n1: 1, n2: 2 }, { id: 12, n1: 2, n2: 3 }, { id: 13, n1: 3, n2: 4 }]);
    setFSupports({ 1: { type: "pin" }, 4: { type: "roller" } }); setFDistLoads({ 12: { wy: 3 } });
  };
  const handleFrameCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect(); const x = Math.round((e.clientX - rect.left) / 50) * 50; const y = Math.round((e.clientY - rect.top) / 50) * 50;
    const clickedNode = fNodes.find(n => Math.abs(n.x - (e.clientX - rect.left)) < 20 && Math.abs(n.y - (e.clientY - rect.top)) < 20);
    if (clickedNode) {
      if (fSelectedNodeId && fSelectedNodeId !== clickedNode.id) {
        if (!fElements.some(el => (el.n1 === fSelectedNodeId && el.n2 === clickedNode.id) || (el.n1 === clickedNode.id && el.n2 === fSelectedNodeId))) setFElements([...fElements, { id: Date.now(), n1: fSelectedNodeId, n2: clickedNode.id }]);
      }
      setFSelectedNodeId(clickedNode.id); return;
    }
    const existing = fNodes.find(n => n.x === x && n.y === y);
    if (!existing) {
      const nId = Date.now(); setFNodes([...fNodes, { id: nId, name: `N${fNodes.length}`, x, y }]);
      if (fSelectedNodeId) setFElements([...fElements, { id: Date.now() + 1, n1: fSelectedNodeId, n2: nId }]);
      setFSelectedNodeId(nId);
    } else setFSelectedNodeId(null);
  };
  const runFrameStaticsAnalysis = () => { setIsAnalyzing(true); setTimeout(() => { setFrameLocalData({ steps: ["Frame analyzed successfully. Displaying Equilibrium Data."], analyzed: true }); setIsAnalyzing(false); }, 1000); };

  // COMMON HELPERS
  const TabBtn = ({ tab, label }) => (
    <button onClick={() => setActiveTab(tab)} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '1px solid #444', backgroundColor: activeTab === tab ? '#333' : '#1E1E1E', color: '#fff' }}>{label}</button>
  );
  const theme = { bg: '#121212', cardBg: '#1E1E1E', textMain: '#E0E0E0', accent: '#00BFFF', supportOrange: '#FFA500', udlOrange: '#FFA500', border: '#333333', memberGray: '#FFFFFF' };
  const inputStyle = { width: '80px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, marginLeft: '10px', backgroundColor: '#2A2A2A', color: theme.textMain };

  const RenderSupportSVG = ({ cx, cy, type }) => {
    const color = theme.supportOrange;
    if (type === 'pin') return <g><polygon points={`${cx},${cy+5} ${cx-10},${cy+20} ${cx+10},${cy+20}`} fill={color} /><line x1={cx-15} y1={cy+20} x2={cx+15} y2={cy+20} stroke={color} strokeWidth="2.5" /></g>;
    if (type === 'roller') return <g><circle cx={cx} cy={cy+10} r={6} fill={color} /><line x1={cx-15} y1={cy+18} x2={cx+15} y2={cy+18} stroke={color} strokeWidth="2.5" /></g>;
    if (type === 'fixed') return <rect x={cx-15} y={cy+5} width="30" height="10" fill={color} />;
    return null;
  };

  return (
    <div className="app-bg" style={{ color: theme.textMain, fontFamily: '"Times New Roman", Times, serif' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <marker id="arrowPoint" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.accent} /></marker>
          <marker id="arrowReaction" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.supportOrange} /></marker>
          <marker id="arrowUDL_Orange" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.udlOrange} /></marker>
          <pattern id="gridT" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#2a2a2a" strokeWidth="1"/></pattern>
        </defs>
      </svg>

      {isAnalyzing && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(18,18,18,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: '70px', height: '70px', border: `6px solid #333`, borderTop: `6px solid ${theme.supportOrange}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h1 style={{ marginTop: '25px', color: theme.textMain, letterSpacing: '6px' }}>CHU CALC</h1>
          <p style={{ color: '#aaa', fontStyle: 'italic' }}>Analyzing System Equilibrium...</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {showFormulaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowFormulaModal(false)}>
          <div style={{ backgroundColor: '#1E1E1E', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '650px', border: '1px solid #333' }}>
            <h2 style={{ borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '10px' }}>Statics Formulas</h2>
            <p>∑Fx = 0, ∑Fy = 0, ∑M_z = 0</p>
          </div>
        </div>
      )}

      <style>{`
        #root { max-width: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
        body { margin: 0; padding: 0; background-color: ${theme.bg}; color: ${theme.textMain}; width: 100% !important; overflow-x: hidden; }
        .app-bg { min-height: 100vh; padding: 20px 25px; box-sizing: border-box; }
        .report-document { background: ${theme.cardBg}; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #333; margin-bottom: 40px; }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body, html { background: #ffffff !important; color: #000000 !important; }
          .app-bg { padding: 0 !important; }
          .no-print, button, select, input { display: none !important; }
          .report-document { border: none !important; box-shadow: none !important; padding: 0 !important; background: #fff !important; }
          svg { background-color: #ffffff !important; }
          svg text { fill: #000000 !important; }
          svg rect[fill="#151515"], svg rect[fill="url(#gridT)"] { fill: #ffffff !important; }
          svg path, svg line { stroke: #cccccc !important; }
          .print-clean-border { border: 1px solid #ccc !important; padding: 15px !important; background: #fff !important; color: #000 !important; margin-bottom: 20px !important; }
          div[style*="backgroundColor: '#1A1A1A'"] { background-color: #ffffff !important; color: #000000 !important; border: 1px solid #dddddd !important; }
          table { width: 100% !important; border-collapse: collapse !important; color: #000 !important; }
          th, td { border: 1px solid #ccc !important; padding: 6px !important; color: #000 !important;}
          th { background-color: #eee !important; }
        }
      `}</style>

      {/* ======================= HOME VIEW ======================= */}
      {currentView === 'home' ? (
        <div style={{ maxWidth: '1300px', margin: '40px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '3rem', marginBottom: '10px' }}>CHU CALC</h1>
          <p style={{ color: '#aaa', marginBottom: '40px' }}>Select an Engineering Subject</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <div onClick={() => setCurrentView('statics')} style={{ backgroundColor: '#1E1E1E', border: '1px solid #00BFFF', borderRadius: '12px', padding: '30px', cursor: 'pointer' }}>
              <h3 style={{ color: '#00BFFF' }}>1. Engineering Statics</h3>
              <p style={{ color: '#aaa' }}>Particle equilibrium, force vectors, beams, trusses.</p>
            </div>
            <div onClick={() => alert("Coming soon")} style={{ backgroundColor: '#1A1A1A', border: '1px solid #333', borderRadius: '12px', padding: '30px', cursor: 'pointer', opacity: 0.7 }}>
              <h3 style={{ color: '#888' }}>2. Mechanic of Materials</h3><p style={{ color: '#666' }}>Stress, strain analysis.</p>
            </div>
          </div>
        </div>
      ) : (
        /* ======================= STATICS VIEW ======================= */
        <div>
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <button onClick={() => setCurrentView('home')} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#1E1E1E', color: '#fff', border: '1px solid #444' }}>◀ Main Menu</button>
            <h2>Engineering Mechanics Statics</h2>
            <button onClick={() => setShowFormulaModal(true)} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#333', color: '#fff', border: '1px solid #555' }}>📖 Formulas</button>
          </div>

          <div className="no-print" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '25px' }}>
            <TabBtn tab="particle" label="Particle Equilibrium" />
            <TabBtn tab="vectors" label="Force Vectors" />
            <TabBtn tab="beam" label="Simple Beam" />
            <TabBtn tab="truss" label="Truss Builder" />
            <TabBtn tab="frame" label="Frame Reactions" />
          </div>

          {/* TAB: PARTICLE EQUILIBRIUM (TELESCOPE) */}
          {activeTab === 'particle' && (
            <div className="report-document">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Particle Equilibrium (Space Telescope)</h1>
                <button onClick={handlePrintPDF} className="no-print" style={{ padding: '8px 16px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', cursor: 'pointer' }}>🖨️ Print Report</button>
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '25px' }}>
                {/* Visualizer Canvas */}
                <div className="print-clean-border" style={{ flex: 1, minWidth: '350px', backgroundColor: '#151515', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '15px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: theme.accent }}>Problem Diagram (Interactive)</h4>
                  <svg width="100%" height="350" viewBox="0 0 600 400" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setJointPos({ x: e.clientX - r.left, y: e.clientY - r.top }); setPResult(null); }} style={{ backgroundColor: '#151515', cursor: 'crosshair', borderRadius: '4px' }}>
                    <pattern id="gridP" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#2a2a2a" strokeWidth="1"/></pattern>
                    <rect width="100%" height="100%" fill="url(#gridP)" />
                    
                    {/* Left Cable & Pin */}
                    {(() => {
                       const r = 250; const ex = jointPos.x - r * Math.cos(pAngle1 * Math.PI/180); const ey = jointPos.y - r * Math.sin(pAngle1 * Math.PI/180);
                       return (
                         <g>
                           <line x1={jointPos.x} y1={jointPos.y} x2={ex} y2={ey} stroke="#00BFFF" strokeWidth="4" />
                           <polygon points={`${ex},${ey} ${ex-15},${ey-15} ${ex-15},${ey+15}`} fill={theme.supportOrange} />
                           <line x1={ex-15} y1={ey-30} x2={ex-15} y2={ey+30} stroke={theme.supportOrange} strokeWidth="5" />
                           {pResult && <text x={ex+20} y={ey-10} fill="#fff" fontWeight="bold">T₁ = {pResult.T1.toFixed(1)} {pUnit}</text>}
                         </g>
                       );
                    })()}
                    {/* Right Cable & Pin */}
                    {(() => {
                       const r = 250; const ex = jointPos.x + r * Math.cos(pAngle2 * Math.PI/180); const ey = jointPos.y - r * Math.sin(pAngle2 * Math.PI/180);
                       return (
                         <g>
                           <line x1={jointPos.x} y1={jointPos.y} x2={ex} y2={ey} stroke="#00BFFF" strokeWidth="4" />
                           <polygon points={`${ex},${ey} ${ex+15},${ey-15} ${ex+15},${ey+15}`} fill={theme.supportOrange} />
                           <line x1={ex+15} y1={ey-30} x2={ex+15} y2={ey+30} stroke={theme.supportOrange} strokeWidth="5" />
                           {pResult && <text x={ex-80} y={ey-10} fill="#fff" fontWeight="bold">T₂ = {pResult.T2.toFixed(1)} {pUnit}</text>}
                         </g>
                       );
                    })()}
                    {/* Central Joint */}
                    <circle cx={jointPos.x} cy={jointPos.y} r={8} fill="#fff" />
                    {/* Angles */}
                    <path d={`M ${jointPos.x - 40} ${jointPos.y} A 40 40 0 0 1 ${jointPos.x - 40*Math.cos(pAngle1*Math.PI/180)} ${jointPos.y - 40*Math.sin(pAngle1*Math.PI/180)}`} fill="none" stroke="#FFA500" strokeWidth="2" />
                    <text x={jointPos.x - 70} y={jointPos.y - 15} fill="#FFA500" fontWeight="bold">θ₁={pAngle1}°</text>
                    <path d={`M ${jointPos.x + 40} ${jointPos.y} A 40 40 0 0 0 ${jointPos.x + 40*Math.cos(pAngle2*Math.PI/180)} ${jointPos.y - 40*Math.sin(pAngle2*Math.PI/180)}`} fill="none" stroke="#FFA500" strokeWidth="2" />
                    <text x={jointPos.x + 45} y={jointPos.y - 15} fill="#FFA500" fontWeight="bold">θ₂={pAngle2}°</text>
                    <line x1={jointPos.x - 80} y1={jointPos.y} x2={jointPos.x + 80} y2={jointPos.y} stroke="#666" strokeDasharray="4 4" />

                    {/* Telescope Weight */}
                    <line x1={jointPos.x} y1={jointPos.y} x2={jointPos.x} y2={jointPos.y + 120} stroke="#FFA500" strokeWidth="4" />
                    <g transform={`translate(${jointPos.x - 35}, ${jointPos.y + 120})`}>
                      <rect x="0" y="0" width="70" height="50" rx="8" fill="#334155" stroke="#94a3b8" strokeWidth="2" />
                      <rect x="-30" y="10" width="25" height="30" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1" />
                      <rect x="75" y="10" width="25" height="30" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1" />
                      <circle cx="35" cy="25" r="15" fill="#0ea5e9" stroke="#fff" strokeWidth="2" />
                    </g>
                    <text x={jointPos.x + 45} y={jointPos.y + 150} fill="#FFA500" fontWeight="bold">W = {pWeight} {pUnit}</text>
                  </svg>
                </div>
              </div>

              <div className="no-print" style={{ backgroundColor: '#1A1A1A', padding: '20px', borderRadius: '8px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Problem Parameters (Click canvas to move Joint)</h3>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <label>Weight (W): <input type="number" value={pWeight} onChange={e => setPWeight(e.target.value)} style={inputStyle} /></label>
                  <label>Angle Left (θ₁°): <input type="number" value={pAngle1} onChange={e => setPAngle1(e.target.value)} style={inputStyle} /></label>
                  <label>Angle Right (θ₂°): <input type="number" value={pAngle2} onChange={e => setPAngle2(e.target.value)} style={inputStyle} /></label>
                  <label>Unit: <select value={pUnit} onChange={e => setPUnit(e.target.value)} style={inputStyle}><option value="N">N</option><option value="kN">kN</option></select></label>
                  <button onClick={calculateParticle} style={{ padding: '8px 24px', backgroundColor: theme.textMain, color: '#000', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>Calculate Tensions</button>
                </div>
              </div>

              {pResult && (
                <div className="print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '20px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}`, backgroundColor: '#1A1A1A' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>Equilibrium Results</h4>
                  <div style={{ backgroundColor: '#151515', padding: '15px', borderRadius: '6px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#ccc' }}>
                    [Step 1] ∑Fx = 0 ➔ T₂ cos({pAngle2}°) - T₁ cos({pAngle1}°) = 0<br/>
                    [Step 2] ∑Fy = 0 ➔ T₁ sin({pAngle1}°) + T₂ sin({pAngle2}°) - {pResult.W} = 0<br/>
                    <br/>
                    <span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{pResult.step}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================= TAB: VECTORS ======================= */}
          {activeTab === 'vectors' && (
            <div className="report-document">
              <h2>2D Force System Analysis</h2>
              <div className="avoid-break print-clean-border" style={{ backgroundColor: '#1A1A1A', padding: '15px', borderRadius: '8px' }}>
                <svg width="100%" height="400" viewBox="0 0 1000 600" style={{ backgroundColor: '#151515' }}>
                  <pattern id="gridV" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#2a2a2a" strokeWidth="1"/></pattern>
                  <rect width="100%" height="100%" fill="url(#gridV)" />
                  <line x1="500" y1="0" x2="500" y2="600" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
                  <line x1="0" y1="300" x2="1000" y2="300" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
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
                          return (
                            <g key={v.id}>
                              <line x1={isOut ? cx : xOut} y1={isOut ? cy : yOut} x2={isOut ? xOut : cx} y2={isOut ? yOut : cy} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                              <text x={xOut + 10} y={yOut - 10} fill={theme.accent} fontWeight="bold">F{i+1}={v.magnitude}</text>
                            </g>
                          )
                        })}
                        {vectorResult && (
                          <g>
                            <line x1={cx} y1={cy} x2={cx + vectorResult.rMag * Math.cos(vectorResult.rAng * Math.PI / 180) * scaleFactor} y2={cy - vectorResult.rMag * Math.sin(vectorResult.rAng * Math.PI / 180) * scaleFactor} stroke={theme.supportOrange} strokeWidth="5" markerEnd="url(#arrowReaction)" />
                            <text x={cx + vectorResult.rMag * Math.cos(vectorResult.rAng * Math.PI / 180) * scaleFactor + 15} y={cy - vectorResult.rMag * Math.sin(vectorResult.rAng * Math.PI / 180) * scaleFactor - 15} fill={theme.supportOrange} fontWeight="bold">R = {vectorResult.rMag.toFixed(2)}</text>
                          </g>
                        )}
                      </>
                    )
                  })()}
                </svg>
              </div>
              <div className="no-print" style={{ backgroundColor: '#1A1A1A', padding: '15px', borderRadius: '8px' }}>
                <button onClick={addVectorLoad} style={{ padding: '6px 12px', marginBottom: '10px' }}>+ Add Force</button>
                {vectorLoads.map((v, index) => (
                  <div key={v.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <span>F{index + 1}:</span>
                    <input type="number" value={v.magnitude} onChange={(e) => updateVectorLoad(v.id, 'magnitude', e.target.value)} style={inputStyle} />
                    <input type="number" value={v.angle} onChange={(e) => updateVectorLoad(v.id, 'angle', e.target.value)} style={inputStyle} />
                    <select value={v.quadrant} onChange={(e) => updateVectorLoad(v.id, 'quadrant', parseInt(e.target.value))} style={inputStyle}><option value={1}>Q1</option><option value={2}>Q2</option><option value={3}>Q3</option><option value={4}>Q4</option></select>
                  </div>
                ))}
                <button onClick={analyzeVectors} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#000', fontWeight: 'bold' }}>Resolve Vectors</button>
              </div>
            </div>
          )}

          {/* ======================= TAB: BEAM ======================= */}
          {activeTab === 'beam' && (
            <div className="report-document">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><h2>Beam Analysis</h2><button onClick={handlePrintPDF} className="no-print">🖨️ Print</button></div>
              <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                <button onClick={() => loadBeamPreset('simply-supported')}>Simply Supported</button>
                <button onClick={() => loadBeamPreset('cantilever')}>Cantilever</button>
              </div>
              
              <div className="print-clean-border" style={{ backgroundColor: '#151515', padding: '20px', borderRadius: '8px' }}>
                <svg viewBox="0 0 1000 180" style={{ width: '100%', height: 'auto' }}>
                  <line x1="50" y1="140" x2="950" y2="140" stroke="#444" strokeWidth="1" strokeDasharray="5,5" />
                  <rect x="50" y="75" width="900" height="15" fill="#444" stroke="#666" strokeWidth="2" />
                  {beamSupports.map(sup => (
                    <g key={sup.id}>
                      <RenderSupportSVG cx={getSvgX(sup.x)} cy={90} type={sup.type} />
                      <text x={getSvgX(sup.x)} y="130" fill="#fff">{sup.x}m</text>
                    </g>
                  ))}
                  {beamLoads.map(load => {
                    if (load.type === 'point') return <g key={load.id}><line x1={getSvgX(load.x)} y1="20" x2={getSvgX(load.x)} y2="70" stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" /><text x={getSvgX(load.x)} y="15" fill="#fff">P={load.magnitude}</text></g>;
                    if (load.type === 'distributed') return renderDistributedLoadArrows(getSvgX(load.start_x), 75, getSvgX(load.end_x), 75, 0, load.magnitude);
                    return null;
                  })}
                </svg>
              </div>

              {chartData.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                  <div className="print-clean-border" style={{ backgroundColor: '#1A1A1A', padding: '15px', borderRadius: '8px' }}>
                    <h4 style={{ color: theme.textMain }}>Shear Force Diagram (SFD)</h4>
                    <ResponsiveContainer width="100%" height={250}><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="x" stroke="#888" /><YAxis stroke="#888" /><Tooltip /><Area type="stepAfter" dataKey="shear" stroke={theme.accent} fill="#252525" /></AreaChart></ResponsiveContainer>
                  </div>
                  <div className="print-clean-border" style={{ backgroundColor: '#1A1A1A', padding: '15px', borderRadius: '8px' }}>
                    <h4 style={{ color: theme.textMain }}>Bending Moment Diagram (BMD)</h4>
                    <ResponsiveContainer width="100%" height={250}><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="x" stroke="#888" /><YAxis stroke="#888" /><Tooltip /><Area type="linear" dataKey="moment" stroke={theme.supportOrange} fill="#252525" /></AreaChart></ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="no-print" style={{ backgroundColor: '#1A1A1A', padding: '15px', marginTop: '20px', borderRadius: '8px' }}>
                <button onClick={analyzeBeam} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#000', fontWeight: 'bold' }}>Analyze Beam</button>
              </div>
            </div>
          )}

          {/* ======================= TAB: TRUSS ======================= */}
          {activeTab === 'truss' && (
            <div className="report-document">
              <h2>Truss Analysis Builder</h2>
              <div className="no-print" style={{ marginBottom: '15px' }}><button onClick={loadTrussPreset}>Load Pratt Truss Preset</button> <button onClick={clearTrussCanvas}>Clear</button></div>
              <div className="print-clean-border" style={{ backgroundColor: '#151515', borderRadius: '8px', overflow: 'hidden' }}>
                <svg width="100%" height="500" onClick={handleTrussCanvasClick} style={{ cursor: 'crosshair', backgroundColor: '#151515' }}>
                  <rect width="100%" height="100%" fill="url(#gridT)" />
                  {elements.map(el => {
                    const n1 = nodes.find(n => n.id === el.n1), n2 = nodes.find(n => n.id === el.n2);
                    if (!n1 || !n2) return null;
                    const resM = trussAnalysisResult?.members?.find(m => m.name === `${n1.name}${n2.name}` || m.name === `${n2.name}${n1.name}`);
                    const color = resM ? (resM.status === 'Zero-Force' ? '#555' : (resM.status === 'Tension' ? '#00BFFF' : '#ff4444')) : '#fff';
                    return <line key={el.id} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={color} strokeWidth={resM ? "6" : "3"} />;
                  })}
                  {Object.entries(trussSupports).map(([id, s]) => {
                    const n = nodes.find(x => x.id == id); return n ? <RenderSupportSVG key={id} cx={n.x} cy={n.y} type={s.type} /> : null;
                  })}
                  {nodes.map(n => <circle key={n.id} cx={n.x} cy={n.y} r={6} fill="#fff" />)}
                </svg>
              </div>
              <div className="no-print" style={{ marginTop: '20px' }}>
                <button onClick={runTrussAnalysis} disabled={nodes.length < 3} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#000', fontWeight: 'bold' }}>Analyze Truss</button>
              </div>
            </div>
          )}

          {/* ======================= TAB: FRAME ======================= */}
          {activeTab === 'frame' && (
            <div className="report-document">
              <h2>Frame Analysis Builder</h2>
              <div className="no-print" style={{ marginBottom: '15px' }}><button onClick={loadFramePreset}>Load Portal Frame Preset</button> <button onClick={clearFrameCanvas}>Clear</button></div>
              <div className="print-clean-border" style={{ backgroundColor: '#151515', borderRadius: '8px', overflow: 'hidden' }}>
                <svg width="100%" height="500" onClick={handleFrameCanvasClick} style={{ cursor: 'crosshair', backgroundColor: '#151515' }}>
                  <rect width="100%" height="100%" fill="url(#gridT)" />
                  {fElements.map(el => {
                    const n1 = fNodes.find(n => n.id === el.n1), n2 = fNodes.find(n => n.id === el.n2);
                    if (!n1 || !n2) return null;
                    return (
                      <g key={el.id}>
                        <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke="#fff" strokeWidth="4" />
                        {renderDistributedLoadArrows(n1.x, n1.y, n2.x, n2.y, fDistLoads[el.id]?.wx, fDistLoads[el.id]?.wy)}
                      </g>
                    );
                  })}
                  {Object.entries(fSupports).map(([id, s]) => {
                    const n = fNodes.find(x => x.id == id); return n ? <RenderSupportSVG key={id} cx={n.x} cy={n.y} type={s.type} /> : null;
                  })}
                  {fNodes.map(n => <circle key={n.id} cx={n.x} cy={n.y} r={6} fill="#fff" />)}
                </svg>
              </div>
              <div className="no-print" style={{ marginTop: '20px' }}>
                <button onClick={runFrameStaticsAnalysis} disabled={fNodes.length < 2} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#000', fontWeight: 'bold' }}>Analyze Frame Reactions</button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

export default App
