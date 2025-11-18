//src/controller/exercise/submitAi.controller.js

export default function submitAiController({ pool }) {
    return {
      async submitAi(req, res) {
        console.log(
          "🔥 [submit-ai] 루틴 저장 요청 도착:",
          JSON.stringify(req.body, null, 2)
        );
  
        const { user_id, start_date, end_date, exercises } = req.body;
  
        // exercises 빈 배열 방어
        if (!Array.isArray(exercises) || exercises.length === 0) {
          console.error("❌ [submit-ai] exercises가 비어있습니다.");
          return res.status(400).json({ error: "운동 정보가 없습니다." });
        }
  
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
  
          // 1️⃣ 기존 플랜 삭제
          await client.query(
            `
            DELETE FROM exercise_plan 
            WHERE user_id = $1 AND start_date >= $2 AND end_date <= $3
          `,
            [user_id, start_date, end_date]
          );
  
          // 2️⃣ 새로운 플랜 생성
          const startDateObj = new Date(start_date);
          const dayValue = [startDateObj.getDate()];
          const dayPattern = ["ai"];
  
          const planResult = await client.query(
            `
            INSERT INTO exercise_plan (
              user_id, start_date, end_date, day, day_pattern, is_dummy
            )
            VALUES ($1, $2, $3, $4, $5, false)
            RETURNING id
          `,
            [user_id, start_date, end_date, dayValue, dayPattern]
          );
  
          const planId = planResult.rows[0].id;
  
          // 운동명 → id 변환
          const nameToId = {};
          for (const ex of exercises) {
            const result = await client.query(
              `SELECT id FROM exercise WHERE name = $1 LIMIT 1`,
              [ex.name]
            );
            if (result.rows.length === 0) {
              throw new Error(`운동명 '${ex.name}'을 찾을 수 없습니다.`);
            }
            nameToId[ex.name] = result.rows[0].id;
          }
  
          // 3️⃣ 스케줄 + reps/time 저장
          let order = 1;
          const scheduleResults = [];
          const repsResults = [];
          const timeResults = [];
  
          for (const ex of exercises) {
            const exId = nameToId[ex.name];
  
            const schedResult = await client.query(
              `
              INSERT INTO exercise_schedule (
                exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
              )
              VALUES ($1, $2, $3, false, false, $4)
              RETURNING *
            `,
              [planId, start_date, order++, exId]
            );
  
            const schedRow = schedResult.rows[0];
            scheduleResults.push(schedRow);
            const schedId = schedRow.id;
  
            if (ex.seconds) {
              // 시간 기반 운동
              const timeRes = await client.query(
                `
                INSERT INTO exercise_time (
                  schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed
                )
                VALUES ($1, $2, 1, $3, false)
                RETURNING *
              `,
                [schedId, exId, ex.seconds * 1000]
              );
              timeResults.push(timeRes.rows[0]);
            } else {
              // reps 운동
              for (let i = 1; i <= ex.sets; i++) {
                const repsRes = await client.query(
                  `
                  INSERT INTO exercise_reps (
                    schedule_id, exercise_id, set_number, weight, reps, is_completed
                  )
                  VALUES ($1, $2, $3, 0, $4, false)
                  RETURNING *
                `,
                  [schedId, exId, i, ex.reps]
                );
                repsResults.push(repsRes.rows[0]);
              }
            }
          }
  
          await client.query("COMMIT");
  
          res.json({
            plan_id: planId,
            schedules: scheduleResults,
            reps: repsResults,
            times: timeResults,
          });
        } catch (err) {
          await client.query("ROLLBACK");
          console.error("❌ [submit-ai] 에러 발생:", err);
          res.status(500).json({ error: err.message });
        } finally {
          client.release();
        }
      },
    };
  }