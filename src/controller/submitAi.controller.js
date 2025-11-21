// src/controller/exercise/submitAi.controller.js
//철저하게 지금 안드로이드 구조 맞춰서 수정 작업을 진행함.

export default function submitAiController({ pool }) {
  return {
    async submitAi(req, res) {
      console.log("🔥 [submit-ai] 요청:", JSON.stringify(req.body, null, 2));

      const { user_id, plans } = req.body;
      if (!plans || plans.length === 0) {
        return res.status(400).json({ error: "plans 배열이 비어 있습니다." });
      }

      // 1개의 플랜만 처리한다고 가정
      const { start_date, end_date, days, focus_area } = plans[0];

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // 기존 플랜 삭제
        await client.query(
          `DELETE FROM exercise_plan 
           WHERE user_id = $1 AND start_date = $2 AND end_date = $3`,
          [user_id, start_date, end_date]
        );

        // 새로운 플랜 생성
        const planResult = await client.query(
          `INSERT INTO exercise_plan (
            user_id, start_date, end_date, day, day_pattern, is_dummy
          ) VALUES ($1, $2, $3, $4, $5, false)
          RETURNING id`,
          [user_id, start_date, end_date, days, [focus_area]]
        );

        const planId = planResult.rows[0].id;

        // 클라이언트(Room DB) 반영 위해 빈 데이터 만들어줌
        const schedules = [];
        const reps_sets = [];
        const time_sets = [];

        await client.query("COMMIT");

        // Android에서 schedules/reps/time을 예상하므로 빈 배열 구조 유지
        return res.json({
          routine_text: "",
          saved_plan_id: planId,
          schedules,
          reps_sets,
          time_sets
        });

      } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ [submit-ai] 에러:", err);
        return res.status(500).json({ error: "서버 오류" });
      } finally {
        client.release();
      }
    }
  };
}
