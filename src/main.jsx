import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, Award, Landmark } from 'lucide-react';

/**
 * --- 环境配置适配层 ---
 * 修复了 import.meta 在某些编译器环境下的警告。
 * 代码会自动识别是处于 Canvas 预览环境还是 Vercel 生产环境。
 */
const safeParse = (val) => {
  if (!val) return {};
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return {}; }
};

// 安全获取环境变量
const getEnvVar = (viteKey, canvasGlobal) => {
  // 1. 尝试从 Canvas 预览环境获取
  if (typeof window !== 'undefined' && window[canvasGlobal]) return window[canvasGlobal];
  
  // 2. 尝试从 Vite/Vercel 环境获取 (使用 try-catch 规避编译器警告)
  try {
    const metaEnv = import.meta.env;
    if (metaEnv && metaEnv[viteKey]) return metaEnv[viteKey];
  } catch (e) {
    // 忽略特定环境下的 import.meta 报错
  }
  return null;
};

// 初始化配置变量
const firebaseConfigRaw = getEnvVar('VITE_FIREBASE_CONFIG', '__firebase_config');
const firebaseConfig = safeParse(firebaseConfigRaw);
const apiKey = getEnvVar('VITE_GEMINI_API_KEY', '__api_key') || "";
const appId = getEnvVar('VITE_APP_ID', '__app_id') || 'bear-judge-app-v3';

const modelName = "gemini-2.5-flash-preview-09-2025";
const FIXED_COVER_URL = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1000";

// 初始化 Firebase 服务
let app, auth, db;
if (firebaseConfig?.apiKey) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Initialization Failed", e);
  }
}

