/**
 * Cloudflare Worker 代理 Google Cloud TTS API
 * 部署指南：
 * 1. 登录 Cloudflare 控制台 -> Workers & Pages -> 找到你的 typewords-tts (或新建)
 * 2. 点击编辑代码 (Edit Code)，将本文件的所有代码覆盖粘贴进去。
 * 3. 点击右上角【保存并部署】。
 */

// 你的 Google API Key
const GOOGLE_API_KEY = "AIzaSyBu7HF8YIkqmhDup235iiBTJO-3rZSPFaw";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 处理跨域请求 (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const text = url.searchParams.get("text");
    // 默认使用顶级女声 Journey-F
    const voice = url.searchParams.get("voice") || "en-US-Journey-F";

    if (!text) {
      return new Response("Missing 'text' parameter", { status: 400 });
    }

    // 解析 languageCode (例如从 en-US-Journey-F 中提取 en-US)
    const languageCode = voice.substring(0, 5);

    // 构建 Google TTS API 的请求 Payload
    const payload = {
      input: { text: text },
      voice: {
        languageCode: languageCode,
        name: voice,
      },
      audioConfig: {
        audioEncoding: "MP3",
      },
    };

    try {
      // 向上游 Google API 发起请求
      const googleApiUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`;
      const response = await fetch(googleApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(`Google API Error: ${errorText}`, {
          status: response.status,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      const json = await response.json();

      // Google 返回的 audioContent 是 Base64 编码的音频字符串
      if (!json.audioContent) {
        return new Response("No audio content returned", { status: 500 });
      }

      // 将 Base64 转换为二进制流
      const binaryString = atob(json.audioContent);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 返回 MP3 二进制流给前端
      return new Response(bytes.buffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=31536000",
        },
      });
    } catch (e) {
      return new Response(e.message, {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
