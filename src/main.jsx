import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, Award, Landmark } from 'lucide-react';

/**
 * --- 生产环境配置与安全解析 ---
 * 为了确保 Vercel 构建成功并正确注入变量，这里必须保留 import.meta.env 的标准引用。
 * 预览窗口可能会提示 import.meta 在 es2015 目标中为空，请完全忽略此警告，
 * 它是上线后的动力核心，也是手机端运行不白屏的保障。
 */
const safeParse = (val) => {
  if (!val) return null;
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return null; }
};

// 环境变量兼容读取层：既满足 Vite 替换，也兼容预览环境 fallback
const getVar = (key, canvasGlobal) => {
  if (typeof window !== 'undefined' && window[canvasGlobal]) return window[canvasGlobal];
  try {
    // 强制 Vite 识别的静态路径
    const env = import.meta.env;
    return env ? env[key] : null;
  } catch (e) {
    return null;
  }
};

const firebaseConfig = safeParse(getVar('VITE_FIREBASE_CONFIG', '__firebase_config'));
const apiKey = getVar('VITE_GEMINI_API_KEY', '__api_key') || "";
const appId = getVar('VITE_APP_ID', '__app_id') || 'bear-judge-app-v3';

const modelName = "gemini-2.5-flash-preview-09-2025";
const FIXED_COVER_URL = "/cover.jpg"; 

// 初始化 Firebase 服务
let app, auth, db;
if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase 初始化异常:", e);
  }
}

