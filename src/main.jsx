import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, Award, Landmark, CheckCircle2, Circle, ArrowLeft, Coffee, Timer, Terminal } from 'lucide-react';

/**
 * --- 王国核心配置注入层 ---
 * 【禁令：绝对不要修改 import.meta.env 的字面量写法】
 * Vite 在 Vercel 构建阶段会扫描这些特定的字符串并进行替换。
 * 预览窗口报错是由于其编译环境不支持 import.meta，不影响 Vercel 部署后的实际运行。
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

// 1. 获取 Firebase 配置：完全静态引用以确保 Vite 替换成功
const firebaseConfig = advancedParse(
  (typeof window !== 'undefined' && window.__firebase_config)
    ? window.__firebase_config
    : import.meta.env.VITE_FIREBASE_CONFIG
);

// 2. 获取 AI 密钥：完全静态引用
const apiKey = (typeof window !== 'undefined' && window.__api_key)
  ? window.__api_key
  : import.meta.env.VITE_GEMINI_API_KEY;

// 3. 获取 App ID
const appId = (typeof window !== 'undefined' && window.__app_id)
  ? window.__app_id
  : (import.meta.env.VITE_APP_ID || 'bear-judge-app-v3');

// 识别环境与模型选择
const isCanvas = typeof window !== 'undefined' && (!!window.__api_key || window.location.hostname.includes('usercontent.goog'));
const modelName = isCanvas ? "gemini-2.5-flash-preview-09-2025" : "gemini-1.5-flash";
const FIXED_COVER_URL = "/cover.jpg"; 

// 初始化 Firebase 服务
let app, auth, db;
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

  // 1. 初始化身份认证
  useEffect(() => {
    if (!auth) {
      setError("熊没能找到有效配置，请检查 Vercel 环境变量设置并执行 Redeploy 嗷！");
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
        setError("认证同步失败，请检查 Firebase 匿名登录开关。");
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
    }, (err) => { setError("数据同步中断，请检查数据库 Rules 路径。"); });
    return () => unsubscribe();
  }, [user, caseId, devMode]);

  // 3. 冷却计时
  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setInterval(() => setCooldown(c => c - 1), 1000);
    } else {
      clearInterval(cooldownRef.current);
    }
    return () => clearInterval(cooldownRef.current);
  }, [cooldown]);

  const checkFoundation = () => {
    console.log("--- 王国地基诊断报告 ---");
    console.log("Env Mode:", isCanvas ? "Canvas" : "Vercel Production");
    console.log("Model:", modelName);
    console.log("API Key Status:", apiKey ? `Loaded (${apiKey.substring(0, 4)}...)` : "MISSING (密钥为空！)");
    console.log("----------------------");
    setError(`自检完成！状态：${apiKey ? '已载入' : '密钥缺失'}。详见 F12 控制台。`);
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
      } else { setError("检索码无效。"); }
    } catch (err) { setError("法庭大门现在拥堵。"); }
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
    } catch (err) { setError("证词存储失败嗷。"); }
    finally { setLoading(false); }
  };

  const triggerAIJudge = async () => {
    if (loading || cooldown > 0) return;
    
    // 强制防抖锁
    const now = Date.now();
    if (now - lastRequestTime.current < 5000) return;
    lastRequestTime.current = now;

    if (!apiKey) { 
      setError("AI 宣判核心连接失败：API 密钥在打包时丢失，请确认 Vercel 变量名完全一致并重新 Redeploy 嗷！"); 
      return; 
    }
    
    setLoading(true); 
    setError("");
    setLoadingMsg("熊正在连线 AI 大脑...");

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感专家。必须且仅输出严格 JSON。包含判决标题、归因比例、法律引用、深度诊断、将心比心、暖心金句、和好罚单。`;

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
        throw new Error(`API_${response.status}: ${errJson.error?.message || '服务器罢工了'}`);
      }
      
      setLoadingMsg("熊正在撰写判决书...");
      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      const jsonMatch = (rawText || "").match(/\{[\s\S]*\}/);
      const verdict = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

      setLoadingMsg("熊正在将判决存入档案库...");
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { 
        verdict, 
        status: 'finished' 
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err.message === "429") {
        setError("熊法官思考得太累了（频率限制），进入 60 秒强制休息，请等倒计时结束嗷！🧸☕");
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
      <div className="min-h-screen bg-[#FFFDFB] flex flex-col items-center justify-center text-[#8D6E63] p-10 text-center text-balance">
        <RefreshCw className="animate-spin mb-6 text-amber-600" size={48} />
        <p className="font-black text-xl mb-2 animate-pulse tracking-tight">正在连接神圣最高法庭...</p>
        <p className="text-xs text-[#A1887F] mt-4 font-medium leading-relaxed">正在同步王国密钥，请稍等几秒嗷～</p>
      </div>
    );
  }

  const verdictData = currentCase?.verdict || null;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const isMyTurn = currentCase && !verdictData && !isBothSubmitted && (
    devMode || (currentCase.sideA?.uid === user?.uid && !currentCase.sideA?.submitted) || (currentCase.sideB?.uid === user?.uid && !currentCase.sideB?.submitted)
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
          <button onClick={checkFoundation} className="w-full py-2 bg-black/20 rounded-xl text-[10px] flex items-center justify-center gap-2 tracking-widest uppercase font-bold"><Terminal size={14} /> 启动法庭地基自检</button>
        </div>
      )}

      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-20 p-4 border-b border-[#F5EBE0] flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer active:scale-95 transition-all" onClick={() => { setClickCount(c => c + 1); if (clickCount >= 4) { setDevMode(!devMode); setClickCount(0); } }}>
          <div className="bg-[#8D6E63] p-1.5 rounded-lg shadow-inner"><Scale className="text-white" size={18} /></div>
          <span className={`font-black text-lg tracking-tight ${devMode ? 'text-indigo-600 animate-pulse' : ''}`}>轻松熊王国神圣最高法庭</span>
        </div>
        {user && <span className="text-[10px] text-[#A1887F] font-mono font-bold uppercase tracking-widest">ID:{user.uid.slice(0, 4)}</span>}
      </nav>

      <div className="max-w-xl mx-auto p-4 pt-6">
        <div className="relative mb-8 rounded-[2.5rem] shadow-2xl overflow-hidden border-[6px] border-white aspect-[16/9] bg-[#F5EBE0]">
          <img src={FIXED_COVER_URL} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" alt="封面" 
               onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1000"; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-6 left-8 flex items-end justify-between right-8 text-white font-bold">
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
              <p className="text-[#8D6E63] text-sm mb-12 px-6 font-medium leading-relaxed leading-relaxed">这里是王国最神圣的地方嗷，熊将抱着极其认真的心情，帮你们化解委屈。</p>
              <div className="space-y-4">
                {showRoleSelect ? (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                    <button onClick={() => createCase('male')} className="bg-blue-50 border-2 border-blue-100 p-6 rounded-3xl active:scale-95 transition-all shadow-sm group"><span className="text-3xl block mb-2 transition-transform">🙋‍♂️</span><span className="text-[11px] font-black text-blue-700 uppercase tracking-tighter">男方当事人</span></button>
                    <button onClick={() => createCase('female')} className="bg-rose-50 border-2 border-rose-100 p-6 rounded-3xl active:scale-95 transition-all shadow-sm group"><span className="text-3xl block mb-2 transition-transform">🙋‍♀️</span><span className="text-[11px] font-black text-rose-700 uppercase tracking-tighter">女方当事人</span></button>
                    <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-sm text-[#A1887F] font-black py-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center gap-2 active:scale-95 transition-all mt-2 uppercase font-bold tracking-widest"><ArrowLeft size={16} /> 返回大厅</button>
                  </div>
                ) : (
                  <><button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-5 rounded-[2rem] font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 tracking-wide"><UserPlus size={24}/> 发起新诉讼</button>
                    <div className="flex gap-2 mt-4 items-stretch h-14">
                      <input placeholder="输入检索码" className="flex-1 min-w-0 p-4 rounded-[1.5rem] bg-[#FDF5E6] border-2 border-transparent focus:border-amber-200 outline-none text-center font-black tracking-widest uppercase text-xs" onChange={(e) => setTempInput(e.target.value)} />
                      <button onClick={() => joinCase(tempInput)} className="flex-shrink-0 bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-6 rounded-[1.5rem] font-black active:bg-[#FDF5E6] text-sm shadow-sm transition-colors tracking-tighter">调取</button>
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
                  <p className="font-black animate-pulse">正在调取资料...</p>
               </div>
            ) : !verdictData ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-[#F5EBE0] min-h-[400px] flex flex-col relative overflow-hidden">
                {isMyTurn ? (
                  <div className="h-full flex flex-col animate-in slide-in-from-right-4 duration-500">
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <h3 className="font-black text-xl text-[#3E2723] flex items-center gap-2 mb-1"><MessageCircle className="text-amber-500" /> {devMode ? `[Dev] ${devTargetSide === 'A' ? '男方' : '女方'}录入` : '提交辩词'}</h3>
                        <p className="text-[10px] text-[#A1887F] font-bold">法律面前众熊平等，请如实描述争议细节嗷！</p>
                      </div>
                      {devMode && (
                        <div className="flex bg-indigo-50 p-1 rounded-xl gap-1 border border-indigo-100 scale-90 origin-right">
                          <button onClick={() => setDevTargetSide('A')} className={`text-[10px] font-bold px-3 py-1 rounded-lg ${devTargetSide === 'A' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400'}`}>男</button>
                          <button onClick={() => setDevTargetSide('B')} className={`text-[10px] font-bold px-3 py-1 rounded-lg ${devTargetSide === 'B' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400'}`}>女</button>
                        </div>
                      )}
                    </div>
                    <textarea className="w-full flex-1 p-6 bg-[#FDFBF9] rounded-[2rem] border-2 border-[#F5EBE0] outline-none resize-none mb-6 text-sm leading-relaxed placeholder:text-gray-300" placeholder="把你的委屈告诉熊..." value={tempInput} onChange={(e) => setTempInput(e.target.value)} />
                    <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-[1.8rem] font-black text-xl shadow-lg active:scale-95 transition-all font-bold tracking-widest uppercase">确认归档</button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-in zoom-in-95 duration-500">
                    <div className="w-24 h-24 bg-white border border-amber-100 rounded-[2.5rem] flex items-center justify-center shadow-xl text-5xl mb-10 text-balance">🏛️</div>
                    <h3 className="text-2xl font-black mb-3 text-[#3E2723]">{isBothSubmitted ? '证据已收齐' : '采证进行中'}</h3>
                    <p className="text-[#8D6E63] text-xs mb-10 px-10 font-medium leading-relaxed leading-relaxed">{isBothSubmitted ? '双方证词均已归入法典。点击按钮启动正式宣判嗷！' : '正在等待对方提交内心辩词嗷。法庭秩序重于一切～'}</p>
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
                        <button onClick={triggerAIJudge} disabled={loading || cooldown > 0} className={`w-full py-6 rounded-full font-black text-2xl shadow-2xl flex items-center justify-center gap-4 transition-all ${cooldown > 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#D84315] text-white hover:bg-[#BF360C] animate-pulse active:scale-95'}`}>
                          {loading ? <RefreshCw className="animate-spin" /> : (cooldown > 0 ? <Timer size={32} /> : <Gavel size={32} />)} 
                          {cooldown > 0 ? `强制休息 (${cooldown}s)` : '开庭宣判！'}
                        </button>
                        {loading && <p className="text-xs text-[#BF360C] font-black mt-4 animate-bounce">{loadingMsg}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-20 duration-1000 pb-10 text-balance">
                <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border-t-[14px] border-[#8D6E63] relative overflow-hidden">
                  <div className="text-center mb-12">
                    <div className="inline-block px-4 py-1 bg-[#FFF8E1] rounded-full text-[10px] font-black text-[#8D6E63] mb-6 border border-amber-100 uppercase tracking-widest font-bold">Kingdom Verdict</div>
                    <h2 className="text-3xl font-black text-[#3E2723] mb-3 leading-tight tracking-tight">📜 {String(verdictData.verdict_title)}</h2>
                    <p className="text-sm italic bg-[#FDF5E6] py-3 px-6 rounded-2xl inline-block border border-amber-50">“{String(verdictData.law_reference)}”</p>
                  </div>
                  <div className="mb-14 bg-[#FDFBF9] p-8 rounded-[2.5rem] border border-[#F5EBE0] shadow-inner font-bold">
                    <div className="flex justify-between mb-5 text-[11px] font-black uppercase tracking-widest">
                      <span className="text-blue-600">男方归因 {verdictData.fault_ratio?.A || 50}%</span>
                      <span className="text-rose-600">女方归因 {verdictData.fault_ratio?.B || 50}%</span>
                    </div>
                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex shadow-inner border border-gray-200">
                      <div className="h-full bg-gradient-to-r from-blue-300 to-blue-400 transition-all duration-1000" style={{ width: `${verdictData.fault_ratio?.A || 50}%` }} />
                      <div className="h-full bg-gradient-to-r from-rose-300 to-rose-400 transition-all duration-1000" style={{ width: `${verdictData.fault_ratio?.B || 50}%` }} />
                    </div>
                  </div>
                  <div className="space-y-10">
                    <div><h4 className="font-black text-[#3E2723] mb-4 flex items-center gap-2 italic text-lg uppercase font-bold"><Sparkles size={22} className="text-amber-500" /> 王国深度诊断</h4><p className="text-[13px] leading-relaxed text-[#5D4037] font-medium pl-2">{String(verdictData.analysis)}</p></div>
                    <div className="bg-emerald-50/70 p-8 rounded-[3rem] border border-emerald-100/50 shadow-sm relative"><h4 className="font-black text-emerald-800 mb-4 flex items-center gap-2 italic text-lg font-bold"><Heart size={22} className="text-emerald-500" /> 将心比心 · 懂你才可爱</h4><p className="text-[13px] leading-relaxed text-emerald-900/80 font-medium whitespace-pre-wrap">{String(verdictData.perspective_taking)}</p></div>
                    <div className="bg-indigo-50/50 p-8 rounded-[2.5rem] text-center italic text-sm text-indigo-900/70 font-black leading-relaxed font-bold leading-relaxed">“{String(verdictData.bear_wisdom)}”</div>
                  </div>
                  <div className="mt-16 pt-12 border-t-4 border-double border-[#F5EBE0]">
                    <h3 className="text-center font-black text-[#8D6E63] text-2xl mb-10 uppercase tracking-widest leading-none font-bold">和好罚单执行</h3>
                    <div className="grid grid-cols-1 gap-4 font-bold">
                      {(verdictData.punishments || []).map((p, i) => (
                        <div key={i} className="bg-white border-2 border-[#F5EBE0] p-6 rounded-[2rem] text-center text-sm font-black shadow-sm transition-all hover:translate-y-[-2px] active:border-amber-300">{String(p)}</div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => {setCaseId(''); setCurrentCase(null); setError("");}} className="w-full mt-14 py-6 text-[#A1887F] text-[11px] font-black tracking-[0.6em] border-t border-[#F5EBE0] pt-10 uppercase active:text-[#8D6E63] font-bold text-sm tracking-widest">结案 · 拥抱离场</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// 生产环境极致隔离挂载逻辑
if (typeof document !== 'undefined') {
  const container = document.getElementById('root');
  // 生产环境判别：非预览域名且无内置 API Key
  const isVercelProd = container && !window.__api_key && !window.location.hostname.includes('usercontent.goog');
  
  if (isVercelProd) {
    if (!container._reactRootContainer) {
       const root = createRoot(container);
       container._reactRootContainer = root;
       root.render(<App />);
    }
  }
}

export default App;
