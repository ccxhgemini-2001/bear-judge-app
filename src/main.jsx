import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, Award, Landmark, CheckCircle2, Circle, ArrowLeft, Coffee, Timer, Terminal } from 'lucide-react';

/**
 * --- 王国配置清洗层 ---
 */
const advancedParse = (val) => {
  if (!val) return null;
  try {
    let cleanVal = val.trim();
    if (cleanVal.includes('=')) {
      cleanVal = cleanVal.substring(cleanVal.indexOf('{'), cleanVal.lastIndexOf('}') + 1);
    }
    if (cleanVal.endsWith(';')) cleanVal = cleanVal.slice(0, -1);
    return typeof cleanVal === 'string' ? JSON.parse(cleanVal) : cleanVal;
  } catch (e) {
    try { return (new Function(`return ${val}`))(); } catch (e2) { return null; }
  }
};

const getEnvValue = (key) => {
  if (typeof window !== 'undefined' && window[key]) return window[key];
  try {
    return import.meta.env[key];
  } catch (e) {
    return undefined;
  }
};

// 识别环境：Canvas 预览 or Vercel 生产
const isCanvas = typeof window !== 'undefined' && (!!window.__api_key || window.location.hostname.includes('usercontent.goog'));

const firebaseConfig = advancedParse(getEnvValue('__firebase_config') || getEnvValue('VITE_FIREBASE_CONFIG'));
const apiKey = getEnvValue('__api_key') || getEnvValue('VITE_GEMINI_API_KEY');
const appId = getEnvValue('__app_id') || getEnvValue('VITE_APP_ID') || 'bear-judge-app-v3';

// 生产环境使用稳定版 Flash，Canvas 预览使用 2.5
const modelName = isCanvas ? "gemini-2.5-flash-preview-09-2025" : "gemini-1.5-flash";
const FIXED_COVER_URL = "/cover.jpg"; 

