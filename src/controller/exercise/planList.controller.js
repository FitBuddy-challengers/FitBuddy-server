// src/controller/exercise/planList.controller.js

export default function planListController({ pool }) {
    return {
  
      // ───────────────────────────── scheduleId 조회 ─────────────────────────────
      async getScheduleId(req, res) {
        const { planId, exerciseId } = req.query;
        if (!planId || !exerciseId)
          return res.status(400).json({ message: "planId와 exerciseId는 필수입니다." });
  
        try {
          const sql = `
            SELECT id FROM exercise_schedule
            WHERE exercise_plan_id = $1 AND exercise_id = $2
            ORDER BY id ASC LIMIT 1
          `;
          const result = await pool.query(sql, [planId, exerciseId]);
  
          if (result.rows.length === 0) {
            console.warn(`[⚠️ scheduleId 없음] planId=${planId}, exerciseId=${exerciseId}`);
            return res.status(404).json({
              message: "해당 운동에 대한 스케줄 정보를 찾을 수 없습니다 (scheduleId not found)."
            });
          }
  
          console.log(`[ℹ️ scheduleId 조회 성공] ${result.rows[0].id}`);
          res.status(200).json({ scheduleId: result.rows[0].id });
        } catch (error) {
          console.error('[❌ scheduleId 조회 실패]', error);
          res.status(500).json({
            message: "scheduleId 조회 중 서버 오류가 발생했습니다."
          });
        }
      },
  
      // ───────────────────────────── 특정 플랜 스케줄 목록 ─────────────────────────────
      async getPlanSchedules(req, res) {
        const planId = parseInt(req.params.planId, 10);
        if (isNaN(planId))
          return res.status(400).json({ message: "유효하지 않은 planId입니다." });
  
        try {
          const result = await pool.query(`
            SELECT id AS schedule_id, exercise_id, exercise_order
            FROM exercise_schedule
            WHERE exercise_plan_id = $1 
            ORDER BY exercise_order ASC
          `, [planId]);
  
          console.log(`[ℹ️ 스케줄 조회] planId=${planId}, count=${result.rows.length}`);
          res.status(200).json(result.rows);
        } catch (error) {
          console.error(`❌ 스케줄 조회 실패 planId=${planId}:`, error);
          res.status(500).json({
            message: "서버 오류: 스케줄 조회에 실패했습니다."
          });
        }
      },
  
      // ───────────────────────────── 전체 플랜 조회 ─────────────────────────────
      async getPlans(req, res) {
        const userId = parseInt(req.query.userId);
        if (!userId)
          return res.status(400).json({ message: "userId가 필요합니다." });
  
        try {
          const planResult = await pool.query(
            `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                    to_char(end_date, 'YYYY-MM-DD') AS end_date,
                    day, day_pattern, completed_days, is_dummy
             FROM exercise_plan
             WHERE user_id = $1
             ORDER BY start_date DESC`,
            [userId]
          );
  
          const plans = [];
          for (const plan of planResult.rows) {
            const schedResult = await pool.query(
              `SELECT * FROM exercise_schedule 
               WHERE exercise_plan_id = $1 ORDER BY exercise_order`,
              [plan.id]
            );
            plans.push({ ...plan, schedules: schedResult.rows });
          }
  
          console.log(`📦 플랜 목록 반환: ${plans.length}개`);
          res.json(plans);
        } catch (error) {
          console.error("❌ /api/plans 실패:", error);
          res.status(500).json({ message: "서버 오류" });
        }
      },
  
      // ───────────────────────────── 스케줄 완료 처리 ─────────────────────────────
      async completeSchedule(req, res) {
        const scheduleId = req.params.scheduleId;
  
        try {
          await pool.query(
            `UPDATE exercise_schedule SET is_completed = true WHERE id = $1`,
            [scheduleId]
          );
          console.log(`✅ 스케줄 완료 처리 scheduleId=${scheduleId}`);
          res.status(200).json({ message: "Schedule marked as complete" });
        } catch (err) {
          console.error("❌ 스케줄 완료 처리 실패:", err);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    };
  }