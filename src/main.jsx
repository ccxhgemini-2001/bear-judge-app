import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
// 修复点1：移除了不存在的 UserSearch，确保所有图标都能找到
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, Award, Landmark, CheckCircle2, Circle, ArrowLeft, Coffee, Timer, Terminal } from 'lucide-react';

/* --- 1. 配置解析与环境 --- */
const parseConfig = (val) => {
  if (!val) return null;
  try { return JSON.parse(val); } catch (e) {
    try {
      let s = val.trim();
      if (s.includes('=')) s = s.substring(s.indexOf('{'), s.lastIndexOf('}') + 1);
      if (s.endsWith(';')) s = s.slice(0, -1);
      return JSON.parse(s);
    } catch (e2) { return null; }
  }
};

const getEnv = (key) => {
  try {
    const meta = import.meta;
    if (meta && meta.env) {
      if (key === 'FIREBASE') return meta.env.VITE_FIREBASE_CONFIG;
      if (key === 'GEMINI') return meta.env.VITE_GEMINI_API_KEY;
      if (key === 'APP_ID') return meta.env.VITE_APP_ID;
    }
  } catch (e) {}
  return "";
};

const firebaseConfig = parseConfig(getEnv('FIREBASE'));
const apiKey = getEnv('GEMINI');
const appId = getEnv('APP_ID') || 'bear-judge-app-v3';
const modelName = "gemini-1.5-flash";
const FIXED_COVER_URL = "/cover.jpg";

/* --- 2. 初始化 Firebase --- */
let app, auth, db;
if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) { console.error("Firebase Init Error:", e); }
}

