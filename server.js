
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = 3000;

console.log("✅ server.js 실제 실행됨 - 최상단 로그 확인"); 

app.use(cors());

app.use(bodyParser.json());

// PostgreSQL 연결
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Nodemailer 설정
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 메모리 임시 저장소
const otpStore = {};
const pendingUsers = {};

// ✅ 회원가입 정보 임시 저장
app.post('/signup', (req, res) => {
    const { email, password } = req.body;
    pendingUsers[email] = { email, password };
    console.log('회원가입 요청 저장됨:', pendingUsers);
    res.status(200).send({ message: '회원가입 정보 임시 저장 완료' });
});

// ✅ OTP 전송
app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: '챌린저스 회원가입 인증번호',
            text: `인증번호는 ${otp} 입니다.`,
        });

        otpStore[email] = otp;
        console.log(`[OTP 전송] ${email} → OTP: ${otp}`);
        res.status(200).send({ message: 'OTP 전송 완료' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'OTP 전송 실패' });
    }
});

// ✅ OTP 검증 및 DB 저장
app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    console.log(`[OTP 검증 요청] email: ${email}, 사용자 입력 OTP: ${otp}`);
    console.log(`[서버 저장된 OTP] ${otpStore[email]}`);

    const userData = pendingUsers[email];
    if (!userData) {
        return res.status(400).send({ message: '회원가입 정보가 존재하지 않습니다.' });
    }

    try {
        const alreadyExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (alreadyExists.rows.length > 0) {
            console.log(`[중복 인증 시도] 이미 가입된 사용자: ${email}`);
            return res.status(200).send({ message: '이미 인증이 완료된 사용자입니다.' });
        }

        if (otpStore[email] && otpStore[email] === otp) {
            delete otpStore[email];

            await pool.query(
                'INSERT INTO users (email, password) VALUES ($1, $2)',
                [userData.email, userData.password]
            );
            delete pendingUsers[email];

            console.log(`[회원가입 성공] email: ${email}`);
            return res.status(200).send({ message: '회원가입 완료' });
        } else {
            console.log(`[인증 실패] email: ${email}, 입력 OTP: ${otp}, 저장된 OTP: ${otpStore[email]}`);
            return res.status(400).send({ message: '인증 실패: 인증번호가 만료되었거나 틀렸습니다.' });
        }
    } catch (error) {
        console.error('[DB 오류]', error);
        return res.status(500).send({ message: '회원가입 실패: DB 처리 중 오류' });
    }
});

// ✅ 프로필 정보 업데이트
app.post('/update-profile', async (req, res) => {
    const {
        email, name, age_group, gender,
        height, weight, diseases,
        workout_level, preferred_workouts, equipment
    } = req.body;

    console.log(`[프로필 저장 요청] email: ${email}`);

    try {
        const result = await pool.query(`
            UPDATE users SET 
                name = $1,
                age_group = $2,
                gender = $3,
                height = $4,
                weight = $5,
                diseases = $6,
                workout_level = $7,
                preferred_workouts = $8,
                equipment = $9
            WHERE email = $10
        `, [
            name,
            age_group,
            gender,
            height,
            weight,
            diseases.join(','),
            workout_level,
            preferred_workouts.join(','),
            equipment.join(','),
            email
        ]);

        if (result.rowCount === 0) {
            return res.status(404).send({ message: '해당 이메일의 사용자가 없습니다.' });
        }

        console.log(`[프로필 저장 완료] ${email}`);
        res.status(200).send({ message: '프로필 저장 완료' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'DB 업데이트 실패' });
    }
});

// ✅ [로그인 기능 추가]
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND password = $2',
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).send({ message: '이메일 또는 비밀번호가 일치하지 않습니다.' });
        }

        console.log(`[로그인 성공] ${email}`);
        res.status(200).send({ message: '로그인 성공', user: result.rows[0] });
    } catch (error) {
        console.error('[로그인 오류]', error);
        res.status(500).send({ message: '로그인 중 서버 오류' });
    }
});

