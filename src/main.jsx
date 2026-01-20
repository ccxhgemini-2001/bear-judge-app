import React from 'react';
import { createRoot } from 'react-dom/client';

const App = () => {
  return (
    <div className="p-10 text-center">
      <h1 className="text-4xl font-bold text-green-600 mb-4">✅ 环境修复成功！</h1>
      <p>现在可以把熊法官的代码粘贴回来了。</p>
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}

export default App;
