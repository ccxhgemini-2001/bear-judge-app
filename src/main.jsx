/* ========================================================================
   🐻 轻松熊王国最高法院 - v5.3.0 (最终上线版)
   ======================================================================== */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, increment } from 'firebase/firestore';
import { Heart, Scale, Sparkles, AlertCircle, RefreshCw, UserPlus, Copy, ShieldCheck, Gavel, Settings, User, PenTool, Zap, Swords, Shield, LogOut, Eye, AlertTriangle, ThumbsUp, ThumbsDown, Info } from 'lucide-react';

/* ========================================================================
   1. 配置区域
   ======================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyBfJbG3mx_GyvfCyREVUiDOhIqxIteGtBc",
  authDomain: "bear-court-2026.firebaseapp.com",
  projectId: "bear-court-2026",
  storageBucket: "bear-court-2026.firebasestorage.app",
  messagingSenderId: "422469568510",
  appId: "1:422469568510:web:b3976df789af390724e2af"
};

// ⚠️ 注意：上线时建议将 Key 移至后端 (详见部署教程)
const DEEPSEEK_API_KEY = "sk-8f1b46b7eb9c408794809042dea41204";

const APP_ID = 'bear-judge-app-v3';
const STATS_DOC_ID = '--GLOBAL-STATS--';
const FALLBACK_COVER = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800";
const VERSION = "v5.2.0";

let app, auth, db;
if (firebaseConfig?.apiKey) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) { console.error("Firebase 初始化失败:", e); }
}

/* ========================================================================
   2. 辅助组件：文本分段渲染器
   ======================================================================== */
const FormattedText = ({ text, className }) => {
  if (!text) return null;
  const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
  return (
    <div className={`space-y-4 ${className}`}>
      {paragraphs.map((para, index) => (
        <p key={index} className="leading-relaxed text-justify indent-0">
          {para}
        </p>
      ))}
    </div>
  );
};

/* ========================================================================
   3. 主程序
   ======================================================================== */
