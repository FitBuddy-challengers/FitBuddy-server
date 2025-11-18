export default function todayPlanController({ pool }) {
    return {
      async getTodayPlan(req, res) {
        const userId = parseInt(req.query.userId);
        if (!userId) return res.status(400).json({ message: "userId가 필요합니다." });
  
        const today = new Date().toISOString().split("T")[0];
  
        try {
          const planResult = await pool.query(
            `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                    to_char(end_date, 'YYYY-MM-DD') AS end_date,
                    day, day_pattern, completed_days, is_dummy
             FROM exercise_plan
             WHERE user_id = $1 AND $2::date BETWEEN start_date AND end_date
             LIMIT 1`,
            [userId, today]
          );
  
          if (planResult.rowCount === 0) {
            return res.status(404).json({ message: "오늘 운동 계획이 없습니다." });
          }
  
          const plan = planResult.rows[0];
  
          const schedResult = await pool.query(
            `SELECT 
                s.id AS schedule_id,
                COALESCE(r.exercise_id, t.exercise_id) AS exercise_id,
                to_char(s.date, 'YYYY-MM-DD') AS date,
                s.exercise_order,
                s.is_completed,
                s.is_dummy,
  
                e.name AS exercise_name,
                e.part,
                e.equip,
                e.image_path,
                e.start_position,
                e.exercise_motion,
                e.breathing,
                e.caution,
                e.mets,
                e.is_time_type,
                e.is_noise,
                e.is_favorite,
                e.is_hidden
              FROM exercise_schedule s
              LEFT JOIN exercise_reps r ON s.id = r.schedule_id AND r.set_number = 1
              LEFT JOIN exercise_time t ON s.id = t.schedule_id
              LEFT JOIN exercise e ON e.id = COALESCE(s.exercise_id, r.exercise_id, t.exercise_id)
              WHERE s.exercise_plan_id = $1
              AND COALESCE(s.exercise_id, r.exercise_id, t.exercise_id) IS NOT NULL
              GROUP BY s.id, r.exercise_id, t.exercise_id, e.id
              ORDER BY s.exercise_order`,
            [plan.id]
          );
  
          for (const sched of schedResult.rows) {
            const scheduleId = sched.schedule_id;
  
            const repsCountRes = await pool.query(
              `SELECT COUNT(*) AS count, MAX(reps) AS max_reps FROM exercise_reps WHERE schedule_id = $1`,
              [scheduleId]
            );
            const timeCountRes = await pool.query(
              `SELECT COUNT(*) AS count, MAX(elapsed_time_millis) AS max_seconds FROM exercise_time WHERE schedule_id = $1`,
              [scheduleId]
            );
  
            const repsCount = parseInt(repsCountRes.rows[0].count || 0);
            const repsVal = parseInt(repsCountRes.rows[0].max_reps || 0);
            const timeCount = parseInt(timeCountRes.rows[0].count || 0);
            const timeVal = parseInt(timeCountRes.rows[0].max_seconds || 0);
  
            sched.set_count = repsCount || timeCount;
            sched.reps = repsVal || null;
            sched.seconds = timeVal || null;
  
            if (sched.is_time_type) {
              const timeInMillis = timeVal || 0;
              let totalSeconds = Math.floor(timeInMillis / 1000);
              const hours = Math.floor(totalSeconds / 3600);
              totalSeconds %= 3600;
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              const pad = (n) => String(n).padStart(2, '0');
              const formattedTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
              sched.display_detail = `${formattedTime} × ${timeCount}세트`;
            } else {
              sched.display_detail = `${repsVal}회 × ${repsCount}세트`;
            }
          }
  
          res.json({ plan, schedules: schedResult.rows });
        } catch (error) {
          console.error("❌ /api/plan/today 실패:", error);
          res.status(500).json({ message: "서버 오류" });
        }
      }
    };
  }