const App = () => {
  const [user, setUser] = useState(null);
  const [caseId, setCaseId] = useState('');
  const [currentCase, setCurrentCase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempInput, setTempInput] = useState('');
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  
  // 仅用于调试的开发者模式
  const [devMode, setDevMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [devTargetSide, setDevTargetSide] = useState('A');

  // 1. 初始化认证
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        // 优先检查预览环境的初始 Token
        if (typeof window !== 'undefined' && window.__initial_auth_token) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error", err);
        setError("法庭内勤认证失败，请检查配置。");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // 2. 实时监听案卷更新
  useEffect(() => {
    if (!user || !caseId || !db) return;
    const caseDoc = doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId);
    const unsubscribe = onSnapshot(caseDoc, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentCase(docSnap.data());
      }
    }, (err) => {
      setError("调取卷宗失败: " + err.message);
    });
    return () => unsubscribe();
  }, [user, caseId]);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      setDevMode(!devMode);
      setClickCount(0);
    }
  };

  const createCase = async (chosenRole) => {
    if (!db || !user) return;
    setLoading(true);
    setError("");
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const sideAData = chosenRole === 'male' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    const sideBData = chosenRole === 'female' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', newId), {
        id: newId,
        createdBy: user.uid,
        status: 'waiting',
        sideA: sideAData,
        sideB: sideBData,
        verdict: null,
        createdAt: Date.now()
      });
      setCaseId(newId);
    } catch (err) {
      setError("卷宗生成失败，请确认权限设置。");
    } finally {
      setLoading(false);
    }
  };

  const joinCase = async (id) => {
    if (!db || !id || !user) return;
    setLoading(true);
    setError("");
    try {
      const targetId = id.toUpperCase();
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', targetId));
      if (snap.exists()) {
        const data = snap.data();
        if (!data.sideB.uid && data.sideA.uid !== user.uid) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', targetId), { "sideB.uid": user.uid });
        } else if (!data.sideA.uid && data.sideB.uid !== user.uid) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', targetId), { "sideA.uid": user.uid });
        }
        setCaseId(targetId);
      } else {
        setError("未能在王国档案库中找到此卷宗编号。");
      }
    } catch (err) {
      setError("无法进入法庭，请检查网络。");
    } finally {
      setLoading(false);
    }
  };

  const submitPart = async () => {
    if (!tempInput.trim() || !currentCase || !user) return;
    setLoading(true);
    const isSideA = devMode ? (devTargetSide === 'A') : (currentCase.sideA.uid === user.uid);
    const field = isSideA ? "sideA" : "sideB";
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        [`${field}.content`]: tempInput,
        [`${field}.submitted`]: true
      });
      setTempInput('');
    } catch (err) {
      setError("证词存档失败。");
    } finally {
      setLoading(false);
    }
  };

  const triggerAIJudge = async () => {
    if (!currentCase || !apiKey) {
      setError("AI 宣判核心密钥未正确加载，请检查 Vercel 设置。");
      return;
    }
    setLoading(true);
    setError("");

    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感调解专家。
    背景：轻松熊王国最高法院·情感分庭。
    要求：语气极度严肃、专业且治愈。输出必须是严格的 JSON 对象。
    JSON 格式：{ "verdict_title": "...", "fault_ratio": {"A": 50, "B": 50}, "law_reference": "...", "analysis": "...", "perspective_taking": "...", "bear_wisdom": "...", "punishments": [] }`;
    
    const userQuery = `男方陈述：${currentCase.sideA.content}\n女方陈述：${currentCase.sideB.content}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) throw new Error("法官陷入沉思，未给出结论。");
      
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const verdict = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        verdict: verdict,
        status: 'finished'
      });
    } catch (err) {
      console.error(err);
      setError("宣判逻辑异常，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const verdictData = currentCase?.verdict || null;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const isMyTurn = currentCase && !verdictData && !isBothSubmitted && (
    devMode ||
    (currentCase.sideA?.uid === user?.uid && !currentCase.sideA?.submitted) ||
    (currentCase.sideB?.uid === user?.uid && !currentCase.sideB?.submitted)
  );

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-[#4E342E] font-sans pb-10 select-none overflow-x-hidden">
      {/* 顶部法院导航栏 */}
      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-20 p-4 border-b border-[#F5EBE0] flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform" onClick={handleTitleClick}>
          <div className="bg-[#8D6E63] p-1.5 rounded-lg shadow-inner">
            <Scale className="text-white" size={18} />
          </div>
          <span className={`font-black text-lg tracking-tight ${devMode ? 'text-indigo-600 animate-pulse' : 'text-[#4E342E]'}`}>
            轻松熊王国最高法院 {devMode && <span className="text-[10px] bg-indigo-100 px-2 py-0.5 rounded-full ml-1 uppercase">Dev</span>}
          </span>
        </div>
        {user && <span className="text-[10px] text-[#A1887F] font-mono tracking-widest font-bold uppercase">ID:{user.uid.slice(0, 4)}</span>}
      </nav>

      <div className="max-w-xl mx-auto p-4 pt-6">
        {/* 固定视觉封面 */}
        <div className="relative mb-8 rounded-[2.5rem] shadow-2xl overflow-hidden border-[6px] border-white aspect-[16/9] bg-[#F5EBE0]">
          <img src={FIXED_COVER_URL} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" alt="法庭封面" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-6 left-8 flex items-end justify-between right-8">
            <div>
              <h1 className="text-white font-black text-2xl drop-shadow-lg leading-none">公正 · 治愈 · 爱</h1>
              <p className="text-white/80 text-[10px] font-bold uppercase tracking-[0.3em] mt-1">Kingdom of Rilakkuma Justice</p>
            </div>
            <Landmark className="text-white/60 mb-1" size={36} />
          </div>
        </div>

        {/* 动态显示区域 */}
        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-[#F5EBE0] text-center animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5"><Award size={120} /></div>
            <div className="relative">
              <div className="w-20 h-20 bg-[#FFF8E1] rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner border border-amber-100/50">
                <Gavel className="text-amber-600" size={40} />
              </div>
              <h2 className="text-2xl font-black mb-3 text-[#3E2723]">王国特别法庭：正式开庭</h2>
              <p className="text-[#8D6E63] text-sm mb-12 px-6 leading-relaxed font-medium">
                本庭将以极度严肃的态度，<br/>妥善解决每一份因深爱而生的委屈。
              </p>
              
              <div className="space-y-4">
                {showRoleSelect ? (
                   <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                     <button onClick={() => startNewCase('male')} className="bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 p-6 rounded-3xl transition-all shadow-sm group">
                       <span className="text-3xl block mb-2 transition-transform group-hover:scale-110">🙋‍♂️</span>
                       <span className="text-[11px] font-black text-blue-700 uppercase tracking-tighter">男方当事人</span>
                     </button>
                     <button onClick={() => startNewCase('female')} className="bg-rose-50 hover:bg-rose-100 border-2 border-rose-200 p-6 rounded-3xl transition-all shadow-sm group">
                       <span className="text-3xl block mb-2 transition-transform group-hover:scale-110">🙋‍♀️</span>
                       <span className="text-[11px] font-black text-rose-700 uppercase tracking-tighter">女方当事人</span>
                     </button>
                     <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest py-2">取消并返回</button>
                   </div>
                ) : (
                  <>
                    <button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-5 rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 shadow-lg hover:bg-[#6D4C41] active:scale-95 transition-all">
                      <UserPlus size={24} /> 发起新诉讼
                    </button>
                    <div className="flex items-center gap-4 py-4 text-[#D7CCC8]">
                      <div className="h-px flex-1 bg-current opacity-30" />
                      <span className="text-[10px] font-black tracking-[0.2em] uppercase">或调取已有卷宗</span>
                      <div className="h-px flex-1 bg-current opacity-30" />
                    </div>
                    <div className="flex gap-2">
                      <input placeholder="请输入6位检索码" className="flex-1 p-5 rounded-[1.8rem] bg-[#FDF5E6] border-2 border-transparent focus:border-amber-200 outline-none text-center font-black tracking-widest uppercase placeholder:text-[#D7CCC8]" onChange={(e) => setTempInput(e.target.value)} />
                      <button onClick={() => joinCase(tempInput)} className="bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-8 rounded-[1.8rem] font-black hover:bg-[#FDF5E6] shadow-sm transition-colors">调取</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* 案卷标识 */}
            <div className="bg-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-md border border-[#F5EBE0]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#FFF8E1] rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <div className="text-[10px] text-[#A1887F] font-black uppercase mb-0.5 font-bold">王国案卷号</div>
                  <div className="font-mono font-black text-2xl text-[#8D6E63] leading-none">{caseId}</div>
                </div>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(caseId); }} className="p-3 bg-[#FDF5E6] text-[#8D6E63] rounded-2xl hover:bg-[#F5EBE0] transition-colors shadow-inner"><Copy size={20} /></button>
            </div>

            {!verdictData ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-[#F5EBE0] min-h-[400px] flex flex-col relative overflow-hidden">
                {isMyTurn ? (
                  <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <h3 className="font-black text-xl text-[#3E2723] flex items-center gap-2 mb-1">
                          <MessageCircle className="text-amber-500" />
                          {devMode ? `[Dev] 代表${devTargetSide === 'A' ? '男方' : '女方'}录入` : '证词录入：提交内心辩词'}
                        </h3>
                        <p className="text-[10px] text-[#A1887F] font-bold">法律面前众熊平等，请如实描述争议细节嗷！</p>
                      </div>
                    </div>
                    <textarea 
                      className="w-full flex-1 p-6 bg-[#FDFBF9] rounded-[2rem] border-2 border-[#F5EBE0] focus:border-amber-200 outline-none resize-none mb-6 text-sm leading-relaxed placeholder:text-[#D7CCC8]"
                      placeholder="请如实描述矛盾背景、具体经过以及你的真实感受..."
                      value={tempInput}
                      onChange={(e) => setTempInput(e.target.value)}
                    />
                    <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-[1.8rem] font-black text-xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all">
                      {loading ? <RefreshCw className="animate-spin" /> : <Sparkles size={20} />} 确认并归档
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-in zoom-in-95 duration-500">
                    <div className="relative mb-10 scale-110">
                       <div className="absolute inset-0 bg-amber-200 blur-3xl opacity-30 animate-pulse rounded-full" />
                       <div className="relative w-24 h-24 bg-white border border-amber-100 rounded-[2.5rem] flex items-center justify-center shadow-xl text-5xl">🏛️</div>
                    </div>
                    <h3 className="text-2xl font-black mb-3 text-[#3E2723]">
                      {isBothSubmitted ? '本庭证据已收齐' : '法庭正在采证中'}
                    </h3>
                    <p className="text-[#8D6E63] text-xs mb-12 px-10 leading-relaxed font-medium text-balance">
                      {isBothSubmitted 
                        ? '双方当事人的证词均已归入《轻松熊王国神圣相处法典》，请点击下方按钮启动正式宣判嗷！' 
                        : '正在等待另一半提交内心辩词。法庭秩序重于一切，请耐心等候哒～'}
                    </p>
                    {isBothSubmitted && (
                      <button onClick={triggerAIJudge} disabled={loading} className="bg-[#D84315] text-white px-16 py-6 rounded-full font-black text-2xl hover:bg-[#BF360C] shadow-2xl animate-pulse active:scale-95 transition-all flex items-center gap-4">
                        {loading ? <RefreshCw className="animate-spin" /> : <Gavel size={32} />} 立刻开庭宣判！
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* 判决书界面 */
              <div className="animate-in slide-in-from-bottom-20 duration-1000 pb-10">
                <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border-t-[14px] border-[#8D6E63] relative overflow-hidden">
                  <div className="text-center mb-12">
                    <div className="inline-block px-4 py-1 bg-[#FFF8E1] rounded-full text-[10px] font-black text-[#8D6E63] tracking-[0.3em] mb-6 border border-amber-100 uppercase">Judgment Record</div>
                    <h2 className="text-3xl font-black text-[#3E2723] mb-3 leading-tight tracking-tight">📜 {String(verdictData.verdict_title)}</h2>
                    <p className="text-sm text-[#A1887F] font-serif italic bg-[#FDF5E6] py-3 px-6 rounded-2xl inline-block border border-amber-50 text-balance">“{String(verdictData.law_reference) }”</p>
                  </div>
                  
                  <div className="mb-14 bg-[#FDFBF9] p-8 rounded-[2.5rem] border border-[#F5EBE0] shadow-inner">
                    <div className="flex justify-between mb-5 text-[11px] font-black uppercase tracking-widest">
                      <span className="text-blue-600 font-bold">男方归因 {verdictData.fault_ratio?.A || 50}%</span>
                      <span className="text-rose-600 font-bold">女方归因 {verdictData.fault_ratio?.B || 50}%</span>
                    </div>
                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex shadow-inner border border-gray-200">
                      <div className="h-full bg-gradient-to-r from-blue-300 to-blue-400 transition-all duration-1000" style={{ width: `${verdictData.fault_ratio?.A || 50}%` }} />
                      <div className="h-full bg-gradient-to-r from-rose-300 to-rose-400 transition-all duration-1000" style={{ width: `${verdictData.fault_ratio?.B || 50}%` }} />
                    </div>
                  </div>

                  <div className="space-y-10">
                    <div>
                      <h4 className="font-black text-[#3E2723] mb-4 flex items-center gap-2 italic text-lg tracking-tighter uppercase leading-none">
                        <Sparkles size={22} className="text-amber-500" /> 熊熊深度诊断
                      </h4>
                      <p className="text-[13px] leading-relaxed text-[#5D4037] font-medium pl-2 text-balance">{String(verdictData.analysis)}</p>
                    </div>

                    <div className="bg-emerald-50/70 p-8 rounded-[3rem] border border-emerald-100/50 shadow-sm relative">
                      <h4 className="font-black text-emerald-800 mb-4 flex items-center gap-2 italic text-lg tracking-tighter uppercase leading-none font-bold">
                        <Heart size={22} className="text-emerald-500" /> 换位思考 · 懂你才可爱
                      </h4>
                      <p className="text-[13px] leading-relaxed text-emerald-900/80 whitespace-pre-wrap font-medium text-balance">{String(verdictData.perspective_taking)}</p>
                    </div>

                    <div className="bg-indigo-50/50 p-8 rounded-[2.5rem] border border-indigo-100/50 text-center relative">
                      <p className="text-sm italic text-indigo-900/70 font-black leading-relaxed text-balance">“{String(verdictData.bear_wisdom)}”</p>
                    </div>
                  </div>

                  <div className="mt-16 pt-12 border-t-4 border-double border-[#F5EBE0]">
                    <h3 className="text-center font-black text-[#8D6E63] text-2xl tracking-[0.5em] mb-10 uppercase leading-none">和好罚单执行</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {(verdictData.punishments || []).map((p, i) => (
                        <div key={i} className="bg-white border-2 border-[#F5EBE0] p-6 rounded-[2rem] text-center text-sm font-black text-[#5D4037] shadow-sm hover:border-amber-300 transition-all hover:-translate-y-1 font-bold">
                          {String(p)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => {setCaseId(''); setCurrentCase(null); setError("");}} className="w-full mt-14 py-6 text-[#A1887F] text-[11px] font-black hover:text-[#8D6E63] tracking-[0.6em] transition-colors uppercase border-t border-[#F5EBE0] pt-10 font-bold">
                    结 案 · 拥 抱 离 场
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-8 p-5 bg-rose-50 text-rose-600 rounded-3xl text-[11px] font-bold flex items-center gap-3 border border-rose-100 animate-in slide-in-from-top-2 duration-300">
            <AlertCircle size={20} /> <span className="flex-1 leading-tight">{error}</span>
            <button onClick={() => setError('')} className="p-2 hover:bg-rose-100 rounded-xl transition-colors">关闭</button>
          </div>
        )}
      </div>
    </div>
  );
};

// 生产环境标准挂载点
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
