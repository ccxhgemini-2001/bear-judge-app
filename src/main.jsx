import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, Undo2, UserPlus, Copy, ShieldCheck, User, Users, Trash2, Gavel } from 'lucide-react';

// --- 生产环境配置 ---
// 在 Vercel 部署时，请确保配置了环境变量 VITE_FIREBASE_CONFIG 和 VITE_GEMINI_API_KEY
const getFirebaseConfig = () => {
  try {
    // 优先尝试从 Vite 环境变量读取
    if (import.meta.env && import.meta.env.VITE_FIREBASE_CONFIG) {
      return JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
    }
    // 降级支持预览环境
    if (typeof __firebase_config !== 'undefined') {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.error("Firebase Config Error:", e);
  }
  return {};
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'bear-judge-app-v3';

// AI 配置
const getApiKey = () => {
  return (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || "";
};
const apiKey = getApiKey();
const modelName = "gemini-2.5-flash-preview-09-2025";
const imageModel = "imagen-4.0-generate-001";

const App = () => {
  const [user, setUser] = useState(null);
  const [caseId, setCaseId] = useState('');
  const [currentCase, setCurrentCase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [error, setError] = useState('');
  const [judgeImg, setJudgeImg] = useState('');
  const [tempInput, setTempInput] = useState('');
  
  // 开发者模式状态
  const [devMode, setDevMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [devTargetSide, setDevTargetSide] = useState('A'); 

  // --- 身份验证设置 ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setError("身份验证失败，请检查 Firebase 配置或网络～");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // --- 图片生成 (法庭背景) ---
  useEffect(() => {
    const generateJudgeImage = async () => {
      if (judgeImg || !apiKey) return;
      setImgLoading(true);
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: "A cute fluffy brown Rilakkuma bear judge with a white lawyer wig, sitting professionally behind a large wooden court desk with a gavel. High-end courtroom interior background with warm sunlight, library shelves with law books, cinematic 3D render, kawaii style, ultra high resolution." }],
            parameters: { sampleCount: 1 }
          })
        });

        if (!response.ok) {
          console.error("Imagen API Error");
          return;
        }

        const result = await response.json();
        if (result.predictions?.[0]?.bytesBase64Encoded) {
          setJudgeImg(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
        }
      } catch (err) {
        console.error("Image Gen Error:", err.message);
      } finally {
        setImgLoading(false);
      }
    };
    generateJudgeImage();
  }, [apiKey]);

  // --- Firestore 监听器 ---
  useEffect(() => {
    if (!user || !caseId) return;
    const caseDoc = doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId);
    const unsubscribe = onSnapshot(caseDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentCase(data);
        if (devMode && !data.verdict) {
           if (!data.sideA.submitted) setDevTargetSide('A');
           else if (!data.sideB.submitted) setDevTargetSide('B');
        }
      } else {
        setError("该案卷未找到嗷～");
      }
    }, (err) => setError("数据同步异常: " + err.message));
    return () => unsubscribe();
  }, [user, caseId, devMode]);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      setDevMode(!devMode);
      setClickCount(0);
    }
  };

  const createCase = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const caseData = {
      id: newId,
      createdBy: user.uid,
      status: 'waiting',
      sideA: { uid: user.uid, content: '', submitted: false },
      sideB: { uid: null, content: '', submitted: false },
      verdict: null,
      createdAt: Date.now()
    };
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', newId), caseData);
      setCaseId(newId);
    } catch (err) {
      setError("创建失败，请确保 Firestore 规则已开启测试模式嗷！");
    } finally {
      setLoading(false);
    }
  };

  const joinCase = async (id) => {
    if (!user || !id) return;
    setLoading(true);
    setError("");
    try {
      const caseDoc = doc(db, 'artifacts', appId, 'public', 'data', 'cases', id.toUpperCase());
      const snap = await getDoc(caseDoc);
      if (snap.exists()) {
        const data = snap.data();
        if (!data.sideB.uid && data.sideA.uid !== user.uid) {
          await updateDoc(caseDoc, { "sideB.uid": user.uid });
        }
        setCaseId(id.toUpperCase());
      } else {
        setError("找不到这个案卷码嗷～");
      }
    } catch (err) {
      setError("加入失败");
    } finally {
      setLoading(false);
    }
  };

  const submitMyPart = async () => {
    if (!tempInput.trim() || !currentCase) return;
    setLoading(true);
    setError("");
    const isSideA = devMode ? (devTargetSide === 'A') : (currentCase.sideA.uid === user.uid);
    const field = isSideA ? "sideA" : "sideB";
    try {
      const updates = {
        [`${field}.content`]: tempInput,
        [`${field}.submitted`]: true
      };
      if (devMode && !isSideA && !currentCase.sideB.uid) {
        updates["sideB.uid"] = "dev_dummy_b";
      }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), updates);
      setTempInput('');
    } catch (err) {
      setError("提交失败");
    } finally {
      setLoading(false);
    }
  };

  const clearCaseData = async () => {
    if (!caseId || !devMode) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        "sideA.content": "",
        "sideA.submitted": false,
        "sideB.content": "",
        "sideB.submitted": false,
        "sideB.uid": null,
        "verdict": null,
        "status": "waiting"
      });
      setDevTargetSide('A');
    } catch (err) {
      setError("重置失败");
    } finally {
      setLoading(false);
    }
  };

  const triggerAIJudge = async () => {
    if (!currentCase || !currentCase.sideA.submitted || !currentCase.sideB.submitted || !apiKey) {
      setError("准备工作未完成嗷！");
      return;
    }
    setLoading(true);
    setError("");
    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感调解专家。语气极度可爱、软萌。输出JSON格式：{verdict_title, fault_ratio: {A, B}, law_reference, analysis, perspective_taking, bear_wisdom, punishments: []}`;
    const userQuery = `男方视角：${currentCase.sideA.content}\n女方视角：${currentCase.sideB.content}`;
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
      const verdictText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!verdictText) throw new Error("Empty AI Response");
      const verdict = JSON.parse(verdictText);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        verdict: verdict,
        status: 'finished'
      });
    } catch (err) {
      setError("审理失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const isMyTurn = currentCase && !currentCase.verdict && !isBothSubmitted && (
    devMode ||
    (currentCase.sideA?.uid === user?.uid && !currentCase.sideA?.submitted) ||
    (currentCase.sideB?.uid === user?.uid && !currentCase.sideB?.submitted) ||
    (!currentCase.sideB?.uid && currentCase.sideA?.uid !== user?.uid)
  );

  return (
    <div className="min-h-screen bg-[#FFF9F2] text-[#5D4037] font-sans pb-10 select-none overflow-x-hidden">
      <nav className="bg-white/90 backdrop-blur-md sticky top-0 z-20 p-4 border-b flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform" onClick={handleTitleClick}>
          <Scale className={`${devMode ? 'text-indigo-600 animate-pulse' : 'text-[#8D6E63]'}`} />
          <span className={`font-black text-lg ${devMode ? 'text-indigo-600' : 'text-[#4E342E]'}`}>
            轻松熊王国最高法院 {devMode && <span className="text-[10px] bg-indigo-100 px-2 py-0.5 rounded-full ml-1">开发者</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {devMode && caseId && <button onClick={clearCaseData} className="p-2 text-indigo-400 hover:bg-indigo-50 rounded-full"><Trash2 size={18} /></button>}
          {user && <span className="text-xs text-gray-300 font-mono">UID:{user.uid.slice(0, 4)}</span>}
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-4 pt-6">
        <div className="relative mb-8 group">
          <div className="relative w-full aspect-video bg-white rounded-3xl shadow-2xl overflow-hidden border-4 border-white">
            {imgLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
                <RefreshCw className="animate-spin text-amber-200 mb-2" size={32} />
                <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">布 置 法 庭 中</span>
              </div>
            ) : judgeImg ? (
              <img src={judgeImg} alt="轻松熊法官" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-amber-50 flex items-center justify-center text-6xl text-amber-200">🏛️</div>
            )}
            <div className="absolute bottom-4 left-4 right-4 bg-white/30 backdrop-blur-xl border border-white/40 p-3 rounded-2xl flex items-center justify-between">
              <span className="text-white text-xs font-black drop-shadow-md">状态: {currentCase?.verdict ? '宣判完毕' : isBothSubmitted ? '准备开庭' : '正在采证'}</span>
              <div className="flex gap-1.5">
                <div className={`w-3 h-3 rounded-full shadow-sm ${currentCase?.sideA?.submitted ? 'bg-green-400' : 'bg-gray-200 animate-pulse'}`} />
                <div className={`w-3 h-3 rounded-full shadow-sm ${currentCase?.sideB?.submitted ? 'bg-green-400' : 'bg-gray-200 animate-pulse'}`} />
              </div>
            </div>
          </div>
        </div>

        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-[#EFEBE9] text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner text-4xl">🧸</div>
            <h2 className="text-2xl font-black mb-3 text-[#4E342E]">开启治愈法庭嗷！</h2>
            <p className="text-gray-400 text-sm mb-10 leading-relaxed px-6 text-balance">异地恋也能异地判，快发起诉讼或者输入码码加入嗷！</p>
            <div className="space-y-4">
              <button onClick={createCase} className="w-full bg-[#8D6E63] text-white py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                <UserPlus size={24} /> 发起新诉讼
              </button>
              <div className="flex items-center gap-3 text-gray-200 py-2">
                <div className="h-px flex-1 bg-current" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">或者</span>
                <div className="h-px flex-1 bg-current" />
              </div>
              <div className="flex gap-2">
                <input placeholder="案卷码" className="flex-1 p-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-[#8D6E63] outline-none text-center font-black tracking-widest uppercase" onChange={(e) => setTempInput(e.target.value)} />
                <button onClick={() => joinCase(tempInput)} className="bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-8 rounded-2xl font-black hover:bg-amber-50 transition-colors">加入</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-[2rem] flex justify-between items-center shadow-sm border border-[#EFEBE9]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-[#8D6E63] shadow-sm"><ShieldCheck size={24} /></div>
                <div>
                  <div className="text-[10px] text-gray-300 font-black uppercase tracking-widest">案卷号</div>
                  <div className="font-mono font-black text-xl text-[#8D6E63] leading-none">{caseId}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {devMode && isBothSubmitted && !currentCase.verdict && (
                  <button onClick={triggerAIJudge} className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg hover:bg-indigo-700 animate-bounce" title="开发者强制开庭"><Gavel size={20} /></button>
                )}
                <button onClick={() => { navigator.clipboard.writeText(caseId); }} className="bg-gray-50 text-gray-400 p-2.5 rounded-xl hover:bg-gray-100 transition-colors shadow-sm"><Copy size={18} /></button>
              </div>
            </div>

            {!currentCase.verdict ? (
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#EFEBE9] min-h-[360px] flex flex-col transition-all">
                {isMyTurn ? (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-500 h-full flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-black text-xl text-[#4E342E] flex items-center gap-2">
                        <MessageCircle className="text-amber-500" />
                        {devMode ? `正在存证：${devTargetSide === 'A' ? '男方' : '女方'}` : '写下你的真实想法'}
                      </h3>
                      {devMode && (
                        <div className="flex bg-indigo-50 p-1 rounded-lg gap-1 border border-indigo-100">
                          <button onClick={() => setDevTargetSide('A')} className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-all ${devTargetSide === 'A' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}>男方</button>
                          <button onClick={() => setDevTargetSide('B')} className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-all ${devTargetSide === 'B' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}>女方</button>
                        </div>
                      )}
                    </div>
                    <textarea 
                      className="w-full flex-1 p-6 bg-gray-50 rounded-3xl border-2 border-transparent focus:border-amber-100 outline-none resize-none mb-6 text-sm leading-relaxed text-[#5D4037] placeholder-gray-300"
                      placeholder="在这里说出你的心里话... 熊熊法官会用心听的嗷！"
                      value={tempInput}
                      onChange={(e) => setTempInput(e.target.value)}
                    />
                    <button onClick={submitMyPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all hover:bg-[#795548]">
                      {loading ? <RefreshCw className="animate-spin" /> : <Sparkles />} 确认并存证
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-10 animate-in zoom-in-95 duration-500">
                    <div className="relative mb-8">
                       <div className="absolute inset-0 bg-amber-200 blur-2xl opacity-20 animate-pulse rounded-full" />
                       <div className="relative w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center shadow-inner text-4xl border-2 border-amber-100">⚖️</div>
                    </div>
                    <h3 className="text-2xl font-black mb-3 text-[#4E342E]">
                      {isBothSubmitted ? '证据已确凿！' : '采证中...'}
                    </h3>
                    <p className="text-gray-400 text-sm mb-10 px-10 leading-relaxed">
                      {isBothSubmitted 
                        ? '男方和女方的视角都已录入法典，请点击下方按钮开始神圣的宣判流程嗷！' 
                        : '正在等待另一半提交存证... 请不要关闭页面或离开法庭哒～'}
                    </p>
                    {isBothSubmitted && (
                      <button onClick={triggerAIJudge} disabled={loading} className="bg-[#D84315] text-white px-16 py-6 rounded-full font-black text-2xl hover:bg-[#BF360C] shadow-2xl shadow-orange-200 flex items-center gap-4 animate-pulse transform hover:scale-105 transition-all active:scale-95">
                        {loading ? <RefreshCw className="animate-spin" /> : <Gavel size={28} />} 立刻宣判！
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : currentCase && currentCase.verdict ? (
              <div className="animate-in slide-in-from-bottom-20 duration-1000">
                <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border-t-[14px] border-[#8D6E63] relative overflow-hidden">
                  <div className="text-center mb-10">
                    <div className="inline-block px-4 py-1.5 bg-[#FFF8E1] rounded-full text-[10px] font-black text-[#8D6E63] tracking-[0.3em] mb-5 border border-amber-100 uppercase">Verdict Report</div>
                    <h2 className="text-3xl font-black text-[#4E342E] leading-tight mb-3">📜 {currentCase.verdict.verdict_title}</h2>
                    <p className="text-sm text-[#A1887F] font-serif italic bg-amber-50/30 py-2.5 px-4 rounded-xl border border-amber-50 inline-block">“{currentCase.verdict.law_reference}”</p>
                  </div>
                  
                  <div className="mb-12 bg-white/60 p-6 rounded-3xl border border-amber-50 shadow-sm backdrop-blur-sm">
                    <div className="flex justify-between mb-4 text-xs font-black tracking-widest uppercase">
                      <span className="text-blue-500">男方归因 {currentCase.verdict.fault_ratio.A}%</span>
                      <span className="text-rose-500">女方归因 {currentCase.verdict.fault_ratio.B}%</span>
                    </div>
                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex shadow-inner border border-gray-50">
                      <div className="h-full bg-gradient-to-r from-blue-300 to-blue-400 transition-all duration-1000" style={{ width: `${currentCase.verdict.fault_ratio.A}%` }} />
                      <div className="h-full bg-gradient-to-r from-rose-300 to-rose-400 transition-all duration-1000" style={{ width: `${currentCase.verdict.fault_ratio.B}%` }} />
                    </div>
                    <p className="text-[10px] text-center text-gray-300 mt-5 italic">※ 比例仅供参考，重点在于爱与沟通嗷！</p>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <h4 className="font-black text-[#4E342E] mb-3 flex items-center gap-2 italic uppercase text-lg tracking-tighter">
                        <Sparkles size={20} className="text-amber-500" /> 熊熊深度诊断
                      </h4>
                      <p className="text-[13px] leading-relaxed text-[#5D4037] font-medium pl-2">{currentCase.verdict.analysis}</p>
                    </div>
                    <div className="bg-emerald-50/70 p-7 rounded-[2.5rem] border border-emerald-100/50 shadow-sm">
                      <h4 className="font-black text-emerald-800 mb-4 flex items-center gap-2 italic text-lg tracking-tighter">
                        <Heart size={20} className="text-emerald-500" /> 换位思考 · 懂你才可爱
                      </h4>
                      <p className="text-[13px] leading-relaxed text-emerald-900/80 whitespace-pre-wrap font-medium">{currentCase.verdict.perspective_taking}</p>
                    </div>
                  </div>

                  <div className="mt-14 pt-12 border-t-2 border-dashed border-gray-100">
                    <div className="text-center mb-8"><h3 className="font-black text-[#8D6E63] text-2xl tracking-[0.4em] uppercase">和好执行单</h3></div>
                    <div className="grid grid-cols-1 gap-4">
                      {currentCase.verdict.punishments.map((p, i) => (
                        <div key={i} className="bg-white border-2 border-[#F5F5F5] p-5 rounded-3xl text-center text-sm font-bold text-[#5D4037] hover:border-amber-300 transition-all shadow-amber-50">{p}</div>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => {setCaseId(''); setCurrentCase(null); setError("");}} className="w-full mt-14 py-5 text-gray-300 text-[10px] font-black hover:text-[#8D6E63] tracking-[0.5em] transition-colors uppercase border-t border-gray-50 pt-8">结 案 · 拥 抱 离 场</button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {error && typeof error === 'string' && (
          <div className="mt-8 p-4 bg-rose-50 text-rose-600 rounded-2xl text-[11px] font-bold flex items-center gap-3 border border-rose-100 animate-in slide-in-from-top-2 duration-300">
            <AlertCircle size={16} /> <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="p-1 hover:bg-rose-100 rounded text-rose-400">关闭</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
