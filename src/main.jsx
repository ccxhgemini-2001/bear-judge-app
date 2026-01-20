import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, Award, Landmark, CheckCircle2, Circle, ArrowLeft, Coffee, Timer, Terminal, UserSearch } from 'lucide-react';

/**
 * --- 王国核心配置注入层 (Build-Safe Edition) ---
 * 修复说明：优化了解析逻辑，移除了导致构建失败的 eval 类代码
 */
const parseConfig = (val) => {
  if (!val) return null;
  try {
    // 尝试直接 JSON 解析
    return JSON.parse(val);
  } catch (e) {
    try {
      // 处理可能的非标准 JSON 字符串 (移除结尾分号或包裹部分)
      let s = val.trim();
      if (s.includes('=')) s = s.substring(s.indexOf('{'), s.lastIndexOf('}') + 1);
      if (s.endsWith(';')) s = s.slice(0, -1);
      // 如果仍然无法解析，返回 null，避免构建报错
      return JSON.parse(s);
    } catch (e2) {
      console.warn("Config parsing failed, check your .env format");
      return null;
    }
  }
};

// 安全获取 Vite 环境变量
const getStaticEnv = (key) => {
  try {
    const meta = import.meta;
    if (meta && meta.env) {
      if (key === 'FIREBASE') return import.meta.env.VITE_FIREBASE_CONFIG;
      if (key === 'GEMINI') return import.meta.env.VITE_GEMINI_API_KEY;
      if (key === 'APP_ID') return import.meta.env.VITE_APP_ID;
    }
  } catch (e) {
    // 忽略预览环境错误
  }
  return undefined;
};

// 1. 提取变量
const VITE_FIREBASE = getStaticEnv('FIREBASE');
const VITE_GEMINI = getStaticEnv('GEMINI');
const VITE_APP_ID = getStaticEnv('APP_ID');

const getEnv = (canvasField, vercelValue) => {
  if (typeof window !== 'undefined' && window[canvasField]) return window[canvasField];
  return vercelValue || "";
};

const firebaseConfig = parseConfig(getEnv('__firebase_config', VITE_FIREBASE));
const apiKey = getEnv('__api_key', VITE_GEMINI);
const appId = getEnv('__app_id', VITE_APP_ID) || 'bear-judge-app-v3';

// 环境判别与模型选择
const isCanvas = typeof window !== 'undefined' && (!!window.__api_key || window.location.hostname.includes('usercontent.goog'));
const modelName = isCanvas ? "gemini-2.5-flash-preview-09-2025" : "gemini-1.5-flash";
const FIXED_COVER_URL = "/cover.jpg"; 