//앱 처음 실행 시 서버에서 더미 플랜 및 스케줄 자동 생성.
app.post('/api/create-dummy-plan', async (req, res) => {
  const { userId, date } = req.body;
  console.log(`[더미 플랜 요청] userId: ${userId}, date: ${date}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // [1] 중복 확인 (동시 요청 방지 위해 FOR UPDATE 사용)
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
      await client.query('ROLLBACK');
      return res.status(200).send({
        message: "이미 오늘 플랜이 존재합니다",
        planId,
        date: formattedDate
      });
    }

    // [2] 운동 플랜 생성
    const planResult = await client.query(`
      INSERT INTO exercise_plan (
        user_id, start_date, end_date, day, day_pattern, completed_days, is_dummy
      ) VALUES ($1, $2, $2, $3, $4, $5, true) RETURNING id
    `, [
      userId,
      date,
      [new Date(date).getDate()],
      ['dummy'],
      null
    ]);
    const planId = planResult.rows[0].id;

    // [3] 더미 운동 정보 삽입
    const dummyExercises = [
      { exerciseId: 15, exOrder: 1, sets: 3, reps: 12 },
      { exerciseId: 120, exOrder: 2, sets: 3, reps: 10 },
      { exerciseId: 8, exOrder: 3, sets: 1, reps: 60 }
    ];

    for (const item of dummyExercises) {
      const schedResult = await client.query(`
        INSERT INTO exercise_schedule (
          exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
        ) VALUES ($1, $2, $3, false, true, $4) RETURNING id
      `, [planId, date, item.exOrder, item.exerciseId]);
      const schedId = schedResult.rows[0].id;

      const typeResult = await client.query(
        `SELECT is_time_type FROM exercise WHERE id = $1`,
        [item.exerciseId]
      );
      const isTime = Boolean(typeResult.rows[0]?.is_time_type);

      if (isTime) {
        await client.query(`
          INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
          VALUES ($1, $2, 1, $3, false)
        `, [schedId, item.exerciseId, item.reps * 1000]); // 분 → 초 변환
      } else {
        for (let i = 1; i <= item.sets; i++) {
          await client.query(`
            INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
            VALUES ($1, $2, $3, 0, $4, false)
          `, [schedId, item.exerciseId, i, item.reps]);
        }
      }
    }

    // [4] 날짜 포맷 반환용 조회
    const result = await client.query(
      `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM exercise_plan WHERE id = $1`,
      [planId]
    );
    const formattedDate = result.rows[0]?.start_date || null;

    // [5] 커밋 및 응답
    await client.query('COMMIT');
    console.log("✅ 더미 플랜 및 운동 삽입 완료");

    res.status(200).send({
      message: '더미 운동 계획 생성 완료',
      planId,
      date: formattedDate
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 더미 계획 생성 실패:', error);
    res.status(500).send({ message: '서버 오류' });
  } finally {
    client.release();
  }
});

// 서버에서 exercise 테이블 데이터를 json으로 리턴해야함! 그래야 안드로이드에서 getAllExercises()가 잘 작동.
app.get("/api/exercises", async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM exercise");
      res.json(result.rows);
    } catch (error) {
      console.error("운동 목록 조회 실패:", error);
      res.status(500).json({ message: "서버 오류" });
    }
  });
  
app.post('/api/schedule', async (req, res) => {
  console.log("[POST] /api/schedule 도착");
  console.log("🔥 req.body 원본:", req.body);

  const { planId, date, exerciseOrder, exercise_id, exerciseId } = req.body;
 // const exId = exercise_id ?? exerciseId;
 const rawExId = exercise_id ?? exerciseId;
const exId = parseInt(rawExId);
if (isNaN(exId)) {
  console.error("❌ 잘못된 exercise_id:", rawExId);
  return res.status(400).json({ message: "유효하지 않은 exercise_id" });
}

  console.log("요청 데이터:", req.body);
  console.log("타입 확인 ▶️", {
    planId: typeof planId,
    date: typeof date,
    exerciseOrder: typeof exerciseOrder,
    exercise_id: typeof exercise_id
  });
  console.log("▶️ planId:", planId, "date:", date, "exerciseOrder:", exerciseOrder, "exercise_id:", exercise_id);

  if (planId === undefined || date === undefined || exId === undefined) {
    return res.status(400).json({ message: "필수 값이 누락되었습니다." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT MAX(exercise_order) AS max_order FROM exercise_schedule WHERE exercise_plan_id = $1',
      [planId]
    );
    const newOrder = (rows[0].max_order || 0) + 1;

    const result = await client.query(
      `INSERT INTO exercise_schedule (
        exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [planId, date, newOrder, false, false, exId] //  이제 6개 정확히 매핑
    );
    console.log("🔥 최종 exercise_id:", exId);

    const scheduleId = result.rows[0].id;

    const typeRes = await client.query(`SELECT is_time_type FROM exercise WHERE id = $1`, [exId]);
    const isTimeType = typeRes.rows[0]?.is_time_type;

    // ✅ 세트 삽입 로직에 try-catch 추가
    console.log("⏱ 운동 타입:", isTimeType ? "TIME 기반" : "REPS 기반");

    try {
      if (isTimeType) {
        for (let i = 1; i <= 3; i++) {
          console.log(`⏳ TIME 세트 삽입 #${i}`);
          await client.query(
            `INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
            VALUES ($1, $2, $3, $4, false)`,
            [scheduleId, exId, i, 600000]
          );
        }
      } else {
        for (let i = 1; i <= 3; i++) {
          console.log(`🏋️ REPS 세트 삽입 #${i}`);
          await client.query(
            `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
             VALUES ($1, $2, $3, 0, 12, false)`,
            [scheduleId, exId, i]
          );
        }
      }
    } catch (err) {
      console.error("🔥 세트 insert 중 에러:", err.message, err.stack);
      throw err; // rollback 유도
    }

        await client.query('COMMIT');
        res.json({ scheduleId, exerciseId: exId });

      } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ 운동 추가 실패:", e);
        res.status(500).send("Error adding exercise");
      } finally {
        client.release();
      }
});