// 初始化 Firebase 服务
let app, auth, db;
if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) { console.error("Firebase Init Error:", e); }
}

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

  const [devMode, setDevMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [devTargetSide, setDevTargetSide] = useState('A'); 

  // 1. 认证初始化
  useEffect(() => {
    if (!auth) {
      setError("熊没能找到有效配置，请去 Vercel 检查环境变量并 Redeploy 嗷！");
      setInitializing(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setInitializing(false);
    });
    const initAuth = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (err) {
        setError("认证同步失败，请检查匿名登录设置。");
        setInitializing(false);
      }
    };
    initAuth();
    return () => unsubscribe();
  }, []);

  // 2. 实时监听案卷
  useEffect(() => {
    if (!user || !caseId || !db) return;
    const caseDoc = doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId);
    const unsubscribe = onSnapshot(caseDoc, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCurrentCase(data);
        if (devMode && !data.verdict) {
           if (!data.sideA.submitted) setDevTargetSide('A');
           else if (!data.sideB.submitted) setDevTargetSide('B');
        }
      }
    }, (err) => {
      setError("调取卷宗失败，请检查数据库 Rules。");
    });
    return () => unsubscribe();
  }, [user, caseId, devMode]);

  // 3. 倒计时维护
  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setInterval(() => {
        setCooldown(c => c - 1);
      }, 1000);
    } else {
      clearInterval(cooldownRef.current);
    }
    return () => clearInterval(cooldownRef.current);
  }, [cooldown]);

  const handleTitleClick = () => {
    setClickCount(prev => {
      const next = prev + 1;
      if (next >= 5) { setDevMode(!devMode); return 0; }
      return next;
    });
  };

  const checkFoundation = () => {
    console.log("--- 王国地基自检报告 ---");
    console.log("App ID:", appId);
    console.log("API Key (已脱敏):", apiKey ? `${apiKey.slice(0, 5)}***${apiKey.slice(-3)}` : "未配置");
    console.log("Model In Use:", modelName);
    console.log("User UID:", user?.uid);
    console.log("----------------------");
    setError(`自检完成！请按 F12 在控制台查看诊断详情嗷～模型当前使用：${modelName}`);
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
    } catch (err) { setError("案卷生成失败。"); }
    finally { setLoading(false); }
  };

  const joinCase = async (id) => {
    if (!db || !id || !user) return;
    setLoading(true); setError("");
    try {
      const targetId = id.toUpperCase();
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', targetId));
      if (snap.exists()) {
        const data = snap.data();
        const update = {};
        if (!data.sideB.uid && data.sideA.uid !== user.uid) update["sideB.uid"] = user.uid;
        else if (!data.sideA.uid && data.sideB.uid !== user.uid) update["sideA.uid"] = user.uid;
        if (Object.keys(update).length > 0) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', targetId), update);
        setCurrentCase(null); 
        setCaseId(targetId);
      } else { setError("检索码无效，请核对。"); }
    } catch (err) { setError("法庭连接失败。"); }
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
    } catch (err) { setError("证词归档失败嗷。"); }
    finally { setLoading(false); }
  };

  /**
   * --- 宣判逻辑：极致稳定化防护 ---
   */
  const triggerAIJudge = async () => {
    if (loading || cooldown > 0) return;
    
    if (!currentCase || !apiKey) { 
      setError("AI 宣判核心未联网：请检查环境变量。"); 
      return; 
    }
    
    setLoading(true); 
    setError("");
    setLoadingMsg("熊正在连线 AI 大脑...");

    // 取消上一个可能存在的遗留请求
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感调解专家。这里是轻松熊王国神圣最高法庭。语气极度严肃、专业且充满治愈感。自称必须为“熊”。必须且仅输出严格 JSON。
    结构示例：{ "verdict_title": "", "fault_ratio": {"A": 50, "B": 50}, "law_reference": "", "analysis": "", "perspective_taking": "", "bear_wisdom": "", "punishments": [] }`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: `[男陈述]：${currentCase.sideA.content}\n[女陈述]：${currentCase.sideB.content}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
        })
      });

      if (response.status === 429) throw new Error("429");

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`API_${response.status}: ${errJson.error?.message || '通讯异常'}`);
      }
      
      setLoadingMsg("熊正在撰写判决书...");
      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      let cleanJsonStr = rawText || "";
      const jsonRegex = /\{[\s\S]*\}/;
      const match = rawText.match(jsonRegex);
      if (match) cleanJsonStr = match[0];

      const verdict = JSON.parse(cleanJsonStr);

      setLoadingMsg("熊正在将判决存入档案库...");
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { 
        verdict, 
        status: 'finished' 
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error("Verdict Error:", err);
      if (err.message === "429") {
        setError("熊法官思考得太累了（频率限制），进入 60 秒物理冷静期，请稍等嗷！🧸☕");
        setCooldown(60); 
      } else {
        setError(`宣判异常：${err.message}，建议点击下方“自检”按钮排查嗷！`);
      }
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#FFFDFB] flex flex-col items-center justify-center text-[#8D6E63] p-10 text-center">
        <RefreshCw className="animate-spin mb-6 text-amber-600" size={48} />
        <p className="font-black text-xl mb-2 animate-pulse">正在连接神圣最高法庭...</p>
        <p className="text-xs text-[#A1887F] mt-4 font-medium">正在同步王国密钥，请稍等几秒嗷～</p>
      </div>
    );
  }

  const verdictData = currentCase?.verdict || null;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  
  const isMyTurn = currentCase && !verdictData && !isBothSubmitted && (
    devMode || 
    (currentCase.sideA?.uid === user?.uid && !currentCase.sideA?.submitted) || 
    (currentCase.sideB?.uid === user?.uid && !currentCase.sideB?.submitted)
  );

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-[#4E342E] font-sans pb-10 select-none overflow-x-hidden text-balance">
      {error && (
        <div className="fixed top-20 left-4 right-4 z-50 p-5 bg-rose-600 text-white rounded-3xl text-sm font-bold shadow-2xl flex flex-col gap-3 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
             {error.includes("频率限制") ? <Coffee size={24} className="animate-bounce" /> : <AlertCircle size={24} />}
             <span className="flex-1 leading-tight">{error}</span>
             <button onClick={() => setError('')} className="p-2 bg-white/20 rounded-xl">关闭</button>
          </div>
          <button onClick={checkFoundation} className="w-full py-2 bg-black/20 rounded-xl text-[10px] flex items-center justify-center gap-2 uppercase tracking-widest"><Terminal size={14} /> 启动法庭地基自检</button>
        </div>
      )}

      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-20 p-4 border-b border-[#F5EBE0] flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer active:scale-95 transition-all" onClick={handleTitleClick}>
          <div className="bg-[#8D6E63] p-1.5 rounded-lg shadow-inner"><Scale className="text-white" size={18} /></div>
          <span className={`font-black text-lg tracking-tight transition-colors ${devMode ? 'text-indigo-600 animate-pulse' : ''}`}>轻松熊王国神圣最高法庭</span>
        </div>
        {user && <span className="text-[10px] text-[#A1887F] font-mono font-bold uppercase tracking-tighter">ID:{user.uid.slice(0, 4)}</span>}
      </nav>

      <div className="max-w-xl mx-auto p-4 pt-6">
        <div className="relative mb-8 rounded-[2.5rem] shadow-2xl overflow-hidden border-[6px] border-white aspect-[16/9] bg-[#F5EBE0]">
          <img src={FIXED_COVER_URL} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" alt="法庭封面" 
               onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1000"; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-6 left-8 flex items-end justify-between right-8 text-white font-bold">
            <h1 className="font-black text-2xl drop-shadow-lg leading-none">公正 · 治愈 · 爱</h1>
            <Landmark className="opacity-60 mb-1" size={36} />
          </div>
        </div>

        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-[#F5EBE0] text-center animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5"><Award size={120} /></div>
            <div className="relative">
              <div className="w-20 h-20 bg-[#FFF8E1] rounded-3xl flex items-center justify-center mx-auto mb-8 border border-amber-100/50 shadow-inner"><Gavel className="text-amber-600" size={40} /></div>
              <h2 className="text-2xl font-black mb-3 text-[#3E2723]">神圣最高法庭</h2>
              <p className="text-[#8D6E63] text-sm mb-12 px-6 font-medium leading-relaxed">这里是王国最神圣的地方嗷，熊将抱着极其认真的心情，帮你们化解委屈。</p>
              <div className="space-y-4">
                {showRoleSelect ? (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                    <button onClick={() => createCase('male')} className="bg-blue-50 border-2 border-blue-100 p-6 rounded-3xl active:scale-95 transition-all shadow-sm group">
                      <span className="text-3xl block mb-2">🙋‍♂️</span>
                      <span className="text-[11px] font-black text-blue-700 uppercase">男方当事人</span>
                    </button>
                    <button onClick={() => createCase('female')} className="bg-rose-50 border-2 border-rose-200 p-6 rounded-3xl active:scale-95 transition-all shadow-sm group">
                      <span className="text-3xl block mb-2">🙋‍♀️</span>
                      <span className="text-[11px] font-black text-rose-700 uppercase">女方当事人</span>
                    </button>
                    <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-sm text-[#A1887F] font-black py-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center gap-2 active:scale-95 transition-all mt-2">
                       <ArrowLeft size={16} /> 返回大厅
                    </button>
                  </div>
                ) : (
                  <><button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-5 rounded-[2rem] font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"><UserPlus size={22}/> 发起新诉讼</button>
                    <div className="flex gap-2 mt-4 items-stretch h-14">
                      <input placeholder="输入卷宗检索码" className="flex-1 min-w-0 p-4 rounded-[1.5rem] bg-[#FDF5E6] border-2 border-transparent focus:border-amber-200 outline-none text-center font-black tracking-widest uppercase text-xs" onChange={(e) => setTempInput(e.target.value)} />
                      <button onClick={() => joinCase(tempInput)} className="flex-shrink-0 bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-6 rounded-[1.5rem] font-black active:bg-[#FDF5E6] text-sm shadow-sm transition-colors">调取</button>
                    </div></>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-md border border-[#F5EBE0]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#FFF8E1] rounded-2xl flex items-center justify-center text-amber-600 border border-amber-100 shadow-sm"><ShieldCheck size={28} /></div>
                <div><div className="text-[10px] text-[#A1887F] font-black uppercase mb-0.5 font-bold tracking-widest">王国案卷号</div><div className="font-mono font-black text-2xl text-[#8D6E63] leading-none">{caseId}</div></div>
              </div>
              <button onClick={() => navigator.clipboard.writeText(caseId)} className="p-3 bg-[#FDF5E6] text-[#8D6E63] rounded-2xl active:bg-[#F5EBE0] transition-colors"><Copy size={20} /></button>
            </div>

            {!currentCase ? (
               <div className="bg-white p-20 rounded-[3rem] shadow-xl flex flex-col items-center justify-center text-[#8D6E63]">
                  <RefreshCw className="animate-spin mb-4" size={32} />
                  <p className="font-black animate-pulse">正在从卷宗库调取资料...</p>
               </div>
            ) : !verdictData ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-[#F5EBE0] min-h-[400px] flex flex-col relative overflow-hidden">
                {isMyTurn ? (
                  <div className="h-full flex flex-col animate-in slide-in-from-right-4 duration-500">
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <h3 className="font-black text-xl text-[#3E2723] flex items-center gap-2 mb-1">
                          <MessageCircle className="text-amber-500" /> 
                          {devMode ? `[Dev] 代表${devTargetSide === 'A' ? '男方' : '女方'}录入` : '证词录入：提交辩词'}
                        </h3>
                        <p className="text-[10px] text-[#A1887F] font-bold">法律面前众熊平等，请如实描述争议细节嗷！</p>
                      </div>
                      {devMode && (
                        <div className="flex bg-indigo-50 p-1 rounded-xl gap-1 border border-indigo-100 scale-90 origin-right">
                          <button onClick={() => setDevTargetSide('A')} className={`text-[10px] font-bold px-3 py-1 rounded-lg ${devTargetSide === 'A' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400'}`}>男</button>
                          <button onClick={() => setDevTargetSide('B')} className={`text-[10px] font-bold px-3 py-1 rounded-lg ${devTargetSide === 'B' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400'}`}>女</button>
                        </div>
                      )}
                    </div>
                    <textarea className="w-full flex-1 p-6 bg-[#FDFBF9] rounded-[2rem] border-2 border-[#F5EBE0] outline-none resize-none mb-6 text-sm leading-relaxed placeholder:text-gray-300" placeholder="把你的委屈都告诉熊，熊会认真听的嗷..." value={tempInput} onChange={(e) => setTempInput(e.target.value)} />
                    <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-[1.8rem] font-black text-xl shadow-lg active:scale-95 transition-all">交给熊归档</button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-in zoom-in-95 duration-500">
                    <div className="w-24 h-24 bg-white border border-amber-100 rounded-[2.5rem] flex items-center justify-center shadow-xl text-5xl mb-10 text-balance">🏛️</div>
                    <h3 className="text-2xl font-black mb-3 text-[#3E2723]">{isBothSubmitted ? '证据已收齐' : '熊正在采证中'}</h3>
                    <p className="text-[#8D6E63] text-xs mb-10 px-10 font-medium leading-relaxed">
                      {isBothSubmitted ? '双方当事人的证词均已归入法典。点击下方按钮，开庭宣判嗷！' : '熊还在等待对方提交内心辩词嗷。法庭秩序重于一切，请耐心等候～'}
                    </p>
                    <div className="grid grid-cols-2 gap-4 mb-10 w-full px-6">
                      <div className={`p-4 rounded-3xl border flex flex-col items-center gap-1 transition-all duration-500 ${currentCase?.sideA?.submitted ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-400 opacity-60'}`}>
                        {currentCase?.sideA?.submitted ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        <span className="text-[10px] font-black uppercase tracking-tighter">男方证词{currentCase?.sideA?.submitted ? '已就绪' : '待录入'}</span>
                      </div>
                      <div className={`p-4 rounded-3xl border flex flex-col items-center gap-1 transition-all duration-500 ${currentCase?.sideB?.submitted ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-gray-50 border-gray-100 text-gray-400 opacity-60'}`}>
                        {currentCase?.sideB?.submitted ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        <span className="text-[10px] font-black uppercase tracking-tighter">女方证词{currentCase?.sideB?.submitted ? '已就绪' : '待录入'}</span>
                      </div>
                    </div>
                    {isBothSubmitted && (
                      <div className="w-full max-w-sm px-6">
                        <button 
                          onClick={triggerAIJudge} 
                          disabled={loading || cooldown > 0} 
                          className={`w-full py-6 rounded-full font-black text-2xl shadow-2xl flex items-center justify-center gap-4 transition-all ${cooldown > 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#D84315] text-white hover:bg-[#BF360C] animate-pulse active:scale-95'}`}
                        >
                          {loading ? <RefreshCw className="animate-spin" /> : (cooldown > 0 ? <Timer size={32} /> : <Gavel size={32} />)} 
                          {cooldown > 0 ? `强制冷却 (${cooldown}s)` : '开庭宣判！'}
                        </button>
                        {loading && <p className="text-xs text-[#BF360C] font-black mt-4 animate-bounce">{loadingMsg}</p>}
                        {cooldown > 0 && <p className="text-[10px] text-gray-400 font-bold mt-4 tracking-tighter italic">熊法官思考得太累了，正在物理断开请求，请休息嗷...</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-20 duration-1000 pb-10">
                <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border-t-[14px] border-[#8D6E63] relative overflow-hidden">
                  <div className="text-center mb-12">
                    <div className="inline-block px-4 py-1 bg-[#FFF8E1] rounded-full text-[10px] font-black text-[#8D6E63] mb-6 border border-amber-100 uppercase tracking-widest font-bold">Kingdom Verdict</div>
                    <h2 className="text-3xl font-black text-[#3E2723] mb-3 leading-tight tracking-tight">📜 {String(verdictData.verdict_title)}</h2>
                    <p className="text-sm italic bg-[#FDF5E6] py-3 px-6 rounded-2xl inline-block border border-amber-50 text-balance">“{String(verdictData.law_reference)}”</p>
                  </div>
                  <div className="mb-14 bg-[#FDFBF9] p-8 rounded-[2.5rem] border border-[#F5EBE0] shadow-inner text-balance">
                    <div className="flex justify-between mb-5 text-[11px] font-black uppercase tracking-widest">
                      <span className="text-blue-600 font-bold">男方归因 {verdictData.fault_ratio?.A || 50}%</span>
                      <span className="text-rose-600 font-bold">女方归因 {verdictData.fault_ratio?.B || 50}%</span>
                    </div>
                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex shadow-inner border border-gray-200">
                      <div className="h-full bg-gradient-to-r from-blue-300 to-blue-400 transition-all duration-1000" style={{ width: `${verdictData.fault_ratio?.A || 50}%` }} />
                      <div className="h-full bg-gradient-to-r from-rose-300 to-rose-400 transition-all duration-1000" style={{ width: `${verdictData.fault_ratio?.B || 50}%` }} />
                    </div>
                  </div>
                  <div className="space-y-10 text-balance">
                    <div>
                      <h4 className="font-black text-[#3E2723] mb-4 flex items-center gap-2 italic text-lg uppercase font-bold"><Sparkles size={22} className="text-amber-500" /> 王国深度诊断</h4>
                      <p className="text-[13px] leading-relaxed text-[#5D4037] font-medium pl-2">{String(verdictData.analysis)}</p>
                    </div>
                    <div className="bg-emerald-50/70 p-8 rounded-[3rem] border border-emerald-100/50 shadow-sm relative text-balance">
                      <h4 className="font-black text-emerald-800 mb-4 flex items-center gap-2 italic text-lg font-bold"><Heart size={22} className="text-emerald-500" /> 将心比心 · 懂你才可爱</h4>
                      <p className="text-[13px] leading-relaxed text-emerald-900/80 font-medium whitespace-pre-wrap">{String(verdictData.perspective_taking)}</p>
                    </div>
                    <div className="bg-indigo-50/50 p-8 rounded-[2.5rem] text-center italic text-sm text-indigo-900/70 font-black leading-relaxed">“{String(verdictData.bear_wisdom)}”</div>
                  </div>
                  <div className="mt-16 pt-12 border-t-4 border-double border-[#F5EBE0]">
                    <h3 className="text-center font-black text-[#8D6E63] text-2xl mb-10 uppercase tracking-widest leading-none font-bold">和好罚单执行</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {(verdictData.punishments || []).map((p, i) => (
                        <div key={i} className="bg-white border-2 border-[#F5EBE0] p-6 rounded-[2rem] text-center text-sm font-black shadow-sm transition-all hover:translate-y-[-2px] active:border-amber-300 font-bold">
                          {String(p)}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => {setCaseId(''); setCurrentCase(null); setError("");}} className="w-full mt-14 py-6 text-[#A1887F] text-[11px] font-black tracking-[0.6em] border-t border-[#F5EBE0] pt-10 uppercase active:text-[#8D6E63] font-bold text-sm">结案 · 拥抱离场</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// 生产环境挂载逻辑：彻底隔离 Canvas 自动渲染
if (typeof document !== 'undefined') {
  const rootElement = document.getElementById('root');
  // 通过全局标志位物理杜绝双重渲染
  if (rootElement && !window.__api_key && !window.location.hostname.includes('usercontent.goog')) {
    if (!window.__BEAR_JUDGE_INITIALIZED__) {
       window.__BEAR_JUDGE_INITIALIZED__ = true;
       const root = createRoot(rootElement);
       root.render(<App />);
    }
  }
}

export default App;
