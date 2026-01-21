import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, CheckCircle2, UserPlus as UserSearch } from 'lucide-react';

/* ========================================================================
   ✅ 1. 你的新 Firebase 配置 (已根据你的截图完美录入 bear-court-2026)
   ======================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyBfJbG3mx_GyvfcYREVUiDOHIqXIteGtBc",
  authDomain: "bear-court-2026.firebaseapp.com",
  projectId: "bear-court-2026",
  storageBucket: "bear-court-2026.firebasestorage.app",
  messagingSenderId: "422469568510",
  appId: "1:422469568510:web:b3976df789af390724e2af"
};

/* ========================================================================
   ✅ 2. 你的 Gemini API Key (已填好)
   ======================================================================== */
const GEMINI_API_KEY = "AIzaSyAwAHM6_ME-bxUjxTr2HUmnywUg7sfvOo8"; 

/* --- 环境与常量 --- */
const isConfigValid = firebaseConfig && firebaseConfig.apiKey; 
const appId = 'bear-judge-app-v3';
const modelName = "gemini-1.5-flash";
const FIXED_COVER_URL = "/cover.jpg";

/* --- 初始化 Firebase --- */
let app, auth, db;
if (isConfigValid) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) { console.error("Firebase Init Error:", e); }
}

/* --- 主组件 --- */
const App = () => {
  const [user, setUser] = useState(null);
  const tryLogin = () => {
    signInAnonymously(auth).catch((err) => {
        console.error("完整错误对象:", err);
        console.error("错误代码:", err.code);
        console.error("错误消息:", err.message);
        
        if (err.code === 'auth/operation-not-allowed') {
           setError("⚠️ 登录未开启");
        } else {
           setError(`登录失败: ${err.code} - ${err.message}`);
        }
        setInitializing(false);
    });
};
  
  const cooldownRef = useRef(null);
  const abortControllerRef = useRef(null);

  // 认证监听
  useEffect(() => {
    if (!auth) {
      setError("Firebase 初始化失败");
      setInitializing(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setInitializing(false);
    });

    const tryLogin = () => {
        signInAnonymously(auth).catch((err) => {
            console.error("Auth Error:", err);
            if (err.code === 'auth/operation-not-allowed') {
               setError("⚠️ 登录未开启：请务必去 bear-court-2026 的 Firebase后台 -> Authentication 开启匿名登录！");
            } else {
               setError(`登录失败 (${err.code})，请刷新重试`);
            }
            setInitializing(false);
        });
    };
    tryLogin();

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
      }
    }, (err) => setError("读取案卷失败，请检查网络"));
    return () => unsubscribe();
  }, [user, caseId]);

  // 冷却计时
  useEffect(() => {
    if (cooldown > 0) cooldownRef.current = setInterval(() => setCooldown(c => c - 1), 1000);
    else clearInterval(cooldownRef.current);
    return () => clearInterval(cooldownRef.current);
  }, [cooldown]);

  const createCase = async (chosenRole) => {
    if (!db || !user) return setError("数据库未连接");
    setLoading(true); setError("");
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sideA = chosenRole === 'male' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    const sideB = chosenRole === 'female' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', newId), {
        id: newId, createdBy: user.uid, status: 'waiting', sideA, sideB, verdict: null, createdAt: Date.now()
      });
      setCurrentCase(null); setCaseId(newId);
    } catch (err) { setError("创建失败：请检查 bear-court-2026 的 Firestore 数据库是否已开启 (Start in Test Mode)"); }
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
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { [`${field}.uid`]: user.uid }); } 
    catch (err) { setError("操作失败，请重试"); } finally { setLoading(false); }
  };

  const submitPart = async () => {
    if (!tempInput.trim() || !currentCase || !user) return;
    setLoading(true);
    const isA = currentCase.sideA.uid === user.uid;
    const field = isA ? "sideA" : "sideB";
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), {
        [`${field}.content`]: tempInput, [`${field}.submitted`]: true
      });
      setTempInput('');
    } catch (err) { setError("提交失败，请重试"); } finally { setLoading(false); }
  };

  const triggerAIJudge = async () => {
    if (loading || cooldown > 0) return;
    const finalKey = GEMINI_API_KEY;
    if (!finalKey) { setError("代码中缺少 API Key"); return; }
    
    setLoading(true); setError(""); setLoadingMsg("🐻 法官正在阅读卷宗 (AI思考中)...");
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感调解专家。必须输出严格 JSON 格式的裁决。包含判决标题、归因比例、法律引用、深度诊断、将心比心、暖心金句、和好罚单。`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${finalKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: `[男方]:${currentCase.sideA.content}\n[女方]:${currentCase.sideB.content}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });

      if (response.status === 429) { throw new Error("429"); }
      
      const resData = await response.json();
      
      if (!response.ok) {
         const googleError = resData.error?.message || resData.error?.status || "API Error";
         throw new Error(`AI请求失败: ${googleError}`);
      }
      
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("法官发呆了(无返回内容)");

      const verdict = JSON.parse(rawText);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { verdict, status: 'finished' });
    } catch (err) {
      if (err.message === "429") { setError("法官累了，请休息 60 秒"); setCooldown(60); }
      else if (err.name !== 'AbortError') setError(`${err.message}`);
    } finally { setLoading(false); setLoadingMsg(""); }
  };

  if (initializing) return <div className="min-h-screen flex items-center justify-center bg-[#FFFDFB] text-[#8D6E63]"><RefreshCw className="animate-spin" /></div>;

  const verdictData = currentCase?.verdict;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const userRole = currentCase?.sideA?.uid === user?.uid ? 'A' : (currentCase?.sideB?.uid === user?.uid ? 'B' : null);

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-[#4E342E] font-sans pb-10 select-none overflow-x-hidden">
      {error && (
        <div className="fixed top-20 left-4 right-4 z-50 p-4 bg-rose-600 text-white rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-2">
           <AlertCircle /> <span className="flex-1 text-sm font-bold">{error}</span> 
           <button onClick={() => setError('')} className="bg-white/20 p-1 rounded">✕</button>
        </div>
      )}

      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-[#F5EBE0] p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 font-black text-lg text-[#8D6E63] cursor-pointer">
          <Scale className="fill-[#8D6E63] text-white p-0.5 bg-[#8D6E63] rounded" size={24} /> 轻松熊王国最高法院
        </div>
        {user && <span className="text-xs font-mono text-[#A1887F]">{user.uid.slice(0,4)}</span>}
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        <div className="aspect-video bg-[#F5EBE0] rounded-3xl mb-8 relative overflow-hidden shadow-lg border-4 border-white">
            <img src={FIXED_COVER_URL} className="w-full h-full object-cover" onError={(e)=>e.target.src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800"} alt="Cover" />
            <div className="absolute bottom-6 left-8 text-white font-black text-3xl drop-shadow-md">公正 · 治愈 · 爱</div>
        </div>

        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-[#F5EBE0] text-center relative overflow-hidden">
            <Gavel className="mx-auto text-amber-500 mb-6 bg-amber-50 p-5 rounded-[2rem] w-24 h-24" />
            <h2 className="text-3xl font-black text-[#3E2723] mb-4">轻松熊王国最高法庭：正式开庭</h2>
            <p className="text-[#8D6E63] text-base mb-12 px-6 font-medium leading-relaxed">就是你们两个吵架了？肃静，和熊说说事情经过。</p>
            
            {showRoleSelect ? (
               <div className="grid grid-cols-2 gap-6 animate-in slide-in-from-right">
                 <button onClick={() => createCase('male')} className="bg-blue-50 text-blue-700 p-8 rounded-[2rem] font-black text-xl border-2 border-blue-100 active:scale-95 transition shadow-sm hover:shadow-md">🙋‍♂️ 我是男方</button>
                 <button onClick={() => createCase('female')} className="bg-rose-50 text-rose-700 p-8 rounded-[2rem] font-black text-xl border-2 border-rose-100 active:scale-95 transition shadow-sm hover:shadow-md">🙋‍♀️ 我是女方</button>
                 <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-gray-400 text-sm font-bold py-4">返回上一步</button>
               </div>
            ) : (
               <>
                 <button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-6 rounded-[2rem] font-black text-2xl shadow-xl active:scale-95 transition mb-8 flex justify-center gap-3 hover:bg-[#795548]"><UserPlus size={28} /> 发起新诉讼</button>
                 <div className="flex gap-3 h-16 items-stretch">
                   <input placeholder="输入案卷号" className="flex-1 bg-[#FDF5E6] rounded-3xl px-8 text-center font-black tracking-widest text-[#5D4037] text-xl outline-none border-2 border-transparent focus:border-amber-200 placeholder:text-amber-800/30" onChange={e => setTempInput(e.target.value)} />
                   <button onClick={() => joinCase(tempInput)} className="bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-10 rounded-3xl font-black text-xl hover:bg-[#FDF5E6] transition active:scale-95 whitespace-nowrap">调取</button>
                 </div>
               </>
            )}
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in">
             <div className="bg-white p-6 rounded-[2rem] flex justify-between items-center shadow-sm border border-[#F5EBE0]">
                <div className="flex gap-4 items-center">
                   <ShieldCheck className="text-amber-500 bg-amber-50 p-3 rounded-2xl w-12 h-12" />
                   <div><div className="text-xs text-[#A1887F] font-bold uppercase tracking-wider">案卷号</div><div className="font-mono font-black text-2xl text-[#5D4037]">{caseId}</div></div>
                </div>
                <button onClick={() => navigator.clipboard.writeText(caseId)} className="bg-[#F5F5F5] p-3 rounded-xl text-[#8D6E63] hover:bg-[#EFEFEF] transition"><Copy size={20}/></button>
             </div>

             {!currentCase ? (
                <div className="p-32 text-center"><RefreshCw className="animate-spin mx-auto text-[#8D6E63] w-10 h-10" /></div>
             ) : !verdictData ? (
                <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-[#F5EBE0] min-h-[500px] flex flex-col">
                   {(!userRole) ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <UserSearch className="w-20 h-20 text-amber-500 mb-6" />
                        <h3 className="font-black text-2xl mb-8 text-[#5D4037]">请先认领当事人身份</h3>
                        <div className="grid grid-cols-2 gap-6 w-full">
                           <button onClick={() => pickRoleInCase('male')} disabled={!!currentCase.sideA.uid} className={`p-6 rounded-[2rem] font-black text-lg border-2 transition ${currentCase.sideA.uid ? 'bg-gray-100 text-gray-400 grayscale' : 'bg-blue-50 border-blue-100 text-blue-600 hover:shadow-md'}`}>🙋‍♂️ 男方{currentCase.sideA.uid&&'(已)'}</button>
                           <button onClick={() => pickRoleInCase('female')} disabled={!!currentCase.sideB.uid} className={`p-6 rounded-[2rem] font-black text-lg border-2 transition ${currentCase.sideB.uid ? 'bg-gray-100 text-gray-400 grayscale' : 'bg-rose-50 border-rose-100 text-rose-600 hover:shadow-md'}`}>🙋‍♀️ 女方{currentCase.sideB.uid&&'(已)'}</button>
                        </div>
                      </div>
                   ) : (userRole === 'A' && !currentCase.sideA.submitted) || (userRole === 'B' && !currentCase.sideB.submitted) ? (
                      <div className="flex-1 flex flex-col animate-in slide-in-from-right">
                        <div className="flex justify-between items-end mb-6">
                           <h3 className="font-black text-xl flex gap-3 items-center text-[#5D4037]"><MessageCircle className="text-amber-500" size={28}/> 提交辩词</h3>
                        </div>
                        <textarea className="flex-1 bg-[#FDFBF9] rounded-[2rem] border-2 border-[#F5EBE0] p-6 mb-6 text-base focus:border-amber-200 outline-none resize-none leading-relaxed" placeholder="把委屈告诉熊，熊会认真听的..." value={tempInput} onChange={e => setTempInput(e.target.value)} />
                        <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-[2rem] font-black text-xl shadow-lg active:scale-95 transition hover:bg-[#795548]">确认提交证词</button>
                      </div>
                   ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                         <div className="text-7xl mb-8">🏛️</div>
                         <h3 className="font-black text-2xl mb-3 text-[#5D4037]">{isBothSubmitted ? '证据已收齐' : '正在采证中...'}</h3>
                         <p className="text-sm text-[#A1887F] mb-12">{isBothSubmitted ? '法庭肃静，请点击下方按钮开庭' : '请耐心等待对方提交证词...'}</p>
                         
                         <div className="flex justify-center gap-6 w-full mb-12 px-8">
                            <div className={`flex-1 p-4 rounded-[2rem] border-2 flex flex-col items-center transition-all ${currentCase.sideA.submitted ? 'bg-blue-50 border-blue-200 text-blue-600 scale-105 shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-300'}`}><CheckCircle2 size={24} /><span className="text-xs font-bold mt-2">男方</span></div>
                            <div className={`flex-1 p-4 rounded-[2rem] border-2 flex flex-col items-center transition-all ${currentCase.sideB.submitted ? 'bg-rose-50 border-rose-200 text-rose-600 scale-105 shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-300'}`}><CheckCircle2 size={24} /><span className="text-xs font-bold mt-2">女方</span></div>
                         </div>

                         {isBothSubmitted && (
                            <button onClick={triggerAIJudge} disabled={loading || cooldown > 0} className={`w-full py-6 rounded-[2rem] font-black text-2xl shadow-xl flex items-center justify-center gap-3 text-white transition ${cooldown > 0 ? 'bg-gray-300' : 'bg-[#D84315] hover:bg-[#BF360C] animate-pulse'}`}>
                               {loading ? <RefreshCw className="animate-spin" /> : <Gavel size={28} />} {cooldown > 0 ? `${cooldown}s` : '开庭宣判'}
                            </button>
                         )}
                         {loading && <p className="text-sm text-amber-600 mt-4 font-bold animate-bounce">{loadingMsg}</p>}
                      </div>
                   )}
                </div>
             ) : (
                <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border-t-[16px] border-[#8D6E63] animate-in slide-in-from-bottom duration-700">
                   <div className="p-10 text-center bg-[#FFFDFB]">
                      <div className="inline-block px-4 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-black tracking-widest mb-6">KINGDOM VERDICT</div>
                      <h2 className="text-3xl font-black text-[#3E2723] mb-4">📜 {verdictData.verdict_title}</h2>
                      <p className="text-sm italic text-[#8D6E63] bg-[#F5EBE0] py-3 px-6 rounded-2xl inline-block">“{verdictData.law_reference}”</p>
                   </div>
                   
                   <div className="px-10 pb-10 space-y-8">
                      <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100">
                         <div className="flex justify-between text-xs font-black mb-3 uppercase text-[#A1887F]"><span>责任归因比例</span></div>
                         <div className="flex h-5 rounded-full overflow-hidden w-full shadow-inner">
                            <div style={{width: `${verdictData.fault_ratio?.A||50}%`}} className="bg-blue-400 h-full transition-all duration-1000"></div>
                            <div style={{width: `${verdictData.fault_ratio?.B||50}%`}} className="bg-rose-400 h-full transition-all duration-1000"></div>
                         </div>
                         <div className="flex justify-between text-xs font-bold mt-2 px-1">
                            <span className="text-blue-600">男方 {verdictData.fault_ratio?.A}%</span>
                            <span className="text-rose-600">女方 {verdictData.fault_ratio?.B}%</span>
                         </div>
                      </div>

                      <div>
                         <h4 className="font-black text-[#5D4037] flex gap-2 items-center text-base mb-3"><Sparkles size={20} className="text-amber-500"/> 深度诊断</h4>
                         <p className="text-base text-[#5D4037] leading-loose bg-[#FDFBF9] p-6 rounded-[2rem] border border-[#F5EBE0]">{verdictData.analysis}</p>
                      </div>

                      <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
                         <h4 className="font-black text-emerald-800 flex gap-2 items-center text-base mb-3"><Heart size={20} className="text-emerald-500"/> 将心比心</h4>
                         <p className="text-base text-emerald-900/80 leading-loose">{verdictData.perspective_taking}</p>
                      </div>

                      <div className="bg-amber-50 p-8 rounded-[2.5rem] text-center border border-amber-100">
                         <div className="text-amber-900/60 font-black text-4xl mb-3">”</div>
                         <p className="text-amber-900 font-bold italic text-lg">{verdictData.bear_wisdom}</p>
                      </div>

                      <div className="pt-8 border-t-2 border-dashed border-[#F5EBE0]">
                         <h4 className="text-center font-black text-[#8D6E63] mb-6 text-sm uppercase tracking-widest">和好罚单</h4>
                         <div className="space-y-3">
                            {verdictData.punishments?.map((p,i)=>(<div key={i} className="bg-white border-2 border-[#F5EBE0] p-4 rounded-2xl text-center text-sm font-bold text-[#5D4037] shadow-sm">{p}</div>))}
                         </div>
                      </div>

                      <button onClick={()=>{setCaseId('');setCurrentCase(null);}} className="w-full py-5 text-[#A1887F] text-xs font-black tracking-[0.2em] hover:text-[#5D4037] uppercase transition-colors">结案 · 拥抱离场</button>
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
