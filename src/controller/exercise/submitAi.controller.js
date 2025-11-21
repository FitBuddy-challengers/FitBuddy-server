// src/controller/exercise/submitAi.controller.js
//철저하게 지금 안드로이드 구조 맞춰서 수정 작업을 진행함.

export default function submitAiController({ pool }) {
  return {
    async submitAi(req, res) {
      console.log("🔥 [submit-ai] 요청:", JSON.stringify(req.body, null, 2));

      const { user_id, plans } = req.body;
      const { start_date, end_date, days, focus_area, exercises } = plans[0];

      if (!exercises || exercises.length === 0) {
        return res.status(400).json({ error: "exercises 배열이 비어 있습니다." });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // 기존 플랜 삭제
        await client.query(
          `DELETE FROM exercise_plan
           WHERE user_id=$1 AND start_date=$2 AND end_date=$3`,
          [user_id, start_date, end_date]
        );

        // 새 플랜 생성
        const planResult = await client.query(
          `INSERT INTO exercise_plan (
            user_id, start_date, end_date, day, day_pattern, is_dummy
          ) VALUES ($1,$2,$3,$4,$5,false)
          RETURNING id`,
          [user_id, start_date, end_date, days, [focus_area]]
        );

        const planId = planResult.rows[0].id;

        // 운동명 → exercise.id 매핑
        const nameToId = {};
        for (const ex of exercises) {
          const q = await client.query(
            `SELECT id, is_time_type FROM exercise WHERE name ILIKE $1 LIMIT 1`,
            [ex.name]
          );
          if (q.rows.length === 0) {
            throw new Error(`운동명 '${ex.name}'을 DB에서 찾을 수 없음`);
          }
          nameToId[ex.name] = q.rows[0];
        }

        // 스케줄 & 세트 생성
        let order = 1;
        const scheduleRows = [];
        const repsRows = [];
        const timeRows = [];

        for (const ex of exercises) {
          const { id: exId, is_time_type } = nameToId[ex.name];

          // 스케줄 생성
          const sched = await client.query(
            `INSERT INTO exercise_schedule (
              exercise_plan_id, date, exercise_order,
              is_completed, is_dummy, exercise_id
            ) VALUES ($1,$2,$3,false,false,$4)
            RETURNING *`,
            [planId, start_date, order++, exId]
          );

          const schedRow = sched.rows[0];
          scheduleRows.push(schedRow);

          const schedId = schedRow.id;

          if (is_time_type) {
            const seconds = (ex.seconds || 60) * 1000;
            const timeSet = await client.query(
              `INSERT INTO exercise_time (
                schedule_id, exercise_id, set_number,
                elapsed_time_millis, is_completed
              ) VALUES ($1,$2,1,$3,false)
              RETURNING *`,
              [schedId, exId, seconds]
            );
            timeRows.push(timeSet.rows[0]);
          } else {
            const sets = ex.sets || 1;
            const reps = ex.reps || 10;

            for (let i = 1; i <= sets; i++) {
              const repsSet = await client.query(
                `INSERT INTO exercise_reps (
                  schedule_id, exercise_id, set_number, weight, reps, is_completed
                ) VALUES ($1,$2,$3,0,$4,false)
                RETURNING *`,
                [schedId, exId, i, reps]
              );
              repsRows.push(repsSet.rows[0]);
            }
          }
        }

        await client.query("COMMIT");

        return res.json({
          routine_text: "",
          saved_plan_id: planId,
          schedules: scheduleRows,
          reps_sets: repsRows,
          time_sets: timeRows
        });

      } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ submit-ai error:", err);
        return res.status(500).json({ error: "서버 오류" });
      } finally {
        client.release();
      }
    }
  };
}