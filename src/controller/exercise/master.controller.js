// src/controller/exercise/master.controller.js
//(운동 목록 + 즐겨찾기 + 숨김)
export default function masterController({ pool }) {
    return {
      // ───────────────────────────── 전체 운동 조회 ─────────────────────────────
      async getExercises(req, res) {
        try {
          const result = await pool.query("SELECT * FROM exercise");
          console.log(`📦 운동 목록 조회: ${result.rowCount}개`);
          res.json(result.rows);
        } catch (error) {
          console.error("❌ 운동 목록 조회 실패:", error);
          res.status(500).json({ message: "서버 오류" });
        }
      },
  
      // ───────────────────────────── 즐겨찾기 토글 ─────────────────────────────
      async toggleFavorite(req, res) {
        const exerciseId = parseInt(req.params.exerciseId, 10);
        const { isFavorite } = req.body;
  
        if (isFavorite === undefined || typeof isFavorite !== "boolean" || isNaN(exerciseId)) {
          return res.status(400).json({
            message: "필수 정보(exerciseId, isFavorite)가 누락되었거나 형식이 잘못되었습니다."
          });
        }
  
        try {
          const result = await pool.query(
            "UPDATE exercise SET is_favorite = $1 WHERE id = $2 RETURNING id, name, is_favorite",
            [isFavorite, exerciseId]
          );
  
          if (result.rowCount === 0)
            return res.status(404).json({ message: "해당 ID의 운동을 찾을 수 없습니다." });
  
          const updated = result.rows[0];
          console.log(`[⭐ 즐겨찾기 변경] id=${updated.id}, is_favorite=${updated.is_favorite}`);
  
          res.status(200).json({
            message: "즐겨찾기 상태가 변경되었습니다.",
            exerciseId: updated.id,
            isFavorite: updated.is_favorite
          });
        } catch (error) {
          console.error("❌ 즐겨찾기 상태 변경 실패:", error);
          res.status(500).json({ message: "서버 오류 발생" });
        }
      },
  
      // ───────────────────────────── 숨김 토글 ─────────────────────────────
      async toggleHidden(req, res) {
        const exerciseId = parseInt(req.params.exerciseId, 10);
        const { isHidden } = req.body;
  
        if (isHidden === undefined || typeof isHidden !== "boolean" || isNaN(exerciseId)) {
          return res.status(400).json({
            message: "필수 정보(exerciseId, isHidden)가 누락되었거나 형식이 잘못되었습니다."
          });
        }
  
        try {
          const result = await pool.query(
            "UPDATE exercise SET is_hidden = $1 WHERE id = $2 RETURNING id, name, is_hidden, is_favorite",
            [isHidden, exerciseId]
          );
  
          if (result.rowCount === 0)
            return res.status(404).json({ message: "해당 ID의 운동을 찾을 수 없습니다." });
  
          const updated = result.rows[0];
          console.log(`[🙈 숨김 상태 변경] id=${updated.id}, is_hidden=${updated.is_hidden}`);
  
          res.status(200).json({
            message: "운동 숨김 상태가 변경되었습니다.",
            exerciseId: updated.id,
            isHidden: updated.is_hidden,
            isFavorite: updated.is_favorite
          });
        } catch (error) {
          console.error("❌ 운동 숨김 상태 변경 실패:", error);
          res.status(500).json({ message: "서버 오류 발생" });
        }
      }
    };
  }