/* --- 3. 主组件 --- */
const App = () => {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [caseId, setCaseId] = useState('');
  const [currentCase, setCurrentCase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [tempInput, setTempInput] = useState('');
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  const cooldownRef = useRef(null);
  const abortControllerRef = useRef(null);
  const lastRequestTime = useRef(0);
  
  // 开发者模式
  const [devMode, setDevMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [devTargetSide, setDevTargetSide] = useState('A');

  // 认证监听
  useEffect(() => {
    if (!auth) {
      setError("配置异常：未检测到 Firebase 配置，请检查 Vercel 环境变量。");
      setInitializing(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setInitializing(false);
    });
    signInAnonymously(auth).catch(() => {
        setError("认证服务连接失败");
        setInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  // 案卷监听
  useEffect(() => {
    if (!user || !caseId || !db) return;
    const caseDoc = doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId);
    const unsubscribe = onSnapshot(caseDoc, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCurrentCase(data);
        if (devMode && !data.verdict) {
            // 自动切换开发者视角
            if (!data.sideA.submitted) setDevTargetSide('A');
            else if (!data.sideB.submitted) setDevTargetSide('B');
        }
      }
    }, (err) => setError("卷宗连接断开"));
    return () => unsubscribe();
  }, [user, caseId, devMode]);

  // 冷却计时
  useEffect(() => {
    if (cooldown > 0) cooldownRef.current = setInterval(() => setCooldown(c => c - 1), 1000);
    else clearInterval(cooldownRef.current);
    return () => clearInterval(cooldownRef.current);
  }, [cooldown]);

  const handleTitleClick = () => {
    setClickCount(prev => {
      const next = prev + 1;
      if (next >= 5) { setDevMode(d => !d); return 0; }
      return next;
    });
  };

  const createCase = async (chosenRole) => {
    if (!db || !user) return;
    setLoading(true); setError("");
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sideA = chosenRole === 'male' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    const sideB = chosenRole === 'female' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', newId), {
        id: newId, createdBy: user.uid, status: 'waiting', sideA, sideB, verdict: null, createdAt: Date.now()
      });
      setCurrentCase(null);
      setCaseId(newId);
    } catch (err) { setError("创建失败，请稍后重试"); }
    finally { setLoading(false); }
  };

  const joinCase = (id) => {
    if (!id) return;
    setCurrentCase(null); setError(""); setCaseId(id.toUpperCase());
  };

  const pickRoleInCase = async (role) => {
    if (!db || !currentCase || !user) return;
    setLoading(true);
    const field = role === 'male' ? 'sideA' : 'sideB';
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { [`${field}.uid`]: user.uid });
    } catch (err) { setError("认领失败"); }
    finally { setLoading(false); }
  };

  const submitPart = async () => {
    if (!tempInput.trim() || !currentCase || !user) return;
    setLoading(true);
    const isA = devMode ? (devTargetSide === 'A') : (currentCase.sideA.uid === user.uid);
    const field = isA ? "sideA" : "sideB";
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        [`${field}.content`]: tempInput, [`${field}.submitted`]: true
      });
      setTempInput('');
    } catch (err) { setError("提交失败"); }
    finally { setLoading(false); }
  };

  const triggerAIJudge = async () => {
    if (loading || cooldown > 0) return;
    if (!apiKey) { setError("缺少 API Key"); return; }
    
    setLoading(true); setError(""); setLoadingMsg("熊正在连线 AI 大脑...");
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感调解专家。必须输出严格 JSON 格式的裁决。包含判决标题、归因比例、法律引用、深度诊断、将心比心、暖心金句、和好罚单。`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: `[男方]:${currentCase.sideA.content}\n[女方]:${currentCase.sideB.content}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (response.status === 429) { throw new Error("429"); }
      if (!response.ok) throw new Error("API Error");
      
      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      const verdict = JSON.parse(rawText || "{}");

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { verdict, status: 'finished' });
    } catch (err) {
      if (err.message === "429") { setError("法官累了，请休息 60 秒"); setCooldown(60); }
      else if (err.name !== 'AbortError') setError("宣判服务暂时不可用");
    } finally { setLoading(false); setLoadingMsg(""); }
  };

  if (initializing) return <div className="min-h-screen flex items-center justify-center bg-[#FFFDFB] text-[#8D6E63]"><RefreshCw className="animate-spin" /></div>;

  const verdictData = currentCase?.verdict;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const userRole = currentCase?.sideA?.uid === user?.uid ? 'A' : (currentCase?.sideB?.uid === user?.uid ? 'B' : null);
  const isMyTurn = currentCase && !verdictData && !isBothSubmitted && (
    devMode || (userRole === 'A' && !currentCase.sideA.submitted) || (userRole === 'B' && !currentCase.sideB.submitted)
  );

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-[#4E342E] font-sans pb-10 select-none overflow-x-hidden">
      {error && (
        <div className="fixed top-20 left-4 right-4 z-50 p-4 bg-rose-600 text-white rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-2">
           <AlertCircle /> <span className="flex-1 text-sm font-bold">{error}</span> 
           <button onClick={() => setError('')} className="bg-white/20 p-1 rounded">✕</button>
        </div>
      )}

      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-[#F5EBE0] p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 font-black text-lg text-[#8D6E63] cursor-pointer" onClick={handleTitleClick}>
          <Scale className="fill-[#8D6E63] text-white p-0.5 bg-[#8D6E63] rounded" size={24} /> 轻松熊法庭 {devMode && <span className="text-xs text-red-500 bg-red-100 px-1 rounded">DEV</span>}
        </div>
        {user && <span className="text-xs font-mono text-[#A1887F]">{user.uid.slice(0,4)}</span>}
      </nav>

      <div className="max-w-xl mx-auto p-4">
        <div className="aspect-video bg-[#F5EBE0] rounded-3xl mb-6 relative overflow-hidden shadow-lg border-4 border-white">
            <img src={FIXED_COVER_URL} className="w-full h-full object-cover" onError={(e)=>e.target.src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800"} alt="Cover" />
            <div className="absolute bottom-4 left-6 text-white font-black text-2xl drop-shadow-md">公正 · 治愈 · 爱</div>
        </div>

        {!caseId ? (
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-[#F5EBE0] text-center relative overflow-hidden">
            <Gavel className="mx-auto text-amber-500 mb-4 bg-amber-50 p-4 rounded-3xl w-20 h-20" />
            <h2 className="text-2xl font-black text-[#3E2723] mb-8">神圣最高法庭</h2>
            
            {showRoleSelect ? (
               <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-right">
                 <button onClick={() => createCase('male')} className="bg-blue-50 text-blue-700 p-6 rounded-3xl font-bold border-2 border-blue-100 active:scale-95 transition">🙋‍♂️ 男方</button>
                 <button onClick={() => createCase('female')} className="bg-rose-50 text-rose-700 p-6 rounded-3xl font-bold border-2 border-rose-100 active:scale-95 transition">🙋‍♀️ 女方</button>
                 <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-gray-400 text-sm font-bold py-3">返回</button>
               </div>
            ) : (
               <>
                 <button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-4 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition mb-4 flex justify-center gap-2"><UserPlus /> 发起新诉讼</button>
                 <div className="flex gap-2">
                   <input placeholder="输入案卷号" className="flex-1 bg-[#FDF5E6] rounded-2xl px-4 text-center font-black tracking-widest text-[#5D4037] outline-none border-2 border-transparent focus:border-amber-200" onChange={e => setTempInput(e.target.value)} />
                   <button onClick={() => joinCase(tempInput)} className="bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-5 rounded-2xl font-black">调取</button>
                 </div>
               </>
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in">
             <div className="bg-white p-4 rounded-3xl flex justify-between items-center shadow-sm border border-[#F5EBE0]">
                <div className="flex gap-3 items-center">
                   <ShieldCheck className="text-amber-500 bg-amber-50 p-2 rounded-xl w-10 h-10" />
                   <div><div className="text-[10px] text-[#A1887F] font-bold">案卷号</div><div className="font-mono font-black text-xl text-[#5D4037]">{caseId}</div></div>
                </div>
                <button onClick={() => navigator.clipboard.writeText(caseId)} className="bg-[#F5F5F5] p-2 rounded-xl text-[#8D6E63]"><Copy size={18}/></button>
             </div>

             {!currentCase ? (
                <div className="p-20 text-center"><RefreshCw className="animate-spin mx-auto text-[#8D6E63]" /></div>
             ) : !verdictData ? (
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-[#F5EBE0] min-h-[400px] flex flex-col">
                   {(!userRole && !devMode) ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                         {/* 修复点2：这里把 UserSearch 换成了 UserPlus */}
                        <UserPlus className="w-16 h-16 text-amber-500 mb-4" />
                        <h3 className="font-black text-lg mb-6 text-[#5D4037]">请认领当事人身份</h3>
                        <div className="grid grid-cols-2 gap-4 w-full">
                           <button onClick={() => pickRoleInCase('male')} disabled={!!currentCase.sideA.uid} className={`p-4 rounded-2xl font-bold border-2 ${currentCase.sideA.uid ? 'bg-gray-100 text-gray-400 grayscale' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>🙋‍♂️ 男方{currentCase.sideA.uid&&'(已)'}</button>
                           <button onClick={() => pickRoleInCase('female')} disabled={!!currentCase.sideB.uid} className={`p-4 rounded-2xl font-bold border-2 ${currentCase.sideB.uid ? 'bg-gray-100 text-gray-400 grayscale' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>🙋‍♀️ 女方{currentCase.sideB.uid&&'(已)'}</button>
                        </div>
                      </div>
                   ) : isMyTurn ? (
                      <div className="flex-1 flex flex-col animate-in slide-in-from-right">
                        <div className="flex justify-between items-end mb-4">
                           <h3 className="font-black text-lg flex gap-2 items-center text-[#5D4037]"><MessageCircle className="text-amber-500"/> 提交辩词</h3>
                           {devMode && <div className="text-[10px] bg-gray-100 p-1 rounded flex gap-1"><button onClick={()=>setDevTargetSide('A')} className={devTargetSide==='A'?'font-bold':''}>男</button>|<button onClick={()=>setDevTargetSide('B')} className={devTargetSide==='B'?'font-bold':''}>女</button></div>}
                        </div>
                        <textarea className="flex-1 bg-[#FDFBF9] rounded-2xl border-2 border-[#F5EBE0] p-4 mb-4 text-sm focus:border-amber-200 outline-none resize-none" placeholder="把委屈告诉熊..." value={tempInput} onChange={e => setTempInput(e.target.value)} />
                        <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-4 rounded-2xl font-black text-lg shadow active:scale-95 transition">确认提交</button>
                      </div>
                   ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                         <div className="text-6xl mb-6">🏛️</div>
                         <h3 className="font-black text-xl mb-2 text-[#5D4037]">{isBothSubmitted ? '证据已收齐' : '采证中...'}</h3>
                         <p className="text-xs text-[#A1887F] mb-8">{isBothSubmitted ? '请点击下方按钮开庭' : '等待对方提交证词'}</p>
                         
                         <div className="flex justify-center gap-4 w-full mb-8">
                            <div className={`flex-1 p-3 rounded-2xl border flex flex-col items-center ${currentCase.sideA.submitted ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-300'}`}><CheckCircle2 size={20} /><span className="text-[10px] font-bold mt-1">男方</span></div>
                            <div className={`flex-1 p-3 rounded-2xl border flex flex-col items-center ${currentCase.sideB.submitted ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-gray-50 border-gray-100 text-gray-300'}`}><CheckCircle2 size={20} /><span className="text-[10px] font-bold mt-1">女方</span></div>
                         </div>

                         {isBothSubmitted && (
                            <button onClick={triggerAIJudge} disabled={loading || cooldown > 0} className={`w-full py-4 rounded-2xl font-black text-xl shadow-lg flex items-center justify-center gap-2 text-white transition ${cooldown > 0 ? 'bg-gray-300' : 'bg-[#D84315] hover:bg-[#BF360C] animate-pulse'}`}>
                               {loading ? <RefreshCw className="animate-spin" /> : <Gavel />} {cooldown > 0 ? `${cooldown}s` : '开庭宣判'}
                            </button>
                         )}
                         {loading && <p className="text-xs text-amber-600 mt-2 font-bold animate-bounce">{loadingMsg}</p>}
                      </div>
                   )}
                </div>
             ) : (
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-t-[12px] border-[#8D6E63] animate-in slide-in-from-bottom duration-700">
                   <div className="p-8 text-center bg-[#FFFDFB]">
                      <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-black tracking-widest mb-4">VERDICT</div>
                      <h2 className="text-2xl font-black text-[#3E2723] mb-2">📜 {verdictData.verdict_title}</h2>
                      <p className="text-xs italic text-[#8D6E63] bg-[#F5EBE0] py-2 px-4 rounded-xl inline-block">“{verdictData.law_reference}”</p>
                   </div>
                   
                   <div className="px-8 pb-8 space-y-6">
                      <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                         <div className="flex justify-between text-[10px] font-black mb-2 uppercase text-[#A1887F]"><span>归因比例</span></div>
                         <div className="flex h-4 rounded-full overflow-hidden w-full">
                            <div style={{width: `${verdictData.fault_ratio?.A||50}%`}} className="bg-blue-300 h-full"></div>
                            <div style={{width: `${verdictData.fault_ratio?.B||50}%`}} className="bg-rose-300 h-full"></div>
                         </div>
                         <div className="flex justify-between text-[10px] font-bold mt-1 px-1">
                            <span className="text-blue-500">男方 {verdictData.fault_ratio?.A}%</span>
                            <span className="text-rose-500">女方 {verdictData.fault_ratio?.B}%</span>
                         </div>
                      </div>

                      <div>
                         <h4 className="font-black text-[#5D4037] flex gap-2 items-center text-sm mb-2"><Sparkles size={16} className="text-amber-500"/> 深度诊断</h4>
                         <p className="text-sm text-[#5D4037] leading-relaxed bg-[#FDFBF9] p-4 rounded-2xl border border-[#F5EBE0]">{verdictData.analysis}</p>
                      </div>

                      <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100">
                         <h4 className="font-black text-emerald-800 flex gap-2 items-center text-sm mb-2"><Heart size={16} className="text-emerald-500"/> 将心比心</h4>
                         <p className="text-sm text-emerald-900/80 leading-relaxed">{verdictData.perspective_taking}</p>
                      </div>

                      <div className="bg-amber-50 p-6 rounded-[2rem] text-center border border-amber-100">
                         <div className="text-amber-900/60 font-black text-3xl mb-2">”</div>
                         <p className="text-amber-900 font-bold italic">{verdictData.bear_wisdom}</p>
                      </div>

                      <div className="pt-6 border-t-2 border-dashed border-[#F5EBE0]">
                         <h4 className="text-center font-black text-[#8D6E63] mb-4 text-sm uppercase tracking-widest">和好罚单</h4>
                         <div className="space-y-2">
                            {verdictData.punishments?.map((p,i)=>(<div key={i} className="bg-white border-2 border-[#F5EBE0] p-3 rounded-xl text-center text-xs font-bold text-[#5D4037] shadow-sm">{p}</div>))}
                         </div>
                      </div>

                      <button onClick={()=>{setCaseId('');setCurrentCase(null);}} className="w-full py-4 text-[#A1887F] text-xs font-black tracking-widest hover:text-[#5D4037] uppercase">结案 · 拥抱离场</button>
                   </div>
                </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

// 挂载逻辑
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}

export default App;
