// src/controller/exercise/deleteDummyPlan.controller.js

export default function deleteDummyPlanController({ pool }) {
    return {
      async deleteDummy(req, res) {
        const { user_id } = req.query;
        if (!user_id) return res.status(400).json({ error: "user_id is required" });
  
        try {
          // reps 삭제
          await pool.query(`
            DELETE FROM exercise_reps 
            WHERE schedule_id IN (
              SELECT id FROM exercise_schedule 
              WHERE plan_id IN (
                SELECT id FROM exercise_plan 
                WHERE user_id = $1 AND is_dummy = TRUE
              )
            )
          `, [user_id]);
  
          // time 삭제
          await pool.query(`
            DELETE FROM exercise_time 
            WHERE schedule_id IN (
              SELECT id FROM exercise_schedule 
              WHERE plan_id IN (
                SELECT id FROM exercise_plan 
                WHERE user_id = $1 AND is_dummy = TRUE
              )
            )
          `, [user_id]);
  
          // schedule 삭제
          await pool.query(`
            DELETE FROM exercise_schedule
            WHERE plan_id IN (
              SELECT id FROM exercise_plan
              WHERE user_id = $1 AND is_dummy = TRUE
            )
          `, [user_id]);
  
          // plan 삭제
          await pool.query(`
            DELETE FROM exercise_plan
            WHERE user_id = $1 AND is_dummy = TRUE
          `, [user_id]);
  
          return res.json({ success: true });
        } catch (err) {
          console.error("deleteDummy error:", err);
          return res.status(500).json({ error: "서버 오류" });
        }
      }
    };
  }
  