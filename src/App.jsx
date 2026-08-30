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
  // PARTICLE SIMPLIFIED WORKBENCH STATES (Chapter 3)
  // ==========================================
  const [pWeight, setPWeight] = useState(150) // น้ำหนักของกล้องโทรทรรศน์อวกาศ
  const [pAngle1, setPAngle1] = useState(30)  // มุมเชือกขวาเทียบแกน X (องศา)
  const [pAngle2, setPAngle2] = useState(45)  // มุมเชือกซ้ายเทียบแกน X (องศา)
  const [particleUnit, setParticleUnit] = useState('N')
  const [particleResult, setParticleResult] = useState(null)

  const analyzeSimpleParticle = () => {
    setIsAnalyzing(true)
    setTimeout(() => {
      const w = Number(pWeight) || 0
      const th1 = (Number(pAngle1) || 0) * Math.PI / 180
      const th2 = (Number(pAngle2) || 0) * Math.PI / 180

      // สมดุลแรง 2 มิติ:
      // T1 cos(th1) - T2 cos(th2) = 0
      // T1 sin(th1) + T2 sin(th2) - W = 0
      const denom = Math.sin(th1) * Math.cos(th2) + Math.cos(th1) * Math.sin(th2)
      let t1 = 0, t2 = 0
      if (Math.abs(denom) > 0.0001) {
        t1 = (w * Math.cos(th2)) / Math.sin(th1 + th2) // T1 (ซ้าย)
        t2 = (w * Math.cos(th1)) / Math.sin(th1 + th2) // T2 (ขวา)
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
          `[Step 1] กำหนดค่าน้ำหนักกล้องโทรทรรศน์อวกาศ W = ${w} ${particleUnit}`,
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

  const inputStyle = { width: '90px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, marginLeft: '10px', fontFamily: '"Times New Roman", Times, serif', backgroundColor: '#2A2A2A', color: theme.textMain }

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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(18,18,18,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: '70px', height: '70px', border: `6px solid #333`, borderTop: `6px solid ${theme.supportOrange}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h1 style={{ marginTop: '25px', color: theme.textMain, letterSpacing: '6px', fontSize: '2.2rem', fontFamily: '"Times New Roman", Times, serif', fontWeight: 'bold' }}>CHU CALC</h1>
          <p style={{ color: '#aaa', fontStyle: 'italic', margin: '5px 0 0 0' }}>Analyzing Particle Equilibrium...</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Formula Sheet Modal */}
      {showFormulaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#1E1E1E', color: '#E0E0E0', padding: '30px', borderRadius: '12px', maxWidth: '650px', width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Statics Formula Sheet</h2>
              <button onClick={() => setShowFormulaModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 'bold', color: '#fff' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#ccc' }}>
              <h4 style={{ margin: '10px 0 5px 0', color: '#fff' }}>1. Particle Equilibrium Equations</h4>
              <p style={{ backgroundColor: '#2A2A2A', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', color: '#fff' }}>
                ∑Fx = 0 ➔ T₂ cos(θ₂) - T₁ cos(θ₁) = 0<br/>
                ∑Fy = 0 ➔ T₁ sin(θ₁) + T₂ sin(θ₂) - W = 0
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
            {/* วิชาอื่นๆ */}
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
                  <h1 style={{ color: theme.textMain, margin: 0, fontSize: '1.8rem', fontFamily: '"Times New Roman", Times, serif' }}>Equilibrium of a Particle (Customizable Setup)</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: '#888' }}>Interactive Particle Equilibrium with Horizontal Pin Supports and Space Telescope Load.</p>
                </div>
              </div>

              {/* Workspace สำหรับแสดงภาพจำลองตามโจทย์ */}
              <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', flexWrap: 'wrap', justifyContent: 'center' }}>
                
                {/* รูปที่ 1: Problem Diagram (Pin แนวนอน + กล้องโทรทรรศน์อวกาศ) */}
                <div style={{ flex: 1, minWidth: '340px', backgroundColor: '#151515', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '15px', textAlign: 'center' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#00BFFF', fontSize: '1rem' }}>Problem Diagram: Suspension System</h4>
                  <svg viewBox="0 0 450 320" style={{ width: '100%', height: 'auto', backgroundColor: '#151515' }}>
                    {/* ผนังซ้ายและขวา */}
                    <rect x="40" y="60" width="15" height="100" fill="#a07050" stroke="#555" />
                    <rect x="395" y="60" width="15" height="100" fill="#a07050" stroke="#555" />
                    {/* Pin แนวนอนซ้าย (C) และขวา (B) */}
                    <circle cx="55" cy="90" r="6" fill="#FFA500" stroke="#fff" strokeWidth="1.5" />
                    <text x="50" y="80" fill="#fff" fontSize="14" fontWeight="bold">C</text>
                    <circle cx="395" cy="90" r="6" fill="#FFA500" stroke="#fff" strokeWidth="1.5" />
                    <text x="395" y="80" fill="#fff" fontSize="14" fontWeight="bold">B</text>
                    
                    {/* จุด Joint ตรงกลาง (B / Ring) */}
                    <circle cx="225" cy="180" r="6" fill="#00BFFF" stroke="#fff" strokeWidth="1.5" />
                    <text x="235" y="175" fill="#00BFFF" fontSize="14" fontWeight="bold">Joint</text>

                    {/* สายเคเบิลซ้ายและขวา */}
                    <line x1="55" y1="90" x2="225" y2="180" stroke="#00BFFF" strokeWidth="3.5" />
                    <line x1="395" y1="90" x2="225" y2="180" stroke="#00BFFF" strokeWidth="3.5" />

                    {/* มุม θ₁ และ θ₂ */}
                    <text x="110" y="125" fill="#FFA500" fontSize="13" fontWeight="bold">θ₁ = {pAngle1}°</text>
                    <text x="300" y="125" fill="#FFA500" fontSize="13" fontWeight="bold">θ₂ = {pAngle2}°</text>

                    {/* สายเคเบิลห้อยน้ำหนัก */}
                    <line x1="225" y1="180" x2="225" y2="230" stroke="#00BFFF" strokeWidth="3.5" />

                    {/* รูปกล้องโทรทรรศน์อวกาศ (Space Telescope) */}
                    <g transform="translate(195, 230)">
                      {/* บอดี้กล้องหลัก */}
                      <rect x="0" y="0" width="60" height="50" rx="6" fill="#334155" stroke="#94a3b8" strokeWidth="2" />
                      {/* แผงโซลาร์เซลล์ซ้าย-ขวา */}
                      <rect x="-30" y="10" width="25" height="30" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1" />
                      <rect x="65" y="10" width="25" height="30" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1" />
                      <line x1="-30" y1="25" x2="-5" y2="25" stroke="#94a3b8" strokeWidth="2" />
                      <line x1="65" y1="25" x2="90" y2="25" stroke="#94a3b8" strokeWidth="2" />
                      {/* เลนส์กล้อง */}
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
                    {/* แกนพิกัด X-Y */}
                    <line x1="225" y1="40" x2="225" y2="280" stroke="#666" strokeWidth="1.5" strokeDasharray="4,4" />
                    <text x="235" y="55" fill="#888" fontSize="14">y</text>
                    <line x1="60" y1="180" x2="390" y2="180" stroke="#666" strokeWidth="1.5" strokeDasharray="4,4" />
                    <text x="375" y="170" fill="#888" fontSize="14">x</text>
                    
                    {/* จุด Joint ตรงกลาง */}
                    <circle cx="225" cy="180" r="5" fill="#fff" />
                    <text x="200" y="195" fill="#fff" fontSize="13" fontWeight="bold">Joint</text>

                    {/* แรง T₁ (ซ้ายขึ้นบน) */}
                    <line x1="225" y1="180" x2="115" y2="90" stroke="#00BFFF" strokeWidth="3.5" markerEnd="url(#arrowPoint)" />
                    <text x="120" y="125" fill="#00BFFF" fontSize="14" fontWeight="bold">T₁</text>

                    {/* แรง T₂ (ขวาขึ้นบน) */}
                    <line x1="225" y1="180" x2="335" y2="90" stroke="#00BFFF" strokeWidth="3.5" markerEnd="url(#arrowPoint)" />
                    <text x="305" y="125" fill="#00BFFF" fontSize="14" fontWeight="bold">T₂</text>

                    {/* น้ำหนัก W (ดึงลงล่าง) */}
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
                  <button onClick={analyzeSimpleParticle} style={{ padding: '12px 30px', fontSize: '1rem', fontWeight: 'bold', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '8px', cursor: 'pointer' }}>Calculate Equilibrium ($T_1$ & $T_2$)</button>
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

          {/* ส่วนแท็บอื่นๆ (Vectors, Beam, Truss, Frame) คงเดิม */}
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

          {/* ======================= TAB 1: BEAM ======================= */}
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

          {/* ======================= TAB 2: TRUSS BUILDER ======================= */}
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
                <button onClick={() => loadTrussPreset('warren')} style={{ padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2A2A2A', color: '#fff', fontWeight: 'bold' }}>Warren Truss</button>
              </div>
              <div className="avoid-break print-clean-border" style={{ marginBottom: '20px', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#1A1A1A' }}>
                <div style={{ padding: '10px 15px', backgroundColor: '#222', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleUndoTruss} disabled={trussHistory.length === 0} style={{ padding: '4px 10px', fontSize: '0.85rem', fontWeight: 'bold', cursor: trussHistory.length===0?'not-allowed':'pointer', backgroundColor: '#2A2A2A', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}>Undo</button>
                    <button onClick={clearTrussCanvas} style={{ padding: '4px 10px', fontSize: '0.85rem', backgroundColor: '#2A2A2A', color: '#fff', border: '1px solid #444', borderRadius: '4px', fontWeight: 'bold' }}>Clear</button>
                  </div>
                </div>
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

          {/* ======================= TAB 3: FRAME ANALYSIS ======================= */}
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
