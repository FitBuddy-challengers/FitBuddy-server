//src/controller/exercise/submitAi.controller.js

export default function submitAiController({ pool, openai }) {
  return {
    async submitAi(req, res) {
      console.log(
        "🔥 [submit-ai] 루틴 저장 요청 도착:",
        JSON.stringify(req.body, null, 2)
      );

      const { user_id, start_date, end_date } = req.body;

      // 1) GPT 호출해 루틴 생성
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "당신은 전문 트레이너 AI입니다. 사용자의 정보를 바탕으로 운동 루틴을 JSON으로만 반환하세요."
          },
          {
            role: "user",
            content: `사용자 ${user_id}의 ${start_date} 운동 계획을 생성해줘.`
          }
        ],
        response_format: {
          type: "json_object"
        }
      });

      const aiData = JSON.parse(gptResponse.choices[0].message.content);
      const routineText = aiData.routine_text ?? "";
      const exercises = aiData.exercises ?? [];

      if (!Array.isArray(exercises) || exercises.length === 0) {
        return res.status(400).json({ error: "AI로부터 운동 정보가 없습니다." });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // 2) 기존 플랜 삭제
        await client.query(
          `
          DELETE FROM exercise_plan 
          WHERE user_id = $1 AND start_date = $2 AND end_date = $3
        `,
          [user_id, start_date, end_date]
        );

        // 3) 새 플랜 생성
        const startDateObj = new Date(start_date);
        const planResult = await client.query(
          `
          INSERT INTO exercise_plan (
            user_id, start_date, end_date, day, day_pattern, is_dummy
          )
          VALUES ($1, $2, $3, $4, $5, false)
          RETURNING id
        `,
          [user_id, start_date, end_date, [startDateObj.getDate()], ["ai"]]
        );

        const planId = planResult.rows[0].id;
        const nameToId = {};

        // 4) 운동명 매핑
        for (const ex of exercises) {
          const result = await client.query(
            `SELECT id, is_time_type FROM exercise WHERE name ILIKE $1 LIMIT 1`,
            [ex.name]
          );
          if (result.rows.length === 0) {
            throw new Error(`운동명 '${ex.name}'을 찾을 수 없습니다.`);
          }
          nameToId[ex.name] = result.rows[0];
        }

        // 5) 스케줄 생성 + 세트 저장
        let order = 1;
        const scheduleRows = [];

        for (const ex of exercises) {
          const { id: exId, is_time_type } = nameToId[ex.name];

          const sched = await client.query(
            `
            INSERT INTO exercise_schedule (
              exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
            )
            VALUES ($1, $2, $3, false, false, $4)
            RETURNING *
          `,
            [planId, start_date, order++, exId]
          );

          const schedId = sched.rows[0].id;
          scheduleRows.push(sched.rows[0]);

          if (is_time_type) {
            await client.query(
              `
              INSERT INTO exercise_time (
                schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed
              )
              VALUES ($1, $2, 1, $3, false)
            `,
              [schedId, exId, (ex.seconds || 60) * 1000]
            );
          } else {
            for (let i = 1; i <= ex.sets; i++) {
              await client.query(
                `
                INSERT INTO exercise_reps (
                  schedule_id, exercise_id, set_number, weight, reps, is_completed
                )
                VALUES ($1, $2, $3, 0, $4, false)
              `,
                [schedId, exId, i, ex.reps]
              );
            }
          }
        }

        await client.query("COMMIT");

        // 6) 앱이 원하는 형태로 응답
        return res.json({
          routine_text: routineText,
          exercises: exercises,
          saved_plan_id: planId
        });

      } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ [submit-ai] 에러 발생:", err);
        return res.status(500).json({ error: err.message });
      } finally {
        client.release();
      }
    }
  };
}