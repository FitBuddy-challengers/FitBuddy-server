import express from "express";
import {
  checkAndUpdateLevel,
  handleAttendance,
  handleExercise,
  handlePhotoUpload,
  claimReward,
  getMonthlyRecord,
  getWeeklyRecord,
  getMonthlyCompletionRate,
  getDailyRecord,
  getWeightHistory,
  saveWeightRecord,
  getStoreItems,
  getUserOwnedItems,
  getStoreUserInfo,
  purchaseItem,
} from "../services/challenge.service.js";

const router = express.Router();

export default ({ pool, upload }) => {
  console.log("challenge router loaded");

  // 공용 userId 파싱 함수
  const parseUserId = (req) => {
    const raw = req.params.userId ?? req.query.userId;
    const id = parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
  };

  // -----------------------------------------------------
  // GET /api/challenge-levels
  // 챌린지 레벨 테이블 전체 조회
  // -----------------------------------------------------
  router.get("/api/challenge-levels", async (req, res) => {
    try {
      const rows = await pool.query(
        `SELECT level, required_attendance, required_photo, required_exercise,
                reward_attendance, reward_photo, reward_exercise
         FROM challenge_level
         ORDER BY level ASC`
      );
      res.json(rows.rows);
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // GET /api/user-challenge-progress/:userId
  // 사용자 챌린지 진행도 조회
  // -----------------------------------------------------
  router.get("/api/user-challenge-progress/:userId", async (req, res) => {
    const userId = parseUserId(req);
  
    try {
      const user = await pool.query(
        "SELECT id, level, coin FROM users WHERE id = $1",
        [userId]
      );
      if (!user.rows.length)
        return res.status(404).json({ message: "User not found" });
  
      const progress = await pool.query(
        `SELECT attendance_count, photo_count, exercise_count, last_attendance_date
         FROM user_challenge_progress WHERE user_id = $1`,
        [userId]
      );
  
      const level = user.rows[0].level ?? 1;
  
      // 레벨 요구치 + 보상 조회
      const reqRes = await pool.query(
        `SELECT required_attendance, required_photo, required_exercise,
                reward_attendance, reward_photo, reward_exercise
         FROM challenge_level WHERE level = $1`,
        [level]
      );
  
      const reqs = reqRes.rows[0] ?? {
        required_attendance: 0,
        required_photo: 0,
        required_exercise: 0,
        reward_attendance: 0,
        reward_photo: 0,
        reward_exercise: 0
      };
  
      const p = progress.rows[0] ?? {
        attendance_count: 0,
        photo_count: 0,
        exercise_count: 0,
        last_attendance_date: null
      };
  
      const pct = (num, den) =>
        den > 0 ? Math.min(100, Math.floor((num * 100) / den)) : 0;
  
      res.json({
        user_id: userId,
        level: level,
        coin: user.rows[0].coin ?? 0,
  
        // 앱 DTO에 맞게 변경됨
        required: {
          attendance: reqs.required_attendance,
          photo: reqs.required_photo,
          exercise: reqs.required_exercise
        },
  
        counts: {
          attendance: p.attendance_count,
          photo: p.photo_count,
          exercise: p.exercise_count
        },
  
        progress_percent: {
          attendancePercent: pct(p.attendance_count, reqs.required_attendance),
          photoPercent: pct(p.photo_count, reqs.required_photo),
          exercisePercent: pct(p.exercise_count, reqs.required_exercise)
        },
  
        reward: {
          attendance: reqs.reward_attendance,
          photo: reqs.reward_photo,
          exercise: reqs.reward_exercise
        },
  
        last_attendance_date: p.last_attendance_date
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // POST /api/challenge/attendance/:userId
  // 하루 출석 처리
  // -----------------------------------------------------
  router.post("/api/challenge/attendance/:userId", async (req, res) => {
    const userId = parseUserId(req);
    const today = new Date().toISOString().split("T")[0];

    try {
      const result = await handleAttendance(pool, userId, today);

      if (result.already)
        return res.status(200).json({ message: "already checked today" });

      res.json({ message: "attendance success" });
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // POST /api/challenge/exercise/:userId
  // 운동 완료 처리
  // -----------------------------------------------------
  router.post("/api/challenge/exercise/:userId", async (req, res) => {
    const userId = parseUserId(req);
    const today = new Date().toISOString().split("T")[0];

    try {
      const result = await handleExercise(pool, userId, today);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "no completed exercise today"
        });
      }

      res.json({ success: true, message: "exercise success" });
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // POST /api/challenge/claim
  // 챌린지 보상 수령
  // -----------------------------------------------------
  router.post(
    ["/challenge/claim", "/api/challenge/claim"],
    async (req, res) => {
      const { userId, challengeType } = req.body;

      if (!userId || !challengeType) {
        return res
          .status(400)
          .json({ success: false, message: "userId and challengeType required" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1) 먼저 레벨업 체크 (카운트 깎이기 전에)
        await checkAndUpdateLevel(client, userId);

        // 2) 그다음 보상 처리
        const result = await claimReward(client, userId, challengeType);

        if (!result.success) {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ success: false, message: result.message });
        }

        await client.query("COMMIT");

        res.json({
          success: true,
          updatedCoin: result.updatedCoin,
          updatedLevel: result.updatedLevel
        });
      } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ success: false, message: "server error" });
      } finally {
        client.release();
      }
    }
  );

  // -----------------------------------------------------
  // GET /api/challenge/monthly-records
  // 월간 사진 인증 기록 조회
  // -----------------------------------------------------
  router.get("/api/challenge/monthly-records", async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    try {
      const result = await getMonthlyRecord(pool, userId, year, month);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // POST /api/challenge/upload-photo
  // 사진 인증 업로드
  // -----------------------------------------------------
  router.post(
    "/api/challenge/upload-photo",
    upload.single("photo"),
    async (req, res) => {
      const { user_id, date } = req.body;
      const userId = parseInt(user_id, 10);
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

      if (!imageUrl)
        return res.status(400).json({ success: false, message: "image missing" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await handlePhotoUpload(pool, client, userId, date, imageUrl);

        await client.query("COMMIT");

        res.json({ success: true, message: "photo upload success" });
      } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ success: false, message: "server error" });
      } finally {
        client.release();
      }
    }
  );

  // -----------------------------------------------------
  // GET /api/challenge/weekly-photos
  // 주간 사진 조회
  // -----------------------------------------------------
  router.get("/api/challenge/weekly-photos", async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const startDate = req.query.startDate;

    try {
      const result = await getWeeklyRecord(pool, userId, startDate);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // GET /api/records/monthly-completion
  // 월간 운동 완료율 조회
  // -----------------------------------------------------
  router.get("/api/records/monthly-completion", async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    try {
      const result = await getMonthlyCompletionRate(pool, userId, year, month);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // GET /api/records/daily
  // 특정 날짜 운동 기록 조회
  // -----------------------------------------------------
  router.get("/api/records/daily", async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const date = req.query.date;

    try {
      const result = await getDailyRecord(pool, userId, date);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // GET /api/records/weight
  // 체중 기록 조회
  // -----------------------------------------------------
  router.get("/api/records/weight", async (req, res) => {
    const userId = parseInt(req.query.userId, 10);

    try {
      const records = await getWeightHistory(pool, userId);
      res.json(records.rows);
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // POST /api/records/weight
  // 체중 기록 저장
  // -----------------------------------------------------
  router.post("/api/records/weight", async (req, res) => {
    const { userId, date, weight, bodyFatPercentage, skeletalMuscleMass } =
      req.body;

    if (!userId || !date || !weight) {
      return res
        .status(400)
        .json({ message: "userId, date, weight required" });
    }

    try {
      await saveWeightRecord(
        pool,
        userId,
        date,
        weight,
        bodyFatPercentage,
        skeletalMuscleMass
      );
      res.status(201).json({ message: "record saved" });
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // GET /api/store/items
  // 상점 아이템 목록 조회
  // -----------------------------------------------------
  router.get("/api/store/items", async (req, res) => {
    try {
      const result = await getStoreItems(pool);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // GET /api/store/owned-items
  // 사용자가 보유한 아이템 조회
  // -----------------------------------------------------
  router.get("/api/store/owned-items", async (req, res) => {
    const userId = parseInt(req.query.userId, 10);

    try {
      const result = await getUserOwnedItems(pool, userId);
      res.json(result.rows.map((r) => r.item_id));
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // GET /api/store/balance/:userId
  // 상점에서 사용할 coin/level 조회
  // -----------------------------------------------------
  router.get("/api/store/balance/:userId", async (req, res) => {
    const userId = parseUserId(req);

    try {
      const result = await getStoreUserInfo(pool, userId);

      if (!result.rows.length)
        return res.status(404).json({ message: "User not found" });

      const { coin, level } = result.rows[0];
      res.json({ coin: coin ?? 0, level: level ?? 1 });
    } catch (err) {
      res.status(500).json({ message: "server error" });
    }
  });

  // -----------------------------------------------------
  // POST /api/store/purchase
  // 아이템 구매
  // -----------------------------------------------------
  router.post("/api/store/purchase", async (req, res) => {
    const { user_id, item_id } = req.body;
    const userId = parseInt(user_id, 10);
    const itemId = parseInt(item_id, 10);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await purchaseItem(client, userId, itemId);

      if (!result.success) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ success: false, message: result.message });
      }

      await client.query("COMMIT");

      res.json({ success: true, updatedCoin: result.updatedCoin });
    } catch (err) {
      await client.query("ROLLBACK");
      res.status(500).json({ success: false, message: "server error" });
    } finally {
      client.release();
    }
  });

  return router;
};
