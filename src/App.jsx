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
    { id: 1, name: 'Multi-Particle Equilibrium (Cables)', type: 'particle', date: 'Today' },
    { id: 2, name: 'Simply Supported Beam (UDL + Point)', type: 'beam', date: 'Yesterday' },
    { id: 3, name: 'Pratt Truss Analysis', type: 'truss', date: '3 days ago' }
  ])

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
  // PARTICLE EQUILIBRIUM BUILDER (MULTI-NODE)
  // ==========================================
  const [pNodes, setPNodes] = useState([])
  const [pElements, setPElements] = useState([])
  const [pSelectedNodeId, setPSelectedNodeId] = useState(null)
  const [pUnit, setPUnit] = useState('N')
  const [pGridScale, setPGridScale] = useState(1.0) 
  const [pSupports, setPSupports] = useState({})
  const [pLoads, setPLoads] = useState({})
  const [pAnalysisResult, setPAnalysisResult] = useState(null)
  const [pHistory, setPHistory] = useState([])

  const saveParticleState = () => setPHistory(prev => [...prev, { nodes: [...pNodes], elements: [...pElements], supports: {...pSupports}, loads: {...pLoads} }])

  const handleUndoParticle = () => {
    if (pHistory.length > 0) {
      const lastState = pHistory[pHistory.length - 1]
      setPNodes(lastState.nodes)
      setPElements(lastState.elements)
      setPSupports(lastState.supports)
      setPLoads(lastState.loads)
      setPSelectedNodeId(null)
      setPHistory(pHistory.slice(0, -1))
    }
  }

  const handleParticleCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) / PIXELS_PER_GRID) * PIXELS_PER_GRID;
    const y = Math.round((e.clientY - rect.top) / PIXELS_PER_GRID) * PIXELS_PER_GRID;
    const clickedExistingNode = pNodes.find(n => Math.abs(n.x - (e.clientX - rect.left)) < 20 && Math.abs(n.y - (e.clientY - rect.top)) < 20);
    
    if (clickedExistingNode) {
      if (pSelectedNodeId && pSelectedNodeId !== clickedExistingNode.id) {
        const isDup = pElements.some(el => (el.n1 === pSelectedNodeId && el.n2 === clickedExistingNode.id) || (el.n1 === clickedExistingNode.id && el.n2 === pSelectedNodeId));
        if (!isDup) { saveParticleState(); setPElements([...pElements, { id: Date.now(), n1: pSelectedNodeId, n2: clickedExistingNode.id }]); }
      }
      setPSelectedNodeId(clickedExistingNode.id); return;
    }
    const existingNode = pNodes.find(n => n.x === x && n.y === y);
    if (!existingNode) {
      saveParticleState();
      const newNodeId = Date.now();
      const nodeName = pNodes.length < 26 ? String.fromCharCode(65 + pNodes.length) : `N${pNodes.length}`;
      setPNodes([...pNodes, { id: newNodeId, name: nodeName, x, y }]);
      if (pSelectedNodeId) setPElements([...pElements, { id: Date.now() + 1, n1: pSelectedNodeId, n2: newNodeId }]);
      setPSelectedNodeId(newNodeId);
    } else { setPSelectedNodeId(null); }
  }

  const handlePSupportTypeChange = (nodeId, type) => {
    saveParticleState();
    setPSupports(prev => {
      const ns = { ...prev };
      if (type === 'none' || type === 'free') delete ns[nodeId];
      else ns[nodeId] = { ...ns[nodeId], type, direction: ns[nodeId]?.direction || 'horizontal' };
      return ns;
    });
  }

  const handlePLoadChange = (nodeId, axis, value) => {
    saveParticleState();
    setPLoads(prev => {
      const nl = { ...prev };
      if (value === '') {
        if (nl[nodeId]) { delete nl[nodeId][axis]; if (Object.keys(nl[nodeId]).length === 0) delete nl[nodeId]; }
      } else { nl[nodeId] = { ...(nl[nodeId] || {}), [axis]: Number(value) }; }
      return nl;
    });
  }

  const clearParticleCanvas = () => { saveParticleState(); setPNodes([]); setPElements([]); setPSupports({}); setPLoads({}); setPSelectedNodeId(null); setPAnalysisResult(null); }

  const runParticleAnalysis = async () => {
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 1500));
    try {
      // Use the truss backend logic since multi-particle cable network is mathematically identical to a truss
      const payload = {
        nodes: pNodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y })),
        elements: pElements.map(el => ({ id: el.id, n1: el.n1, n2: el.n2 })), 
        supports: pSupports, loads: pLoads, unit: pUnit, ei: null
      };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze-truss', payload);
      if(!response.data) throw new Error("No Data from Server");
      setPAnalysisResult(response.data);
    } catch (error) {
      console.error("Particle Analysis Error:", error); 
      alert("Analysis Failed! Ensure the system is stable and has enough supports.");
    } finally { setIsAnalyzing(false); }
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
    if (type === 'fixed') {
      return isV
        ? <rect x={cx-15} y={cy-15} width="10" height="30" fill={color} />
        : <rect x={cx-15} y={cy+5} width="30" height="10" fill={color} />;
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

  const inputStyle = { width: '80px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, marginLeft: '10px', fontFamily: '"Times New Roman", Times, serif', backgroundColor: '#2A2A2A', color: theme.textMain }

  return (
    <div className="app-bg" style={{ color: theme.textMain, fontFamily: '"Times New Roman", Times, serif' }}>
      
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none', zIndex: -1 }}>
        <defs>
          <marker id="arrowPoint" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.accent} /></marker>
          <marker id="arrowReaction" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.supportOrange} /></marker>
        </defs>
      </svg>

      {isAnalyzing && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(18,18,18,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: '70px', height: '70px', border: `6px solid #333`, borderTop: `6px solid ${theme.supportOrange}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h1 style={{ marginTop: '25px', color: theme.textMain, letterSpacing: '6px', fontSize: '2.2rem', fontFamily: '"Times New Roman", Times, serif', fontWeight: 'bold' }}>CHU CALC</h1>
          <p style={{ color: '#aaa', fontStyle: 'italic', margin: '5px 0 0 0' }}>Analyzing System Equilibrium...</p>
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
              <h4 style={{ margin: '10px 0 5px 0', color: '#fff' }}>1. General Static Equilibrium</h4>
              <p style={{ backgroundColor: '#2A2A2A', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', color: '#fff' }}>
                ∑Fx = 0 (Horizontal Force Equilibrium)<br/>
                ∑Fy = 0 (Vertical Force Equilibrium)<br/>
                ∑M_z = 0 (Moment Equilibrium about Any Point)
              </p>
              <h4 style={{ margin: '15px 0 5px 0', color: '#fff' }}>2. Particle Equilibrium</h4>
              <p style={{ backgroundColor: '#2A2A2A', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', color: '#fff' }}>
                ∑F = 0 ➔ ∑Fx = 0, ∑Fy = 0<br/>
                Cable Tension is constant throughout its length.<br/>
                Weight: W = m × 9.81 N
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

          <div style={{ backgroundColor: '#181818', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '25px', textAlign: 'left' }}>
            <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🕒 Recent Analysis Sessions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentProjects.map(proj => (
                <div 
                  key={proj.id}
                  onClick={() => { setCurrentView('statics'); setActiveTab(proj.type); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', backgroundColor: '#1E1E1E', borderRadius: '8px', border: '1px solid #333', cursor: 'pointer', transition: '0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#252525'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1E1E1E'}
                >
                  <span style={{ color: '#E0E0E0', fontWeight: 'bold' }}>{proj.name}</span>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase' }}>[{proj.type}]</span>
                    <span style={{ fontSize: '0.85rem', color: '#00BFFF' }}>{proj.date} ➔</span>
                  </div>
                </div>
              ))}
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

          {/* ======================= TAB 1: PARTICLE EQUILIBRIUM (MULTI-NODE) ======================= */}
          {activeTab === 'particle' && (
            <div className="report-document">
              <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Equilibrium of a Particle (Chapter 3)</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#888' }}>Interactive Canvas: Draw nodes, connect cables, and apply concurrent forces.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '15px', backgroundColor: '#1A1A1A', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>Tools:</span>
                <button onClick={handleUndoParticle} disabled={pHistory.length === 0} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: pHistory.length===0?'not-allowed':'pointer', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2A2A2A', color: '#fff', fontWeight: 'bold' }}>Undo</button>
                <button onClick={clearParticleCanvas} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2A2A2A', color: '#fff', fontWeight: 'bold' }}>Clear Canvas</button>
                
                <label style={{ fontSize: '0.9rem', fontWeight: 'bold', marginLeft: '15px' }}>Grid: 
                  <select value={pGridScale} onChange={(e) => setPGridScale(Number(e.target.value))} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif', padding: '4px' }}>
                    {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.5, 2.0].map(v => <option key={v} value={v}>{v.toFixed(1)}m</option>)}
                  </select>
                </label>
                <label style={{ fontSize: '0.9rem', fontWeight: 'bold', marginLeft: '10px' }}>Unit: 
                  <select value={pUnit} onChange={(e) => setPUnit(e.target.value)} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif', padding: '4px' }}>
                    <option value="N">N</option><option value="kN">kN</option><option value="lb">lb</option>
                  </select>
                </label>
              </div>

              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#1A1A1A' }}>
                <div style={{ width: '100%', overflow: 'auto', backgroundColor: '#151515', display: 'flex', justifyContent: 'center' }}>
                  <svg width="1400" height="500" onClick={handleParticleCanvasClick} style={{ cursor: 'crosshair', display: 'block', backgroundColor: '#151515' }}>
                    <defs>
                      <pattern id="gridP" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#2a2a2a" strokeWidth="1"/></pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#gridP)" />
                    {renderDimensions(pNodes, pGridScale)}
                    
                    {/* Render Cables */}
                    {pElements.map(el => {
                      const n1 = pNodes.find(n => n.id === el.n1), n2 = pNodes.find(n => n.id === el.n2);
                      if (!n1 || !n2) return null;
                      return <line key={el.id} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke="#00BFFF" strokeWidth="4" strokeLinecap="round" />
                    })}
                    
                    {/* Render Pin Supports */}
                    {Object.entries(pSupports).map(([nId, supData]) => {
                      const node = pNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                      return (
                        <g key={`sup-${nId}`}>
                          {/* Pin Wall (Vertical Line) */}
                          <line x1={node.x - 15} y1={node.y - 30} x2={node.x - 15} y2={node.y + 30} stroke={theme.supportOrange} strokeWidth="4" />
                          {/* Triangle Pin */}
                          <polygon points={`${node.x},${node.y} ${node.x-15},${node.y-15} ${node.x-15},${node.y+15}`} fill={theme.supportOrange} />
                        </g>
                      )
                    })}
                    
                    {/* Render Loads (Weights / Forces) */}
                    {Object.entries(pLoads).map(([nId, force]) => {
                      const node = pNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                      return (
                        <g key={`load-${nId}`}>
                          {Number(force.fy) !== 0 && force.fy !== undefined && (
                            <>
                              <line x1={node.x} y1={force.fy > 0 ? node.y - 50 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 50} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                              <text x={node.x + 12} y={node.y + 35} fill={theme.accent} fontSize="13" fontWeight="bold">Load: {Math.abs(force.fy)} {pUnit}</text>
                            </>
                          )}
                          {Number(force.fx) !== 0 && force.fx !== undefined && (
                            <>
                              <line x1={force.fx > 0 ? node.x - 50 : node.x + 10} y1={node.y} x2={force.fx > 0 ? node.x - 10 : node.x + 50} y2={node.y} stroke={theme.accent} strokeWidth="3" markerEnd="url(#arrowPoint)" />
                              <text x={node.x - 20} y={node.y - 15} fill={theme.accent} fontSize="13" fontWeight="bold">{force.fx} {pUnit}</text>
                            </>
                          )}
                        </g>
                      )
                    })}
                    
                    {/* Render Nodes (Joints) */}
                    {pNodes.map(node => (
                      <g key={node.id} style={{ cursor: 'pointer' }}>
                        <circle cx={node.x} cy={node.y} r={25} fill="transparent" onClick={(e) => handleParticleCanvasClick(e, node)} />
                        <circle cx={node.x} cy={node.y} r={pSelectedNodeId === node.id ? 8 : 5} fill={pSelectedNodeId === node.id ? theme.accent : "#fff"} stroke="#000" strokeWidth="2" style={{ pointerEvents: 'none' }} />
                        <text x={node.x + 12} y={node.y - 12} fill="#fff" fontSize="14" fontWeight="bold" style={{ pointerEvents: 'none' }}>{node.name}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'center' }}>
                <div style={{ flex: 1, backgroundColor: '#1A1A1A', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  {pNodes.find(n => n.id === pSelectedNodeId) ? (
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#fff' }}>Selected Node {pNodes.find(n=>n.id===pSelectedNodeId).name}:</strong>
                      
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: '#fff' }}>
                        <input 
                          type="checkbox" 
                          checked={!!pSupports[pSelectedNodeId]} 
                          onChange={(e) => handlePSupportTypeChange(pSelectedNodeId, e.target.checked ? 'pin' : 'none')} 
                        /> Wall Support (Pin)
                      </label>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '0.85rem' }}>Fx (Pull):</label>
                        <input type="number" placeholder={`Fx (${pUnit})`} value={pLoads[pSelectedNodeId]?.fx || ''} onChange={(e) => handlePLoadChange(pSelectedNodeId, 'fx', e.target.value)} style={inputStyle} />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '0.85rem' }}>Fy (Weight):</label>
                        <input type="number" placeholder={`Fy (${pUnit})`} value={pLoads[pSelectedNodeId]?.fy || ''} onChange={(e) => handlePLoadChange(pSelectedNodeId, 'fy', e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                  ) : <span style={{ fontSize: '0.9rem', color: '#888' }}>Click any node on canvas to add Wall Support or External Load/Weight.</span>}
                </div>
                <button onClick={runParticleAnalysis} disabled={pNodes.length < 3} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', backgroundColor: pNodes.length < 3 ? '#444' : '#333', color: '#fff', border: '1px solid #555', borderRadius: '8px', cursor: pNodes.length < 3 ? 'not-allowed' : 'pointer' }}>Analyze Cable Tensions</button>
              </div>

              {pAnalysisResult && (
                <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.accent}`, backgroundColor: '#1A1A1A' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: theme.textMain }}>Equilibrium Cable Tensions (∑Fx=0, ∑Fy=0)</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead><tr style={{ backgroundColor: '#222', borderBottom: `2px solid #555` }}><th style={{ padding: '6px', textAlign: 'left' }}>Cable Section</th><th style={{ padding: '6px', textAlign: 'right' }}>Tension Force ({pUnit})</th><th style={{ padding: '6px', textAlign: 'center' }}>Status</th></tr></thead>
                    <tbody>
                      {pAnalysisResult.members.map((m, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid #333`, backgroundColor: m.status === 'Compression' ? '#3a1f1f' : 'transparent' }}>
                          <td style={{ padding: '6px' }}>{m.name}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{Math.abs(m.force).toLocaleString()}</td>
                          <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold', color: m.status === 'Compression' ? '#ff4444' : '#4ade80' }}>
                            {m.status === 'Compression' ? 'Invalid (Cable Slack)' : 'Tension (OK)'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ marginTop: '10px', fontSize: '0.85rem', color: '#aaa' }}>*Note: Cables can only support Tension. If force shows 'Invalid', the system geometry will collapse.</p>
                </div>
              )}
            </div>
          )}

          {/* ======================= TAB 2: FORCE VECTORS ======================= */}
          {activeTab === 'vectors' && (
            <div className="report-document">
               {/* ... (เนื้อหาหน้า Vectors เหมือนเดิม) ... */}
            </div>
          )}

          {/* ======================= TAB 3: BEAM ======================= */}
          {activeTab === 'beam' && (
            <div className="report-document" id="report-container">
              {/* ... (เนื้อหาหน้า Beam เหมือนเดิม) ... */}
            </div>
          )}

          {/* ======================= TAB 4: TRUSS BUILDER ======================= */}
          {activeTab === 'truss' && (
            <div className="report-document">
              {/* ... (เนื้อหาหน้า Truss เหมือนเดิม) ... */}
            </div>
          )}

          {/* ======================= TAB 5: FRAME ANALYSIS ======================= */}
          {activeTab === 'frame' && (
            <div className="report-document">
              {/* ... (เนื้อหาหน้า Frame เหมือนเดิม) ... */}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
