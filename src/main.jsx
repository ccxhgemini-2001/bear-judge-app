import React from 'react';
import { createRoot } from 'react-dom/client';

// --- 极简探针模式 ---
const App = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f0f0' }}>
      <h1 style={{ color: 'green', fontSize: '24px', fontFamily: 'sans-serif' }}>
        ✅ 王国地基自检通过！Build Success!
      </h1>
    </div>
  );
};

// 挂载逻辑
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
} else {
  console.error("找不到 root 节点，请检查 index.html");
}

export default App;
