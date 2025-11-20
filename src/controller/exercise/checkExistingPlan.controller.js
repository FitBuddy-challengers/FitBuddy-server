// src/controller/exercise/checkExistingPlan.controller.js

//기존 운동 스케줄이 있으면 이를 알려주는 ai 서버 
export default function checkExistingPlanController({ pool }) {
    return {
      async check(req, res) {

        //기존: start_date, end_date → 변경: date으로 변경함.
        const { user_id, date } = req.query;
  
        try {
          const result = await pool.query(
            `
            SELECT id
            FROM exercise_plan
            WHERE user_id = $1
            AND $2 BETWEEN start_date AND end_date
            LIMIT 1
          `,
            [user_id, date]
          );
  
          if (result.rows.length > 0) {
            return res.json({ exists: true, plan_id: result.rows[0].id });
          } else {
            return res.json({ exists: false });
          }
        } catch (err) {
          console.error("checkExistingPlan error:", err);
          return res.status(500).json({ error: "서버 오류" });
        }
      }
    }
  }