const App = () => {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [caseId, setCaseId] = useState('');
  const [currentCase, setCurrentCase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempInput, setTempInput] = useState('');
  const [showRoleSelect, setShowRoleSelect] = useState(false);

  // 1. 初始化身份认证：确保“内勤”彻底就绪
  useEffect(() => {
    if (!auth) {
      setError("熊迷路了：未能读取到有效配置，请检查 Vercel 环境变量设置嗷！");
      setInitializing(false);
      return;
    }
    
    // 监听认证状态
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setInitializing(false); // 只有在用户对象真正就绪后才结束加载
      }
    });

    const initAuth = async () => {
      try {
        const canvasToken = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (canvasToken) {
          await signInWithCustomToken(auth, canvasToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setError("法庭内勤认证同步失败，请刷新页面嗷。");
        setInitializing(false);
      }
    };

    initAuth();
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
      setError("调取卷宗失败：请检查 Firebase Rules 设置嗷。");
    });
    return () => unsubscribe();
  }, [user, caseId]);

  const startNewCase = (role) => {
    setShowRoleSelect(false);
    createCase(role);
  };

  const createCase = async (chosenRole) => {
    if (!db || !user) {
      setError("法庭内勤尚未就绪，熊还在努力连接中，等中间圆圈消失后再试嗷！");
      return;
    }
    setLoading(true);
    setError("");
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // sideA: 男方, sideB: 女方
    const sideA = chosenRole === 'male' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    const sideB = chosenRole === 'female' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', newId), {
        id: newId,
        createdBy: user.uid,
        status: 'waiting',
        sideA, sideB, verdict: null,
        createdAt: Date.now()
      });
      setCaseId(newId);
    } catch (err) {
      console.error(err);
      setError("案卷创建失败：请确认 Firebase 的 Rules 规则是否已发布嗷。");
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
        const update = {};
        if (!data.sideB.uid && data.sideA.uid !== user.uid) update["sideB.uid"] = user.uid;
        else if (!data.sideA.uid && data.sideB.uid !== user.uid) update["sideA.uid"] = user.uid;
        
        if (Object.keys(update).length > 0) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', targetId), update);
        }
        setCaseId(targetId);
      } else {
        setError("熊翻遍了档案库也没找到这个案卷号嗷。");
      }
    } catch (err) {
      setError("法庭大门暂时拥堵。");
    } finally {
      setLoading(false);
    }
  };

  const submitPart = async () => {
    if (!tempInput.trim() || !currentCase || !user) return;
    setLoading(true);
    const isA = currentCase.sideA.uid === user?.uid;
    const field = isA ? "sideA" : "sideB";
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        [`${field}.content`]: tempInput,
        [`${field}.submitted`]: true
      });
      setTempInput('');
    } catch (err) {
      setError("证词没能存进法典，请检查网络嗷。");
    } finally {
      setLoading(false);
    }
  };

  const triggerAIJudge = async () => {
    if (!currentCase || !apiKey) {
      setError("AI 宣判核心未联通，请检查 Vercel 密钥设置。");
      return;
    }
    setLoading(true);
    setError("");

    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感调解专家。这里是轻松熊王国神圣最高法庭。
    语气：极度严肃、专业且充满治愈感。自称必须为“熊”。
    任务：基于双方视角给出裁决。
    输出：严格 JSON。包含判决标题、归因比例、法律引用、深度诊断、将心比心、暖心金句、和好罚单。`;
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `[男陈述]：${currentCase.sideA.content}\n[女陈述]：${currentCase.sideB.content}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("宣判失败。");
      
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const verdict = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        verdict: verdict,
        status: 'finished'
      });
    } catch (err) {
      setError("宣判逻辑波动，请重试嗷！");
    } finally {
      setLoading(false);
    }
  };

  // 全屏初始化等待界面
  if (initializing) {
    return (
      <div className="min-h-screen bg-[#FFFDFB] flex flex-col items-center justify-center text-[#8D6E63] p-10 text-center">
        <RefreshCw className="animate-spin mb-6 text-amber-600" size={48} />
        <p className="font-black text-xl mb-2 animate-pulse">正在连接轻松熊王国神圣最高法庭...</p>
        <p className="text-xs text-[#A1887F] mt-4 leading-relaxed font-medium">
          首次开启可能需要几秒，<br/>
          如果一直停留在此页面，请确认 Vercel 环境变量中 Firebase 配置正确嗷～
        </p>
      </div>
    );
  }

  const verdictData = currentCase?.verdict || null;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const isMyTurn = currentCase && !verdictData && !isBothSubmitted && (
    (currentCase.sideA?.uid === user?.uid && !currentCase.sideA?.submitted) ||
    (currentCase.sideB?.uid === user?.uid && !currentCase.sideB?.submitted)
  );

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-[#4E342E] font-sans pb-10 select-none overflow-x-hidden text-balance">
      {/* 顶部导航 */}
      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-20 p-4 border-b border-[#F5EBE0] flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-[#8D6E63] p-1.5 rounded-lg shadow-inner"><Scale className="text-white" size={18} /></div>
          <span className="font-black text-lg tracking-tight">轻松熊王国神圣最高法庭</span>
        </div>
        {user && <span className="text-[10px] text-[#A1887F] font-mono font-bold uppercase tracking-widest">ID:{user.uid.slice(0, 4)}</span>}
      </nav>

      <div className="max-w-xl mx-auto p-4 pt-6">
        {/* 固定封面 */}
        <div className="relative mb-8 rounded-[2.5rem] shadow-2xl overflow-hidden border-[6px] border-white aspect-[16/9] bg-[#F5EBE0]">
          <img src={FIXED_COVER_URL} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" alt="法庭封面" 
               onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1000"; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-6 left-8 flex items-end justify-between right-8 text-white">
            <h1 className="font-black text-2xl drop-shadow-lg leading-none font-bold">公正 · 治愈 · 爱</h1>
            <Landmark className="opacity-60 mb-1" size={36} />
          </div>
        </div>

        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-[#F5EBE0] text-center animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5"><Award size={120} /></div>
            <div className="relative">
              <div className="w-20 h-20 bg-[#FFF8E1] rounded-3xl flex items-center justify-center mx-auto mb-8 border border-amber-100/50 shadow-inner">
                <Gavel className="text-amber-600" size={40} />
              </div>
              <h2 className="text-2xl font-black mb-3">神圣最高法庭</h2>
              <p className="text-[#8D6E63] text-sm mb-12 px-6 font-medium leading-relaxed">
                这里是王国最神圣的地方嗷，熊将抱着极其认真的心情，帮你们化解每一颗受委屈的小心心。
              </p>
              
              <div className="space-y-4">
                {showRoleSelect ? (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                    <button onClick={() => startNewCase('male')} className="bg-blue-50 border-2 border-blue-200 p-6 rounded-3xl group active:scale-95 transition-all">
                      <span className="text-3xl block mb-2 transition-transform group-hover:scale-110">🙋‍♂️</span>
                      <span className="text-[11px] font-black text-blue-700 uppercase">男方当事人</span>
                    </button>
                    <button onClick={() => startNewCase('female')} className="bg-rose-50 border-2 border-rose-200 p-6 rounded-3xl group active:scale-95 transition-all">
                      <span className="text-3xl block mb-2 transition-transform group-hover:scale-110">🙋‍♀️</span>
                      <span className="text-[11px] font-black text-rose-700 uppercase">女方当事人</span>
                    </button>
                    <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-[10px] text-gray-400 font-bold uppercase py-2 tracking-widest font-bold">取消并返回</button>
                  </div>
                ) : (
                  <><button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-5 rounded-[2rem] font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"><UserPlus size={22}/> 发起新诉讼</button>
                    {/* 手机端布局优化：确保调取按钮在窄屏下可见 */}
                    <div className="flex gap-2 mt-4 items-stretch h-14">
                      <input 
                        placeholder="输入卷宗检索码" 
                        className="flex-1 min-w-0 p-4 rounded-[1.5rem] bg-[#FDF5E6] border-2 border-transparent focus:border-amber-200 outline-none text-center font-black tracking-widest uppercase text-xs" 
                        onChange={(e) => setTempInput(e.target.value)} 
                      />
                      <button 
                        onClick={() => joinCase(tempInput)} 
                        className="flex-shrink-0 bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-6 rounded-[1.5rem] font-black active:bg-[#FDF5E6] transition-colors shadow-sm text-sm"
                      >
                        调取
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* 案卷检索标识 */}
            <div className="bg-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-md border border-[#F5EBE0]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#FFF8E1] rounded-2xl flex items-center justify-center text-amber-600 border border-amber-100 shadow-sm"><ShieldCheck size={28} /></div>
                <div>
                  <div className="text-[10px] text-[#A1887F] font-black uppercase mb-0.5 font-bold tracking-widest">王国案卷号</div>
                  <div className="font-mono font-black text-2xl text-[#8D6E63] leading-none">{caseId}</div>
                </div>
              </div>
              <button onClick={() => navigator.clipboard.writeText(caseId)} className="p-3 bg-[#FDF5E6] text-[#8D6E63] rounded-2xl hover:bg-[#F5EBE0] transition-colors shadow-inner"><Copy size={20} /></button>
            </div>

            {!verdictData ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-[#F5EBE0] min-h-[400px] flex flex-col relative overflow-hidden">
                {isMyTurn ? (
                  <div className="h-full flex flex-col animate-in slide-in-from-right-4 duration-500">
                    <h3 className="font-black text-xl text-[#3E2723] flex items-center gap-2 mb-1"><MessageCircle className="text-amber-500" /> 证词录入：提交辩词</h3>
                    <p className="text-[10px] text-[#A1887F] font-bold mb-6 tracking-tighter">神圣法律面前众熊平等，请如实描述争议细节嗷！</p>
                    <textarea className="w-full flex-1 p-6 bg-[#FDFBF9] rounded-[2rem] border-2 border-[#F5EBE0] outline-none resize-none mb-6 text-sm leading-relaxed" placeholder="把你的委屈都告诉熊，熊会认真听的..." value={tempInput} onChange={(e) => setTempInput(e.target.value)} />
                    <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-[1.8rem] font-black text-xl shadow-lg active:scale-95 transition-all">交给熊归档</button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-in zoom-in-95 duration-500">
                    <div className="w-24 h-24 bg-white border border-amber-100 rounded-[2.5rem] flex items-center justify-center shadow-xl text-5xl mb-10 text-balance">🏛️</div>
                    <h3 className="text-2xl font-black mb-3 text-[#3E2723]">{isBothSubmitted ? '证据已收齐' : '熊正在采证中'}</h3>
                    <p className="text-[#8D6E63] text-xs mb-12 px-10 font-medium leading-relaxed">
                      {isBothSubmitted ? '双方当事人的证词均已归入法典。点击下方按钮，熊要宣判了嗷！' : '熊还在等待另一半提交内心辩词嗷。法庭秩序重于一切，请耐心等候～'}
                    </p>
                    {isBothSubmitted && <button onClick={triggerAIJudge} disabled={loading} className="bg-[#D84315] text-white px-16 py-6 rounded-full font-black text-2xl hover:bg-[#BF360C] shadow-2xl animate-pulse flex items-center gap-4 active:scale-95 transition-all">{loading ? <RefreshCw className="animate-spin" /> : <Gavel size={32} />} 熊要宣判了！</button>}
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-20 duration-1000 pb-10">
                <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border-t-[14px] border-[#8D6E63] relative overflow-hidden">
                  <div className="text-center mb-12">
                    <div className="inline-block px-4 py-1 bg-[#FFF8E1] rounded-full text-[10px] font-black text-[#8D6E63] mb-6 border border-amber-100 uppercase tracking-widest font-bold">Kingdom Verdict</div>
                    <h2 className="text-3xl font-black text-[#3E2723] mb-3 leading-tight tracking-tight">📜 {String(verdictData.verdict_title)}</h2>
                    <p className="text-sm italic bg-[#FDF5E6] py-3 px-6 rounded-2xl inline-block border border-amber-50">“{String(verdictData.law_reference)}”</p>
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
                    <h3 className="text-center font-black text-[#8D6E63] text-2xl mb-10 uppercase tracking-widest leading-none">和好罚单执行</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {(verdictData.punishments || []).map((p, i) => (
                        <div key={i} className="bg-white border-2 border-[#F5EBE0] p-6 rounded-[2rem] text-center text-sm font-black shadow-sm transition-all hover:translate-y-[-2px]">
                          {String(p)}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => {setCaseId(''); setCurrentCase(null); setError("");}} className="w-full mt-14 py-6 text-[#A1887F] text-[11px] font-black tracking-[0.6em] border-t border-[#F5EBE0] pt-10 uppercase active:text-[#8D6E63] font-bold">结案 · 拥抱离场</button>
                </div>
              </div>
            )}
          </div>
        )}
        {error && <div className="mt-8 p-5 bg-rose-50 text-rose-600 rounded-3xl text-[11px] font-bold border border-rose-100 flex items-center gap-3 animate-in fade-in duration-300"><AlertCircle size={20} /> <span className="flex-1 leading-tight font-bold">{error}</span><button onClick={() => setError('')} className="p-2 hover:bg-rose-100 rounded-xl transition-colors">关闭</button></div>}
      </div>
    </div>
  );
};

export default App;
