// 文件路径: /api/judge.js

export default async function handler(request, response) {
  // 1. 设置允许跨域 (CORS)，防止浏览器拦截
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 处理预检请求 (OPTIONS)
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // 2. 从 Vercel 的保险柜里取出 Key
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: "服务器端缺少 API Key" });
  }

  // 3. 接收前端传来的案情
  const { role, content, systemPrompt, userContent } = request.body;

  try {
    // 4. 在服务器端偷偷请求 DeepSeek
    const result = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}` // Key 在这里被使用，但用户看不见
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 1.3,
        stream: false
      })
    });

    const data = await result.json();
    
    // 5. 把 DeepSeek 的结果转发给前端
    return response.status(200).json(data);

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