const App = () => {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [caseId, setCaseId] = useState('');
  const [currentCase, setCurrentCase] = useState(null);
  
  // UI 状态
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [tempInput, setTempInput] = useState('');
  const [objectionInput, setObjectionInput] = useState('');
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [showObjectionModal, setShowObjectionModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false); 
  const [showEvidence, setShowEvidence] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [globalStats, setGlobalStats] = useState({ rate: 98, total: 0 });
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  
  const titleClickCount = useRef(0);
  const titleClickTimer = useRef(null);

  // ------------------ 生命周期 ------------------
  useEffect(() => {
    if (!auth) { setError("Firebase 配置错误"); setInitializing(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setInitializing(false);
    });
    signInAnonymously(auth).catch((err) => console.error(err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !caseId || !db) return;
    const caseDoc = doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', caseId);
    return onSnapshot(caseDoc, (snap) => {
      if (snap.exists()) {
          const data = snap.data();
          setCurrentCase(data);
          if (data.verdict?.feedback) setFeedbackGiven(true);
      } else setError("案卷不存在");
    }, () => setError("读取失败"));
  }, [user, caseId]);

  useEffect(() => {
      if (!db) return;
      const statsDoc = doc(db, 'artifacts', APP_ID, 'public', 'data', 'stats', STATS_DOC_ID);
      const unsubStats = onSnapshot(statsDoc, (snap) => {
          if (snap.exists()) {
              const data = snap.data();
              const total = (data.likes || 0) + (data.dislikes || 0);
              const rate = total === 0 ? 100 : Math.round(((data.likes || 0) / total) * 100);
              setGlobalStats({ rate, total });
          }
      });
      return () => unsubStats();
  }, []);

  // ------------------ 业务逻辑 ------------------
  const handleTitleClick = () => {
    titleClickCount.current += 1;
    if (titleClickTimer.current) clearTimeout(titleClickTimer.current);
    if (titleClickCount.current === 5) {
      setDevMode(!devMode);
      setError(devMode ? "开发者模式已关闭" : "🔓 开发者模式已开启");
      titleClickCount.current = 0;
    }
    titleClickTimer.current = setTimeout(() => { titleClickCount.current = 0; }, 2000);
  };

  const createCase = async (chosenRole) => {
    if (!db || !user) return setError("数据库未连接");
    setLoading(true); setError("");
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sideA = chosenRole === 'plaintiff' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    const sideB = chosenRole === 'defendant' ? { uid: user.uid, content: '', submitted: false } : { uid: null, content: '', submitted: false };
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', newId), {
        id: newId, createdBy: user.uid, status: 'waiting', sideA, sideB, verdict: null, objection: null, createdAt: Date.now()
      });
      setCurrentCase(null); setCaseId(newId);
    } catch (err) { setError("创建失败"); }
    finally { setLoading(false); }
  };

  const joinCase = (id) => { 
      if (id) { 
          setCurrentCase(null); 
          setError(""); 
          setCaseId(id.toUpperCase());
          setTempInput('');
      } 
  };

  const pickRoleInCase = async (role) => {
    if (!db || !currentCase || !user) return;
    setLoading(true);
    const field = role === 'plaintiff' ? 'sideA' : 'sideB';
    try { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', caseId), { [`${field}.uid`]: user.uid }); } 
    catch (err) { setError("操作失败"); } finally { setLoading(false); }
  };

  const submitPart = async () => {
    if (!tempInput.trim() || !currentCase || !user) return;
    setLoading(true);
    const field = currentCase.sideA.uid === user.uid ? "sideA" : "sideB";
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', caseId), { [`${field}.content`]: tempInput, [`${field}.submitted`]: true });
      setTempInput('');
    } catch (err) { setError("提交失败"); } finally { setLoading(false); }
  };

  const handleLogout = async () => { await signOut(auth); window.location.reload(); };

  // ------------------ 🔥 DeepSeek API 调用 ------------------
  const triggerAIJudge = async (isRejudge = false) => {
    if (loading) return;
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.includes("粘贴")) { setError("⚠️ 请配置 DeepSeek Key"); return; }

    setLoading(true); setError(""); 
    setLoadingMsg(isRejudge ? "🐻 正在听取新证据..." : "🐻 法官正在一边吃松饼一边阅读...");

    const bearPersona = `你是一位名为"轻松熊法官"的AI情感调解专家。
    【人设核心】
    1. **拒绝太嗲/童话**：不要用哄小孩的语气。你是"懒洋洋但看透世事、充满智慧的治愈系老友"。说话可以幽默，但必须有深度。
    2. **必须深度分段**：在分析和换位思考部分，请输出长文本（300字以上），并且**务必使用双换行符来分隔段落**，让阅读体验像散文一样舒适。不要使用"1. 2. 3."这种僵硬的列表标题。
    3. **接地气**：和好罚单必须是现实生活中具体、可执行、甚至有点小浪漫或小搞怪的（例如"给对方吹头发"、"一起去吃路边摊"），严禁抽象的建议。
    
    【输出格式】
    严格输出 JSON：
    {
      "verdict_title": "标题（幽默、精准）",
      "fault_ratio": { "A": 40, "B": 60 },
      "law_reference": "虚构的熊熊法条",
      "analysis": "深度诊断（请写长一点，深入剖析双方潜意识需求，使用换行符分隔段落）",
      "perspective_taking": "换位思考（详细描述对方心理，使用换行符分隔段落）",
      "bear_wisdom": "金句",
      "punishments": ["罚单1", "罚单2", "罚单3", "罚单4", "罚单5"] // 必须正好5个
    }`;

    let userContent = `【案件详情】\n原告(控方): ${currentCase.sideA.content}\n\n被告(辩方): ${currentCase.sideB.content}`;
    
    if (isRejudge && currentCase.objection) {
        userContent += `\n\n🚨【異議あり！】🚨\n一方提出了异议补充："${currentCase.objection.content}"\n\n请注意：结合新证据，重新评估局面。请温柔地指出这可能是视角的缺失而非恶意隐瞒。重新生成一份深度判决。`;
    }

    try {
      // 不需要 Authorization 头了，Key 在后端
const response = await fetch("/api/judge", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    systemPrompt: bearPersona, // 传入人设
    userContent: userContent   // 传入案情
  })
});

      if (!response.ok) throw new Error(`API错误: ${response.status}`);
      const data = await response.json();
      let rawText = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
      const verdict = JSON.parse(rawText);
      
      await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', caseId), { 
          verdict, 
          status: 'finished',
          'objection.status': isRejudge ? 'resolved' : null
      });

    } catch (err) { console.error(err); setError(`裁决失败: ${err.message}`); } 
    finally { setLoading(false); setLoadingMsg(""); setShowObjectionModal(false); }
  };

  const submitObjection = async () => {
      if (!objectionInput.trim()) return;
      setLoading(true);
      try {
          await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', caseId), { 
              objection: { uid: user.uid, role: currentCase.sideA.uid === user.uid ? 'A' : 'B', content: objectionInput, status: 'pending', createdAt: Date.now() }
          });
          await triggerAIJudge(true); 
      } catch (e) { setError("异议提交失败"); setLoading(false); }
  };

  const submitFeedback = async (isLike) => {
      if (feedbackGiven || !db) return;
      try {
          await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', caseId), { 'verdict.feedback': isLike ? 'like' : 'dislike' });
          const statsRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'stats', STATS_DOC_ID);
          await setDoc(statsRef, { lastUpdated: Date.now() }, { merge: true });
          await updateDoc(statsRef, { [isLike ? 'likes' : 'dislikes']: increment(1) });
          setFeedbackGiven(true);
          setGlobalStats(prev => ({
              total: prev.total + 1,
              rate: isLike 
                ? Math.round(((prev.rate * prev.total / 100 + 1) / (prev.total + 1)) * 100)
                : Math.round(((prev.rate * prev.total / 100) / (prev.total + 1)) * 100)
          }));
      } catch (e) { console.error(e); }
  };

  const devUpdateCase = async (updates) => {
    if (!db || !caseId) return;
    try { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'cases', caseId), updates); setError("✅ 操作成功"); } catch (e) { setError("❌ 操作失败"); }
  };

  // ------------------ UI 渲染 ------------------
  if (initializing) return <div className="min-h-screen flex items-center justify-center bg-[#FFFDFB]"><RefreshCw className="animate-spin text-[#8D6E63]" size={40}/></div>;

  const verdictData = currentCase?.verdict;
  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const userRole = currentCase?.sideA?.uid === user?.uid ? 'A' : (currentCase?.sideB?.uid === user?.uid ? 'B' : null);
  const isOpponentReady = userRole === 'A' ? !!currentCase?.sideB.uid : (userRole === 'B' ? !!currentCase?.sideA.uid : false);

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-[#4E342E] font-sans pt-20 pb-20"> 
      
      {error && (
        <div className="fixed top-24 left-4 right-4 z-[60] p-4 bg-rose-600 text-white rounded-2xl shadow-xl flex items-center gap-3 animate-bounce">
          <AlertCircle /><span className="flex-1 text-sm font-bold">{error}</span> 
          <button onClick={() => setError('')} className="bg-white/20 p-1 rounded">✕</button>
        </div>
      )}

      {/* 🌟 顶部导航 (Fixed) */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-[#F5EBE0] px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 font-black text-lg text-[#8D6E63] cursor-pointer" onClick={handleTitleClick}>
          <Scale className="fill-[#8D6E63] text-white p-0.5 bg-[#8D6E63] rounded" size={24} /> 
          轻松熊王国最高法院 <span className="text-xs font-mono text-[#A1887F] opacity-60 ml-1">{VERSION}</span>
        </div>
        {user && devMode && <button onClick={handleLogout} className="p-1 bg-red-100 rounded text-red-500"><LogOut size={12}/></button>}
      </nav>

      {/* 🌟 关于我们弹窗 (功能介绍版) */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onClick={()=>setShowAboutModal(false)}>
            <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl relative overflow-y-auto max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowAboutModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
                <div className="text-center mb-6">
                    <Heart className="w-16 h-16 text-rose-500 mx-auto mb-4 fill-rose-100" />
                    <h3 className="text-2xl font-black text-[#5D4037]">关于本庭</h3>
                    <p className="text-sm text-[#A1887F] mt-1">功能使用说明书</p>
                </div>
                <div className="space-y-4 text-sm text-[#5D4037] leading-relaxed text-justify">
                    <p>欢迎来到轻松熊王国最高法院。在这里，我们不争输赢，只讲爱与理解。</p>
                    
                    <div className="bg-[#FFF8E1] p-4 rounded-xl border border-[#FFE082]">
                        <h4 className="font-bold text-[#F57F17] mb-2 flex items-center gap-2"><Gavel size={16}/> 核心功能</h4>
                        <ul className="list-disc pl-4 space-y-1 text-xs">
                            <li><strong>身份认领</strong>：支持原告（控方）与被告（辩方）分别入座。</li>
                            <li><strong>AI 审判</strong>：由 DeepSeek 驱动的轻松熊法官，基于双方证词进行深度心理分析。</li>
                            <li><strong>异议机制</strong>：如果对判决不满或有事实补充，可点击“異議あり！”发起重审。</li>
                            <li><strong>和好罚单</strong>：生成 5 个具体的、治愈系的和好任务。</li>
                        </ul>
                    </div>

                    <p>我们的初衷是提供一个第三方视角，帮助深陷情绪中的情侣打破僵局，看到彼此未曾表达的潜意识需求。</p>
                    
                    <p className="font-bold text-rose-500 text-center mt-6 pt-4 border-t border-dashed border-gray-200">
                        愿天下所有的情侣都能好好的。<br/>让世界充满爱。
                    </p>
                </div>
            </div>
        </div>
      )}

      {/* 🌟 异议弹窗 */}
      {showObjectionModal && (
          <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl relative border-4 border-[#D84315]">
                  <button onClick={() => setShowObjectionModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
                  <div className="text-center mb-6">
                      <h3 className="text-4xl font-black text-[#D84315] italic tracking-tighter" style={{fontFamily: 'serif'}}>異議あり！</h3>
                      <p className="text-gray-500 text-xs mt-2">OBJECTION!</p>
                  </div>
                  <p className="text-[#5D4037] text-sm mb-4 font-bold">这一判决存在关键事实遗漏！我要补充：</p>
                  <textarea className="w-full bg-gray-50 rounded-xl p-4 h-32 mb-6 border-2 border-gray-200 focus:border-[#D84315] outline-none text-[#5D4037]" placeholder="其实事情的真相是..." value={objectionInput} onChange={e => setObjectionInput(e.target.value)} />
                  <button onClick={submitObjection} disabled={loading} className="w-full bg-[#D84315] text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-[#BF360C] transition uppercase tracking-widest">提交异议 · 要求重审</button>
              </div>
          </div>
      )}

      <div className="max-w-4xl mx-auto p-6">
        <div className="aspect-video bg-[#F5EBE0] rounded-3xl mb-8 relative overflow-hidden shadow-lg border-4 border-white">
            <img src="/cover.jpg" className="w-full h-full object-cover" onError={(e) => e.target.src = FALLBACK_COVER} alt="Cover" />
            <div className="absolute bottom-6 left-8 text-white font-black text-3xl drop-shadow-md">公正 · 治愈 · 爱</div>
        </div>

        {/* 开发者工具 */}
        {devMode && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 mb-6 shadow-sm">
             <div className="flex gap-2 mb-2">
                <button onClick={() => devUpdateCase({ 'sideA.uid': user.uid, 'sideB.uid': 'TEMP' })} className="flex-1 bg-blue-100 text-blue-700 py-2 rounded-lg text-xs font-bold">⚔️ 变原告</button>
                <button onClick={() => devUpdateCase({ 'sideB.uid': user.uid, 'sideA.uid': 'TEMP' })} className="flex-1 bg-rose-100 text-rose-700 py-2 rounded-lg text-xs font-bold">🛡️ 变被告</button>
                <button onClick={() => devUpdateCase({ 'sideA.content': "Dev原告", 'sideA.submitted': true, 'sideB.content': "Dev被告", 'sideB.submitted': true })} className="flex-1 bg-yellow-400 text-yellow-900 py-2 rounded-lg text-xs font-bold">⚡ 填充</button>
                <button onClick={() => devUpdateCase({ verdict: null, status: 'waiting', 'sideA.submitted':false, 'sideB.submitted':false, objection: null })} className="flex-1 bg-gray-200 text-gray-600 py-2 rounded-lg text-xs font-bold">🔄 重置</button>
             </div>
          </div>
        )}

        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-[#F5EBE0] text-center flex flex-col">
            <div className="flex-1">
                <Gavel className="mx-auto text-amber-500 mb-6 bg-amber-50 p-5 rounded-[2rem] w-24 h-24" />
                <h2 className="text-3xl font-black text-[#3E2723] mb-4">轻松熊王国最高法庭</h2>
                {showRoleSelect ? (
                   <div className="grid grid-cols-2 gap-6">
                     <button onClick={() => createCase('plaintiff')} className="bg-blue-50 text-blue-700 p-8 rounded-[2rem] font-black text-xl border-2 border-blue-100 flex flex-col items-center gap-3 active:scale-95 transition">
                        <Swords size={32} /> <div>我要控诉<br/><span className="text-sm font-normal opacity-70">(我是原告)</span></div>
                     </button>
                     <button onClick={() => createCase('defendant')} className="bg-rose-50 text-rose-700 p-8 rounded-[2rem] font-black text-xl border-2 border-rose-100 flex flex-col items-center gap-3 active:scale-95 transition">
                        <Shield size={32} /> <div>我要辩护<br/><span className="text-sm font-normal opacity-70">(我是被告)</span></div>
                     </button>
                     <button onClick={() => setShowRoleSelect(false)} className="col-span-2 text-gray-400 text-sm font-bold py-4">返回</button>
                   </div>
                ) : (
                   <button onClick={() => setShowRoleSelect(true)} className="w-full bg-[#8D6E63] text-white py-6 rounded-[2rem] font-black text-2xl shadow-xl mb-8 flex justify-center gap-3 hover:bg-[#795548] transition"><UserPlus size={28} /> 发起新诉讼</button>
                )}
                 <div className="flex gap-3 h-16 mt-6">
                    <input placeholder="输入案卷号" value={tempInput} className="flex-1 bg-[#FDF5E6] rounded-3xl px-8 text-center font-black text-xl outline-none" onChange={e => setTempInput(e.target.value)} />
                    <button onClick={() => joinCase(tempInput)} className="bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-10 rounded-3xl font-black text-xl hover:bg-[#FDF5E6] active:scale-95 transition">调取</button>
                 </div>
            </div>

             {/* 🌟 4. 好评率 + 关于我们 (合理的间距) */}
             <div className="mt-12 flex flex-col items-center gap-4">
                 <div className="bg-[#FFF8E1] text-[#F57F17] px-4 py-2 rounded-full text-xs font-bold border border-[#FFE082] shadow-sm flex items-center gap-2 animate-pulse">
                     <Heart size={12} className="fill-[#F57F17]"/> 本庭案件审理好评率：{globalStats.rate}%
                 </div>
                 <button onClick={() => setShowAboutModal(true)} className="text-[#A1887F] text-xs font-bold flex items-center gap-1 hover:text-[#5D4037] transition">
                    <Info size={12}/> 关于本庭
                 </button>
             </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-[2rem] flex justify-between items-center shadow-sm border border-[#F5EBE0]">
                <div className="flex gap-4 items-center">
                   <ShieldCheck className="text-amber-500 bg-amber-50 p-3 rounded-2xl w-12 h-12" />
                   <div><div className="text-xs text-[#A1887F] font-bold uppercase">案卷号</div><div className="font-mono font-black text-2xl text-[#5D4037]">{caseId}</div></div>
                </div>
                <button onClick={() => navigator.clipboard.writeText(caseId)} className="bg-[#F5F5F5] p-3 rounded-xl text-[#8D6E63]"><Copy size={20}/></button>
            </div>
            
            {!currentCase ? <div className="p-32 text-center"><RefreshCw className="animate-spin mx-auto text-[#8D6E63]" size={40} /></div> : !verdictData ? (
                <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-[#F5EBE0] min-h-[500px] flex flex-col">
                   {(!userRole) ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <UserPlus className="w-12 h-12 text-amber-500 mb-6 bg-amber-50 p-3 rounded-full" />
                        <h3 className="font-black text-2xl mb-2 text-[#5D4037]">欢迎来到法庭</h3>
                        <p className="text-gray-400 mb-8 text-sm">请入座空缺的席位</p>
                        {(!currentCase.sideA.uid || currentCase.sideA.uid === user?.uid) && (
                            <button onClick={() => pickRoleInCase('plaintiff')} disabled={!!currentCase.sideA.uid} className={`w-full p-6 rounded-[2rem] font-black text-xl border-2 mb-4 flex items-center justify-center gap-3 ${currentCase.sideA.uid ? 'bg-gray-50 border-gray-100 text-gray-300' : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100'}`}>
                                <Swords size={24}/> 原告席 (控方) {currentCase.sideA.uid && '(已有人)'}
                            </button>
                        )}
                        {(!currentCase.sideB.uid || currentCase.sideB.uid === user?.uid) && (
                            <button onClick={() => pickRoleInCase('defendant')} disabled={!!currentCase.sideB.uid} className={`w-full p-6 rounded-[2rem] font-black text-xl border-2 flex items-center justify-center gap-3 ${currentCase.sideB.uid ? 'bg-gray-50 border-gray-100 text-gray-300' : 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100'}`}>
                                <Shield size={24}/> 被告席 (辩方) {currentCase.sideB.uid && '(已有人)'}
                            </button>
                        )}
                      </div>
                   ) : (userRole === 'A' && !currentCase.sideA.submitted) || (userRole === 'B' && !currentCase.sideB.submitted) ? (
                      <div className="flex-1 flex flex-col animate-in fade-in">
                        <h3 className="font-black text-xl flex gap-3 items-center text-[#5D4037] mb-2">
                            {userRole === 'A' ? <Swords className="text-blue-500"/> : <Shield className="text-rose-500"/>} 
                            {userRole === 'A' ? '原告(控方)陈述' : '被告(辩方)陈述'}
                        </h3>
                        <div className={`mb-4 text-xs font-bold py-2 px-3 rounded-lg inline-flex items-center gap-2 self-start transition-colors ${isOpponentReady ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                             <div className={`w-2 h-2 rounded-full ${isOpponentReady ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                             {isOpponentReady ? `${userRole==='A'?'被告':'原告'}已就位` : `等待${userRole==='A'?'被告':'原告'}入座...`}
                        </div>
                        <textarea className="flex-1 bg-[#FDFBF9] rounded-[2rem] border-2 border-[#F5EBE0] p-6 mb-6 text-base outline-none resize-none focus:border-amber-200 transition" placeholder="请陈述案情经过..." value={tempInput} onChange={e => setTempInput(e.target.value)} />
                        <button onClick={submitPart} disabled={loading} className="w-full bg-[#8D6E63] text-white py-5 rounded-[2rem] font-black text-xl shadow-lg hover:bg-[#795548] transition active:scale-95">确认提交</button>
                      </div>
                   ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in">
                         <div className="text-7xl mb-8 animate-bounce">🏛️</div>
                         <h3 className="font-black text-2xl mb-3 text-[#5D4037]">{isBothSubmitted ? '卷宗已呈递' : '等待对方陈述...'}</h3>
                         <div className="flex gap-6 w-full mb-12 px-8">
                            <div className={`flex-1 p-4 rounded-[2rem] border-2 flex flex-col items-center ${currentCase.sideA.submitted ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-300'}`}><Swords size={24} /><span className="text-xs font-bold mt-2">原告</span></div>
                            <div className={`flex-1 p-4 rounded-[2rem] border-2 flex flex-col items-center ${currentCase.sideB.submitted ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-gray-50 border-gray-100 text-gray-300'}`}><Shield size={24} /><span className="text-xs font-bold mt-2">被告</span></div>
                         </div>
                         {isBothSubmitted && (
                            <button onClick={() => triggerAIJudge(false)} disabled={loading} className={`w-full py-6 rounded-[2rem] font-black text-2xl shadow-xl flex items-center justify-center gap-3 text-white bg-[#D84315] animate-pulse hover:bg-[#BF360C] transition`}>
                               {loading ? <RefreshCw className="animate-spin" /> : <Gavel size={28} />} 开庭宣判
                            </button>
                         )}
                         {loading && <p className="text-sm text-amber-600 mt-4 font-bold animate-pulse">{loadingMsg}</p>}
                      </div>
                   )}
                </div>
            ) : (
                <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border-t-[16px] border-[#8D6E63] animate-in slide-in-from-bottom">
                   <div className="p-10 text-center bg-[#FFFDFB]">
                      <div className="inline-block px-4 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-black mb-6">FINAL VERDICT</div>
                      <h2 className="text-3xl font-black text-[#3E2723] mb-4">📜 {verdictData.verdict_title}</h2>
                      <p className="text-sm italic text-[#8D6E63] bg-[#F5EBE0] py-3 px-6 rounded-2xl inline-block">"{verdictData.law_reference}"</p>
                   </div>
                   <div className="px-10 pb-10 space-y-8">
                      {/* 责任比例 */}
                      <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100">
                         <div className="flex justify-between text-xs font-black mb-3 uppercase text-[#A1887F]">
                            <span>原告责任</span><span>被告责任</span>
                         </div>
                         <div className="flex h-6 rounded-full overflow-hidden relative">
                            <div style={{width: `${verdictData.fault_ratio?.A||50}%`}} className="bg-blue-400 transition-all duration-1000"></div>
                            <div style={{width: `${verdictData.fault_ratio?.B||50}%`}} className="bg-rose-400 transition-all duration-1000"></div>
                            <div className="absolute inset-0 flex justify-between px-3 items-center text-[10px] text-white font-bold">
                                <span>{verdictData.fault_ratio?.A}%</span>
                                <span>{verdictData.fault_ratio?.B}%</span>
                            </div>
                         </div>
                      </div>

                      {/* 深度分析 (分段渲染) */}
                      <div>
                         <h4 className="font-black text-[#5D4037] flex gap-2 items-center text-base mb-3"><Sparkles size={20} className="text-amber-500"/> 深度诊断</h4>
                         <FormattedText text={verdictData.analysis} className="bg-[#FDFBF9] p-6 rounded-[2rem] border border-[#F5EBE0] text-[#5D4037]" />
                      </div>

                      <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
                         <h4 className="font-black text-emerald-800 flex gap-2 items-center text-base mb-3"><Heart size={20} className="text-emerald-500"/> 将心比心</h4>
                         <FormattedText text={verdictData.perspective_taking} className="text-emerald-900/80" />
                      </div>

                      <div className="bg-amber-50 p-8 rounded-[2.5rem] text-center border border-amber-100">
                         <p className="text-amber-900 font-bold italic text-lg font-serif">"{verdictData.bear_wisdom}"</p>
                      </div>
                      
                      {/* 5条和好罚单 */}
                      {verdictData.punishments && (
                          <div className="bg-white border-2 border-dashed border-rose-200 p-6 rounded-[2rem]">
                              <h4 className="font-black text-rose-500 flex gap-2 items-center text-base mb-4"><Zap size={20}/> 和好罚单</h4>
                              <ul className="space-y-3">
                                  {verdictData.punishments.map((p, i) => (
                                      <li key={i} className="flex gap-3 items-start text-sm text-[#5D4037]">
                                          <span className="bg-rose-100 text-rose-600 rounded-full w-5 h-5 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">{i+1}</span>
                                          {p}
                                      </li>
                                  ))}
                              </ul>
                          </div>
                      )}

                      {/* 评价系统 + 异议 */}
                      <div className="pt-4 border-t border-[#F5EBE0]">
                          <div className="flex justify-between items-center mb-6 px-4">
                              <span className="text-sm font-bold text-[#A1887F]">对熊法官的判决满意吗？</span>
                              <div className="flex gap-3">
                                  <button 
                                    onClick={() => submitFeedback(true)}
                                    disabled={feedbackGiven}
                                    className={`p-2 rounded-full border-2 transition ${verdictData.feedback === 'like' ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-400'}`}
                                  >
                                      <ThumbsUp size={20} />
                                  </button>
                                  <button 
                                    onClick={() => submitFeedback(false)}
                                    disabled={feedbackGiven}
                                    className={`p-2 rounded-full border-2 transition ${verdictData.feedback === 'dislike' ? 'bg-rose-500 text-white border-rose-500' : 'border-gray-200 text-gray-400 hover:border-rose-400 hover:text-rose-400'}`}
                                  >
                                      <ThumbsDown size={20} />
                                  </button>
                              </div>
                          </div>

                          <button onClick={() => setShowEvidence(!showEvidence)} className="w-full py-3 text-[#A1887F] text-xs font-bold flex items-center justify-center gap-2 hover:text-[#5D4037] transition">
                              <Eye size={14}/> {showEvidence ? '收起证词' : '查看双方证词'}
                          </button>
                          
                          {showEvidence && (
                              <div className="mt-4 space-y-4 animate-in slide-in-from-top">
                                  <div className="bg-blue-50 p-4 rounded-2xl text-xs text-blue-800">
                                      <div className="font-bold mb-1">原告证词：</div>{currentCase.sideA.content}
                                  </div>
                                  <div className="bg-rose-50 p-4 rounded-2xl text-xs text-rose-800">
                                      <div className="font-bold mb-1">被告证词：</div>{currentCase.sideB.content}
                                  </div>
                                  
                                  {!currentCase.objection?.status && (
                                      <button onClick={() => setShowObjectionModal(true)} className="w-full mt-6 bg-[#D84315] text-white py-4 rounded-xl font-black text-2xl shadow-lg flex items-center justify-center gap-2 hover:bg-[#BF360C] transition transform active:scale-95 italic" style={{fontFamily: 'serif'}}>
                                          <AlertTriangle size={24} className="text-yellow-400"/> 異議あり！
                                      </button>
                                  )}
                                  
                                  {currentCase.objection && (
                                      <div className="mt-4 text-center text-xs text-gray-400 bg-gray-50 p-2 rounded-lg">
                                          🚨 异议已受理: "{currentCase.objection.content}"
                                      </div>
                                  )}
                              </div>
                          )}
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

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);

export default App;