// 운동 스케줄 수정 (기본 세트 자동 생성: reps = 12x3, time = 10분x3)
app.post("/api/schedule/:scheduleId/exercise", async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.scheduleId);
    const { exercise_id } = req.body;

    const exercise = await pool.query(
      "SELECT is_time_type FROM exercise WHERE id = $1",
      [exercise_id]
    );
    const isTimeType = exercise.rows[0]?.is_time_type;

    // ✅ 먼저 exercise_schedule에 exercise_id 설정
    await pool.query(
      `UPDATE exercise_schedule SET exercise_id = $1 WHERE id = $2`,
      [exercise_id, scheduleId]
    );

    if (isTimeType) {
      // ✅ time 기반: 10분(600초) × 3세트
      for (let i = 1; i <= 3; i++) {
        await pool.query(
          `INSERT INTO exercise_time
           (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed) 
           VALUES ($1, $2, $3, $4, false)`,
          [scheduleId, exercise_id, i, 600]
        );
      }
    } else {
      // ✅ reps 기반: 12회 × 3세트
      for (let i = 1; i <= 3; i++) {
        await pool.query(
          `INSERT INTO exercise_reps 
           (schedule_id, exercise_id, set_number, weight, reps) 
           VALUES ($1, $2, $3, 0, 12)`,
          [scheduleId, exercise_id, i]
        );
      }
    }

    res.status(201).json({ message: "운동 추가 성공 (기본 세트 적용됨)" });
  } catch (error) {
    console.error("❌ 운동 추가 실패:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

app.get("/api/schedule/:scheduleId/exercise-info", async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId, 10);

  if (isNaN(scheduleId)) {
    return res.status(400).json({ message: "Invalid scheduleId" });
  }

  try {
    const result = await pool.query(`
      SELECT e.id, e.name, e.is_time_type
      FROM exercise_schedule s
      JOIN exercise e ON s.exercise_id = e.id
      WHERE s.id = $1
    `, [scheduleId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Exercise not found" });
    }

    res.json(result.rows[0]);  // { id, name, is_time_type }
  } catch (err) {
    console.error("🚨 운동 정보 조회 실패:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//서버에 순서 변경 

app.patch('/api/schedule/:id/order', async (req, res) => {
  const scheduleId = parseInt(req.params.id);
  const newOrder = parseInt(req.query.order);

  try {
      await pool.query(
          'UPDATE exercise_schedule SET exercise_order = $1 WHERE id = $2',
          [newOrder, scheduleId]
      );
      res.status(200).send();
  } catch (err) {
      res.status(500).send('Error updating order');
  }
});


  //여거 운동 계획 + 각 계획의 스케쥴 목록 리턴
  app.get("/api/plans", async (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) return res.status(400).json({ message: "userId가 필요합니다." });
  
    try {
      // 1. 모든 plan 가져오기
      const planResult = await pool.query(
        `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date, 'YYYY-MM-DD') AS end_date,
                day, day_pattern, completed_days, is_dummy
         FROM exercise_plan
         WHERE user_id = $1
         ORDER BY start_date DESC`,
        [userId]
      );
  
      const plans = [];
  
      for (const plan of planResult.rows) {
        // 2. 각 계획에 맞는 스케줄 가져오기
        const schedResult = await pool.query(
          `SELECT * FROM exercise_schedule WHERE exercise_plan_id = $1 ORDER BY exercise_order`,
          [plan.id]
        );
  
        plans.push({
          ...plan,
          schedules: schedResult.rows
        });
      }
  
      res.json(plans);
    } catch (error) {
      console.error("❌ /api/plans 실패:", error);
      res.status(500).json({ message: "서버 오류" });
    }
  });


  // 운동 변경하기 서버 라우터
//  운동 변경하기 서버 라우터 (수정 완료)
app.post("/api/schedule/:scheduleId/change-exercise", async (req, res) => {
  console.log("🔥 운동 변경 요청 body:", req.body);
  const scheduleId = parseInt(req.params.scheduleId, 10);
  const { newExerciseId } = req.body;

  // null 또는 undefined 방어 로직 추가
  if (!newExerciseId || isNaN(newExerciseId)) {
    console.error("❌ 운동 ID 누락:", newExerciseId); // ← 이 로그 나오는지 확인
    return res.status(400).json({
      success: false,
      message: "❌ 운동 ID가 누락되었거나 잘못 전달되었습니다.",
    });
  }

  try {
    const client = await pool.connect();

    await client.query("BEGIN");

    // 1️⃣ 기존 세트 삭제
    await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
    await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);

    // 2️⃣ exercise_id 업데이트
    await client.query(
      "UPDATE exercise_schedule SET exercise_id = $1 WHERE id = $2",
      [newExerciseId, scheduleId]
    );

    // 3️⃣ 새 운동이 시간 기반인지 확인
    const result = await client.query(
      "SELECT is_time_type FROM exercise WHERE id = $1",
      [newExerciseId]
    );

    if (result.rows.length === 0) {
      throw new Error(`❌ ID=${newExerciseId}에 해당하는 운동이 존재하지 않습니다.`);
    }

    const isTime = result.rows[0].is_time_type;

    // 4️⃣ 새 세트 생성
    if (isTime) {
      for (let i = 1; i <= 3; i++) {
        await client.query(
          `INSERT INTO exercise_time
            (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed) 
           VALUES ($1, $2, $3, $4, false)`,
          [scheduleId, newExerciseId, i, 600000]
        );
      }
    } else {
      for (let i = 1; i <= 3; i++) {
        await client.query(
          `INSERT INTO exercise_reps 
            (schedule_id, exercise_id, set_number, weight, reps, is_completed) 
           VALUES ($1, $2, $3, 0, 12, false)`,
          [scheduleId, newExerciseId, i]
        );
      }
    }

    await client.query("COMMIT");
    client.release();
    res.json({ success: true });
  } catch (error) {
    console.error("❌ 운동 변경 실패:", error.message);
    res.status(500).json({ success: false, message: "운동 변경 실패", detail: error.message });
  }
});

  //오늘 날짜와 일치하는 운동 계획 + 스캐줄 목록 리턴
 // 오늘 날짜와 일치하는 운동 계획 + 스케줄 + 운동정보 포함
 app.get("/api/plan/today", async (req, res) => {
  const userId = parseInt(req.query.userId);
  if (!userId) return res.status(400).json({ message: "userId가 필요합니다." });

  const today = new Date().toISOString().split("T")[0];

  try {
    const planResult = await pool.query(
      `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date,
              day, day_pattern, completed_days, is_dummy
       FROM exercise_plan
       WHERE user_id = $1 AND $2::date BETWEEN start_date AND end_date
       LIMIT 1`,
      [userId, today]
    );

    if (planResult.rowCount === 0) {
      return res.status(404).json({ message: "오늘 운동 계획이 없습니다." });
    }

    const plan = planResult.rows[0];

    const schedResult = await pool.query(
      `SELECT 
          s.id AS schedule_id,
          COALESCE(r.exercise_id, t.exercise_id) AS exercise_id,
          to_char(s.date, 'YYYY-MM-DD') AS date,
          s.exercise_order,
          s.is_completed,
          s.is_dummy,

          e.name AS exercise_name,
          e.part,
          e.equip,
          e.image_path,
          e.start_position,
          e.exercise_motion,
          e.breathing,
          e.caution,
          e.mets,
          e.is_time_type,
          e.is_noise

        FROM exercise_schedule s
        LEFT JOIN exercise_reps r ON s.id = r.schedule_id AND r.set_number = 1
        LEFT JOIN exercise_time t ON s.id = t.schedule_id
        LEFT JOIN exercise e ON e.id = COALESCE(s.exercise_id, r.exercise_id, t.exercise_id)
        WHERE s.exercise_plan_id = $1
        AND COALESCE(s.exercise_id, r.exercise_id, t.exercise_id) IS NOT NULL
        GROUP BY s.id, r.exercise_id, t.exercise_id, e.id
        ORDER BY s.exercise_order`,
      [plan.id]
    );

    // ✅ 세트 수, reps, seconds, display_detail 추가
    for (const sched of schedResult.rows) {
      const scheduleId = sched.schedule_id;

      const repsCountRes = await pool.query(
        `SELECT COUNT(*) AS count, MAX(reps) AS max_reps FROM exercise_reps WHERE schedule_id = $1`,
        [scheduleId]
      );
      // time 기반 세트 정보
      const timeCountRes = await pool.query(
        `SELECT COUNT(*) AS count, MAX(elapsed_time_millis) AS max_seconds FROM exercise_time WHERE schedule_id = $1`,
        [scheduleId]
      );

      const repsCount = parseInt(repsCountRes.rows[0].count || 0);
      const repsVal = parseInt(repsCountRes.rows[0].max_reps || 0);

      const timeCount = parseInt(timeCountRes.rows[0].count || 0);
      const timeVal = parseInt(timeCountRes.rows[0].max_seconds || 0);

      sched.set_count = repsCount || timeCount;
      sched.reps = repsVal || null;
      sched.seconds = timeVal || null;

      if (sched.is_time_type) {
        // 수정: 프론트엔드는 서버가 전달한 이 display_detail 값을 그대로 화면에 표시하기 때문에 "10000분"으로 보이게 됩니다.
        // const minutes = Math.round((timeVal || 0) / 60); (x)
        // const minutes = Math.round((timeVal || 0) / 60000);
        const timeInMillis = timeVal || 0;
        let totalSeconds = Math.floor(timeInMillis / 1000);
  
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600; // 시간으로 계산된 나머지만 사용
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60; // 분으로 계산된 나머지가 초
  
        // 각 부분을 두 자리 숫자로 포맷팅 (예: 7 -> "07")
        const formattedHours = String(hours).padStart(2, '0');
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
  
        const formattedTime = `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
        sched.display_detail = `${formattedTime} × ${timeCount}세트`;
      } else {
        sched.display_detail = `${repsVal}회 × ${repsCount}세트`;
      }
    }

    res.json({
      plan: plan,
      schedules: schedResult.rows
    });

  } catch (error) {
    console.error("❌ /api/plan/today 실패:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});


  // 즐겨찾기 상태 토글


  //스케줄 삭제
  //실제 운동 스케줄 삭제 라우터 
app.delete('/api/schedule/:scheduleId', async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId);
  console.log("✅ 생성된 scheduleId:", scheduleId);
  if (!scheduleId) {
    console.log("⚠️ 유효하지 않은 scheduleId:", req.params.scheduleId);
    return res.status(400).json({ message: "scheduleId가 필요합니다." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log(`🗑️ 운동 스케줄 삭제 시작 → scheduleId: ${scheduleId}`);

    // 🔹 연결된 세트 먼저 삭제
    await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
    await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);

    // ✅ 스케줄 자체 삭제
    await client.query("DELETE FROM exercise_schedule WHERE id = $1", [scheduleId]);

    await client.query('COMMIT');
    console.log(`✅ 운동 스케줄 삭제 완료 → scheduleId: ${scheduleId}`);
    res.status(200).json({ message: "운동 스케줄 삭제 완료" });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ 운동 삭제 실패:", error);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    client.release();
  }
});
  
  app.get('/api/schedule-id', async (req, res) => {
    const { planId, exerciseId } = req.query;
    try {
        const result = await pool.query(`
            SELECT es.id FROM exercise_schedule es
            LEFT JOIN exercise_reps er ON es.id = er.schedule_id
            LEFT JOIN exercise_time et ON es.id = et.schedule_id
            WHERE es.exercise_plan_id = $1 AND 
                  (er.exercise_id = $2 OR et.exercise_id = $2)
            LIMIT 1
        `, [planId, exerciseId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "scheduleId not found" });
        }

        res.status(200).json({ scheduleId: result.rows[0].id });
    } catch (error) {
        console.error("scheduleId 조회 실패:", error);
        res.status(500).json({ message: "서버 오류" });
    }
});

// ✅ REPS 세트 불러오기 (클라이언트가 실제 요청하는 경로)
app.get('/api/reps-sets/:scheduleId', async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId, 10);

  if (isNaN(scheduleId)) {
    return res.status(400).json({ message: "유효하지 않은 scheduleId" });
  }

  try {
    const result = await pool.query(
      `SELECT set_number, reps, weight
       FROM exercise_reps
       WHERE schedule_id = $1
       ORDER BY set_number ASC`,
      [scheduleId]
    );

    console.log(`✅ [GET] 세트 불러오기 - scheduleId: ${scheduleId}`);
    res.json(result.rows); // [{ set_number: 1, reps: 12, weight: 0 }, ...]
  } catch (err) {
    console.error("❌ 세트 불러오기 실패:", err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// ✅ REPS 세트 저장하기
app.patch('/api/schedule/:scheduleId/reps-sets', async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId, 10);
  console.log("🔥 세트 저장 요청 실행됨 - scheduleId:", scheduleId);

  const sets = req.body; // [{ set_number, reps, weight }, ...]

  if (!Array.isArray(sets)) {
    return res.status(400).json({ message: "잘못된 데이터 형식입니다." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1️⃣ 기존 세트 삭제
    await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
    console.log("🗑 기존 세트 삭제 완료");

    // 2️⃣ schedule_id로부터 exercise_id 가져오기
    const result = await client.query(
      `SELECT exercise_id FROM exercise_schedule WHERE id = $1`,
      [scheduleId]
    );
    const exerciseId = result.rows[0]?.exercise_id;

    if (!exerciseId) {
      throw new Error(`❌ schedule_id=${scheduleId}에 대한 exercise_id가 존재하지 않습니다.`);
    }

    // 3️⃣ 새 세트 삽입
    for (const set of sets) {
      console.log("➕ 세트 삽입:", set);
      await client.query(
        `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [scheduleId, exerciseId, set.set_number, set.weight, set.reps]
      );
    }

    await client.query("COMMIT");
    console.log("✅ 세트 저장 성공");
    res.status(200).send();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ 세트 저장 실패:", err.message);
    res.status(500).json({ message: "서버 오류", detail: err.message });
  } finally {
    client.release();
  }
});

// 🔄 elapsed_time_millis → seconds 로 환산하여 내려줌
app.get('/api/schedule/:scheduleId/time-sets', async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId, 10);

  if (isNaN(scheduleId)) {
    return res.status(400).json({ message: "유효하지 않은 scheduleId" });
  }

  try {
    const result = await pool.query(
      `SELECT set_number, elapsed_time_millis, weight
       FROM exercise_time
       WHERE schedule_id = $1
       ORDER BY set_number ASC`,
      [scheduleId]
    );

    // 클라이언트에 초 단위로 내려줌
    const sets = result.rows.map(row => ({
      set_number: row.set_number,
      seconds: Math.floor(row.elapsed_time_millis / 1000),
      weight: row.weight
    }));

    console.log(`✅ [GET] TIME 세트 불러오기 - scheduleId: ${scheduleId}`);
    res.json(sets); // [{ set_number: 1, seconds: 600, weight: 0.0 }, ...]
  } catch (err) {
    console.error("❌ TIME 세트 불러오기 실패:", err);
    res.status(500).json({ message: "서버 오류" });
  }
});

app.patch("/api/schedule/:scheduleId/time-sets", async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId);
  const setList = req.body; // [{ set_number, seconds, weight }, ...]

  if (!Array.isArray(setList)) {
    return res.status(400).json({ message: "잘못된 요청 형식입니다." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ⭐️ 1. scheduleId로부터 exercise_id 가져오기
    const scheduleDataResult = await client.query(
      "SELECT exercise_id FROM exercise_schedule WHERE id = $1",
      [scheduleId]
    );

    if (scheduleDataResult.rows.length === 0) {
      await client.query("ROLLBACK"); // 롤백 후 에러 처리
      return res.status(404).json({ message: `스케줄 ID ${scheduleId}를 찾을 수 없습니다.` });
    }
    const exerciseId = scheduleDataResult.rows[0].exercise_id;
    if (!exerciseId) {
        await client.query("ROLLBACK"); // 롤백 후 에러 처리
        return res.status(404).json({ message: `스케줄 ID ${scheduleId}에 연결된 운동 ID를 찾을 수 없습니다.` });
    }

    // 2. 기존 세트 삭제
    await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);
    console.log(`[PATCH /time-sets] Deleted old sets for scheduleId: ${scheduleId}`);

    // 3. 새 세트 삽입 시 exercise_id 포함
    if (setList.length > 0) { // 삽입할 세트가 있을 경우에만 루프 실행
        for (const set of setList) {
            const millis = set.seconds * 1000;
            console.log(`[PATCH /time-sets] Inserting new set for scheduleId: ${scheduleId}, exerciseId: ${exerciseId}, set:`, set);
            // ⭐️ exercise_id를 INSERT 문에 추가
            await client.query(`
              INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, weight, is_completed)
              VALUES ($1, $2, $3, $4, $5, false)
            `, [scheduleId, exerciseId, set.set_number, millis, set.weight]); // exerciseId 파라미터 추가
        }
    } else {
        console.log(`[PATCH /time-sets] No sets to insert for scheduleId: ${scheduleId}. All sets might have been deleted.`);
    }


    await client.query("COMMIT");
    console.log(`✅ [PATCH] TIME 세트 저장 완료 - scheduleId: ${scheduleId}`);
    res.sendStatus(200);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`❌ PATCH /time-sets 실패 for scheduleId ${scheduleId}:`, e);
    res.status(500).json({ message: "세트 저장 실패", detail: e.message });
  } finally {
    client.release();
  }
});

