// src/controller/exercise/plan.controller.js

export default function planController({ pool }) {
    return {
      async createDummyPlan(req, res) {
        console.log("[🧪 더미 플랜 요청] 전체 req.body:", req.body);
        const { user_id, date } = req.body;
  
        if (!user_id || isNaN(user_id)) {
          console.error("❌ 유효하지 않은 user_id:", user_id);
          return res.status(400).json({
            message: "유효하지 않은 user_id입니다. 실제 존재하는 유저 ID를 전달하세요."
          });
        }
  
        const userId = user_id;
        const client = await pool.connect();
  
        try {
          await client.query("BEGIN");
  
          const existing = await client.query(
            `SELECT id FROM exercise_plan WHERE user_id = $1 AND start_date = $2 FOR UPDATE`,
            [userId, date]
          );
  
          if (existing.rows.length > 0) {
            const planId = existing.rows[0].id;
  
            const result = await client.query(
              `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM exercise_plan WHERE id = $1`,
              [planId]
            );
  
            const formattedDate = result.rows[0]?.start_date || null;
            await client.query("ROLLBACK");
  
            console.log("ℹ️ 이미 오늘 플랜이 있어 그대로 반환");
  
            return res.status(200).send({
              message: "이미 오늘 플랜이 존재합니다",
              planId,
              date: formattedDate
            });
          }
  
          // 새 플랜 생성
          const planResult = await client.query(
            `
            INSERT INTO exercise_plan (
              user_id, start_date, end_date, day, day_pattern, completed_days, is_dummy
            ) VALUES ($1, $2, $2, $3, $4, $5, true) RETURNING id
          `,
            [
              userId,
              date,
              [new Date(date).getDate()],
              ["dummy"],
              null
            ]
          );
  
          const planId = planResult.rows[0].id;
  
          const dummyExercises = [
            { exerciseId: 15, exOrder: 1, sets: 3, reps: 12 },
            { exerciseId: 120, exOrder: 2, sets: 3, reps: 10 },
            { exerciseId: 8, exOrder: 3, sets: 1, reps: 60 }
          ];
  
          for (const item of dummyExercises) {
            const schedResult = await client.query(
              `
              INSERT INTO exercise_schedule (
                exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
              ) VALUES ($1, $2, $3, false, true, $4) RETURNING id
            `,
              [planId, date, item.exOrder, item.exerciseId]
            );
  
            const schedId = schedResult.rows[0].id;
  
            const typeResult = await client.query(
              `SELECT is_time_type FROM exercise WHERE id = $1`,
              [item.exerciseId]
            );
  
            const isTime = Boolean(typeResult.rows[0]?.is_time_type);
  
            if (isTime) {
              await client.query(
                `
                INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
                VALUES ($1, $2, 1, $3, false)
              `,
                [schedId, item.exerciseId, item.reps * 1000]
              );
            } else {
              for (let i = 1; i <= item.sets; i++) {
                await client.query(
                  `
                  INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
                  VALUES ($1, $2, $3, 0, $4, false)
                `,
                  [schedId, item.exerciseId, i, item.reps]
                );
              }
            }
          }
  
          const result = await client.query(
            `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM exercise_plan WHERE id = $1`,
            [planId]
          );
  
          const formattedDate = result.rows[0]?.start_date || null;
  
          await client.query("COMMIT");
          console.log("✅ 더미 플랜 및 운동 삽입 완료");
  
          res.status(200).send({
            message: "더미 운동 계획 생성 완료",
            planId,
            date: formattedDate
          });
        } catch (error) {
          await client.query("ROLLBACK");
          console.error("❌ 더미 계획 생성 실패:", error);
          res.status(500).send({ message: "서버 오류" });
        } finally {
          client.release();
        }
      }
    };
  }