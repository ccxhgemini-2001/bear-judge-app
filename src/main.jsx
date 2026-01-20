import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Heart, Scale, MessageCircle, Sparkles, AlertCircle, RefreshCw, Undo2, UserPlus, Copy, ShieldCheck, User, Users, Trash2, Gavel } from 'lucide-react';

// --- 从环境变量安全读取配置 ---
const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'bear-judge-app-v3';
const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 
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
  const [devMode, setDevMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [devTargetSide, setDevTargetSide] = useState('A'); 

  useEffect(() => {
    signInAnonymously(auth).catch(err => setError("身份验证初始化失败"));
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const generateJudgeImage = async () => {
      if (judgeImg) return;
      setImgLoading(true);
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: "A cute fluffy brown Rilakkuma bear judge with a white lawyer wig, sitting professionally behind a large wooden court desk with a gavel. High-end courtroom interior background with warm sunlight, library shelves with law books, cinematic 3D render, kawaii style." }],
            parameters: { sampleCount: 1 }
          })
        });
        const result = await response.json();
        if (result.predictions?.[0]?.bytesBase64Encoded) {
          setJudgeImg(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
        }
      } catch (err) { console.error("Image error", err); }
      finally { setImgLoading(false); }
    };
    if (apiKey) generateJudgeImage();
  }, []);

  useEffect(() => {
    if (!user || !caseId) return;
    const unsubscribe = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentCase(data);
        if (devMode && !data.verdict) {
           if (!data.sideA.submitted) setDevTargetSide('A');
           else if (!data.sideB.submitted) setDevTargetSide('B');
        }
      }
    });
    return () => unsubscribe();
  }, [user, caseId, devMode]);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) { setDevMode(!devMode); setClickCount(0); }
  };

  const createCase = async () => {
    setLoading(true);
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', newId), {
        id: newId, createdBy: user.uid, status: 'waiting',
        sideA: { uid: user.uid, content: '', submitted: false },
        sideB: { uid: null, content: '', submitted: false },
        verdict: null, createdAt: Date.now()
      });
      setCaseId(newId);
    } catch (err) { setError("创建失败: " + err.message); }
    finally { setLoading(false); }
  };

  const joinCase = async (id) => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', id.toUpperCase()));
      if (snap.exists()) {
        const data = snap.data();
        if (!data.sideB.uid && data.sideA.uid !== user.uid) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', id.toUpperCase()), { "sideB.uid": user.uid });
        }
        setCaseId(id.toUpperCase());
      } else { setError("编号不存在嗷"); }
    } catch (err) { setError("加入失败"); }
    finally { setLoading(false); }
  };

  const submitMyPart = async () => {
    setLoading(true);
    const isSideA = devMode ? (devTargetSide === 'A') : (currentCase.sideA.uid === user.uid);
    const field = isSideA ? "sideA" : "sideB";
    try {
      const updates = { [`${field}.content`]: tempInput, [`${field}.submitted`]: true };
      if (devMode && !isSideA && !currentCase.sideB.uid) { updates["sideB.uid"] = "dev_dummy_b"; }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), updates);
      setTempInput('');
    } catch (err) { setError("提交失败"); }
    finally { setLoading(false); }
  };

  const triggerAIJudge = async () => {
    setLoading(true);
    const systemPrompt = `你是一位名为“轻松熊法官”的AI情感调解专家。语气极度可爱、软萌。输出JSON。`;
    const userQuery = `男方：${currentCase.sideA.content}\n女方：${currentCase.sideB.content}`;
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
      const verdict = JSON.parse(resData.candidates[0].content.parts[0].text);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', caseId), { verdict, status: 'finished' });
    } catch (err) { setError("AI审理失败"); }
    finally { setLoading(false); }
  };

  const isBothSubmitted = currentCase?.sideA?.submitted && currentCase?.sideB?.submitted;
  const isMyTurn = currentCase && !currentCase.verdict && !isBothSubmitted && (devMode || (currentCase.sideA?.uid === user?.uid && !currentCase.sideA?.submitted) || (currentCase.sideB?.uid === user?.uid && !currentCase.sideB?.submitted) || (!currentCase.sideB?.uid && currentCase.sideA?.uid !== user?.uid));

  // --- UI Rendering ---
  return (
    <div className="min-h-screen bg-[#FFF9F2] text-[#5D4037] font-sans pb-10">
      <nav className="bg-white/90 p-4 border-b flex justify-between items-center px-6 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleTitleClick}>
          <Scale className={devMode ? 'text-indigo-600' : 'text-[#8D6E63]'} />
          <span className="font-black">轻松熊王国最高法院 {devMode && "(DEV)"}</span>
        </div>
      </nav>
      <div className="max-w-2xl mx-auto p-4 pt-6">
        <div className="relative mb-8 aspect-video bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-white flex items-center justify-center">
          {imgLoading ? <RefreshCw className="animate-spin text-amber-200" /> : judgeImg ? <img src={judgeImg} className="w-full h-full object-cover" /> : <div className="text-6xl">🏛️</div>}
        </div>
        {!caseId ? (
          <div className="bg-white p-10 rounded-[3rem] shadow-sm text-center">
            <h2 className="text-2xl font-black mb-8">开启治愈法庭嗷！</h2>
            <button onClick={createCase} className="w-full bg-[#8D6E63] text-white py-5 rounded-2xl font-black shadow-lg mb-6">发起新诉讼</button>
            <div className="flex gap-2">
              <input placeholder="输入案卷码" className="flex-1 p-4 rounded-2xl bg-gray-50 border-none outline-none text-center font-black uppercase" onChange={(e) => setTempInput(e.target.value)} />
              <button onClick={() => joinCase(tempInput)} className="bg-white border-2 border-[#8D6E63] text-[#8D6E63] px-6 rounded-2xl font-black">加入</button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-[2rem] flex justify-between items-center border border-[#EFEBE9]">
              <div><span className="text-[10px] text-gray-300 block uppercase">案卷号</span><span className="font-mono font-black text-[#8D6E63]">{caseId}</span></div>
              <button onClick={() => navigator.clipboard.writeText(caseId)} className="p-2 text-gray-400 bg-gray-50 rounded-xl"><Copy size={18} /></button>
            </div>
            {!currentCase?.verdict ? (
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm min-h-[300px] flex flex-col">
                {isMyTurn ? (
                  <>
                    <h3 className="font-black mb-4">{devMode ? `正在存证：${devTargetSide === 'A' ? '男方' : '女方'}` : '写下你的想法'}</h3>
                    <textarea className="w-full flex-1 p-6 bg-gray-50 rounded-3xl outline-none resize-none mb-4 text-sm" value={tempInput} onChange={(e) => setTempInput(e.target.value)} />
                    <button onClick={submitMyPart} className="w-full bg-[#8D6E63] text-white py-5 rounded-2xl font-black">确认存证</button>
                  </>
                ) : (
                  <div className="text-center py-10">
                    <p className="font-black text-xl mb-4">{isBothSubmitted ? '证据已确凿！' : '采证中...'}</p>
                    {isBothSubmitted && <button onClick={triggerAIJudge} className="bg-orange-600 text-white px-10 py-5 rounded-full font-black animate-pulse">立刻宣判！</button>}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border-t-[14px] border-[#8D6E63]">
                <h2 className="text-2xl font-black text-center mb-6">📜 {currentCase.verdict.verdict_title}</h2>
                <div className="mb-8 p-6 bg-gray-50 rounded-3xl">
                  <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden flex mb-2">
                    <div className="bg-blue-400 h-full" style={{width: `${currentCase.verdict.fault_ratio.A}%`}} />
                    <div className="bg-rose-400 h-full" style={{width: `${currentCase.verdict.fault_ratio.B}%`}} />
                  </div>
                </div>
                <div className="space-y-6">
                  <p className="text-sm"><strong>诊断：</strong>{currentCase.verdict.analysis}</p>
                  <p className="text-sm bg-green-50 p-4 rounded-2xl italic"><strong>换位思考：</strong>{currentCase.verdict.perspective_taking}</p>
                  <div className="pt-6 border-t border-dashed">
                    <h4 className="font-black text-[#8D6E63] mb-4">执行罚单：</h4>
                    {currentCase.verdict.punishments.map((p, i) => <div key={i} className="bg-gray-50 p-3 rounded-xl mb-2 text-xs font-bold text-center">{p}</div>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {error && <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