//세트 완료 처리 라우터
app.patch("/api/reps-sets/:scheduleId/complete-set", async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId);
  const { setNumber } = req.body;

  if (!scheduleId || !setNumber) {
    return res.status(400).json({ message: "scheduleId와 setNumber 필요" });
  }

  try {
    const client = await pool.connect();
    await client.query("BEGIN");

    // 1️⃣ 해당 세트 is_completed = true
    await client.query(
      `UPDATE exercise_reps
       SET is_completed = true
       WHERE schedule_id = $1 AND set_number = $2`,
      [scheduleId, setNumber]
    );

    // 2️⃣ 전체 세트 완료 여부 확인
    const result = await client.query(
      `SELECT COUNT(*) FILTER (WHERE is_completed) AS completed,
              COUNT(*) AS total
       FROM exercise_reps
       WHERE schedule_id = $1`,
      [scheduleId]
    );

    const { completed, total } = result.rows[0];
    if (parseInt(completed) === parseInt(total)) {
      // 3️⃣ 모두 완료 → 운동 완료 처리
      await client.query(
        `UPDATE exercise_schedule
         SET is_completed = true
         WHERE id = $1`,
        [scheduleId]
      );
    }

    await client.query("COMMIT");
    res.json({ message: "세트 완료 처리 완료", isWorkoutCompleted: completed == total });
  } catch (e) {
    console.error("❌ 세트 완료 처리 실패:", e);
    res.status(500).json({ message: "서버 오류", error: e.message });
  }
});

//개별 세트 완료
app.patch('/api/sets/reps/complete', async (req, res) => {
  const { scheduleId, setNumber, isCompleted } = req.body;

  try {
    const result = await pool.query(
      `UPDATE exercise_reps 
       SET is_completed = $1 
       WHERE schedule_id = $2 AND set_number = $3`,
      [isCompleted, scheduleId, setNumber]
    );

    res.status(200).json({ message: "Set completion updated successfully" });
  } catch (err) {
    console.error("Error updating set completion:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

//운동 완료api
app.patch('/api/schedule/:scheduleId/complete', async (req, res) => {
  const scheduleId = req.params.scheduleId;

  try {
    const result = await pool.query(
      `UPDATE exercise_schedule 
       SET is_completed = true 
       WHERE id = $1`,
      [scheduleId]
    );

    res.status(200).json({ message: "Schedule marked as complete" });
  } catch (err) {
    console.error("Error marking schedule as complete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

  


// ✅ 서버 시작
app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 서버가 http://0.0.0.0:${port} 에서 실행 중입니다.`);
});