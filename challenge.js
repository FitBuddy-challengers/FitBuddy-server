// challenge.js
const express = require('express');
const router = express.Router();

module.exports = ({ pool, upload /* openai, uploadDir 필요없음 */ }) => {
  console.log("✅ challenge 라우터 로드됨");

  // ───────────────── 공용 유틸 ─────────────────
  function csvToArray(s) {
    return (s || '').split(',').map(v => v.trim()).filter(Boolean);
  }

  // ── 내부 유틸: 레벨업 확인 ──
  async function checkAndUpdateLevel(clientOrUserId, maybeUserId) {
    let client, userId;
    const hasExternalClient = typeof clientOrUserId === 'object' && clientOrUserId?.query;

    if (hasExternalClient) {
      client = clientOrUserId;
      userId = maybeUserId;
    } else {
      userId = clientOrUserId;
      client = await pool.connect();
      await client.query('BEGIN');
    }

    try {
      const progressResult = await client.query(
        `SELECT attendance_count, photo_count, exercise_count
         FROM user_challenge_progress WHERE user_id = $1`,
        [userId]
      );
      const userResult = await client.query(`SELECT level FROM users WHERE id = $1`, [userId]);

      if (!userResult.rows.length || !progressResult.rows.length) {
        if (!hasExternalClient) await client.query('ROLLBACK');
        return;
      }

      const currentLevel = userResult.rows[0].level;
      const nextLevel = currentLevel + 1;

      const reqRes = await client.query(
        `SELECT required_attendance, required_photo, required_exercise
         FROM challenge_level WHERE level = $1`,
        [nextLevel]
      );
      if (!reqRes.rowCount) {
        if (!hasExternalClient) await client.query('COMMIT');
        return;
      }

      const req = reqRes.rows[0];
      const prog = progressResult.rows[0];

      if (prog.attendance_count >= req.required_attendance &&
          prog.photo_count >= req.required_photo &&
          prog.exercise_count >= req.required_exercise) {
        await client.query(`UPDATE users SET level = $1 WHERE id = $2`, [nextLevel, userId]);
        console.log(`[🏆 레벨업] userId=${userId}, ${currentLevel} → ${nextLevel}`);
      }

      if (!hasExternalClient) await client.query('COMMIT');
    } catch (error) {
      if (!hasExternalClient) await client.query('ROLLBACK');
      console.error(`❌ 레벨업 확인 오류 userId=${userId}:`, error);
      throw error;
    } finally {
      if (!hasExternalClient) client.release();
    }
  }

  // ───────────────── 챌린지 레벨 조회 ─────────────────
  // GET /api/challenge-levels
  router.get('/api/challenge-levels', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT level, required_attendance, required_photo, required_exercise,
                reward_attendance, reward_photo, reward_exercise
         FROM challenge_level
         ORDER BY level ASC`
      );
      res.json(rows);
    } catch (e) {
      console.error('❌ 레벨 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // ───────────────── 사용자 챌린지 진행도 ─────────────────
  // GET /api/user-challenge-progress/:userId
  router.get('/api/user-challenge-progress/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ message: '유효한 userId가 필요합니다.' });
    try {
      const progQ = `
        SELECT attendance_count, photo_count, exercise_count, last_attendance_date
        FROM user_challenge_progress WHERE user_id = $1`;
      const userQ = `SELECT id, level, coin FROM users WHERE id = $1`;
      const reqQ  = `SELECT required_attendance, required_photo, required_exercise
                     FROM challenge_level WHERE level = $1`;

      const [prog, user] = await Promise.all([
        pool.query(progQ, [userId]),
        pool.query(userQ, [userId])
      ]);
      if (!user.rows.length) return res.status(404).json({ message: 'User not found' });

      const level = user.rows[0].level ?? 1;
      const reqRow = await pool.query(reqQ, [level]);
      const reqs = reqRow.rows[0] || { required_attendance: 0, required_photo: 0, required_exercise: 0 };

      const p = prog.rows[0] || { attendance_count: 0, photo_count: 0, exercise_count: 0, last_attendance_date: null };

      const clampPct = (num, den) => (den > 0 ? Math.min(100, Math.floor((num * 100) / den)) : 0);

      res.json({
        user_id: userId,
        level,
        coin: user.rows[0].coin ?? 0,
        counts: {
          attendance: p.attendance_count,
          photo: p.photo_count,
          exercise: p.exercise_count
        },
        required: {
          attendance: reqs.required_attendance,
          photo: reqs.required_photo,
          exercise: reqs.required_exercise
        },
        progress_percent: {
          attendance: clampPct(p.attendance_count, reqs.required_attendance),
          photo: clampPct(p.photo_count, reqs.required_photo),
          exercise: clampPct(p.exercise_count, reqs.required_exercise)
        },
        last_attendance_date: p.last_attendance_date
      });
    } catch (e) {
      console.error('❌ 진행도 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // ───────────────── 출석 1회 기록 ─────────────────
  router.post('/api/challenge/attendance/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const today = new Date().toISOString().split('T')[0];
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid userId' });

    try {
      const result = await pool.query(
        `SELECT last_attendance_date FROM user_challenge_progress WHERE user_id = $1`,
        [userId]
      );
      if (!result.rows.length) return res.status(404).json({ message: 'User progress not found' });

      const lastDate = result.rows[0].last_attendance_date;
      const already = lastDate && lastDate.toISOString().split('T')[0] === today;
      if (already) return res.status(200).json({ message: '오늘 이미 출석함' });

      await pool.query(
        `UPDATE user_challenge_progress
         SET attendance_count = attendance_count + 1, last_attendance_date = $1
         WHERE user_id = $2`,
        [today, userId]
      );

      const rewardResult = await pool.query(
        `SELECT attendance_count FROM user_challenge_progress WHERE user_id = $1`,
        [userId]
      );
      if (rewardResult.rows[0].attendance_count === 5) {
        await pool.query(`UPDATE users SET coin = coin + 300 WHERE id = $1`, [userId]);
        console.log(`🎁 출석 5회 보상 지급 userId=${userId}`);
      }

      await checkAndUpdateLevel(userId);
      console.log(`✅ 출석 처리 완료 userId=${userId}`);
      res.json({ message: '출석 처리 완료' });
    } catch (err) {
      console.error('❌ 출석 처리 실패:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ───────────────── 운동 1회 기록 ─────────────────
  router.post('/api/challenge/exercise/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const today = new Date().toISOString().split('T')[0];

    try {
      const result = await pool.query(
        `SELECT 1 FROM user_exercise_log WHERE user_id = $1 AND DATE(date) = $2`,
        [userId, today]
      );

      if (result.rowCount === 0) {
        const exerciseDone = await pool.query(`
          SELECT COUNT(*) FROM exercise_schedule
          WHERE DATE(date) = $1 AND is_completed = true
          AND exercise_plan_id IN (SELECT id FROM exercise_plan WHERE user_id = $2)
        `, [today, userId]);

        if (parseInt(exerciseDone.rows[0].count) > 0) {
          await pool.query(`INSERT INTO user_exercise_log (user_id, date) VALUES ($1, $2)`, [userId, today]);
          await pool.query(`
            INSERT INTO user_challenge_progress (user_id, exercise_count, last_attendance_date)
            VALUES ($1, 1, $2)
            ON CONFLICT (user_id) DO UPDATE
            SET exercise_count = user_challenge_progress.exercise_count + 1,
                last_attendance_date = $2;
          `, [userId, today]);

          await checkAndUpdateLevel(userId);
        }
      }

      console.log(`✅ 운동 처리 완료 userId=${userId}`);
      res.json({ message: '운동 처리 완료' });
    } catch (err) {
      console.error('❌ 운동 처리 실패:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ───────────────── 챌린지 보상 수령 ─────────────────
  // 기존 경로 유지
  router.post('/challenge/claim', claimHandler);
  // /api 접두 alias 추가
  router.post('/api/challenge/claim', claimHandler);

  async function claimHandler(req, res) {
    const { userId, challengeType } = req.body;
    if (!userId || !challengeType) {
      return res.status(400).json({ success: false, message: '사용자 ID와 챌린지 타입은 필수입니다.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const progressQuery = `
        SELECT 
          u.level, u.coin,
          p.attendance_count, p.photo_count, p.exercise_count,
          cl.required_attendance, cl.required_photo, cl.required_exercise,
          cl.reward_attendance, cl.reward_photo, cl.reward_exercise
        FROM users u
        JOIN user_challenge_progress p ON u.id = p.user_id
        JOIN challenge_level cl ON u.level = cl.level
        WHERE u.id = $1 FOR UPDATE;
      `;
      const progressResult = await client.query(progressQuery, [userId]);
      if (!progressResult.rows.length) throw new Error('사용자 또는 챌린지 정보를 찾을 수 없습니다.');

      const data = progressResult.rows[0];
      let requiredCount = 0, currentCount = 0, rewardAmount = 0, countColumn = '';

      switch (challengeType) {
        case 'attendance':
          requiredCount = data.required_attendance;
          currentCount = data.attendance_count;
          rewardAmount = data.reward_attendance;
          countColumn = 'attendance_count';
          break;
        case 'exercise':
          requiredCount = data.required_exercise;
          currentCount = data.exercise_count;
          rewardAmount = data.reward_exercise;
          countColumn = 'exercise_count';
          break;
        case 'photo':
          requiredCount = data.required_photo;
          currentCount = data.photo_count;
          rewardAmount = data.reward_photo;
          countColumn = 'photo_count';
          break;
        default:
          throw new Error('알 수 없는 챌린지 타입입니다.');
      }

      if (currentCount < requiredCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: '아직 챌린지 목표를 달성하지 못했습니다.' });
      }

      await client.query(`UPDATE users SET coin = coin + $1 WHERE id = $2`, [rewardAmount, userId]);
      await client.query(
        `UPDATE user_challenge_progress SET ${countColumn} = GREATEST(${countColumn} - $1, 0) WHERE user_id = $2`,
        [requiredCount, userId]
      );

      await checkAndUpdateLevel(client, userId);

      const finalUserResult = await client.query('SELECT coin, level FROM users WHERE id = $1', [userId]);
      const finalUser = finalUserResult.rows[0];

      await client.query('COMMIT');
      console.log(`🎉 보상 지급 완료 type=${challengeType}, amount=${rewardAmount}`);
      res.status(200).json({
        success: true,
        message: '보상을 획득했습니다!',
        updatedCoin: finalUser.coin,
        updatedLevel: finalUser.level
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ 챌린지 보상 지급 실패:', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
      client.release();
    }
  }

  // ───────────────── 월간 사진 인증일(캘린더) ─────────────────
  // GET /challenge/monthly-records  (명세상 무접두 사용 흔적)
  router.get('/challenge/monthly-records', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10); // ✅ 전역변수 오탈자 제거

    if (isNaN(userId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({ message: 'userId, year, month는 필수이며 숫자 형식이어야 합니다.' });
    }

    try {
      const result = await pool.query(`
        SELECT DISTINCT to_char(created_at, 'YYYY-MM-DD') as date
        FROM photo_challenges
        WHERE user_id = $1
          AND EXTRACT(YEAR FROM created_at) = $2
          AND EXTRACT(MONTH FROM created_at) = $3
        ORDER BY date ASC;
      `, [userId, year, month]);

      console.log(`[ℹ️ 월간 사진 인증일] userId=${userId} ${year}-${month} 개수=${result.rows.length}`);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error('❌ 월간 사진 인증 기록 조회 실패:', error);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // ───────────────── 사진 업로드(인증) ─────────────────
  // POST /api/challenge/upload-photo
  router.post('/api/challenge/upload-photo', upload.single('photo'), async (req, res) => {
    const { user_id, date } = req.body;
    const userId = parseInt(user_id, 10);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    console.log(`[🖼 사진 인증] userId=${userId}, date=${date}, file=${req.file?.filename}`);

    if (isNaN(userId) || !date || !imageUrl) {
      return res.status(400).json({ success: false, message: '필수 정보가 누락되었습니다.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM photo_challenges WHERE user_id = $1 AND created_at = $2',
        [userId, date]
      );

      if (existing.rows.length > 0) {
        await client.query(
          'UPDATE photo_challenges SET image_url = $1 WHERE user_id = $2 AND created_at = $3',
          [imageUrl, userId, date]
        );
        console.log(`[🖼 사진 인증 수정] userId=${userId}, date=${date}`);
      } else {
        await client.query(
          'INSERT INTO photo_challenges (user_id, created_at, image_url) VALUES ($1, $2, $3)',
          [userId, date, imageUrl]
        );
        await client.query(
          'UPDATE user_challenge_progress SET photo_count = photo_count + 1 WHERE user_id = $1',
          [userId]
        );
        console.log(`[🖼 사진 인증 성공] userId=${userId}, date=${date}, photo_count +1`);
      }

      // ✅ 여기! 사진 인증 처리 후 커밋 전에 레벨업 체크
      await checkAndUpdateLevel(client, userId);

      await client.query('COMMIT');
      res.json({ success: true, message: '사진이 성공적으로 인증되었습니다.' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ 사진 인증 실패:', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
      client.release();
    }
  });

  // ───────────────── 주간 사진 인증 목록 ─────────────────
  // GET /api/challenge/weekly-photos
  router.get('/api/challenge/weekly-photos', async (req, res) => {
    const userId = parseInt(req.query.userId);
    const startDate = req.query.startDate;
    if (isNaN(userId) || !startDate) return res.status(400).json({ message: "userId와 startDate는 필수입니다." });

    try {
      const result = await pool.query(
        `SELECT to_char(created_at, 'YYYY-MM-DD') as date, image_url 
         FROM photo_challenges 
         WHERE user_id = $1 AND created_at BETWEEN $2::date AND $2::date + 6`,
        [userId, startDate]
      );
      console.log(`[ℹ️ 주간 사진 조회] userId=${userId}, start=${startDate}, count=${result.rows.length}`);
      res.json(result.rows.map(r => ({ image_url: r.image_url, date: r.date })));
    } catch (error) {
      console.error('❌ 주간 사진 조회 실패:', error);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // ───────────────── 기록/통계 ─────────────────
  // GET /api/records/monthly-completion?userId=&year=&month=
  router.get('/api/records/monthly-completion', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (isNaN(userId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({ message: 'userId, year, month는 필수입니다.' });
    }
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    try {
      const result = await pool.query(`
        SELECT
          to_char(s.date, 'YYYY-MM-DD') AS date,
          (COUNT(CASE WHEN s.is_completed THEN 1 END) * 100.0 / COUNT(*))::integer AS completion_rate
        FROM exercise_schedule s
        JOIN exercise_plan p ON s.exercise_plan_id = p.id
        WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3
        GROUP BY s.date
        ORDER BY s.date;
      `, [userId, startDate, endDate]);

      console.log(`[ℹ️ 월별 완료율] userId=${userId}, ${year}-${month}, rows=${result.rows.length}`);
      res.json(result.rows);
    } catch (e) {
      console.error('❌ 월별 운동 완료율 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // GET /api/records/daily?userId=&date=
  router.get('/api/records/daily', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const date = req.query.date;
    if (isNaN(userId) || !date) return res.status(400).json({ message: 'userId와 date는 필수입니다.' });

    try {
      const planResult = await pool.query(
        `SELECT id FROM exercise_plan WHERE user_id = $1 AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
        [userId, date]
      );

      if (!planResult.rowCount) return res.json([]);

      const planId = planResult.rows[0].id;
      const schedResult = await pool.query(`
        SELECT s.id AS schedule_id, s.is_completed, e.name AS exercise_name, e.is_time_type
        FROM exercise_schedule s
        JOIN exercise e ON s.exercise_id = e.id
        WHERE s.exercise_plan_id = $1 AND s.date = $2
        ORDER BY s.exercise_order;
      `, [planId, date]);

      const records = [];
      for (const sched of schedResult.rows) {
        let sets = 0, reps = null, seconds = null;

        if (sched.is_time_type) {
          const timeRes = await pool.query(
            `SELECT COUNT(*) AS count, MAX(elapsed_time_millis) AS max_ms FROM exercise_time WHERE schedule_id = $1`,
            [sched.schedule_id]
          );
          sets = parseInt(timeRes.rows[0].count || 0);
          seconds = Math.floor(parseInt(timeRes.rows[0].max_ms || 0) / 1000);
        } else {
          const repsRes = await pool.query(
            `SELECT COUNT(*) AS count, MAX(reps) AS max_reps FROM exercise_reps WHERE schedule_id = $1`,
            [sched.schedule_id]
          );
          sets = parseInt(repsRes.rows[0].count || 0);
          reps = parseInt(repsRes.rows[0].max_reps || 0);
        }

        records.push({
          exercise_name: sched.exercise_name,
          reps, sets, seconds,
          is_completed: sched.is_completed,
          is_time_type: sched.is_time_type
        });
      }

      console.log(`[ℹ️ 일별 기록 조회] userId=${userId}, date=${date}, count=${records.length}`);
      res.json(records);
    } catch (e) {
      console.error('❌ 특정 날짜 운동 기록 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // GET /api/records/monthly-summary?userId=
  router.get('/api/records/monthly-summary', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'userId는 필수입니다.' });

    try {
      const date = new Date();
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

      const baseQuery = `
        WITH monthly_completed_workouts AS (
          SELECT s.exercise_id, (r.time_seconds * 1000) AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_reps r ON s.id = r.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 AND r.is_completed = true AND r.time_seconds > 0
          UNION ALL
          SELECT s.exercise_id, t.elapsed_time_millis AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_time t ON s.id = t.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 AND t.is_completed = true AND t.elapsed_time_millis > 0
        )
      `;

      const allWorkoutsResult = await pool.query(`
        ${baseQuery}
        SELECT e.part, w.duration_ms
        FROM monthly_completed_workouts w
        JOIN exercise e ON w.exercise_id = e.id;
      `, [userId, firstDay, lastDay]);

      const partDurationMap = {};
      allWorkoutsResult.rows.forEach(row => {
        const parts = csvToArray(row.part);
        const duration = parseFloat(row.duration_ms);
        if (parts.length > 0 && duration > 0) {
          const per = duration / parts.length;
          parts.forEach(part => {
            partDurationMap[part] = (partDurationMap[part] || 0) + per;
          });
        }
      });

      let topPartName = null, maxDuration = -1;
      for (const part in partDurationMap) {
        if (partDurationMap[part] > maxDuration) { maxDuration = partDurationMap[part]; topPartName = part; }
      }
      const mostFrequentPart = topPartName ? { part: topPartName, count: Math.round(maxDuration) } : null;

      let leastPartName = null, minDuration = Infinity;
      for (const part in partDurationMap) {
        if (partDurationMap[part] < minDuration) { minDuration = partDurationMap[part]; leastPartName = part; }
      }
      const leastFrequentPart = leastPartName ? { part: leastPartName, count: Math.round(minDuration) } : null;

      const exerciseResult = await pool.query(`
        ${baseQuery}
        SELECT e.name, SUM(w.duration_ms) as total_duration
        FROM monthly_completed_workouts w
        JOIN exercise e ON w.exercise_id = e.id
        GROUP BY e.name
        ORDER BY total_duration DESC
        LIMIT 1;
      `, [userId, firstDay, lastDay]);

      res.json({
        mostFrequentPart,
        leastFrequentPart,
        mostFrequentExercise: exerciseResult.rows[0] || null
      });
    } catch (e) {
      console.error('❌ 월간 요약 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // GET /api/records/radar-data?userId=&period=(week|month|year|all)
  router.get('/api/records/radar-data', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const period = req.query.period;
    if (isNaN(userId) || !period) return res.status(400).json({ message: 'userId와 period는 필수입니다.' });

    try {
      const now = new Date();
      let startDate;
      switch (period) {
        case 'week':  startDate = new Date(new Date().setDate(now.getDate() - 7)); break;
        case 'month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
        case 'year':  startDate = new Date(now.getFullYear(), 0, 1); break;
        case 'all':   startDate = new Date(0); break;
        default: return res.status(400).json({ message: '잘못된 period 값입니다.' });
      }
      const startDateString = startDate.toISOString().split('T')[0];

      const timeResult = await pool.query(`
        SELECT e.part, (t.elapsed_time_millis / 60000.0 * e.mets) as volume
        FROM exercise_time t
        JOIN exercise_schedule s ON t.schedule_id = s.id
        JOIN exercise_plan p ON s.exercise_plan_id = p.id
        JOIN exercise e ON t.exercise_id = e.id
        WHERE p.user_id = $1 AND s.date >= $2 AND t.is_completed = true AND t.elapsed_time_millis > 0;
      `, [userId, startDateString]);

      const repsResult = await pool.query(`
        SELECT e.part, (r.time_seconds / 60.0 * e.mets) as volume
        FROM exercise_reps r
        JOIN exercise_schedule s ON r.schedule_id = s.id
        JOIN exercise_plan p ON s.exercise_plan_id = p.id
        JOIN exercise e ON r.exercise_id = e.id
        WHERE p.user_id = $1 AND s.date >= $2 AND r.is_completed = true AND r.time_seconds > 0;
      `, [userId, startDateString]);

      const partVolumeMap = { "가슴": 0, "등": 0, "하체": 0, "어깨": 0, "팔": 0, "복근": 0, "유산소": 0 };
      const processRows = (rows) => {
        rows.forEach(row => {
          const parts = csvToArray(row.part);
          const volume = parseFloat(row.volume);
          if (parts.length > 0 && volume > 0) {
            const per = volume / parts.length;
            parts.forEach(part => {
              if (part in partVolumeMap) partVolumeMap[part] += per;
            });
          }
        });
      };
      processRows(timeResult.rows);
      processRows(repsResult.rows);

      for (const key in partVolumeMap) partVolumeMap[key] = parseFloat(partVolumeMap[key].toFixed(2));

      console.log(`[📊 레이더 데이터 반환]`, partVolumeMap);
      res.json(partVolumeMap);
    } catch (e) {
      console.error('❌ 레이더 데이터 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // 체중 기록
  // GET /api/records/weight?userId=
  router.get('/api/records/weight', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'userId는 필수입니다.' });

    try {
      const result = await pool.query(
        `SELECT id, user_id, to_char(date, 'YYYY-MM-DD') AS date, weight, body_fat_percentage, skeletal_muscle_mass 
         FROM weight_records WHERE user_id = $1 ORDER BY date ASC`,
        [userId]
      );
      console.log(`[ℹ️ 체중 기록 조회] userId=${userId}, count=${result.rowCount}`);
      res.json(result.rows);
    } catch (error) {
      console.error('❌ 신체 기록 조회 실패:', error);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // POST /api/records/weight
  router.post('/api/records/weight', async (req, res) => {
    const { userId, date, weight, bodyFatPercentage, skeletalMuscleMass } = req.body;
    if (!userId || !date || !weight) return res.status(400).json({ message: 'userId, date, weight는 필수입니다.' });

    try {
      await pool.query(`
        INSERT INTO weight_records (user_id, date, weight, body_fat_percentage, skeletal_muscle_mass)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, date)
        DO UPDATE SET
          weight = EXCLUDED.weight,
          body_fat_percentage = EXCLUDED.body_fat_percentage,
          skeletal_muscle_mass = EXCLUDED.skeletal_muscle_mass;
      `, [userId, date, weight, bodyFatPercentage, skeletalMuscleMass]);

      console.log(`[✅ 체중 기록 저장] userId=${userId}, date=${date}`);
      res.status(201).json({ message: '신체 기록이 성공적으로 저장되었습니다.' });
    } catch (error) {
      console.error('❌ 신체 기록 저장 실패:', error);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // ───────────────── 상점(Store) ─────────────────
  // 아이템 전체 목록
  router.get('/api/store/items', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, name, price, required_level, image_url, "type", description
        FROM items
        ORDER BY required_level ASC, price ASC, id ASC
      `);
      res.json(rows);
    } catch (e) {
      console.error('❌ 아이템 목록 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // 사용자 소유 아이템
  router.get('/api/store/owned-items', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ message: "userId는 필수입니다." });

    try {
      const result = await pool.query(
        'SELECT item_id FROM user_owned_items WHERE user_id = $1',
        [userId]
      );
      const ownedItemIds = result.rows.map(r => r.item_id);
      console.log(`[🛍 소유 아이템 조회] userId=${userId}, 개수=${ownedItemIds.length}`);
      res.json(ownedItemIds);
    } catch (error) {
      console.error('❌ 소유 아이템 조회 실패:', error);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // 코인/레벨 잔액 조회
  router.get('/api/store/balance/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ message: '유효한 userId가 필요합니다.' });

    try {
      const { rows } = await pool.query('SELECT coin, level FROM users WHERE id = $1', [userId]);
      if (!rows.length) return res.status(404).json({ message: 'User not found' });
      res.json({ coin: rows[0].coin ?? 0, level: rows[0].level ?? 1 });
    } catch (e) {
      console.error('❌ 잔액 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // 아이템 구매
  router.post('/api/store/purchase', async (req, res) => {
    const { user_id, item_id } = req.body;
    const userId = parseInt(user_id, 10);
    const itemId = parseInt(item_id, 10);

    console.log(`[🛒 아이템 구매 요청] userId=${userId}, itemId=${itemId}`);

    if (isNaN(userId) || isNaN(itemId)) {
      return res.status(400).json({ success: false, message: '사용자 ID와 아이템 ID는 필수입니다.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemResult = await client.query(
        'SELECT price, required_level FROM items WHERE id = $1 FOR UPDATE',
        [itemId]
      );
      if (!itemResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: '존재하지 않는 아이템입니다.' });
      }
      const item = itemResult.rows[0];

      const userResult = await client.query(
        'SELECT level, coin FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (!userResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
      }
      const user = userResult.rows[0];

      if (user.level < item.required_level) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: `레벨 ${item.required_level}이 필요합니다.` });
      }
      if (user.coin < item.price) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: '코인이 부족합니다.' });
      }

      const owned = await client.query(
        'SELECT 1 FROM user_owned_items WHERE user_id = $1 AND item_id = $2',
        [userId, itemId]
      );
      if (owned.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: '이미 소유하고 있는 아이템입니다.' });
      }

      const newCoin = user.coin - item.price;
      await client.query('UPDATE users SET coin = $1 WHERE id = $2', [newCoin, userId]);
      await client.query(
        'INSERT INTO user_owned_items (user_id, item_id) VALUES ($1, $2)',
        [userId, itemId]
      );

      await client.query('COMMIT');
      console.log(`✅ 구매 성공 userId=${userId}, itemId=${itemId}, 남은 코인=${newCoin}`);
      res.json({ success: true, message: '구매에 성공했습니다!', updatedCoin: newCoin });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ 아이템 구매 실패:', error);
      res.status(500).json({ success: false, message: '구매 처리 중 서버 오류가 발생했습니다.' });
    } finally {
      client.release();
    }
  });

  return router;
};