// 初始化 Firebase 服务
let app, auth, db;
// 增加构建环境安全检查，防止在 Build 阶段因缺失 Config 报错
if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
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
  const lastRequestTime = useRef(0);

  const [devMode, setDevMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [devTargetSide, setDevTargetSide] = useState('A'); 

  // 1. 认证初始化 (RULE 3)
  useEffect(() => {
    // 如果 auth 未初始化（通常是因为没有配置环境变量），不仅停止加载，还给出明确提示
    if (!auth) {
      setError("地基配置异常：未检测到有效配置。请在 Vercel 检查 VITE_FIREBASE_CONFIG 变量。");
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
        setError("认证同步失败，请检查网络。");
        setInitializing(false);
      }
    };
    initAuth();
    return () => unsubscribe();
  }, []);

  // 2. 实时监听案卷 (包含角色逻辑)
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
    }, (err) => { setError("卷宗链路中断嗷。"); });
    return () => unsubscribe();
  }, [user, caseId, devMode]);

  // 3. 冷却倒计时维护
  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setInterval(() => setCooldown(c => c - 1), 1000);
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
    console.log("--- 王国地基终审诊断 ---");
    console.log("Environment Mode:", isCanvas ? "Canvas Preview" : "Production");
    console.log("Model:", modelName);
    console.log("API Key Status:", apiKey ? `Recognized (${apiKey.substring(0, 4)}...)` : "MISSING!");
    console.log("Firebase Status:", firebaseConfig ? "Connected" : "MISSING");
    console.log("------------------------");
    setError(`自检完成！API 状态：${apiKey ? '就绪' : '缺失'}。详见 F12 日志。`);
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
    } catch (err) { setError("案卷生成失败，请确认数据库权限。"); }
    finally { setLoading(false); }
  };

  const joinCase = (id) => {
    if (!id || !user) return;
    const targetId = id.toUpperCase();
    setCurrentCase(null);
    setError("");
    setCaseId(targetId);
  };

  const pickRoleInCase = async (role) => {
    if (!db || !currentCase || !user) return;
    setLoading(true);
    const field = role === 'male' ? 'sideA' : 'sideB';
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        [`${field}.uid`]: user.uid
      });
    } catch (err) { setError("身份认领失败嗷。"); }
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

  const triggerAIJudge = async () => {
    if (loading || cooldown > 0) return;
    const now = Date.now();
    if (now - lastRequestTime.current < 5000) return;
    lastRequestTime.current = now;

    if (!apiKey) { 
      setError("AI 宣判核心无法启动：API 密钥未注入。请务必执行 Vercel Redeploy 嗷！"); 
      return; 
    }
    
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
          contents: [{ parts: [{ text: `[男当事人陈述]：${currentCase.sideA.content}\n[女当事人陈述]：${currentCase.sideB.content}` }] }],
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
      const jsonMatch = (rawText || "").match(/\{[\s\S]*\}/);
      const verdict = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

      setLoadingMsg("熊正在将判决存入档案库...");
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { verdict, status: 'finished' });
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err.message === "429") {
        setError("法官大人脑力配额用完啦（频率限制），进入 60 秒物理冷静期。");
        setCooldown(60); 
      } else {
        setError(`宣判异常：${err.message}`);
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
        <p className="font-black text-xl mb-2 animate-pulse tracking-tight text-balance">正在连接神圣最高法庭...</p>
      </div>
    );
  }

  const verdictData = currentCase?.verdict || null;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  
  const userRole = currentCase?.sideA?.uid === user?.uid ? 'A' : (currentCase?.sideB?.uid === user?.uid ? 'B' : null);
  const isMyTurn = currentCase && !verdictData && !isBothSubmitted && (
    devMode || (userRole === 'A' && !currentCase.sideA.submitted) || (userRole === 'B' && !currentCase.sideB.submitted)
  );

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-[#4E342E] font-sans pb-10 select-none overflow-x-hidden text-balance">
      {error && (
        <div className="fixed top-20 left-4 right-4 z-50 p-5 bg-rose-600 text-white rounded-3xl text-sm font-bold shadow-2xl flex flex-col gap-3 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
             {error.includes("限制") ? <Coffee size={24} className="animate-bounce" /> : <AlertCircle size={24} />}
             <span className="flex-1 leading-tight">{error}</span>
             <button onClick={() => setError('')} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-colors">关闭</button>
          </div>
          <button onClick={checkFoundation} className="w-full py-2 bg-black/20 rounded-xl text-[10px] flex items-center justify-center gap-2 uppercase tracking-widest font-bold font-bold"><Terminal size={14} /> 启动地基自检</button>
        </div>
      )}

      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-20 p-4 border-b border-[#F5EBE0] flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer active:scale-95 transition-all" onClick={handleTitleClick}>
          <div className="bg-[#8D6E63] p-1.5 rounded-lg shadow-inner"><Scale className="text-white" size={18} /></div>
          <span className={`font-black text-lg tracking-tight ${devMode ? 'text-indigo-600 animate-pulse' : ''}`}>轻松熊王国神圣最高法庭</span>
        </div>
        {user && <span className="text-[10px] text-[#A1887F] font-mono tracking-widest font-bold uppercase">ID:{user.uid.slice(0, 4)}</span>}
      </nav>

      <div className="max-w-xl mx-auto p-4 pt-6">
        <div className="relative mb-8 rounded-[2.5rem] shadow-2xl overflow-hidden border-[6px] border-white aspect-[16/9] bg-[#F5EBE0]">
          <img src={FIXED_COVER_URL} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" alt="封面" 
               onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1000"; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-6 left-8 flex items-end justify-between right-8 text-white font-bold text-balance">
            <h1 className="font-black text-2xl drop-shadow-lg leading-none tracking-tight">公正 · 治愈 · 爱</h1>
            <Landmark className="opacity-60 mb-1" size={36} />
          </div>
        </div>

        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-[#F5EBE0] text-center animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5"><Award size={120} /></div>
            <div className="relative text-balance">
              <div className="w-20 h-20 bg-[#FFF8E1] rounded-3xl flex items-center justify-center mx-auto mb-8 border border-amber-100/50 shadow-inner"><Gavel className="text-amber-600" size={40} /></div>
              <h2 className="text-2xl font-black mb-3 text-[#3E2723]">神圣最高法庭</h2>
              <p className="text-[#8D6E63] text-sm mb-12 px-6 font-medium leading-relaxed text-balance">这里是王国最神圣的地方嗷，熊将帮你们化解委屈。</p>
              <div className="space-y-4">
                {showRoleSelect ? (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                    <button onClick={() => createCase('male')} className="bg-blue-50 border-2 border-blue-100 p-6 rounded-[2rem] active:scale-95 transition-all shadow-sm group font-bold text-blue-700"><span className="text-3xl block mb-2 transition-transform group-hover:scale-110">🙋‍♂️</span>男方当事人</button>
                    <button onClick={() => createCase('female')} className="bg-rose-50 border-2 border-rose-100 p-6 rounded-[2rem] active:scale-95 transition-all shadow-sm group font-bold text-rose-700"><span className="text-3xl block mb-2 transition-transform group-hover:scale-110">🙋‍♀️</span>女方当事人</button>
                    <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-sm text-[#A1887F] font-black py-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center gap-2 active:scale-95 transition-all mt-2 uppercase font-bold tracking-widest"><ArrowLeft size={16} /> 返回大厅</button>
                  </div>
                ) : (
                  <><button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-5 rounded-[2rem] font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 tracking-wide font-bold"><UserPlus size={24}/> 发起新诉讼</button>
                    <div className="flex gap-2 mt-4 items-stretch h-14">
                      <input placeholder="输入检索码" className="flex-1 min-w-0 p-4 rounded-[1.5rem] bg-[#FDF5E6] border-2 border-transparent focus:border-amber-200 outline-none text-center font-black tracking-widest uppercase text-xs" onChange={(e) => setTempInput(e.target.value)} />
                      <button onClick={() => joinCase(tempInput)} className="flex-shrink-0 bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-6 rounded-[1.5rem] font-black active:bg-[#FDF5E6] text-sm shadow-sm transition-colors tracking-tighter font-bold">调取</button>
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
                  <p className="font-black animate-pulse">正在调取卷宗资料...</p>
               </div>
            ) : !verdictData ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-[#F5EBE0] min-h-[400px] flex flex-col relative overflow-hidden text-balance">
                {!userRole && !devMode ? (
                  /* 角色认领界面 */
                  <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                    <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mb-6 text-amber-600 shadow-inner"><UserSearch size={40}/></div>
                    <h3 className="text-xl font-black mb-2 text-[#3E2723]">请认领当事人身份</h3>
                    <p className="text-xs text-[#8D6E63] mb-10 px-10 leading-relaxed text-balance">熊在案卷里还没认出你嗷，认领角色后才能提交证词哦！</p>
                    <div className="grid grid-cols-2 gap-4 w-full px-6">
                        <button onClick={() => pickRoleInCase('male')} disabled={!!currentCase.sideA.uid} className={`p-6 rounded-[2rem] border-2 transition-all shadow-sm ${currentCase.sideA.uid ? 'bg-gray-50 border-gray-100 opacity-40 grayscale text-gray-400 cursor-not-allowed' : 'bg-blue-50 border-blue-100 text-blue-700 active:scale-95'}`}>
                          <span className="text-3xl block mb-1">🙋‍♂️</span>
                          <span className="text-[10px] font-black uppercase tracking-tight">{currentCase.sideA.uid ? '男方已认领' : '我是男方'}</span>
                        </button>
                        <button onClick={() => pickRoleInCase('female')} disabled={!!currentCase.sideB.uid} className={`p-6 rounded-[2rem] border-2 transition-all shadow-sm ${currentCase.sideB.uid ? 'bg-gray-50 border-gray-100 opacity-40 grayscale text-gray-400 cursor-not-allowed' : 'bg-rose-50 border-rose-100 text-rose-700 active:scale-95'}`}>
                          <span className="text-3xl block mb-1">🙋‍♀️</span>
                          <span className="text-[10px] font-black uppercase tracking-tight">{currentCase.sideB.uid ? '女方已认领' : '我是女方'}</span>
                        </button>
                    </div>
                  </div>
                ) : isMyTurn ? (
                  <div className="h-full flex flex-col animate-in slide-in-from-right-4 duration-500">
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <h3 className="font-black text-xl text-[#3E2723] flex items-center gap-2 mb-1"><MessageCircle className="text-amber-500" /> 提交辩词</h3>
                        <p className="text-[10px] text-[#A1887F] font-bold uppercase tracking-tighter">法律面前众熊平等，请如实描述争议细节嗷！</p>
                      </div>
                      {devMode && (
                        /* 开发者性别切换按钮 */
                        <div className="flex bg-indigo-50 p-1 rounded-xl gap-1 border border-indigo-100 scale-90 origin-right shadow-sm">
                          <button onClick={() => setDevTargetSide('A')} className={`text-[10px] font-black px-3 py-1 rounded-lg transition-colors ${devTargetSide === 'A' ? 'bg-indigo-600 text-white' : 'text-indigo-400'}`}>男方</button>
                          <button onClick={() => setDevTargetSide('B')} className={`text-[10px] font-black px-3 py-1 rounded-lg transition-colors ${devTargetSide === 'B' ? 'bg-indigo-600 text-white' : 'text-indigo-400'}`}>女方</button>
                        </div>
                      )}
                    </div>
                    <textarea className="w-full flex-1 p-6 bg-[#FDFBF9] rounded-[2rem] border-2 border-[#F5EBE0] outline-none resize-none mb-6 text-sm leading-relaxed placeholder:text-gray-300" placeholder="把你的委屈告诉熊，熊会认真听的嗷..." value={tempInput} onChange={(e) => setTempInput(e.target.value)} />
                    <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-[1.8rem] font-black text-xl shadow-lg active:scale-95 transition-all font-bold tracking-widest uppercase">确认归档证词</button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-in zoom-in-95 duration-500">
                    <div className="w-24 h-24 bg-white border border-amber-100 rounded-[2.5rem] flex items-center justify-center shadow-xl text-5xl mb-10 text-balance">🏛️</div>
                    <h3 className="text-2xl font-black mb-3 text-[#3E2723]">{isBothSubmitted ? '证据已收齐' : '采证进行中'}</h3>
                    <p className="text-[#8D6E63] text-xs mb-10 px-10 leading-relaxed leading-relaxed text-balance">{isBothSubmitted ? '双方证词均已归入法典。点击按钮启动正式宣判嗷！' : '正在等待对方提交内心辩词嗷。法庭秩序重于一切～'}</p>
                    <div className="grid grid-cols-2 gap-4 mb-10 w-full px-6 text-balance">
                      <div className={`p-4 rounded-3xl border flex flex-col items-center gap-1 transition-all duration-500 ${currentCase?.sideA?.submitted ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-400 opacity-60'}`}>
                        {currentCase?.sideA?.submitted ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        <span className="text-[10px] font-black uppercase tracking-tighter font-bold font-bold font-bold font-bold">男方证词{currentCase?.sideA?.submitted ? '已就绪' : '待录入'}</span>
                      </div>
                      <div className={`p-4 rounded-3xl border flex flex-col items-center gap-1 transition-all duration-500 ${currentCase?.sideB?.submitted ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-gray-50 border-gray-100 text-gray-400 opacity-60'}`}>
                        {currentCase?.sideB?.submitted ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        <span className="text-[10px] font-black uppercase tracking-tighter font-bold font-bold font-bold font-bold">女方证词{currentCase?.sideB?.submitted ? '已就绪' : '待录入'}</span>
                      </div>
                    </div>
                    {isBothSubmitted && (
                      <div className="w-full max-w-sm px-6">
                        <button onClick={triggerAIJudge} disabled={loading || cooldown > 0} className={`w-full py-6 rounded-full font-black text-2xl shadow-2xl flex items-center justify-center gap-4 transition-all ${cooldown > 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#D84315] text-white hover:bg-[#BF360C] animate-pulse active:scale-95'}`}>
                          {loading ? <RefreshCw className="animate-spin" /> : (cooldown > 0 ? <Timer size={32} /> : <Gavel size={32} />)} 
                          {cooldown > 0 ? `强制冷却 (${cooldown}s)` : '开庭宣判！'}
                        </button>
                        {loading && <p className="text-xs text-[#BF360C] font-black mt-4 animate-bounce">{loadingMsg}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-20 duration-1000 pb-10 text-balance text-balance text-balance">
                <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border-t-[14px] border-[#8D6E63] relative overflow-hidden">
                  <div className="text-center mb-12">
                    <div className="inline-block px-4 py-1 bg-[#FFF8E1] rounded-full text-[10px] font-black text-[#8D6E63] mb-6 border border-amber-100 uppercase tracking-widest font-bold tracking-widest font-bold font-bold font-bold font-bold">Kingdom Verdict</div>
                    <h2 className="text-3xl font-black text-[#3E2723] mb-3 leading-tight tracking-tight tracking-tight font-bold font-bold font-bold font-bold font-bold">📜 {String(verdictData.verdict_title)}</h2>
                    <p className="text-sm italic bg-[#FDF5E6] py-3 px-6 rounded-2xl inline-block border border-amber-50">“{String(verdictData.law_reference)}”</p>
                  </div>
                  <div className="mb-14 bg-[#FDFBF9] p-8 rounded-[2.5rem] border border-[#F5EBE0] shadow-inner font-bold">
                    <div className="flex justify-between mb-5 text-[11px] font-black uppercase tracking-widest">
                      <span className="text-blue-600 font-bold font-bold font-bold font-bold font-bold">男方归因 {verdictData.fault_ratio?.A || 50}%</span>
                      <span className="text-rose-600 font-bold font-bold font-bold font-bold font-bold">女方归因 {verdictData.fault_ratio?.B || 50}%</span>
                    </div>
                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex shadow-inner border border-gray-200">
                      <div className="h-full bg-gradient-to-r from-blue-300 to-blue-400 transition-all duration-1000 font-bold font-bold font-bold" style={{ width: `${verdictData.fault_ratio?.A || 50}%` }} />
                      <div className="h-full bg-gradient-to-r from-rose-300 to-rose-400 transition-all duration-1000 font-bold font-bold font-bold" style={{ width: `${verdictData.fault_ratio?.B || 50}%` }} />
                    </div>
                  </div>
                  <div className="space-y-10 text-balance text-balance text-balance text-balance text-balance">
                    <div><h4 className="font-black text-[#3E2723] mb-4 flex items-center gap-2 italic text-lg uppercase font-bold font-bold font-bold font-bold"><Sparkles size={22} className="text-amber-500" /> 王国深度诊断</h4><p className="text-[13px] leading-relaxed text-[#5D4037] font-medium pl-2">{String(verdictData.analysis)}</p></div>
                    <div className="bg-emerald-50/70 p-8 rounded-[3rem] border border-emerald-100/50 shadow-sm relative text-balance text-balance text-balance text-balance text-balance text-balance"><h4 className="font-black text-emerald-800 mb-4 flex items-center gap-2 italic text-lg font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold"><Heart size={22} className="text-emerald-500" /> 将心比心 · 懂你才可爱</h4><p className="text-[13px] leading-relaxed text-emerald-900/80 font-medium whitespace-pre-wrap">{String(verdictData.perspective_taking)}</p></div>
                    <div className="bg-indigo-50/50 p-8 rounded-[2.5rem] text-center italic text-sm text-indigo-900/70 font-black leading-relaxed font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold">“{String(verdictData.bear_wisdom)}”</div>
                  </div>
                  <div className="mt-16 pt-12 border-t-4 border-double border-[#F5EBE0]">
                    <h3 className="text-center font-black text-[#8D6E63] text-2xl mb-10 uppercase tracking-widest leading-none font-bold tracking-widest font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold">和好罚单执行</h3>
                    <div className="grid grid-cols-1 gap-4 font-bold font-bold font-bold font-bold font-bold font-bold font-bold">
                      {(verdictData.punishments || []).map((p, i) => (
                        <div key={i} className="bg-white border-2 border-[#F5EBE0] p-6 rounded-[2rem] text-center text-sm font-black shadow-sm transition-all hover:translate-y-[-2px] active:border-amber-300 font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold">{String(p)}</div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => {setCaseId(''); setCurrentCase(null); setError("");}} className="w-full mt-14 py-6 text-[#A1887F] text-[11px] font-black tracking-[0.6em] border-t border-[#F5EBE0] pt-10 uppercase active:text-[#8D6E63] font-bold text-sm tracking-widest uppercase font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold font-bold">结案 · 拥抱离场</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
