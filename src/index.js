// src/index.js
import app from "./app.js";

const port = process.env.PORT || 3000;
const isRender = !!process.env.RENDER;

const PUBLIC_URL =
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PUBLIC_BASE_URL ||
  `http://0.0.0.0:${port}`;

app.listen(port, "0.0.0.0", () => {
  console.log("서버 실행 완료");

  if (isRender) {
    console.log(`🌐 외부 접속 주소(HTTPS): ${PUBLIC_URL.replace(/^http:/, "https:")}`);
    console.log("ℹ️ HTTP 요청은 자동으로 HTTPS로 리다이렉트됩니다.");
  } else {
    console.log(`🚀 로컬 개발 서버: ${PUBLIC_URL}`);
  }
});