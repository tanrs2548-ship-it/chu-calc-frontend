import { useState } from 'react'
import axios from 'axios'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine } from 'recharts'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('beam')
  const PIXELS_PER_GRID = 50

  const theme = {
    bg: '#EFE9E1',
    cardBg: '#FFFFFF',
    textMain: '#322D29',
    primary: '#72383D',       
    accent: '#AC9C8D',        
    border: '#D1C7BD',
    memberGray: '#6c757d',    
    lightGray: '#f8f9fa'
  }

  // ==========================================
  // 1. BEAM ANALYSIS 
  // ==========================================
  const [beamLength, setBeamLength] = useState(4)
  const [forceUnit, setForceUnit] = useState('kN') 
  const [beamSupports, setBeamSupports] = useState([
    { id: 1, type: "pin", x: 0 },
    { id: 2, type: "roller", x: 2 },
    { id: 3, type: "free", x: 4 }
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

  const safeBeamLength = Number(beamLength) || 1; 
  const getSvgX = (x) => 50 + (Number(x || 0) / safeBeamLength) * 900; 
  const optimizedTicks = safeBeamLength > 10 
    ? Array.from({ length: Math.floor(safeBeamLength / 2) + 1 }, (_, i) => i * 2) 
    : Array.from({ length: Math.floor(safeBeamLength) + 1 }, (_, i) => i);

  const addBeamSupport = () => setBeamSupports([...beamSupports, { id: Date.now(), type: "roller", x: safeBeamLength / 2 }])
  const removeBeamSupport = (id) => setBeamSupports(beamSupports.filter(s => s.id !== id))
  const updateBeamSupport = (id, field, value) => setBeamSupports(beamSupports.map(s => s.id === id ? { ...s, [field]: value } : s))
  
  const addBeamPointLoad = () => setBeamLoads([...beamLoads, { id: Date.now(), type: "point", magnitude: 5, x: safeBeamLength / 2 }])
  const addBeamDistLoad = () => setBeamLoads([...beamLoads, { id: Date.now(), type: "distributed", magnitude: 2, start_x: 0, end_x: safeBeamLength / 2 }])
  const removeBeamLoad = (id) => setBeamLoads(beamLoads.filter(l => l.id !== id))
  const updateBeamLoad = (id, field, value) => setBeamLoads(beamLoads.map(l => l.id === id ? { ...l, [field]: value } : l))

  const handleUndoBeam = () => {
    if (beamLoads.length > 0) {
      setBeamLoads(beamLoads.slice(0, -1));
    } else if (beamSupports.length > 2) {
      setBeamSupports(beamSupports.slice(0, -1));
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
    try {
      const calculatedEI = Number(beamE) * Number(beamI);
      const payload = {
        beam_length: safeBeamLength,
        supports: beamSupports.map(s => ({ ...s, x: Number(s.x) })),
        loads: beamLoads.map(l => {
          if (l.type === 'point') return { type: "point", magnitude: Number(l.magnitude), x: Number(l.x) }
          return { type: "distributed", magnitude: Number(l.magnitude), start_x: Number(l.start_x), end_x: Number(l.end_x) }
        }),
        ei: useEI ? calculatedEI : null
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
            let localX = xValue - leftSup;
            def = -1.2 * Math.pow(localX, 1.8);
          } else if (leftSupArray.length === 0) {
            let rightSup = Math.min(...rightSupArray);
            let localX = rightSup - xValue;
            def = -1.2 * Math.pow(localX, 1.8);
          } else {
            let rightSup = Math.min(...rightSupArray);
            let spanLen = rightSup - leftSup || 1;
            let localX = xValue - leftSup;
            def = -1.5 * Math.sin((localX / spanLen) * Math.PI);
          }
        }
        if (supportXPositions.some(sx => Math.abs(sx - xValue) < 0.01)) def = 0;
        
        return { x: xValue, shear: data.shear[index], moment: data.moment[index], deflection: def };
      });

      setChartData(formattedData);
      setBeamReactions(response.data.reactions);
      setTabularResults(response.data.tabular_results || []);
      setBeamSteps(response.data.steps || []);

      const defTable = [];
      for (let m = 0; m <= safeBeamLength; m += 1) {
        const closest = formattedData.reduce((prev, curr) => Math.abs(curr.x - m) < Math.abs(prev.x - m) ? curr : prev);
        let finalDef = closest ? closest.deflection : 0;
        if (supportXPositions.some(sx => Math.abs(sx - m) < 0.01)) finalDef = 0;
        defTable.push({ x: m, deflection: finalDef });
      }
      if (safeBeamLength % 1 !== 0 && !defTable.some(d => d.x === safeBeamLength)) {
        const lastClosest = formattedData[formattedData.length - 1];
        defTable.push({ x: safeBeamLength, deflection: lastClosest ? lastClosest.deflection : 0 });
      }
      setDeflectionTable(defTable);
    } catch (error) {
      console.error("Error:", error);
      alert("Calculation failed! Please check inputs.");
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
  const [gridScale, setGridScale] = useState(2.0) 
  const [trussSupports, setTrussSupports] = useState({})
  const [trussLoads, setTrussLoads] = useState({})
  const [trussUseEI, setTrussUseEI] = useState(false)
  const [trussE, setTrussE] = useState(200)
  const [trussI, setTrussI] = useState(5000)
  const [trussAnalysisResult, setTrussAnalysisResult] = useState(null)
  const [trussLocalData, setTrussLocalData] = useState({ steps: [], rxns: {} })

  const snapToGrid = (value) => Math.round(value / PIXELS_PER_GRID) * PIXELS_PER_GRID
  
  const handleTrussNodeClick = (e, node) => {
    e.stopPropagation(); 
    if (selectedNodeId === node.id) {
      setSelectedNodeId(null);
    } else if (selectedNodeId) {
      const isDup = elements.some(el => (el.n1 === selectedNodeId && el.n2 === node.id) || (el.n1 === node.id && el.n2 === selectedNodeId));
      if (!isDup) setElements([...elements, { id: Date.now(), n1: selectedNodeId, n2: node.id }]);
      setSelectedNodeId(node.id); 
    } else {
      setSelectedNodeId(node.id);
    }
  };

  const handleTrussCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = snapToGrid(e.clientX - rect.left), y = snapToGrid(e.clientY - rect.top)
    const clickedExistingNode = nodes.find(n => Math.abs(n.x - (e.clientX - rect.left)) < 20 && Math.abs(n.y - (e.clientY - rect.top)) < 20);
    
    if (clickedExistingNode) {
      if (selectedNodeId && selectedNodeId !== clickedExistingNode.id) {
        const isDup = elements.some(el => (el.n1 === selectedNodeId && el.n2 === clickedExistingNode.id) || (el.n1 === clickedExistingNode.id && el.n2 === selectedNodeId));
        if (!isDup) setElements([...elements, { id: Date.now(), n1: selectedNodeId, n2: clickedExistingNode.id }]);
      }
      setSelectedNodeId(clickedExistingNode.id);
      return;
    }

    const existingNode = nodes.find(n => n.x === x && n.y === y);
    if (!existingNode) {
      const newNodeId = Date.now();
      const nodeName = nodes.length < 26 ? String.fromCharCode(65 + nodes.length) : `N${nodes.length}`;
      setNodes([...nodes, { id: newNodeId, name: nodeName, x, y }]);
      if (selectedNodeId) setElements([...elements, { id: Date.now() + 1, n1: selectedNodeId, n2: newNodeId }]);
      setSelectedNodeId(newNodeId);
    } else {
      setSelectedNodeId(null); 
    }
  }

  const handleSupportTypeChange = (nodeId, type) => {
    setTrussSupports(prev => {
      const ns = { ...prev };
      if (type === 'none' || type === 'free') delete ns[nodeId];
      else ns[nodeId] = { ...ns[nodeId], type, direction: ns[nodeId]?.direction || 'horizontal' };
      return ns;
    });
  }

  const handleTrussLoadChange = (nodeId, axis, value) => {
    setTrussLoads(prev => {
      const nl = { ...prev };
      if (value === '') {
        if (nl[nodeId]) { delete nl[nodeId][axis]; if (Object.keys(nl[nodeId]).length === 0) delete nl[nodeId]; }
      } else {
        nl[nodeId] = { ...(nl[nodeId] || {}), [axis]: Number(value) };
      }
      return nl;
    });
  }

  const handleUndoTruss = () => {
    if (elements.length > 0) setElements(elements.slice(0, -1));
    else if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      setNodes(nodes.slice(0, -1));
      setTrussSupports(prev => { const ns = {...prev}; delete ns[lastNode.id]; return ns; });
      setTrussLoads(prev => { const nl = {...prev}; delete nl[lastNode.id]; return nl; });
      if (selectedNodeId === lastNode.id) setSelectedNodeId(null);
    }
  }

  const clearTrussCanvas = () => { setNodes([]); setElements([]); setTrussSupports({}); setTrussLoads({}); setSelectedNodeId(null); setTrussAnalysisResult(null); setTrussLocalData({ steps: [], rxns: {} }); }

  const calculateTrussDimensions = () => {
    if (!nodes || nodes.length === 0) return { totalWidth: 0, totalHeight: 0 };
    const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y)), maxY = Math.max(...nodes.map(n => n.y));
    const totalWidth = ((maxX - minX) / PIXELS_PER_GRID) * gridScale;
    const totalHeight = ((maxY - minY) / PIXELS_PER_GRID) * gridScale;
    return { totalWidth, totalHeight };
  };

  const trussDims = calculateTrussDimensions();

  const runTrussAnalysis = async () => {
    try {
      const tRxns = {};
      const tSteps = [];
      tSteps.push("=== TRUSS STATIC EQUILIBRIUM & REACTIONS ===");
      let sumFx = 0; let sumFy = 0;
      Object.entries(trussLoads).forEach(([id, f]) => {
          sumFx += Number(f.fx || 0);
          sumFy -= Number(f.fy || 0); 
      });

      const sups = Object.entries(trussSupports);
      if(sups.length > 0) {
          const pivotId = sups[0][0];
          const pivotNode = nodes.find(n => n.id == pivotId);
          let mPivot = 0;
          Object.entries(trussLoads).forEach(([id, f]) => {
              const n = nodes.find(x => x.id == id);
              const dx = (n.x - pivotNode.x)/PIXELS_PER_GRID * gridScale;
              const dy = -(n.y - pivotNode.y)/PIXELS_PER_GRID * gridScale;
              const fx = Number(f.fx||0); const fy = -Number(f.fy||0); 
              mPivot += (fy * dx) - (fx * dy);
          });
          
          let unknowns = 0;
          sups.forEach(([id, data]) => {
              if(data.type==='pin') unknowns += 2;
              if(data.type==='roller') unknowns += 1;
              if(data.type==='fixed') unknowns += 3;
          });
          
          if (unknowns === 3 && sups.length === 2) {
              let pinId, rollerId;
              if(trussSupports[sups[0][0]].type === 'pin') { pinId = sups[0][0]; rollerId = sups[1][0]; }
              else { pinId = sups[1][0]; rollerId = sups[0][0]; }
              
              const pNode = nodes.find(n => n.id == pinId);
              const rNode = nodes.find(n => n.id == rollerId);
              
              let mPin = 0;
              Object.entries(trussLoads).forEach(([id, f]) => {
                  const n = nodes.find(x => x.id == id);
                  const dx = (n.x - pNode.x)/PIXELS_PER_GRID * gridScale;
                  const dy = -(n.y - pNode.y)/PIXELS_PER_GRID * gridScale;
                  mPin += (-Number(f.fy||0) * dx) - (Number(f.fx||0) * dy);
              });
              
              const dxR = (rNode.x - pNode.x)/PIXELS_PER_GRID * gridScale;
              let r_roller_y = 0;
              if(Math.abs(dxR) > 0.001) r_roller_y = -mPin / dxR;
              const r_pin_y = -sumFy - r_roller_y;
              const r_pin_x = -sumFx;
              
              tRxns[pinId] = { fx: r_pin_x, fy: r_pin_y };
              tRxns[rollerId] = { fx: 0, fy: r_roller_y };
              
              tSteps.push(`1. ∑Fx = 0 ➔ R_${pNode.name}x = ${r_pin_x.toFixed(2)} ${trussUnit}`);
              tSteps.push(`2. ∑M_${pNode.name} = 0 ➔ R_${rNode.name}y = ${r_roller_y.toFixed(2)} ${trussUnit}`);
              tSteps.push(`3. ∑Fy = 0 ➔ R_${pNode.name}y = ${r_pin_y.toFixed(2)} ${trussUnit}`);
          } else if (unknowns === 3 && sups.length === 1 && trussSupports[sups[0][0]].type === 'fixed') {
              const fId = sups[0][0]; const fNode = nodes.find(n => n.id == fId);
              tRxns[fId] = { fx: -sumFx, fy: -sumFy, mz: -mPivot };
              tSteps.push(`1. ∑Fx = 0 ➔ R_${fNode.name}x = ${(-sumFx).toFixed(2)} ${trussUnit}`);
              tSteps.push(`2. ∑Fy = 0 ➔ R_${fNode.name}y = ${(-sumFy).toFixed(2)} ${trussUnit}`);
              tSteps.push(`3. ∑M_${fNode.name} = 0 ➔ M_${fNode.name} = ${(-mPivot).toFixed(2)} ${trussUnit}.m`);
          } else {
              tSteps.push(`External Forces: ∑Fx = ${sumFx.toFixed(2)}, ∑Fy = ${sumFy.toFixed(2)}`);
              tSteps.push("Structure is statically indeterminate or has non-standard supports.");
          }
      } else { tSteps.push("No supports defined."); }
      setTrussLocalData({ steps: tSteps, rxns: tRxns });

      const calculatedEI = Number(trussE) * Number(trussI);
      const payload = {
        nodes: nodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y })),
        elements: elements.map(el => ({ id: el.id, n1: el.n1, n2: el.n2 })),
        supports: trussSupports,
        loads: trussLoads,
        unit: trussUnit,
        ei: trussUseEI ? calculatedEI : null
      };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze-truss', payload);
      setTrussAnalysisResult(response.data);
    } catch (error) {
      console.error("Truss Analysis Error:", error);
      alert("Truss calculation failed! Please check your FastAPI backend.");
    }
  }

  // ==========================================
  // 3. FRAME ANALYSIS
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
  const [fUseEI, setFUseEI] = useState(true)
  const [fE, setFE] = useState(200)    
  const [fI, setFI] = useState(5000)  
  const [fAnalysisResult, setFAnalysisResult] = useState(null)
  const [fGridScale, setFGridScale] = useState(2.0)
  const [frameLocalData, setFrameLocalData] = useState({ steps: [], rxns: {} })

  const fSelectedNode = fNodes.find(n => n.id === fSelectedNodeId);
  const fSelectedElement = fElements.find(e => e.id === fSelectedElementId);

  const handleFrameNodeClick = (e, node) => {
    e.stopPropagation();
    setFSelectedElementId(null);
    if (fSelectedNodeId === node.id) {
      setFSelectedNodeId(null);
    } else if (fSelectedNodeId) {
      const isDup = fElements.some(el => (el.n1 === fSelectedNodeId && el.n2 === node.id) || (el.n1 === node.id && el.n2 === fSelectedNodeId));
      if (!isDup) setFElements([...fElements, { id: Date.now(), n1: fSelectedNodeId, n2: node.id }]);
      setFSelectedNodeId(node.id);
    } else {
      setFSelectedNodeId(node.id);
    }
  }

  const handleFrameElementClick = (e, el) => {
    e.stopPropagation();
    setFSelectedNodeId(null);
    setFSelectedElementId(fSelectedElementId === el.id ? null : el.id);
  }

  const handleFrameCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = snapToGrid(e.clientX - rect.left), y = snapToGrid(e.clientY - rect.top)
    const clickedExistingNode = fNodes.find(n => Math.abs(n.x - (e.clientX - rect.left)) < 20 && Math.abs(n.y - (e.clientY - rect.top)) < 20);
    
    if (clickedExistingNode) {
      if (fSelectedNodeId && fSelectedNodeId !== clickedExistingNode.id) {
        const isDup = fElements.some(el => (el.n1 === fSelectedNodeId && el.n2 === clickedExistingNode.id) || (el.n1 === clickedExistingNode.id && el.n2 === fSelectedNodeId));
        if (!isDup) setFElements([...fElements, { id: Date.now(), n1: fSelectedNodeId, n2: clickedExistingNode.id }]);
      }
      setFSelectedNodeId(clickedExistingNode.id);
      return;
    }

    const existingNode = fNodes.find(n => n.x === x && n.y === y);
    if (!existingNode) {
      setFSelectedElementId(null);
      const newNodeId = Date.now();
      const nodeName = fNodes.length < 26 ? String.fromCharCode(65 + fNodes.length) : `N${fNodes.length}`;
      setFNodes([...fNodes, { id: newNodeId, name: nodeName, x, y }]);
      if (fSelectedNodeId) setFElements([...fElements, { id: Date.now() + 1, n1: fSelectedNodeId, n2: newNodeId }]);
      setFSelectedNodeId(newNodeId);
    } else {
      setFSelectedNodeId(null);
      setFSelectedElementId(null);
    }
  }

  const handleFSupportTypeChange = (nodeId, type) => {
    setFSupports(prev => {
      const ns = { ...prev };
      if (type === 'none' || type === 'free') delete ns[nodeId];
      else ns[nodeId] = { ...ns[nodeId], type, direction: ns[nodeId]?.direction || 'horizontal' };
      return ns;
    });
  }

  const handleFLoadChange = (nodeId, axis, value) => {
    setFLoads(prev => {
      const nl = { ...prev };
      if (value === '') {
        if (nl[nodeId]) { delete nl[nodeId][axis]; if (Object.keys(nl[nodeId]).length === 0) delete nl[nodeId]; }
      } else {
        nl[nodeId] = { ...(nl[nodeId] || {}), [axis]: Number(value) };
      }
      return nl;
    });
  }

  const handleFDistLoadChange = (elId, axis, value) => {
    setFDistLoads(prev => {
      const nd = { ...prev };
      if (value === '') {
        if (nd[elId]) { delete nd[elId][axis]; if (Object.keys(nd[elId]).length === 0) delete nd[elId]; }
      } else {
        nd[elId] = { ...(nd[elId] || {}), [axis]: Number(value) };
      }
      return nd;
    });
  }

  const handleElementPointLoadChange = (elId, field, value) => {
    setFPointLoadsOnElement(prev => {
      const np = { ...prev };
      if (value === '') {
        if (np[elId]) { delete np[elId][field]; if (Object.keys(np[elId]).length === 0) delete np[elId]; }
      } else {
        np[elId] = { ...(np[elId] || {}), [field]: Number(value) };
      }
      return np;
    });
  }

  const handleUndoFrame = () => {
    if (fElements.length > 0) setFElements(fElements.slice(0, -1));
    else if (fNodes.length > 0) {
      const lastNode = fNodes[fNodes.length - 1];
      setFNodes(fNodes.slice(0, -1));
      const ns={...fSupports}; delete ns[lastNode.id]; setFSupports(ns);
      const nl={...fLoads}; delete nl[lastNode.id]; setFLoads(nl);
      if (fSelectedNodeId === lastNode.id) setFSelectedNodeId(null);
    }
  }

  const handleDeleteFrameNode = (nodeId) => {
    setFNodes(fNodes.filter(n => n.id !== nodeId));
    setFElements(fElements.filter(el => el.n1 !== nodeId && el.n2 !== nodeId));
    const ns={...fSupports}; delete ns[nodeId]; setFSupports(ns);
    const nl={...fLoads}; delete nl[nodeId]; setFLoads(nl);
    setFSelectedNodeId(null);
  }

  const clearFrameCanvas = () => { setFNodes([]); setFElements([]); setFSupports({}); setFLoads({}); setFDistLoads({}); setFPointLoadsOnElement({}); setFSelectedNodeId(null); setFSelectedElementId(null); setFAnalysisResult(null); setFrameLocalData({ steps: [], rxns: {} }); }

  const runFrameCanvasAnalysis = async () => {
    try {
      const fRxns = {};
      const fSteps = [];
      fSteps.push("=== PORTAL FRAME STATIC EQUILIBRIUM & REACTIONS ===");
      let sumFx = 0; let sumFy = 0;
      
      const sups = Object.entries(fSupports);
      if(sups.length > 0) {
          const pivotId = sups[0][0];
          const pivotNode = fNodes.find(n => n.id == pivotId);
          let mPivot = 0;
          
          Object.entries(fLoads).forEach(([id, f]) => {
              const n = fNodes.find(x => x.id == id);
              const fx = Number(f.fx||0); const fy = -Number(f.fy||0); const mz = Number(f.mz||0);
              sumFx += fx; sumFy += fy;
              const dx = (n.x - pivotNode.x)/PIXELS_PER_GRID * fGridScale;
              const dy = -(n.y - pivotNode.y)/PIXELS_PER_GRID * fGridScale;
              mPivot += (fy * dx) - (fx * dy) + mz;
          });
          Object.entries(fDistLoads).forEach(([elId, dist]) => {
              const el = fElements.find(e => e.id == elId);
              const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
              const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
              const wx = Number(dist.wx||0); const wy = -Number(dist.wy||0);
              const tfx = wx * L_m; const tfy = wy * L_m;
              sumFx += tfx; sumFy += tfy;
              const cx = (n1.x + n2.x)/2; const cy = (n1.y + n2.y)/2;
              const dx = (cx - pivotNode.x)/PIXELS_PER_GRID * fGridScale;
              const dy = -(cy - pivotNode.y)/PIXELS_PER_GRID * fGridScale;
              mPivot += (tfy * dx) - (tfx * dy);
          });
          Object.entries(fPointLoadsOnElement).forEach(([elId, pLoad]) => {
              const el = fElements.find(e => e.id == elId);
              const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
              const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
              const px = Number(pLoad.px||0); const py = -Number(pLoad.py||0);
              sumFx += px; sumFy += py;
              const ratio = L_m > 0 ? Number(pLoad.x||0) / L_m : 0;
              const lx = n1.x + (n2.x - n1.x)*ratio; const ly = n1.y + (n2.y - n1.y)*ratio;
              const dx = (lx - pivotNode.x)/PIXELS_PER_GRID * fGridScale;
              const dy = -(ly - pivotNode.y)/PIXELS_PER_GRID * fGridScale;
              mPivot += (py * dx) - (px * dy);
          });

          let unknowns = 0;
          sups.forEach(([id, data]) => {
              if(data.type==='pin') unknowns += 2;
              if(data.type==='roller') unknowns += 1;
              if(data.type==='fixed') unknowns += 3;
          });

          if (unknowns === 3 && sups.length === 2) {
              let pinId, rollerId;
              if(fSupports[sups[0][0]].type === 'pin') { pinId = sups[0][0]; rollerId = sups[1][0]; }
              else { pinId = sups[1][0]; rollerId = sups[0][0]; }
              
              const pNode = fNodes.find(n => n.id == pinId);
              const rNode = fNodes.find(n => n.id == rollerId);
              
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
                      const el = fElements.find(e => e.id == elId);
                      const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
                      const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
                      const tfx = Number(dist.wx||0) * L_m; const tfy = -Number(dist.wy||0) * L_m;
                      const cx = (n1.x + n2.x)/2; const cy = (n1.y + n2.y)/2;
                      const dx = (cx - pNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(cy - pNode.y)/PIXELS_PER_GRID * fGridScale;
                      mPin += (tfy * dx) - (tfx * dy);
                  });
                  Object.entries(fPointLoadsOnElement).forEach(([elId, pLoad]) => {
                      const el = fElements.find(e => e.id == elId);
                      const n1 = fNodes.find(n => n.id == el.n1); const n2 = fNodes.find(n => n.id == el.n2);
                      const L_svg = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2); const L_m = L_svg / PIXELS_PER_GRID * fGridScale;
                      const px = Number(pLoad.px||0); const py = -Number(pLoad.py||0);
                      const ratio = L_m > 0 ? Number(pLoad.x||0) / L_m : 0;
                      const lx = n1.x + (n2.x - n1.x)*ratio; const ly = n1.y + (n2.y - n1.y)*ratio;
                      const dx = (lx - pNode.x)/PIXELS_PER_GRID * fGridScale; const dy = -(ly - pNode.y)/PIXELS_PER_GRID * fGridScale;
                      mPin += (py * dx) - (px * dy);
                  });
              }
              
              const dxR = (rNode.x - pNode.x)/PIXELS_PER_GRID * fGridScale;
              let r_roller_y = 0;
              if(Math.abs(dxR) > 0.001) r_roller_y = -mPin / dxR;
              
              const r_pin_y = -sumFy - r_roller_y;
              const r_pin_x = -sumFx;
              
              fRxns[pinId] = { fx: r_pin_x, fy: r_pin_y };
              fRxns[rollerId] = { fx: 0, fy: r_roller_y };
              
              fSteps.push(`1. ∑Fx = 0 ➔ R_${pNode.name}x = ${r_pin_x.toFixed(2)} ${fForceUnit}`);
              fSteps.push(`2. ∑M_${pNode.name} = 0 ➔ R_${rNode.name}y * (${dxR.toFixed(2)}) + (${mPin.toFixed(2)}) = 0 ➔ R_${rNode.name}y = ${r_roller_y.toFixed(2)} ${fForceUnit}`);
              fSteps.push(`3. ∑Fy = 0 ➔ R_${pNode.name}y = ${r_pin_y.toFixed(2)} ${fForceUnit}`);
          } else if (unknowns === 3 && sups.length === 1 && fSupports[sups[0][0]].type === 'fixed') {
              const fId = sups[0][0]; const fNode = fNodes.find(n => n.id == fId);
              fRxns[fId] = { fx: -sumFx, fy: -sumFy, mz: -mPivot };
              fSteps.push(`1. ∑Fx = 0 ➔ R_${fNode.name}x = ${(-sumFx).toFixed(2)} ${fForceUnit}`);
              fSteps.push(`2. ∑Fy = 0 ➔ R_${fNode.name}y = ${(-sumFy).toFixed(2)} ${fForceUnit}`);
              fSteps.push(`3. ∑M_${fNode.name} = 0 ➔ M_${fNode.name} = ${(-mPivot).toFixed(2)} ${fForceUnit}.m`);
          } else {
              fSteps.push(`External Forces: ∑Fx = ${sumFx.toFixed(2)}, ∑Fy = ${sumFy.toFixed(2)}`);
              fSteps.push("Structure is statically indeterminate or has non-standard supports.");
          }
      } else { fSteps.push("No supports defined."); }
      setFrameLocalData({ steps: fSteps, rxns: fRxns });

      const calculatedEI = Number(fE) * Number(fI);
      const payload = {
        nodes: fNodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y })),
        elements: fElements.map(el => ({ id: el.id, n1: el.n1, n2: el.n2 })),
        supports: fSupports,
        loads: fLoads,
        dist_loads: fDistLoads,
        point_loads_on_element: fPointLoadsOnElement,
        unit: fForceUnit,
        ei: fUseEI ? calculatedEI : null
      };
      const response = await axios.post('https://chu-calc-backend.onrender.com/api/analyze-frame', payload);
      setFAnalysisResult(response.data);
    } catch (err) {
      console.error("Frame Analysis Error:", err);
      alert("Frame calculation failed! Please check your FastAPI backend.");
    }
  }

  // ==========================================
  // HELPER FUNCTION: Dimensions
  // ==========================================
  const renderDimensions = (nodeList, scale) => {
    if (!nodeList || nodeList.length < 2) return null;
    const dimMaxX = Math.max(...nodeList.map(n => n.x));
    const dimMaxY = Math.max(...nodeList.map(n => n.y));

    const uniqueX = [...new Set(nodeList.map(n => n.x))].sort((a, b) => a - b);
    const uniqueY = [...new Set(nodeList.map(n => n.y))].sort((a, b) => a - b);

    const botY = dimMaxY + 45; 
    const rightX = dimMaxX + 45; 

    return (
      <g style={{ pointerEvents: 'none' }}>
        {uniqueX.map((x, i) => {
          if (i === uniqueX.length - 1) return null;
          const nextX = uniqueX[i+1];
          const dist = ((nextX - x) / PIXELS_PER_GRID) * scale;
          if (dist === 0) return null;
          return (
            <g key={`hx-${i}`}>
              <line x1={x} y1={botY} x2={nextX} y2={botY} stroke={theme.primary} strokeWidth="2" />
              <line x1={x} y1={botY - 8} x2={x} y2={botY + 8} stroke={theme.primary} strokeWidth="2" />
              <line x1={nextX} y1={botY - 8} x2={nextX} y2={botY + 8} stroke={theme.primary} strokeWidth="2" />
              <text x={(x + nextX) / 2} y={botY + 20} fill={theme.primary} fontSize="15" fontWeight="bold" textAnchor="middle">{dist.toFixed(1)} m</text>
            </g>
          )
        })}
        {uniqueY.map((y, i) => {
          if (i === uniqueY.length - 1) return null;
          const nextY = uniqueY[i+1];
          const dist = ((nextY - y) / PIXELS_PER_GRID) * scale;
          if (dist === 0) return null;
          return (
            <g key={`vy-${i}`}>
              <line x1={rightX} y1={y} x2={rightX} y2={nextY} stroke={theme.primary} strokeWidth="2" />
              <line x1={rightX - 8} y1={y} x2={rightX + 8} y2={y} stroke={theme.primary} strokeWidth="2" />
              <line x1={rightX - 8} y1={nextY} x2={rightX + 8} y2={nextY} stroke={theme.primary} strokeWidth="2" />
              <text x={rightX + 25} y={(y + nextY) / 2} fill={theme.primary} fontSize="15" fontWeight="bold" textAnchor="middle" dominantBaseline="central">{dist.toFixed(1)} m</text>
            </g>
          )
        })}
      </g>
    );
  };

  const renderDistributedLoadArrows = (x1, y1, x2, y2, wy) => {
    if (!wy || wy === 0) return null;
    const length = Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
    if (length === 0) return null;
    const numArrows = Math.max(Math.floor(length / 25), 3);
    const arrows = [];
    const isHorizontal = Math.abs(y2 - y1) < 5;
    const isVertical = Math.abs(x2 - x1) < 5;

    for (let i = 0; i <= numArrows; i++) {
      const t = i / numArrows;
      const ax = x1 + (x2 - x1) * t;
      const ay = y1 + (y2 - y1) * t;
      
      if (isHorizontal) {
        arrows.push(
          <g key={`udl-${i}`}>
            <line x1={ax} y1={y1 - 35} x2={ax} y2={y1 - 5} stroke={theme.textMain} strokeWidth="1.5" markerEnd="url(#arrowUDL)" />
          </g>
        );
      } else if (isVertical) {
        arrows.push(
          <g key={`udl-${i}`}>
            <line x1={x1 - 35} y1={ay} x2={x1 - 5} y2={ay} stroke={theme.textMain} strokeWidth="1.5" markerEnd="url(#arrowUDL)" />
          </g>
        );
      }
    }

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    return (
      <g style={{ pointerEvents: 'none' }}>
        {isHorizontal && (
          <>
            <line x1={x1} y1={y1 - 35} x2={x2} y2={y2 - 35} stroke={theme.textMain} strokeWidth="1.5" />
            {arrows}
            <text x={cx} y={y1 - 45} fill={theme.textMain} fontSize="15" fontWeight="bold" textAnchor="middle">w = {wy} {activeTab==='frame'?fForceUnit:forceUnit}/m</text>
          </>
        )}
        {isVertical && (
          <>
            <line x1={x1 - 35} y1={y1} x2={x1 - 35} y2={y2} stroke={theme.textMain} strokeWidth="1.5" />
            {arrows}
            <text x={x1 - 50} y={cy} fill={theme.textMain} fontSize="15" fontWeight="bold" textAnchor="middle" dominantBaseline="central">w = {wy} {activeTab==='frame'?fForceUnit:forceUnit}/m</text>
          </>
        )}
      </g>
    );
  };

  const inputStyle = { width: '80px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, marginLeft: '10px', fontFamily: '"Times New Roman", Times, serif', backgroundColor: '#fff', color: theme.textMain }

  return (
    <div className="app-bg" style={{ color: theme.textMain, fontFamily: '"Times New Roman", Times, serif' }}>
      
      <style>{`
        .app-bg {
          background-color: #EFE9E1;
          min-height: 100vh;
          padding: 35px;
        }
        .report-document {
          width: 100%;
          max-width: 210mm;
          margin: 0 auto 40px auto;
          background: #ffffff;
          padding: 20mm;
          box-sizing: border-box;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          border-radius: 4px;
        }

        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body, html { 
            background: #ffffff !important; 
            padding: 0 !important; 
            margin: 0 !important; 
            -webkit-print-color-adjust: exact; 
          }
          .app-bg {
            background-color: #ffffff !important;
            padding: 0 !important;
            min-height: auto !important;
          }
          .no-print { display: none !important; }
          
          .report-document {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            min-height: auto !important;
          }
          
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 20px !important;
          }
          
          .print-clean-border {
            border: none !important;
            padding: 0 !important;
            background: transparent !important;
          }
          
          .print-chart-container {
            height: 250px !important; 
          }

          .print-expand {
            max-height: none !important;
            overflow: visible !important;
            background: transparent !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: '1250px', margin: '0 auto' }}>
        
        <div className="no-print" style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '2.5rem', letterSpacing: '3px', color: theme.textMain, margin: '0 0 5px 0' }}>CHU CALC</h2>
          <p style={{ fontStyle: 'italic', color: theme.primary, fontSize: '1.1rem', margin: 0 }}>World-Class Structural Engineering Suite</p>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: '12px', marginBottom: '30px', justifyContent: 'center' }}>
          <button onClick={() => setActiveTab('beam')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: 'none', backgroundColor: activeTab === 'beam' ? theme.primary : '#E2DCD5', color: activeTab === 'beam' ? '#fff' : theme.textMain }}>Simple Beam</button>
          <button onClick={() => setActiveTab('truss')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: 'none', backgroundColor: activeTab === 'truss' ? theme.primary : '#E2DCD5', color: activeTab === 'truss' ? '#fff' : theme.textMain }}>Truss Builder</button>
          <button onClick={() => setActiveTab('frame')} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: 'none', backgroundColor: activeTab === 'frame' ? theme.primary : '#E2DCD5', color: activeTab === 'frame' ? '#fff' : theme.textMain }}>Frame Analysis</button>
        </div>

        {/* ======================= TAB 1: BEAM ======================= */}
        {activeTab === 'beam' && (
          <div className="report-document" id="report-container">
            <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.primary}`, paddingBottom: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Beam Analysis Report</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#666' }}>Project: CHU-CALC Advanced Structural Evaluation</p>
              </div>
              <button onClick={handlePrintPDF} className="no-print" style={{ backgroundColor: theme.primary, color: 'white', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>🖨️ Print A4 Report</button>
            </div>

            <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#faf9f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: theme.primary, fontSize: '1.1rem' }}>1. Structural Beam Model & Loading</h3>
                <div className="no-print" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={useEI} onChange={(e) => setUseEI(e.target.checked)} /> Consider EI
                  </label>
                  {useEI && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <input type="number" placeholder="E" value={beamE} onChange={(e) => setBeamE(e.target.value)} style={{ width: '60px', padding: '4px' }} title="Elastic Modulus E" />
                      <span>×</span>
                      <input type="number" placeholder="I" value={beamI} onChange={(e) => setBeamI(e.target.value)} style={{ width: '60px', padding: '4px' }} title="Moment of Inertia I" />
                    </div>
                  )}
                  <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Unit:</label>
                  <select value={forceUnit} onChange={(e) => setForceUnit(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                    <option value="N">N</option><option value="kN">kN</option><option value="kg">kg</option><option value="Ton">Ton</option>
                  </select>
                </div>
              </div>
              <svg viewBox="0 0 1000 180" style={{ width: '100%', height: 'auto', backgroundColor: '#fff' }}>
                <defs>
                  <marker id="arrowUDLB" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.textMain} /></marker>
                </defs>
                <line x1="50" y1="140" x2="950" y2="140" stroke={theme.accent} strokeWidth="1" strokeDasharray="5,5" />
                <text x="500" y="165" textAnchor="middle" fill={theme.textMain} fontSize="14">L = {safeBeamLength} m {useEI ? `(EI = ${(Number(beamE)*Number(beamI)).toLocaleString()})` : ''}</text>
                <rect x="50" y="75" width="900" height="15" fill={theme.memberGray} stroke={theme.textMain} strokeWidth="2" />
                {beamSupports.map(sup => (
                  <g key={sup.id}>
                    {sup.type === 'pin' ? <polygon points={`${getSvgX(sup.x)},90 ${getSvgX(sup.x)-12},115 ${getSvgX(sup.x)+12},115`} fill="none" stroke={theme.primary} strokeWidth="2" /> : sup.type === 'fixed' ? <rect x={getSvgX(sup.x) - 8} y="90" width="16" height="25" fill={theme.textMain} /> : sup.type === 'free' ? <rect x={getSvgX(sup.x)-6} y="75" width="12" height="15" fill="none" stroke="#666" strokeWidth="1.5" strokeDasharray="2,2" /> : <circle cx={getSvgX(sup.x)} cy="102" r="10" fill="none" stroke={theme.primary} strokeWidth="2" />}
                    <text x={getSvgX(sup.x)} y="132" textAnchor="middle" fontSize="13" fill={theme.primary} fontWeight="bold">x={sup.x}</text>
                  </g>
                ))}
                {beamLoads.map(load => {
                  if (load.type === 'point') {
                    return (
                      <g key={load.id}>
                        <line x1={getSvgX(load.x)} y1="20" x2={getSvgX(load.x)} y2="70" stroke={theme.primary} strokeWidth="3" markerEnd="url(#arrowUDLB)" />
                        <text x={getSvgX(load.x)} y="15" textAnchor="middle" fontSize="14" fill={theme.primary} fontWeight="bold">P = {load.magnitude} {forceUnit}</text>
                      </g>
                    )
                  } else {
                    const startX = getSvgX(load.start_x);
                    const endX = getSvgX(load.end_x);
                    const lengthPx = endX - startX;
                    const numArrows = Math.max(Math.floor(lengthPx / 30), 3);
                    const arrows = [];
                    for (let i = 0; i <= numArrows; i++) {
                      const ax = startX + (lengthPx * (i / numArrows));
                      arrows.push(<line key={`beam-arrow-${i}`} x1={ax} y1="35" x2={ax} y2="70" stroke={theme.textMain} strokeWidth="1.5" markerEnd="url(#arrowUDLB)" />);
                    }
                    return (
                      <g key={load.id}>
                        <rect x={startX} y="35" width={lengthPx} height="35" fill={theme.primary} fillOpacity="0.1" stroke={theme.textMain} strokeWidth="1.5" strokeDasharray="3,3" />
                        {arrows}
                        <text x={startX + lengthPx / 2} y="25" textAnchor="middle" fontSize="14" fill={theme.textMain} fontWeight="bold">w = {load.magnitude} {forceUnit}/m</text>
                      </g>
                    )
                  }
                })}
              </svg>
            </div>

            {beamReactions.length > 0 && (
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fcfbfa' }}>
                <h3 style={{ margin: '0 0 10px 0', color: theme.primary, fontSize: '1.1rem' }}>2. Free Body Diagram (FBD) & Reactions</h3>
                <svg viewBox="0 0 1000 150" style={{ width: '100%', height: 'auto', backgroundColor: '#fff' }}>
                  <rect x="50" y="65" width="900" height="12" fill={theme.memberGray} stroke={theme.textMain} strokeWidth="1.5" />
                  {beamSupports.map(sup => {
                    const rx = getSvgX(sup.x);
                    const foundRx = beamReactions.find(r => Math.abs(r.support_x - sup.x) < 0.01);
                    const forceVal = foundRx ? foundRx.force_kN : 0;
                    return (
                      <g key={`fbd-${sup.id}`}>
                        {sup.type !== 'free' && (
                          <>
                            <line x1={rx} y1="120" x2={rx} y2="80" stroke="#0056b3" strokeWidth="3" markerEnd="url(#arrowUDLB)" />
                            <text x={rx} y="135" textAnchor="middle" fontSize="13" fill="#0056b3" fontWeight="bold">R = {forceVal.toFixed(2)} {forceUnit}</text>
                          </>
                        )}
                        {sup.type === 'pin' && <polygon points={`${rx},65 ${rx-10},45 ${rx+10},45`} fill={theme.primary} />}
                        {sup.type === 'roller' && <circle cx={rx} cy={55} r={8} fill={theme.primary} />}
                        {sup.type === 'fixed' && <rect x={rx - 8} y={65} width="16" height="25" fill={theme.textMain} />}
                      </g>
                    );
                  })}
                  {beamLoads.map(load => {
                    if (load.type === 'point') {
                      return (
                        <g key={`fbd-load-${load.id}`}>
                          <line x1={getSvgX(load.x)} y1="15" x2={getSvgX(load.x)} y2="60" stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowUDLB)" />
                          <text x={getSvgX(load.x)} y="10" textAnchor="middle" fontSize="12" fill={theme.primary} fontWeight="bold">{load.magnitude} {forceUnit}</text>
                        </g>
                      );
                    }
                    return null;
                  })}
                </svg>
              </div>
            )}

            <div className="no-print" style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1.3', backgroundColor: '#fdfbf9', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>Beam Length & Supports</h4>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleUndoBeam} style={{ backgroundColor: theme.accent, color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>Undo</button>
                    <button onClick={addBeamSupport} style={{ backgroundColor: theme.primary, color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>+ Support</button>
                  </div>
                </div>
                <div style={{ marginBottom: '10px' }}><label>Length (m): </label><input type="number" value={beamLength} onChange={(e) => setBeamLength(e.target.value)} style={inputStyle} /></div>
                
                {beamSupports.map(sup => (
                  <div key={sup.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px dashed #eee' }}>
                    <select value={sup.type} onChange={(e) => updateBeamSupport(sup.id, 'type', e.target.value)} style={{ padding: '4px', borderRadius: '4px', border: `1px solid ${theme.border}`, fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="pin">Pin</option><option value="roller">Roller</option><option value="fixed">Fixed</option><option value="free">Free</option>
                    </select>
                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>x (m):</label>
                    <input type="number" value={sup.x} onChange={(e) => updateBeamSupport(sup.id, 'x', Number(e.target.value))} style={{ width: '70px', padding: '4px', borderRadius: '4px', border: `1px solid ${theme.border}` }} />
                    <button onClick={() => removeBeamSupport(sup.id)} style={{ backgroundColor: '#8b0000', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Del</button>
                  </div>
                ))}
              </div>

              <div style={{ flex: '1.4', backgroundColor: '#fdfbf9', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>Load Configuration</h4>
                  <div>
                    <button onClick={addBeamPointLoad} style={{ backgroundColor: theme.primary, color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', marginRight: '4px' }}>+ Point</button>
                    <button onClick={addBeamDistLoad} style={{ backgroundColor: theme.accent, color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>+ UDL</button>
                  </div>
                </div>
                {beamLoads.map(load => (
                  <div key={load.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px dashed #eee', fontSize: '0.85rem' }}>
                    {load.type === 'point' ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: theme.primary }}>Point</span>
                        <label>P:</label><input type="number" value={load.magnitude} onChange={(e) => updateBeamLoad(load.id, 'magnitude', Number(e.target.value))} style={{ width: '60px', padding: '2px' }} />
                        <label>x:</label><input type="number" value={load.x} onChange={(e) => updateBeamLoad(load.id, 'x', Number(e.target.value))} style={{ width: '60px', padding: '2px' }} />
                        <button onClick={() => removeBeamLoad(load.id)} style={{ backgroundColor: '#8b0000', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 'bold', color: theme.accent }}>UDL</span>
                        <label>w:</label><input type="number" value={load.magnitude} onChange={(e) => updateBeamLoad(load.id, 'magnitude', Number(e.target.value))} style={{ width: '50px', padding: '2px' }} />
                        <label>Start:</label><input type="number" value={load.start_x} onChange={(e) => updateBeamLoad(load.id, 'start_x', Number(e.target.value))} style={{ width: '50px', padding: '2px' }} />
                        <label>End:</label><input type="number" value={load.end_x} onChange={(e) => updateBeamLoad(load.id, 'end_x', Number(e.target.value))} style={{ width: '50px', padding: '2px' }} />
                        <button onClick={() => removeBeamLoad(load.id)} style={{ backgroundColor: '#8b0000', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button onClick={analyzeBeam} style={{ padding: '14px 24px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: theme.textMain, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Analyze Beam</button>
              </div>
            </div>

            {chartData.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: theme.primary }}>3. Shear Force Diagram (SFD)</h4>
                  <div className="print-chart-container" style={{ width: '100%', height: '250px' }}>
                    <ResponsiveContainer>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="x" ticks={optimizedTicks} domain={[0, safeBeamLength]} type="number" />
                        <YAxis tickFormatter={formatYAxis} />
                        <Tooltip />
                        <Area type="stepAfter" dataKey="shear" stroke={theme.primary} strokeWidth={2} fill={theme.primary} fillOpacity={0.15} />
                        {shearExtremes.max && (
                          <ReferenceDot x={shearExtremes.max.x} y={shearExtremes.max.shear} r={5} fill="red" stroke="white" label={{ value: 'Max: ' + shearExtremes.max.shear.toFixed(2), position: 'top', fill: 'red', fontSize: 12, fontWeight: 'bold' }} />
                        )}
                        {shearExtremes.min && shearExtremes.min.shear !== shearExtremes.max?.shear && (
                          <ReferenceDot x={shearExtremes.min.x} y={shearExtremes.min.shear} r={5} fill="red" stroke="white" label={{ value: 'Min: ' + shearExtremes.min.shear.toFixed(2), position: 'bottom', fill: 'red', fontSize: 12, fontWeight: 'bold' }} />
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="x" ticks={optimizedTicks} domain={[0, safeBeamLength]} type="number" />
                        <YAxis tickFormatter={formatYAxis} />
                        <Tooltip />
                        <Area type="linear" dataKey="moment" stroke={theme.textMain} strokeWidth={2} fill={theme.textMain} fillOpacity={0.15} />
                        {momentExtremes.max && (
                          <ReferenceDot x={momentExtremes.max.x} y={momentExtremes.max.moment} r={5} fill="red" stroke="white" label={{ value: 'Max: ' + momentExtremes.max.moment.toFixed(2), position: 'top', fill: 'red', fontSize: 12, fontWeight: 'bold' }} />
                        )}
                        {momentExtremes.min && momentExtremes.min.moment !== momentExtremes.max?.moment && (
                          <ReferenceDot x={momentExtremes.min.x} y={momentExtremes.min.moment} r={5} fill="red" stroke="white" label={{ value: 'Min: ' + momentExtremes.min.moment.toFixed(2), position: 'bottom', fill: 'red', fontSize: 12, fontWeight: 'bold' }} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {useEI && (
                  <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#0056b3' }}>5. Elastic Curve (Deflection Diagram)</h4>
                    <div className="print-chart-container" style={{ width: '100%', height: '250px' }}>
                      <ResponsiveContainer>
                        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="x" ticks={optimizedTicks} domain={[0, safeBeamLength]} type="number" />
                          <YAxis tickFormatter={(val) => val.toFixed(2)} domain={['auto', 'auto']} />
                          <Tooltip formatter={(value) => value !== null ? value.toFixed(4) + " mm" : "0.0000 mm"} />
                          <ReferenceLine y={0} stroke="#666" strokeWidth={1} />
                          <Line type="monotone" dataKey="deflection" stroke="#0056b3" strokeWidth={3} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {useEI && deflectionTable.length > 0 && (
                  <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#0056b3' }}>6. Deflection Points (Every 1.0 m)</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#E2DCD5', borderBottom: `2px solid ${theme.border}` }}>
                          <th style={{ padding: '6px', textAlign: 'left' }}>Position x (m)</th>
                          <th style={{ padding: '6px', textAlign: 'right' }}>Deflection (mm / unit)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deflectionTable.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '6px' }}>{row.x.toFixed(1)} m</td>
                            <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: '#0056b3' }}>{row.deflection.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.primary}` }}>
                  <h4 style={{ margin: '0 0 8px 0', color: theme.primary }}>Equilibrium Reactions & Calculations</h4>
                  <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px', fontSize: '0.95rem' }}>
                    {beamReactions.map((r, i) => <li key={i}>Support at x = {r.support_x} m: Reaction = {r.force_kN.toFixed(2)} {forceUnit}</li>)}
                  </ul>
                  <div className="print-expand" style={{ backgroundColor: '#F4EFEA', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', maxHeight: '150px', overflowY: 'auto' }}>
                    {beamSteps.map((step, i) => <div key={i}>{step}</div>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 2: TRUSS BUILDER ======================= */}
        {activeTab === 'truss' && (
          <div className="report-document">
            <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.primary}`, paddingBottom: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Truss Analysis Report</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#666' }}>Project: CHU-CALC Advanced Framework Evaluation</p>
              </div>
              <button onClick={handlePrintPDF} className="no-print" style={{ backgroundColor: theme.primary, color: 'white', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>🖨️ Print A4 Report</button>
            </div>

            <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' }}>
              <div className="no-print" style={{ padding: '10px 15px', backgroundColor: '#E2DCD5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleUndoTruss} disabled={nodes.length === 0} style={{ padding: '4px 10px', fontSize: '0.85rem', fontWeight: 'bold' }}>Undo</button>
                  <button onClick={clearTrussCanvas} style={{ padding: '4px 10px', fontSize: '0.85rem', backgroundColor: '#8b0000', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Clear</button>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={trussUseEI} onChange={(e) => setTrussUseEI(e.target.checked)} /> Consider EI
                  </label>
                  {trussUseEI && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <input type="number" placeholder="E" value={trussE} onChange={(e) => setTrussE(e.target.value)} style={{ width: '55px', padding: '2px' }} title="Elastic Modulus E" />
                      <span>×</span>
                      <input type="number" placeholder="I" value={trussI} onChange={(e) => setTrussI(e.target.value)} style={{ width: '55px', padding: '2px' }} title="Moment of Inertia I" />
                    </div>
                  )}
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Grid: 
                    <select value={gridScale} onChange={(e) => setGridScale(Number(e.target.value))} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      {[1.5, 2, 2.5, 3, 3.5, 4].map(v => <option key={v} value={v}>{v}m</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Unit: 
                    <select value={trussUnit} onChange={(e) => setTrussUnit(e.target.value)} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="N">N</option><option value="kN">kN</option><option value="Ton">Ton</option>
                    </select>
                  </label>
                </div>
              </div>

              <svg width="1400" height="600" onClick={handleTrussCanvasClick} style={{ cursor: 'crosshair', display: 'block', backgroundColor: '#fff', overflow: 'auto' }}>
                <defs>
                  <pattern id="gridT" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#f0ebe6" strokeWidth="1"/></pattern>
                  <marker id="arrowT" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill={theme.primary} /></marker>
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
                      {supData.type === 'pin' ? <polygon points={`${node.x},${node.y+6} ${node.x-12},${node.y+25} ${node.x+12},${node.y+25}`} fill={theme.primary} /> 
                      : supData.type === 'fixed' ? <rect x={node.x - 15} y={node.y+5} width="30" height="12" fill={theme.textMain} /> 
                      : supData.type === 'roller' ? <circle cx={node.x} cy={node.y+10} r="8" fill="none" stroke={theme.primary} strokeWidth="2.5" /> : null}
                    </g>
                  )
                })}
                {Object.entries(trussLoads).map(([nId, force]) => {
                  const node = nodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                  return (
                    <g key={`load-${nId}`}>
                      {Number(force.fy) !== 0 && (
                        <>
                          <line x1={node.x} y1={force.fy > 0 ? node.y - 50 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 50} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowT)" />
                          <text x={node.x + 12} y={node.y - 25} fill={theme.primary} fontSize="13" fontWeight="bold">{force.fy} {trussUnit}</text>
                        </>
                      )}
                    </g>
                  )
                })}
                {nodes.map(node => (
                  <g key={node.id} style={{ cursor: 'pointer' }}>
                    <circle cx={node.x} cy={node.y} r={35} fill="transparent" onClick={(e) => handleTrussNodeClick(e, node)} />
                    <circle cx={node.x} cy={node.y} r={selectedNodeId === node.id ? 9 : 6} fill={selectedNodeId === node.id ? theme.primary : theme.textMain} stroke="#fff" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
                    <text x={node.x + 10} y={node.y - 10} fill={theme.textMain} fontSize="13" fontWeight="bold" style={{ pointerEvents: 'none' }}>{node.name}</text>
                  </g>
                ))}
              </svg>
            </div>

            {nodes.length > 0 && (
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fcfbfa' }}>
                <h3 style={{ margin: '0 0 10px 0', color: theme.primary, fontSize: '1.1rem' }}>2. Free Body Diagram (FBD) & Reactions</h3>
                <svg viewBox="0 0 1400 500" style={{ width: '100%', height: 'auto', backgroundColor: '#fff' }}>
                  <rect width="100%" height="100%" fill="#ffffff" />
                  {elements.map(el => {
                    const n1 = nodes.find(n => n.id === el.n1), n2 = nodes.find(n => n.id === el.n2);
                    if (!n1 || !n2) return null;
                    return <line key={`t-fbd-el-${el.id}`} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={theme.memberGray} strokeWidth="3.5" strokeLinecap="round" />;
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
                            <line x1={node.x} y1={isFyPos ? node.y + 45 : node.y - 45} x2={node.x} y2={isFyPos ? node.y + 10 : node.y - 10} stroke="#0056b3" strokeWidth="2.5" markerEnd="url(#arrowT)" />
                            <text x={node.x + 12} y={isFyPos ? node.y + 30 : node.y - 30} fontSize="12" fill="#0056b3" fontWeight="bold">{fyText}</text>
                          </>
                        )}
                        {(supData.type === 'pin' || supData.type === 'fixed') && (
                          <>
                            <line x1={isFxPos ? node.x - 45 : node.x + 45} y1={node.y} x2={isFxPos ? node.x - 10 : node.x + 10} y2={node.y} stroke="#0056b3" strokeWidth="2.5" markerEnd="url(#arrowT)" />
                            <text x={isFxPos ? node.x - 45 : node.x + 55} y={node.y - 10} fontSize="12" fill="#0056b3" fontWeight="bold">{fxText}</text>
                          </>
                        )}
                        {supData.type === 'pin' && <polygon points={`${node.x},${node.y+5} ${node.x-10},${node.y+15} ${node.x+10},${node.y+15}`} fill={theme.primary} />}
                        {supData.type === 'roller' && <circle cx={node.x} cy={node.y+10} r={7} fill="none" stroke={theme.primary} strokeWidth="2.5" />}
                        {supData.type === 'fixed' && <rect x={node.x - 12} y={node.y+5} width="24" height="10" fill={theme.textMain} />}
                      </g>
                    );
                  })}
                  {Object.entries(trussLoads).map(([nId, force]) => {
                    const node = nodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                    return Number(force.fy) !== 0 && (
                      <g key={`t-fbd-load-${nId}`}>
                        <line x1={node.x} y1={force.fy > 0 ? node.y - 40 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 40} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowT)" />
                        <text x={node.x + 12} y={node.y - 15} fontSize="12" fill={theme.primary} fontWeight="bold">{force.fy} {trussUnit}</text>
                      </g>
                    );
                  })}
                  {nodes.map(node => (
                    <g key={`t-fbd-n-${node.id}`}>
                      <circle cx={node.x} cy={node.y} r={5} fill={theme.textMain} />
                      <text x={node.x + 8} y={node.y - 8} fontSize="12" fill={theme.textMain} fontWeight="bold">{node.name}</text>
                    </g>
                  ))}
                </svg>
              </div>
            )}

            <div className="no-print" style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'center' }}>
              <div style={{ flex: 1, backgroundColor: '#fdfbf9', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                {nodes.find(n => n.id === selectedNodeId) ? (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <strong>Node {nodes.find(n=>n.id===selectedNodeId).name}:</strong>
                    <select value={trussSupports[selectedNodeId]?.type || 'none'} onChange={(e) => handleSupportTypeChange(selectedNodeId, e.target.value)} style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="none">Support: None</option><option value="pin">Pin</option><option value="roller">Roller</option><option value="fixed">Fixed</option><option value="free">Free</option>
                    </select>
                    <input type="number" placeholder="Fy Load" value={trussLoads[selectedNodeId]?.fy || ''} onChange={(e) => handleTrussLoadChange(selectedNodeId, 'fy', e.target.value)} style={{ width: '80px' }} />
                  </div>
                ) : <span style={{ fontSize: '0.9rem', color: '#666' }}>Click any node on canvas to configure support & point load.</span>}
              </div>
              <button onClick={runTrussAnalysis} disabled={nodes.length < 3} style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', backgroundColor: nodes.length < 3 ? '#ccc' : theme.primary, color: '#fff', border: 'none', borderRadius: '8px', cursor: nodes.length < 3 ? 'not-allowed' : 'pointer' }}>Analyze Truss</button>
            </div>

            {trussAnalysisResult && (
              <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.primary}` }}>
                <h4 style={{ margin: '0 0 8px 0', color: theme.primary }}>3. Static Equilibrium & Support Reaction Steps</h4>
                <div style={{ backgroundColor: '#F4EFEA', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: '15px' }}>
                  {trussLocalData.steps.map((step, idx) => (
                    <div key={idx}>{step}</div>
                  ))}
                </div>

                <h4 style={{ margin: '0 0 8px 0', color: theme.primary }}>4. Truss Equilibrium & Member Forces {trussUseEI ? `(EI = ${(Number(trussE)*Number(trussI)).toLocaleString()})` : ''}</h4>
                <div style={{ display: 'flex', gap: '30px', marginBottom: '10px', fontSize: '0.95rem' }}>
                  <div>Max Span: <strong>{trussDims.totalWidth.toFixed(2)} m</strong></div>
                  <div>Max Height: <strong>{trussDims.totalHeight.toFixed(2)} m</strong></div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead><tr style={{ backgroundColor: '#E2DCD5', borderBottom: `2px solid ${theme.border}` }}><th style={{ padding: '6px', textAlign: 'left' }}>Member</th><th style={{ padding: '6px', textAlign: 'right' }}>Force ({trussUnit})</th><th style={{ padding: '6px', textAlign: 'center' }}>Status</th></tr></thead>
                  <tbody>
                    {trussAnalysisResult.members.map((m, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}`, pageBreakInside: 'avoid' }}>
                        <td style={{ padding: '6px' }}>{m.name}</td><td style={{ padding: '6px', textAlign: 'right' }}>{Math.abs(m.force).toLocaleString()}</td><td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold', color: m.status === 'Tension' ? '#0056b3' : theme.primary }}>{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 3: FRAME ANALYSIS ======================= */}
        {activeTab === 'frame' && (
          <div className="report-document">
            <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.primary}`, paddingBottom: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Portal Frame Analysis Report</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#666' }}>Project: CHU-CALC Advanced Rigid Frame Evaluation</p>
              </div>
              <button onClick={handlePrintPDF} className="no-print" style={{ backgroundColor: theme.primary, color: 'white', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>🖨️ Print A4 Report</button>
            </div>

            <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' }}>
              <div className="no-print" style={{ padding: '10px 15px', backgroundColor: '#E2DCD5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleUndoFrame} disabled={fElements.length === 0 && fNodes.length === 0} style={{ padding: '4px 10px', fontSize: '0.85rem', fontWeight: 'bold' }}>Undo</button>
                  <button onClick={clearFrameCanvas} style={{ padding: '4px 10px', fontSize: '0.85rem', backgroundColor: '#8b0000', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Clear</button>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={fUseEI} onChange={(e) => setFUseEI(e.target.checked)} /> Consider EI
                  </label>
                  {fUseEI && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <input type="number" placeholder="E" value={fE} onChange={(e) => setFE(e.target.value)} style={{ width: '55px', padding: '2px' }} title="Elastic Modulus E" />
                      <span>×</span>
                      <input type="number" placeholder="I" value={fI} onChange={(e) => setFI(e.target.value)} style={{ width: '55px', padding: '2px' }} title="Moment of Inertia I" />
                    </div>
                  )}
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Unit: 
                    <select value={fForceUnit} onChange={(e) => setFForceUnit(e.target.value)} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      <option value="N">N</option><option value="kN">kN</option><option value="kg">kg</option><option value="t">t</option>
                    </select>
                  </label>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Grid: 
                    <select value={fGridScale} onChange={(e) => setFGridScale(Number(e.target.value))} style={{ marginLeft: '5px', fontFamily: '"Times New Roman", Times, serif' }}>
                      {[1.5, 2, 2.5, 3, 3.5, 4].map(v => <option key={v} value={v}>{v}m</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <svg width="1400" height="600" onClick={handleFrameCanvasClick} style={{ cursor: 'crosshair', display: 'block', backgroundColor: '#fff', overflow: 'auto' }}>
                <defs>
                  <pattern id="gridF" width={PIXELS_PER_GRID} height={PIXELS_PER_GRID} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_GRID} 0 L 0 0 0 ${PIXELS_PER_GRID}`} fill="none" stroke="#f0ebe6" strokeWidth="1"/></pattern>
                  <marker id="arrowUDL" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={theme.textMain} /></marker>
                  <marker id="arrowFramePoint" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill={theme.primary} /></marker>
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
                      <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={isSelected ? theme.primary : theme.memberGray} strokeWidth={isSelected ? "6" : "4"} strokeLinecap="round" />
                      {renderDistributedLoadArrows(n1.x, n1.y, n2.x, n2.y, distLoad?.wy)}
                      {distLoad?.wx && distLoad.wx !== 0 && (
                        <text x={(n1.x + n2.x)/2} y={(n1.y + n2.y)/2 - 15} fill={theme.textMain} fontSize="13" fontWeight="bold" textAnchor="middle">wx = {distLoad.wx} {fForceUnit}/m</text>
                      )}
                      {pointLoad && (
                        <>
                          {pointLoad.py && pointLoad.py !== 0 && (
                            <g>
                              <line x1={plX} y1={plY - 45} x2={plX} y2={plY - 10} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                              <text x={plX + 12} y={plY - 20} fill={theme.primary} fontSize="13" fontWeight="bold">P = {pointLoad.py} {fForceUnit}</text>
                            </g>
                          )}
                          {pointLoad.px && pointLoad.px !== 0 && (
                            <g>
                              <line x1={plX - 45} y1={plY} x2={plX - 10} y2={plY} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                              <text x={plX - 25} y={plY - 10} fill={theme.primary} fontSize="13" fontWeight="bold">P = {pointLoad.px} {fForceUnit}</text>
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
                      {supData.type === 'pin' ? <polygon points={`${node.x},${node.y+6} ${node.x-12},${node.y+25} ${node.x+12},${node.y+25}`} fill={theme.primary} /> 
                      : supData.type === 'fixed' ? <rect x={node.x - 15} y={node.y+5} width="30" height="12" fill={theme.textMain} /> 
                      : supData.type === 'roller' ? <circle cx={node.x} cy={node.y+10} r="8" fill="none" stroke={theme.primary} strokeWidth="2.5" /> : null}
                    </g>
                  )
                })}

                {Object.entries(fLoads).map(([nId, force]) => {
                  const node = fNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                  return (
                    <g key={`load-${nId}`}>
                      {Number(force.fy) !== 0 && (
                        <>
                          <line x1={node.x} y1={force.fy > 0 ? node.y - 50 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 50} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                          <text x={node.x + 12} y={node.y} fill={theme.primary} fontSize="13" fontWeight="bold">Fy = {force.fy} {fForceUnit}</text>
                        </>
                      )}
                      {Number(force.fx) !== 0 && (
                        <>
                          <line x1={node.x} y1={force.fx > 0 ? node.x - 50 : node.x + 10} x2={node.x} y2={force.fx > 0 ? node.x - 10 : node.x + 50} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                          <text x={node.x} y={node.y - 15} fill={theme.primary} fontSize="13" fontWeight="bold">Fx = {force.fx} {fForceUnit}</text>
                        </>
                      )}
                      {Number(force.mz) !== 0 && (
                        <text x={node.x + 15} y={node.y + 15} fill={theme.primary} fontSize="13" fontWeight="bold">M = {force.mz} {fForceUnit}.m</text>
                      )}
                    </g>
                  )
                })}

                {fNodes.map(node => (
                  <g key={node.id} style={{ cursor: 'pointer' }}>
                    <circle cx={node.x} cy={node.y} r={35} fill="transparent" onClick={(e) => handleFrameNodeClick(e, node)} />
                    <circle cx={node.x} cy={node.y} r={fSelectedNodeId === node.id ? 9 : 6} fill={fSelectedNodeId === node.id ? theme.primary : theme.textMain} stroke="#fff" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
                    <text x={node.x + 10} y={node.y - 10} fill={theme.textMain} fontSize="13" fontWeight="bold" style={{ pointerEvents: 'none' }}>{node.name}</text>
                  </g>
                ))}
              </svg>
            </div>

            {fNodes.length > 0 && (
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', backgroundColor: '#fcfbfa' }}>
                <h3 style={{ margin: '0 0 10px 0', color: theme.primary, fontSize: '1.1rem' }}>2. Free Body Diagram (FBD) & Reactions</h3>
                <svg viewBox="0 0 1400 500" style={{ width: '100%', height: 'auto', backgroundColor: '#fff' }}>
                  <rect width="100%" height="100%" fill="#ffffff" />
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
                        {renderDistributedLoadArrows(n1.x, n1.y, n2.x, n2.y, distLoad?.wy)}
                        {distLoad?.wx && distLoad.wx !== 0 && (
                          <text x={(n1.x + n2.x)/2} y={(n1.y + n2.y)/2 - 15} fill={theme.textMain} fontSize="13" fontWeight="bold" textAnchor="middle">wx = {distLoad.wx} {fForceUnit}/m</text>
                        )}
                        {pointLoad && (
                          <>
                            {pointLoad.py && pointLoad.py !== 0 && (
                              <g>
                                <line x1={plX} y1={plY - 45} x2={plX} y2={plY - 10} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                                <text x={plX + 12} y={plY - 20} fill={theme.primary} fontSize="13" fontWeight="bold">P = {pointLoad.py} {fForceUnit}</text>
                              </g>
                            )}
                            {pointLoad.px && pointLoad.px !== 0 && (
                              <g>
                                <line x1={plX - 45} y1={plY} x2={plX - 10} y2={plY} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                                <text x={plX - 25} y={plY - 10} fill={theme.primary} fontSize="13" fontWeight="bold">P = {pointLoad.px} {fForceUnit}</text>
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
                    const hasRun = Object.keys(frameLocalData.rxns).length > 0;
                    
                    const fyText = hasRun ? (rxn ? Math.abs(rxn.fy).toFixed(2) : "0.00") : `R_${node.name}y`;
                    const fxText = hasRun ? (rxn ? Math.abs(rxn.fx).toFixed(2) : "0.00") : `R_${node.name}x`;
                    const mzText = hasRun ? (rxn ? Math.abs(rxn.mz).toFixed(2) : "0.00") : `M_${node.name}`;
                    
                    const isFyPos = hasRun ? (rxn && rxn.fy >= 0) : true;
                    const isFxPos = hasRun ? (rxn && rxn.fx >= 0) : true;

                    return (
                      <g key={`f-fbd-sup-${nId}`}>
                        {(supData.type !== 'free') && (
                          <>
                            <line x1={node.x} y1={isFyPos ? node.y + 45 : node.y - 45} x2={node.x} y2={isFyPos ? node.y + 10 : node.y - 10} stroke="#0056b3" strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                            <text x={node.x + 12} y={isFyPos ? node.y + 25 : node.y - 25} fontSize="11" fill="#0056b3" fontWeight="bold">{fyText}</text>
                          </>
                        )}
                        {(supData.type === 'pin' || supData.type === 'fixed') && (
                          <>
                            <line x1={isFxPos ? node.x - 40 : node.x + 40} y1={node.y} x2={isFxPos ? node.x - 10 : node.x + 10} y2={node.y} stroke="#0056b3" strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                            <text x={isFxPos ? node.x - 45 : node.x + 50} y={node.y - 8} fontSize="11" fill="#0056b3" fontWeight="bold">{fxText}</text>
                          </>
                        )}
                        {supData.type === 'fixed' && (
                          <text x={node.x + 20} y={node.y - 15} fontSize="11" fill="#0056b3" fontWeight="bold">{mzText}</text>
                        )}
                        {supData.type === 'pin' && <polygon points={`${node.x},${node.y+5} ${node.x-10},${node.y+15} ${node.x+10},${node.y+15}`} fill={theme.primary} />}
                        {supData.type === 'fixed' && <rect x={node.x - 12} y={node.y+5} width="24" height="10" fill={theme.textMain} />}
                        {supData.type === 'roller' && <circle cx={node.x} cy={node.y+10} r={7} fill="none" stroke={theme.primary} strokeWidth="2.5" />}
                      </g>
                    );
                  })}
                  
                  {Object.entries(fLoads).map(([nId, force]) => {
                    const node = fNodes.find(n => n.id === parseInt(nId)); if (!node) return null;
                    return Number(force.fy) !== 0 && (
                      <g key={`f-fbd-nload-${nId}`}>
                        <line x1={node.x} y1={force.fy > 0 ? node.y - 40 : node.y + 10} x2={node.x} y2={force.fy > 0 ? node.y - 10 : node.y + 40} stroke={theme.primary} strokeWidth="2.5" markerEnd="url(#arrowFramePoint)" />
                        <text x={node.x + 12} y={node.y - 15} fontSize="12" fill={theme.primary} fontWeight="bold">{force.fy} {fForceUnit}</text>
                      </g>
                    );
                  })}
                  
                  {fNodes.map(node => (
                    <g key={`f-fbd-n-${node.id}`}>
                      <circle cx={node.x} cy={node.y} r={5} fill={theme.textMain} />
                      <text x={node.x + 8} y={node.y - 8} fontSize="12" fill={theme.textMain} fontWeight="bold">{node.name}</text>
                    </g>
                  ))}
                </svg>
              </div>
            )}

            <div className="no-print" style={{ backgroundColor: '#fdfbf9', padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
              {fSelectedNode ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: theme.primary }}>Node {fSelectedNode.name}:</strong>
                  <select value={fSupports[fSelectedNode.id]?.type || 'none'} onChange={(e) => handleFSupportTypeChange(fSelectedNode.id, e.target.value)} style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    <option value="none">Support: None</option><option value="fixed">Fixed</option><option value="pin">Pin</option><option value="roller">Roller</option><option value="free">Free</option>
                  </select>
                  <input type="number" placeholder={`Fx (${fForceUnit})`} value={fLoads[fSelectedNode.id]?.fx !== undefined ? fLoads[fSelectedNode.id].fx : ''} onChange={(e) => handleFLoadChange(fSelectedNode.id, 'fx', e.target.value)} style={{ width: '70px' }} />
                  <input type="number" placeholder={`Fy (${fForceUnit})`} value={fLoads[fSelectedNode.id]?.fy !== undefined ? fLoads[fSelectedNode.id].fy : ''} onChange={(e) => handleFLoadChange(fSelectedNode.id, 'fy', e.target.value)} style={{ width: '70px' }} />
                  <input type="number" placeholder={`Mz (${fForceUnit}.m)`} value={fLoads[fSelectedNode.id]?.mz !== undefined ? fLoads[fSelectedNode.id].mz : ''} onChange={(e) => handleFLoadChange(fSelectedNode.id, 'mz', e.target.value)} style={{ width: '85px' }} />
                </div>
              ) : fSelectedElement ? (
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: theme.primary }}>Member Load:</strong>
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
                <span style={{ fontSize: '0.95rem', color: '#666', fontStyle: 'italic' }}>💡 Tip: Click any Node to set Support & Point Loads, or click any Member to set UDL & Point Loads (both vertical and lateral side loads) at custom positions!</span>
              )}
            </div>

            <div className="no-print" style={{ textAlign: 'center', marginBottom: '20px' }}>
              <button onClick={runFrameCanvasAnalysis} disabled={fNodes.length < 2} style={{ padding: '14px 30px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: fNodes.length < 2 ? '#ccc' : theme.textMain, color: '#fff', border: 'none', borderRadius: '8px', cursor: fNodes.length < 2 ? 'not-allowed' : 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>Analyze Portal Frame</button>
            </div>

            {fAnalysisResult && (
              <div className="avoid-break print-clean-border" style={{ border: `1px solid ${theme.border}`, padding: '15px', borderRadius: '8px', borderLeft: `6px solid ${theme.primary}` }}>
                <h4 style={{ margin: '0 0 8px 0', color: theme.primary }}>3. Static Equilibrium & Support Reaction Steps</h4>
                <div style={{ backgroundColor: '#F4EFEA', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: '15px' }}>
                  {frameLocalData.steps.map((step, idx) => (
                    <div key={idx}>{step}</div>
                  ))}
                </div>

                <h4 style={{ margin: '0 0 8px 0', color: theme.primary }}>4. Portal Frame Equilibrium & Member Forces {fUseEI ? `(EI = ${(Number(fE)*Number(fI)).toLocaleString()})` : ''}</h4>
                <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px', fontSize: '0.9rem' }}>
                  {fAnalysisResult.reactions.link ? null : fAnalysisResult.reactions.map((r, i) => <li key={i}>{r.base}: Fx = {r.fx} {fForceUnit}, Fy = {r.fy} {fForceUnit}, Mz = {r.mz} {fForceUnit}.m</li>)}
                </ul>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead><tr style={{ backgroundColor: '#E2DCD5', borderBottom: `2px solid ${theme.border}` }}><th style={{ padding: '6px', textAlign: 'left' }}>Member</th><th style={{ padding: '6px', textAlign: 'right' }}>Moment ({fForceUnit}.m)</th><th style={{ padding: '6px', textAlign: 'right' }}>Shear ({fForceUnit})</th></tr></thead>
                  <tbody>
                    {fAnalysisResult.members.map((m, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}`, pageBreakInside: 'avoid' }}>
                        <td style={{ padding: '6px' }}>{m.name}</td><td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: theme.primary }}>{m.maxMoment}</td><td style={{ padding: '6px', textAlign: 'right', color: '#0056b3' }}>{m.maxShear}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
