export default async function handler(request, response) {
  // 1. 从环境变量里拿 Key (Vercel 后台配置)
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: "Missing API Key" });
  }

  // 2. 拿到前端发来的 prompt
  const { systemPrompt, userContent } = request.body;

  try {
    // 3. 在服务器端请求 DeepSeek
    const result = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
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
    
    // 4. 把结果转发回给前端
    return response.status(200).json(data);

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
