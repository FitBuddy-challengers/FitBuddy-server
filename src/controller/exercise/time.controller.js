export default function timeController({ pool }) {
    return {
      // TIME 세트 조회
      async getTimeSets(req, res) {
        const scheduleId = parseInt(req.params.scheduleId, 10);
        if (isNaN(scheduleId))
          return res.status(400).json({ message: "유효하지 않은 scheduleId" });
  
        try {
          const result = await pool.query(
            `SELECT set_number, elapsed_time_millis, is_completed, COALESCE(weight, 0) AS weight
             FROM exercise_time WHERE schedule_id = $1 ORDER BY set_number ASC`,
            [scheduleId]
          );
  
          const sets = result.rows.map((row) => ({
            set_number: row.set_number,
            seconds: Math.floor(row.elapsed_time_millis / 1000),
            weight: row.weight
          }));
  
          console.log(`ℹ️ TIME 세트 조회 scheduleId=${scheduleId}`);
          res.json(sets);
        } catch (err) {
          console.error("❌ TIME 세트 불러오기 실패:", err);
          res.status(500).json({ message: "서버 오류" });
        }
      },
  
      // TIME 세트 저장 (전체 교체)
      async saveTimeSets(req, res) {
        const scheduleId = parseInt(req.params.scheduleId);
        const setList = req.body;
        if (!Array.isArray(setList))
          return res.status(400).json({ message: "잘못된 요청 형식입니다." });
  
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
  
          const scheduleDataResult = await client.query(
            "SELECT exercise_id FROM exercise_schedule WHERE id = $1",
            [scheduleId]
          );
  
          if (!scheduleDataResult.rows.length) {
            await client.query("ROLLBACK");
            return res
              .status(404)
              .json({ message: `스케줄 ID ${scheduleId}를 찾을 수 없습니다.` });
          }
  
          const exerciseId = scheduleDataResult.rows[0].exercise_id;
          if (!exerciseId) {
            await client.query("ROLLBACK");
            return res
              .status(404)
              .json({ message: `스케줄 ID ${scheduleId}에 연결된 운동 ID를 찾을 수 없습니다.` });
          }
  
          await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [
            scheduleId
          ]);
  
          for (const set of setList) {
            const millis = set.seconds * 1000;
            await client.query(
              `INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, weight, is_completed)
               VALUES ($1, $2, $3, $4, $5, false)`,
              [scheduleId, exerciseId, set.set_number, millis, set.weight]
            );
          }
  
          await client.query("COMMIT");
          console.log(`✅ TIME 세트 저장 완료 scheduleId=${scheduleId}`);
          res.sendStatus(200);
        } catch (e) {
          await client.query("ROLLBACK");
          console.error(`❌ TIME 세트 저장 실패 scheduleId=${scheduleId}:`, e);
          res.status(500).json({ message: "세트 저장 실패", detail: e.message });
        } finally {
          client.release();
        }
      }
    };
  }