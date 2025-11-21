// src/controller/exercise/submitAi.controller.js

export default function submitAiController({ pool }) {
    return {
      async submitAi(req, res) {
        const { user_id, plans } = req.body;
  
        try {
  
  
          //  새 플랜 저장 (네 기존 코드 그대로)
          //  (원래 있던 플랜 생성/스케줄 생성 코드)
  
          return res.json({ success: true });
        } catch (err) {
          console.error("submitAi error:", err);
          return res.status(500).json({ error: "서버 오류" });
        }
      }
    }
  }
  