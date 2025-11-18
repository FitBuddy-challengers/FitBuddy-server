export default function scheduleController({ pool }) {
    return {
  
      // ───────────────────────────── 스케줄 추가 ─────────────────────────────
      async addSchedule(req, res) {
        console.log("[➕ 스케줄 추가 요청 도착] body:", req.body);
  
        const { planId, date, exerciseOrder, exercise_id, exerciseId } = req.body;
        const rawExId = exercise_id ?? exerciseId;
        const exId = parseInt(rawExId);
        if (isNaN(exId)) {
          console.error("❌ 잘못된 exercise_id:", rawExId);
          return res.status(400).json({ message: "유효하지 않은 exercise_id" });
        }
  
        if (planId === undefined || date === undefined) {
          return res.status(400).json({ message: "필수 값이 누락되었습니다." });
        }
  
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
  
          const { rows } = await client.query(
            "SELECT MAX(exercise_order) AS max_order FROM exercise_schedule WHERE exercise_plan_id = $1",
            [planId]
          );
          const newOrder = (rows[0].max_order || 0) + 1;
  
          const result = await client.query(
            `INSERT INTO exercise_schedule (
              exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id`,
            [planId, date, newOrder, false, false, exId]
          );
  
          const scheduleId = result.rows[0].id;
  
          const typeRes = await client.query(
            `SELECT is_time_type FROM exercise WHERE id = $1`,
            [exId]
          );
          const isTimeType = typeRes.rows[0]?.is_time_type;
  
          if (isTimeType) {
            for (let i = 1; i <= 3; i++) {
              await client.query(
                `INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
                 VALUES ($1, $2, $3, $4, false)`,
                [scheduleId, exId, i, 600000]
              );
            }
          } else {
            for (let i = 1; i <= 3; i++) {
              await client.query(
                `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
                 VALUES ($1, $2, $3, 0, 12, false)`,
                [scheduleId, exId, i]
              );
            }
          }
  
          await client.query("COMMIT");
          console.log(`[✅ 스케줄 추가 완료] scheduleId=${scheduleId}, exerciseId=${exId}`);
          res.json({ scheduleId, exerciseId: exId });
        } catch (e) {
          await client.query("ROLLBACK");
          console.error("❌ 운동 추가 실패:", e);
          res.status(500).send("Error adding exercise");
        } finally {
          client.release();
        }
      },
  
      // ───────────────────────────── 순서 변경 ─────────────────────────────
      async updateScheduleOrder(req, res) {
        const scheduleId = parseInt(req.params.id);
        const newOrder = parseInt(req.query.order);
  
        try {
          await pool.query(
            "UPDATE exercise_schedule SET exercise_order = $1 WHERE id = $2",
            [newOrder, scheduleId]
          );
          console.log(`[🔁 순서 변경 완료] scheduleId=${scheduleId}, order=${newOrder}`);
          res.status(200).send();
        } catch (err) {
          console.error("❌ 순서 변경 실패:", err);
          res.status(500).send("Error updating order");
        }
      },
  
      // ───────────────────────────── 스케줄 삭제 ─────────────────────────────
      async deleteSchedule(req, res) {
        const scheduleIdParam = req.params.scheduleId;
        const scheduleId = parseInt(scheduleIdParam, 10);
  
        console.log(`[🗑️ 스케줄 삭제 요청] scheduleId=${scheduleId}`);
  
        if (isNaN(scheduleId) || scheduleId <= 0) {
          return res.status(400).json({
            message: `유효하지 않은 scheduleId 입니다: ${scheduleIdParam}`
          });
        }
  
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
  
          await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
          await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);
          const scheduleDeleteResult = await client.query(
            "DELETE FROM exercise_schedule WHERE id = $1",
            [scheduleId]
          );
  
          if (scheduleDeleteResult.rowCount === 0) {
            await client.query("ROLLBACK");
            console.warn(`[⚠️ 스케줄 없음] scheduleId=${scheduleId}`);
            return res.status(404).json({
              message: "삭제할 운동 스케줄을 찾지 못했습니다."
            });
          }
  
          await client.query("COMMIT");
          console.log(`✅ 스케줄 삭제 완료 scheduleId=${scheduleId}`);
          res.status(200).json({
            message: "운동 스케줄이 성공적으로 삭제되었습니다."
          });
        } catch (error) {
          await client.query("ROLLBACK");
          console.error(`❌ 스케줄 삭제 실패 scheduleId=${scheduleId}:`, error);
          res.status(500).json({
            message: "운동 스케줄 삭제 중 서버 오류가 발생했습니다.",
            detail: error.message
          });
        } finally {
          client.release();
        }
      },
  
      // ───────────────────────────── 운동 변경 ─────────────────────────────
      async changeExercise(req, res) {
        console.log("🔁 운동 변경 요청 body:", req.body);
        const scheduleId = parseInt(req.params.scheduleId, 10);
        const { newExerciseId } = req.body;
  
        if (!newExerciseId || isNaN(newExerciseId)) {
          return res.status(400).json({
            success: false,
            message: "❌ 운동 ID가 누락되었거나 잘못 전달되었습니다."
          });
        }
  
        try {
          const client = await pool.connect();
          await client.query("BEGIN");
  
          await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
          await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);
  
          await client.query(
            "UPDATE exercise_schedule SET exercise_id = $1 WHERE id = $2",
            [newExerciseId, scheduleId]
          );
  
          const result = await client.query(
            "SELECT is_time_type FROM exercise WHERE id = $1",
            [newExerciseId]
          );
          if (result.rows.length === 0)
            throw new Error(`❌ ID=${newExerciseId} 운동 없음`);
  
          const isTime = result.rows[0].is_time_type;
  
          if (isTime) {
            for (let i = 1; i <= 3; i++) {
              await client.query(
                `INSERT INTO exercise_time (
                   schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed
                 ) VALUES ($1, $2, $3, 600000, false)`,
                [scheduleId, newExerciseId, i]
              );
            }
          } else {
            for (let i = 1; i <= 3; i++) {
              await client.query(
                `INSERT INTO exercise_reps (
                   schedule_id, exercise_id, set_number, weight, reps, is_completed
                 ) VALUES ($1, $2, $3, 0, 12, false)`,
                [scheduleId, newExerciseId, i]
              );
            }
          }
  
          await client.query("COMMIT");
          client.release();
          console.log("✅ 운동 변경 성공");
          res.json({ success: true });
        } catch (error) {
          console.error("❌ 운동 변경 실패:", error.message);
          res.status(500).json({
            success: false,
            message: "운동 변경 실패",
            detail: error.message
          });
        }
      }
    };
  }