//src/controller/exercise/reps.controller.js
export default function repsController({ pool }) {
    return {
      // REPS 세트 조회
      async getRepsSets(req, res) {
        const scheduleId = parseInt(req.params.scheduleId, 10);
        if (isNaN(scheduleId)) return res.status(400).json({ message: "유효하지 않은 scheduleId" });
  
        try {
          const result = await pool.query(
            `SELECT set_number, reps, weight, is_completed
             FROM exercise_reps
             WHERE schedule_id = $1
             ORDER BY set_number ASC`,
            [scheduleId]
          );
  
          console.log(`ℹ️ REPS 세트 조회 scheduleId=${scheduleId}`);
          res.json(result.rows);
        } catch (err) {
          console.error("❌ 세트 불러오기 실패:", err);
          res.status(500).json({ message: "서버 오류" });
        }
      },
  
      // REPS 세트 저장(전체 교체)
      async saveRepsSets(req, res) {
        const scheduleId = parseInt(req.params.scheduleId, 10);
        const sets = req.body;
        if (!Array.isArray(sets))
          return res.status(400).json({ message: "잘못된 데이터 형식입니다." });
  
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
  
          const result = await client.query(
            `SELECT exercise_id FROM exercise_schedule WHERE id = $1`,
            [scheduleId]
          );
          const exerciseId = result.rows[0]?.exercise_id;
          if (!exerciseId)
            throw new Error(`❌ schedule_id=${scheduleId}에 대한 exercise_id가 없음`);
  
          for (const set of sets) {
            await client.query(
              `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [scheduleId, exerciseId, set.set_number, set.weight, set.reps, set.is_completed]
            );
          }
  
          await client.query("COMMIT");
          console.log(`✅ REPS 세트 저장 완료 scheduleId=${scheduleId}`);
          res.status(200).send();
        } catch (err) {
          await client.query("ROLLBACK");
          console.error("❌ REPS 세트 저장 실패:", err.message);
          res.status(500).json({ message: "서버 오류", detail: err.message });
        } finally {
          client.release();
        }
      },
  
      // REPS 완료/시간 업데이트
      async completeReps(req, res) {
        const { scheduleId, setNumber, isCompleted, time_seconds } = req.body;
  
        if (
          typeof scheduleId === "undefined" ||
          typeof setNumber === "undefined" ||
          typeof isCompleted !== "boolean"
        ) {
          return res.status(400).json({
            message: "잘못된 입력: scheduleId, setNumber는 필수이며, isCompleted는 boolean 타입이어야 합니다."
          });
        }
  
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const sql = `
            UPDATE exercise_reps 
            SET is_completed = $1,
                time_seconds = COALESCE($4, time_seconds)
            WHERE schedule_id = $2 AND set_number = $3
          `;
          const result = await client.query(sql, [
            isCompleted,
            scheduleId,
            setNumber,
            time_seconds
          ]);
  
          if (result.rowCount > 0) {
            await client.query("COMMIT");
            console.log(`✅ REPS 세트 완료/시간 업데이트 scheduleId=${scheduleId} set=${setNumber}`);
            res.status(200).json({ message: "세트 완료 상태가 성공적으로 업데이트되었습니다." });
          } else {
            await client.query("ROLLBACK");
            console.warn(`⚠️ REPS 세트 찾지 못함 scheduleId=${scheduleId} set=${setNumber}`);
            res.status(404).json({
              message: `scheduleId ${scheduleId}, setNumber ${setNumber} 세트를 찾을 수 없습니다.`
            });
          }
        } catch (err) {
          await client.query("ROLLBACK");
          console.error("❌ REPS 세트 완료 처리 실패:", err);
          res.status(500).json({
            error: "세트 완료 상태 업데이트 중 서버 오류 발생.",
            detail: err.message
          });
        } finally {
          client.release();
        }
      }
    };
  }