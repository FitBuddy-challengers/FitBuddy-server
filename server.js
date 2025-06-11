
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = 3000;

// 미들웨어 등록
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

//  GPT API 설정
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


//  라우터 선언 및 설정
const router = express.Router();




//  GPT 운동 루틴 생성 라우터
router.post('/generate-routine', async (req, res) => {
  const { user_info, schedule_info } = req.body;

  if (!user_info || !schedule_info) {
    return res.status(400).json({ error: '필수 정보 누락' }); 
    ////
  }

  const prompt = `
  당신은 전문 퍼스널 트레이너 AI입니다. 아래 정보를 참고하여 한국어로 하루치 운동 루틴을 구성해주세요.
  
  [사용자 정보]
  이름: ${user_info.name}
  연령대: ${user_info.age_group}
  성별: ${user_info.gender}
  키: ${user_info.height}cm
  몸무게: ${user_info.weight}kg
  질병 이력: ${user_info.disease}
  운동 수준: ${user_info.exercise_level}
  선호하는 운동: ${user_info.preferred_exercise?.join(', ') || '없음'}
  운동 도구: ${user_info.exercise_equipment?.join(', ') || '없음'}
  
  [운동 계획 정보]
  운동 시작일: ${schedule_info.start_date}
  운동 종료일: ${schedule_info.end_date}
  운동 요일: ${schedule_info.days_of_week?.join(', ') || '없음'}
  강화 부위: ${schedule_info.focus_area}
  
  [요청 사항]
  - 하루치 운동 루틴만 작성해 주세요.
  - 반드시 아래 형식을 정확히 지켜 주세요:
    1. 스쿼트 - 15회 3세트
    2. 런지 - 12회 3세트
    3. 레그 레이즈 - 10회 3세트
  - 각 줄은 숫자로 시작하고, 운동 이름 다음엔 '-' 또는 ':' 를 사용해 주세요.
  - 횟수는 '회', 세트 수는 '세트' 단위를 붙여 주세요.
  - 타임이나 시간 기반 표현 없이, 횟수/세트만 사용해 주세요.
  - 마지막엔 스트레칭으로 마무리해 주세요.
  
  이 형식을 반드시 지켜 주세요.
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: '너는 전문적인 퍼스널 트레이너 AI야.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    const result = completion.choices[0].message.content;
    res.json({ plan_text: result.trim() });
  } catch (error) {
    console.error('❌ GPT 호출 실패:', error.response?.data || error.message);
    res.status(500).json({ error: '루틴 생성 실패' });
  }
});


console.log("server.js 실제 실행됨 - 최상단 로그 확인"); 

//app.use(cors());


//app.use(bodyParser.json());

// ✅ 여기 추가하세요
router.get('/user-info/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  try {
    const result = await pool.query(`
      SELECT name, age_group, gender, height, weight, diseases, workout_level, preferred_workouts, equipment
      FROM users
      WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const row = result.rows[0];
    res.json({
      name: row.name,
      age_group: row.age_group,
      gender: row.gender,
      height: row.height,
      weight: row.weight,
      disease: row.diseases,
      exercise_level: row.workout_level,
      preferred_exercises: row.preferred_workouts?.split(',') ?? [],
      exercise_equipment: row.equipment?.split(',') ?? [],
    });
  } catch (err) {
    console.error('❌ getUserInfo 실패:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



router.post('/plan/submit-ai', async (req, res) => {
  console.log("🔥 [submit-ai] 루틴 저장 요청 도착:", JSON.stringify(req.body, null, 2));
  const { user_id, start_date, end_date, exercises } = req.body;

  // 서버에서 exercises가 비었을 경우 방어 로직 추가
  if (!Array.isArray(exercises) || exercises.length === 0) {
    console.error("❌ [submit-ai] exercises가 비어있습니다.");
    return res.status(400).json({ error: "운동 정보가 없습니다." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1️⃣ 기존 플랜 삭제
    await client.query(
      `DELETE FROM exercise_plan WHERE user_id = $1 AND start_date >= $2 AND end_date <= $3`,
      [user_id, start_date, end_date]
    );

    // 2️⃣ 새로운 플랜 삽입
    const startDateObj = new Date(start_date);
    const dayValue = [startDateObj.getDate()];
    const dayPattern = ['ai'];

    const planResult = await client.query(
      `INSERT INTO exercise_plan (user_id, start_date, end_date, day, day_pattern, is_dummy)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING id`,
      [user_id, start_date, end_date, dayValue, dayPattern]
    );
    const planId = planResult.rows[0].id;

    const nameToId = {};
    for (const ex of exercises) {
      const result = await client.query(
        `SELECT id FROM exercise WHERE name = $1 LIMIT 1`, [ex.name]
      );
      if (result.rows.length === 0) {
        throw new Error(`운동명 '${ex.name}'을 찾을 수 없습니다.`);
      }
      nameToId[ex.name] = result.rows[0].id;
    }

    // 3️⃣ 스케줄, reps/time 저장 + 결과 수집
    let order = 1;
    const scheduleResults = [];
    const repsResults = [];
    const timeResults = [];

    for (const ex of exercises) {
      const exId = nameToId[ex.name];

      const schedResult = await client.query(
        `INSERT INTO exercise_schedule (exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id)
         VALUES ($1, $2, $3, false, false, $4) RETURNING *`,
        [planId, start_date, order++, exId]
      );
      const schedRow = schedResult.rows[0];
      scheduleResults.push(schedRow);
      const schedId = schedRow.id;

      if (ex.seconds) {
        const timeRes = await client.query(
          `INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
           VALUES ($1, $2, 1, $3, false) RETURNING *`,
          [schedId, exId, ex.seconds * 1000]
        );
        timeResults.push(timeRes.rows[0]);
      } else {
        for (let i = 1; i <= ex.sets; i++) {
          const repsRes = await client.query(
            `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
             VALUES ($1, $2, $3, 0, $4, false) RETURNING *`,
            [schedId, exId, i, ex.reps]
          );
          repsResults.push(repsRes.rows[0]);
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      plan_id: planId,
      schedules: scheduleResults,
      reps: repsResults,
      times: timeResults
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 에러 발생:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// 사용자 챌린지 정보 조회 API
router.get('/user-challenge-progress/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  if (isNaN(userId)) {
    return res.status(400).json({ message: 'Invalid userId' });
  }

  try {
    // 1. users 테이블에서 닉네임, 레벨, 코인, 이미지 조회
    const userResult = await pool.query(
      `SELECT name, level, coin, COALESCE(profile_image, '') AS profile_image
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // 2. challenge_level 테이블에서 현재 레벨의 조건 + 보상 조회
    const levelResult = await pool.query(
      `SELECT 
         required_attendance, required_photo, required_exercise,
         reward_attendance, reward_photo, reward_exercise
       FROM challenge_level
       WHERE level = $1`,
      [user.level]
    );

    const levelInfo = levelResult.rows.length > 0
      ? levelResult.rows[0]
      : {
          required_attendance: 0, required_photo: 0, required_exercise: 0,
          reward_attendance: 0, reward_photo: 0, reward_exercise: 0
        };

    // 3. user_challenge_progress 테이블에서 현재 진행도 조회
    const progressResult = await pool.query(
      `SELECT attendance_count, photo_count, exercise_count
       FROM user_challenge_progress
       WHERE user_id = $1`,
      [userId]
    );

    const current = progressResult.rows.length > 0
      ? progressResult.rows[0]
      : { attendance_count: 0, photo_count: 0, exercise_count: 0 };

    // 4. 퍼센트 계산 함수
    const calcPercent = (curr, req) => (req === 0 ? 100 : Math.min(100, Math.floor((curr / req) * 100)));

    // 5. 응답 데이터 구성
    const response = {
      nickname: user.name,
      level: user.level,
      coin: user.coin,
      profileImage: user.profile_image,
      required: {
        attendance: levelInfo.required_attendance,
        photo: levelInfo.required_photo,
        exercise: levelInfo.required_exercise
      },
      current: {
        attendance: current.attendance_count,
        photo: current.photo_count,
        exercise: current.exercise_count
      },
      progress: {
        attendancePercent: calcPercent(current.attendance_count, levelInfo.required_attendance),
        photoPercent: calcPercent(current.photo_count, levelInfo.required_photo),
        exercisePercent: calcPercent(current.exercise_count, levelInfo.required_exercise)
      },
      reward: { // ✅ 추가된 reward 필드
        attendance: levelInfo.reward_attendance,
        photo: levelInfo.reward_photo,
        exercise: levelInfo.reward_exercise
      }
    };

    console.log(`✅ 사용자 챌린지 정보 반환:`, response);
    res.json(response);

  } catch (error) {
    console.error('❌ 사용자 챌린지 조회 실패:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ 반드시 router 정의 후 app.use로 등록해야 함
app.use('/api', router);


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

          // 1. 사용자 생성
          await pool.query(
              'INSERT INTO users (email, password) VALUES ($1, $2)',
              [userData.email, userData.password]
          );

          // 2. 생성된 사용자 ID 가져오기
          const userIdResult = await pool.query('SELECT id FROM users WHERE email = $1', [userData.email]);
          const newUserId = userIdResult.rows[0].id;

          // 3. 챌린지 진행도 기본값 삽입
          await pool.query(
            `INSERT INTO user_challenge_progress (
              user_id, attendance_count, photo_count, exercise_count, last_attendance_date
            ) VALUES ($1, 0, 0, 0, NULL)`,
            [newUserId]
          ); // ← ✅ 세미콜론 꼭 붙이기!

          // 4. 메모리에서 임시 데이터 삭제
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
  console.log("[더미 플랜 요청] 전체 req.body:", req.body); 
  const { user_id, date } = req.body; // ★★★ userId -> user_id로 변경 ★★★

// JavaScript에서는 변수명을 카멜케이스로 사용하는 것이 일반적이므로,
  // 추출한 user_id 값을 새로운 카멜케이스 변수에 할당하여 사용할 수 있습니다.
  const userId = user_id; // ★★★ 이 userId 변수를 이후 로직에서 사용 ★★★

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
      SELECT e.id, e.name, e.is_time_type, e.is_favorite, e.is_hidden
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

  // ✅ 특정 운동 계획(planId)에 속한 스케줄 목록 반환 API
app.get("/api/plans/:planId/schedules", async (req, res) => {
  const planId = parseInt(req.params.planId, 10);

  if (isNaN(planId)) {
      return res.status(400).json({ message: "유효하지 않은 planId입니다." });
  }

  try {
      const result = await pool.query(
          `SELECT 
              id AS schedule_id, 
              exercise_id, 
              exercise_order
           FROM exercise_schedule 
           WHERE exercise_plan_id = $1 
           ORDER BY exercise_order ASC`,
          [planId]
      );

      if (result.rows.length === 0) {
          console.log(`[스케줄 조회] planId: ${planId}에 해당하는 스케줄 없음`);
          return res.status(200).json([]); 
      }

      console.log(`[스케줄 조회] planId: ${planId}의 스케줄 ${result.rows.length}개 반환`);
      res.status(200).json(result.rows); 

  } catch (error) {
      console.error(`❌ planId ${planId}의 스케줄 조회 실패:`, error);
      res.status(500).json({ message: "서버 오류: 스케줄 조회에 실패했습니다." });
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
          e.is_noise,
          e.is_favorite, -- ★ 추가
          e.is_hidden    -- ★ 추가
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
        // const minutes = Math.round((timeVal || 0) / 60); (기존)
        // const minutes = Math.round((timeVal || 0) / 60000); (분 단위로 나오게)
        // 00:00:00 단위로 나오게 (아래)
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

  //스케줄 삭제
// 운동 스케줄 삭제 라우터
app.delete('/api/schedule/:scheduleId', async (req, res) => {
  const scheduleIdParam = req.params.scheduleId;
  const scheduleId = parseInt(scheduleIdParam, 10); // 10진수로 변환

  console.log(`[DELETE /api/schedule/:scheduleId] 요청 수신. Parameter: ${scheduleIdParam}, Parsed scheduleId: ${scheduleId}`);

  // scheduleId가 숫자가 아니거나, 0 이하의 값인 경우 유효하지 않은 것으로 처리
  if (isNaN(scheduleId) || scheduleId <= 0) {
    console.warn(`[DELETE /api/schedule/:scheduleId] 유효하지 않은 scheduleId: ${scheduleIdParam} (파싱 후: ${scheduleId})`);
    return res.status(400).json({ message: `유효하지 않은 scheduleId 입니다: ${scheduleIdParam}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log(`🗑️ 운동 스케줄 삭제 시작 → scheduleId: ${scheduleId}`);

    // 1. 연결된 exercise_reps 삭제
    const repsDeleteResult = await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
    console.log(`[DELETE /api/schedule/:scheduleId] exercise_reps 삭제 결과: ${repsDeleteResult.rowCount} 행 삭제됨 (scheduleId: ${scheduleId})`);

    // 2. 연결된 exercise_time 삭제
    const timeDeleteResult = await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);
    console.log(`[DELETE /api/schedule/:scheduleId] exercise_time 삭제 결과: ${timeDeleteResult.rowCount} 행 삭제됨 (scheduleId: ${scheduleId})`);

    // 3. exercise_schedule 자체 삭제
    const scheduleDeleteResult = await client.query("DELETE FROM exercise_schedule WHERE id = $1", [scheduleId]);
    console.log(`[DELETE /api/schedule/:scheduleId] exercise_schedule 삭제 결과: ${scheduleDeleteResult.rowCount} 행 삭제됨 (id: ${scheduleId})`);

    // 실제로 스케줄이 삭제되었는지 확인 (rowCount가 0이면 해당 스케줄이 없었던 것)
    if (scheduleDeleteResult.rowCount === 0) {
      await client.query('ROLLBACK'); // 스케줄이 없었으므로 롤백 (이미 다른 곳에서 삭제되었거나 ID가 잘못된 경우)
      console.warn(`[DELETE /api/schedule/:scheduleId] 삭제할 스케줄을 찾지 못했습니다 (scheduleId: ${scheduleId}). 트랜잭션 롤백됨.`);
      return res.status(404).json({ message: "삭제할 운동 스케줄을 찾지 못했습니다." });
    }

    await client.query('COMMIT');
    console.log(`✅ 운동 스케줄 삭제 완료 (scheduleId: ${scheduleId})`);
    res.status(200).json({ message: "운동 스케줄이 성공적으로 삭제되었습니다." });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ 운동 스케줄 삭제 실패 (scheduleId: ${scheduleId}):`, error);
    res.status(500).json({ message: "운동 스케줄 삭제 중 서버 오류가 발생했습니다.", detail: error.message });
  } finally {
    client.release();
  }
});
  
 
// 수정된 /api/schedule-id 엔드포인트
app.get('/api/schedule-id', async (req, res) => {
  const { planId, exerciseId } = req.query; // 클라이언트에서 planId와 exerciseId를 쿼리 파라미터로 받습니다.

  // planId 또는 exerciseId가 제공되지 않았거나 유효하지 않은 경우 오류 처리
  if (!planId || !exerciseId) {
      return res.status(400).json({ message: "planId와 exerciseId는 필수입니다." });
  }

  try {
      // exercise_schedule 테이블에서 exercise_plan_id와 exercise_id를 직접 사용하여 scheduleId (es.id)를 조회합니다.
      // 이 방식이 더 정확하고, reps나 time 정보가 아직 없는 운동 스케줄도 올바르게 찾을 수 있습니다.
      const sqlQuery = `
          SELECT id FROM exercise_schedule
          WHERE exercise_plan_id = $1 AND exercise_id = $2
          ORDER BY id ASC -- 만약 중복 가능성이 있다면 정렬 후 첫번째 항목 사용 (또는 다른 기준 적용)
          LIMIT 1
      `;
      const result = await pool.query(sqlQuery, [planId, exerciseId]);

      if (result.rows.length === 0) {
          // 해당 planId와 exerciseId에 맞는 스케줄이 없는 경우 404 반환
          console.warn(`[GET /api/schedule-id] scheduleId를 찾을 수 없음. planId: ${planId}, exerciseId: ${exerciseId}`);
          return res.status(404).json({ message: "해당 운동에 대한 스케줄 정보를 찾을 수 없습니다 (scheduleId not found)." });
      }

      // 성공적으로 scheduleId를 찾은 경우 반환
      console.log(`[GET /api/schedule-id] scheduleId 조회 성공. planId: ${planId}, exerciseId: ${exerciseId}, scheduleId: ${result.rows[0].id}`);
      res.status(200).json({ scheduleId: result.rows[0].id });

  } catch (error) {
      console.error(`[GET /api/schedule-id] scheduleId 조회 중 서버 오류 발생. planId: ${planId}, exerciseId: ${exerciseId}`, error);
      res.status(500).json({ message: "scheduleId 조회 중 서버 오류가 발생했습니다." });
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
      `SELECT set_number, reps, weight, is_completed
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
  console.log(`🔥 [PATCH /api/schedule/:scheduleId/reps-sets] scheduleId: ${scheduleId}, 받은 세트:`, sets);

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
         VALUES ($1, $2, $3, $4, $5, $6)`,
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

// 🔄 elapsed_time_millis → seconds 로 환산하여 내려줌 -) 시간 세트 수정만 손 보고 나머지는 건들지 않았습니다! 
app.get('/api/schedule/:scheduleId/time-sets', async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId, 10);

  if (isNaN(scheduleId)) {
    return res.status(400).json({ message: "유효하지 않은 scheduleId" });
  }

  try {
    const result = await pool.query(
      `SELECT set_number, elapsed_time_millis, is_completed,
              COALESCE(weight, 0) AS weight  -- 🔥 weight 기본값 보장
       FROM exercise_time 
       WHERE schedule_id = $1 
       ORDER BY set_number ASC`,
      [scheduleId]
    );

    // 초 단위로 변환해서 내려줌
    const sets = result.rows.map(row => ({
      set_number: row.set_number,
      seconds: Math.floor(row.elapsed_time_millis / 1000),
      weight: row.weight
    }));

    console.log(`✅ [GET] TIME 세트 불러오기 - scheduleId: ${scheduleId}`);
    res.json(sets); 
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


//reps 세트 완료
app.patch('/api/sets/reps/complete', async (req, res) => {
    const { scheduleId, setNumber, isCompleted, time_seconds } = req.body;
    console.log(`[PATCH /api/sets/reps/complete] 요청 수신됨. scheduleId: ${scheduleId}, setNumber: ${setNumber}, isCompleted: ${isCompleted}, time_seconds: ${time_seconds}`);
    
    if (typeof scheduleId === 'undefined' || typeof setNumber === 'undefined' || typeof isCompleted !== 'boolean') {
        console.error('[PATCH /api/sets/reps/complete] 유효하지 않은 입력 타입 또는 누락된 파라미터. 수신된 req.body:', JSON.stringify(req.body));
        return res.status(400).json({ message: "잘못된 입력: scheduleId, setNumber는 필수이며, isCompleted는 boolean 타입이어야 합니다." });
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
  
      // SQL 쿼리 문자열 정의
     const sqlQuery = `UPDATE exercise_reps 
          SET is_completed = $1,
              time_seconds = COALESCE($4, time_seconds) 
          WHERE schedule_id = $2 AND set_number = $3`;
           
        console.log('[PATCH /api/sets/reps/complete] 실행될 SQL:', sqlQuery);
        console.log('[PATCH /api/sets/reps/complete] SQL 파라미터:', [isCompleted, scheduleId, setNumber, time_seconds]); // 파라미터에 time_seconds 추가

     const result = await client.query(sqlQuery, [isCompleted, scheduleId, setNumber, time_seconds]);
    
        if (result.rowCount > 0) {
            await client.query('COMMIT');
            console.log(`[PATCH /api/sets/reps/complete] scheduleId: ${scheduleId}, setNumber: ${setNumber}에 대해 ${result.rowCount}개 행 업데이트 성공 및 커밋 완료.`);
            res.status(200).json({ message: "세트 완료 상태가 성공적으로 업데이트되었습니다." });
        } else {
            await client.query('ROLLBACK');
            console.warn(`[PATCH /api/sets/reps/complete] scheduleId: ${scheduleId}, setNumber: ${setNumber}에 대해 업데이트된 행 없음. 트랜잭션 롤백됨.`);
            res.status(404).json({ message: `scheduleId ${scheduleId}, setNumber ${setNumber}에 해당하는 세트를 찾을 수 없습니다.` });
        }
    } catch (err) {
        console.error('[PATCH /api/sets/reps/complete] 오류 발생, 트랜잭션 롤백됨.', err.stack);
        if (client) {
            try { await client.query('ROLLBACK'); }
            catch (rollbackErr) { console.error('[PATCH /api/sets/reps/complete] 롤백 중 오류 발생.', rollbackErr.stack); }
        }
        res.status(500).json({ error: "세트 완료 상태 업데이트 중 서버 오류 발생.", detail: err.message });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// time 세트 완료 
app.patch('/api/sets/time/complete', async (req, res) => {
    const { scheduleId, setNumber, isCompleted, elapsedTimeMillis } = req.body;
    console.log(`[PATCH /api/sets/time/complete] 요청 수신: scheduleId=${scheduleId}, setNumber=${setNumber}, isCompleted=${isCompleted}, elapsedTimeMillis=${elapsedTimeMillis}`);

    if (scheduleId === undefined || setNumber === undefined || isCompleted === undefined) {
        return res.status(400).json({ message: 'scheduleId, setNumber, isCompleted는 필수입니다.' });
    }

    try {
        const result = await pool.query(
            `UPDATE exercise_time 
             SET is_completed = $1, 
                 elapsed_time_millis = COALESCE($2, elapsed_time_millis)
             WHERE schedule_id = $3 AND set_number = $4
             RETURNING *;`,
            [isCompleted, elapsedTimeMillis, scheduleId, setNumber]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: '해당 세트를 찾을 수 없습니다.' });
        }
        
        res.status(200).json({ message: '시간 세트가 성공적으로 업데이트되었습니다.', data: result.rows[0] });

    } catch (error) {
        console.error('❌ 시간 세트 업데이트 실패:', error);
        res.status(500).json({ message: '서버 오류' });
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

 // 운동 즐겨찾기 상태 토글 API
app.patch("/api/exercises/:exerciseId/favorite", async (req, res) => {
  const exerciseIdFromParam = parseInt(req.params.exerciseId, 10); // 명확한 변수명 사용
  const { isFavorite: requestedIsFavorite } = req.body; // 클라이언트가 요청한 새로운 상태

  if (requestedIsFavorite === undefined || typeof requestedIsFavorite !== 'boolean' || isNaN(exerciseIdFromParam)) {
      return res.status(400).json({ message: "필수 정보(exerciseId, isFavorite)가 누락되었거나 형식이 잘못되었습니다." });
  }

  try {
      const result = await pool.query(
          "UPDATE exercise SET is_favorite = $1 WHERE id = $2 RETURNING id, name, is_favorite",
          [requestedIsFavorite, exerciseIdFromParam] // 클라이언트가 요청한 isFavorite 값으로 DB 업데이트
      );

      if (result.rowCount === 0) {
          return res.status(404).json({ message: "해당 ID의 운동을 찾을 수 없습니다." });
      }

      const updatedExercise = result.rows[0]; // DB에서 실제 업데이트된 값을 가져옴

      // 서버 내부 로깅 (DB에 실제 반영된 값 기준)
      console.log(`[즐겨찾기 DB 업데이트 완료] exerciseId: ${updatedExercise.id}, 실제 DB is_favorite: ${updatedExercise.is_favorite}`);

      // 클라이언트에 반환하는 JSON 객체
      res.status(200).json({
          message: "즐겨찾기 상태가 변경되었습니다.",
          exerciseId: updatedExercise.id, // ★★★ DB에서 반환된 id 사용
          isFavorite: updatedExercise.is_favorite // ★★★ DB에서 반환된 is_favorite 사용
      });

  } catch (error) {
      console.error("즐겨찾기 상태 변경 실패:", error);
      res.status(500).json({ message: "서버 오류 발생" });
  }
});

// 운동 숨김상태 
app.patch("/api/exercises/:exerciseId/hidden", async (req, res) => {
  const exerciseId = parseInt(req.params.exerciseId, 10);
  const { isHidden } = req.body; // 클라이언트에서 새로운 숨김 상태 (true/false)를 보냄

  if (isHidden === undefined || typeof isHidden !== 'boolean' || isNaN(exerciseId)) {
      return res.status(400).json({ message: "필수 정보(exerciseId, isHidden)가 누락되었거나 형식이 잘못되었습니다." });
  }

  try {
      const result = await pool.query(
          // is_favorite도 함께 반환하여 클라이언트가 최신 상태를 모두 가질 수 있도록 함
          "UPDATE exercise SET is_hidden = $1 WHERE id = $2 RETURNING id, name, is_hidden, is_favorite",
          [isHidden, exerciseId]
      );

      if (result.rowCount === 0) {
          return res.status(404).json({ message: "해당 ID의 운동을 찾을 수 없습니다." });
      }

      const updatedExercise = result.rows[0];
      console.log(`[숨김 상태 변경] exerciseId: ${updatedExercise.id}, 실제 DB is_hidden: ${updatedExercise.is_hidden}`);

      res.status(200).json({
          message: "운동 숨김 상태가 변경되었습니다.",
          exerciseId: updatedExercise.id,
          isHidden: updatedExercise.is_hidden,
          isFavorite: updatedExercise.is_favorite // 즐겨찾기 상태도 함께 반환
      });

  } catch (error) {
      console.error("운동 숨김 상태 변경 실패:", error);
      res.status(500).json({ message: "서버 오류 발생" });
  }
});

// GET /api/challenge-levels(개인 챌린지 부분.)
app.get('/api/challenge-levels', async (req, res) => {
  try {
      const result = await pool.query('SELECT * FROM challenge_level ORDER BY level ASC');
      res.json(result.rows);
  } catch (err) {
      console.error('❌ challenge level fetch error', err);
      res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/user-challenge-progress/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
  }

  try {
    const result = await pool.query(`
      SELECT 
          u.level,
          u.coin,
          u.name AS nickname,
          COALESCE(u.profile_image, '') AS profile_image,
          COALESCE(cl.required_attendance, 0) AS required_attendance,
          COALESCE(cl.required_photo, 0) AS required_photo,
          COALESCE(cl.required_exercise, 0) AS required_exercise,
          COALESCE(cl.reward_attendance, 0) AS reward_attendance,
          COALESCE(cl.reward_photo, 0) AS reward_photo,
          COALESCE(cl.reward_exercise, 0) AS reward_exercise,
          COALESCE(p.attendance_count, 0) AS attendance_count,
          COALESCE(p.photo_count, 0) AS photo_count,
          COALESCE(p.exercise_count, 0) AS exercise_count
      FROM users u
      LEFT JOIN challenge_level cl ON u.level = cl.level
      LEFT JOIN user_challenge_progress p ON u.id = p.user_id
      WHERE u.id = $1
    `, [userId]);

      if (result.rows.length === 0) {
          return res.status(404).json({ message: "User not found" });
      }

      const row = result.rows[0];

      const progress = {
          attendancePercent: Math.min(100, Math.floor((row.attendance_count / row.required_attendance) * 100)),
          photoPercent: Math.min(100, Math.floor((row.photo_count / row.required_photo) * 100)),
          exercisePercent: Math.min(100, Math.floor((row.exercise_count / row.required_exercise) * 100))
      };

      res.json({
          level: row.level,
          coin: row.coin,
          nickname: row.nickname,
          profileImage: row.profile_image,
          required: {
              attendance: row.required_attendance,
              photo: row.required_photo,
              exercise: row.required_exercise
          },
          current: {
              attendance: row.attendance_count,
              photo: row.photo_count,
              exercise: row.exercise_count
          },
          progress: progress,
          reward: { 
            attendance: row.reward_attendance,
            photo: row.reward_photo,
            exercise: row.reward_exercise
          }
      });
  } catch (err) {
      console.error("❌ Error fetching user challenge progress", err);
      res.status(500).json({ error: "Server error" });
  }
});

//서버에서 자동 레벨업 처리
//user_challenge_progress와 challenge_level를 비교하여 자동 레벨업
async function checkAndUpdateLevel(userId) {
  const progress = await pool.query(`
      SELECT attendance_count, photo_count, exercise_count
      FROM user_challenge_progress
      WHERE user_id = $1
  `, [userId]);

  const user = await pool.query(`SELECT level FROM users WHERE id = $1`, [userId]);
  const currentLevel = user.rows[0].level;

  // 다음 레벨 조건 가져오기
  const nextLevel = currentLevel + 1;
  const nextLevelReq = await pool.query(`
      SELECT * FROM challenge_level WHERE level = $1
  `, [nextLevel]);

  if (nextLevelReq.rowCount === 0) return; // 더 이상 레벨 없음

  const required = nextLevelReq.rows[0];

  if (
      progress.rows[0].attendance_count >= required.required_attendance &&
      progress.rows[0].photo_count >= required.required_photo &&
      progress.rows[0].exercise_count >= required.required_exercise
  ) {
      // ✅ 레벨업 실행
      await pool.query(`UPDATE users SET level = $1 WHERE id = $2`, [nextLevel, userId]);
  }
}
// 출석 1회 기록 로직 (user_attendance 없이 처리)
// 출석 1회 기록 로직 (user_attendance 없이 처리)
app.post('/api/challenge/attendance/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const today = new Date().toISOString().split('T')[0];

  if (isNaN(userId)) {
    return res.status(400).json({ message: 'Invalid userId' });
  }

  try {
    // 1. 오늘 이미 출석했는지 확인
    const result = await pool.query(
      `SELECT last_attendance_date FROM user_challenge_progress WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User progress not found' });
    }

    const lastDate = result.rows[0].last_attendance_date;
    const alreadyCheckedToday = lastDate && lastDate.toISOString().split('T')[0] === today;

    if (alreadyCheckedToday) {
      return res.status(200).json({ message: '오늘 이미 출석함' });
    }

    // 2. 출석 처리
    await pool.query(
      `UPDATE user_challenge_progress
       SET attendance_count = attendance_count + 1,
           last_attendance_date = $1
       WHERE user_id = $2`,
      [today, userId]
    );

    // 3. ✅ 보상 지급: 출석 5회 달성 시 코인 지급
    const rewardResult = await pool.query(
      `SELECT attendance_count FROM user_challenge_progress WHERE user_id = $1`,
      [userId]
    );
    const attendanceCount = rewardResult.rows[0].attendance_count;

    if (attendanceCount === 5) {
      await pool.query(
        `UPDATE users SET coin = coin + 300 WHERE id = $1`,
        [userId]
      );
      console.log(`🎁 코인 보상 지급 완료! userId=${userId}, amount=300`);
    }

    await checkAndUpdateLevel(userId); // 레벨업 검사

    return res.json({ message: '출석 처리 완료' });

  } catch (err) {
    console.error('❌ 출석 처리 실패:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 3. 운동 1회 기록 로직
app.post('/api/challenge/exercise/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD' 문자열

  try {
    // ✅ [1] 오늘 이미 운동 기록했는지 확인 (DATE 처리로 timestamp와 비교)
    const result = await pool.query(
      `SELECT * FROM user_exercise_log WHERE user_id = $1 AND DATE(date) = $2`,
      [userId, today]
    );

    if (result.rowCount === 0) {
      // ✅ [2] 오늘 완료된 운동이 있는지 확인 (DATE 처리 추가)
      const exerciseDone = await pool.query(`
        SELECT COUNT(*) FROM exercise_schedule
        WHERE DATE(date) = $1 AND is_completed = true
        AND exercise_plan_id IN (
          SELECT id FROM exercise_plan WHERE user_id = $2
        )
      `, [today, userId]);

      if (parseInt(exerciseDone.rows[0].count) > 0) {
        // ✅ [3] 운동 완료 기록 추가
        await pool.query(
          `INSERT INTO user_exercise_log (user_id, date) VALUES ($1, $2)`,
          [userId, today]
        );

        // ✅ [4] 개인 챌린지 기록 반영 (중복 방지 & 날짜 조건 처리)
        await pool.query(`
          INSERT INTO user_challenge_progress (user_id, exercise_count, last_attendance_date)
          VALUES ($1, 1, $2)
          ON CONFLICT (user_id) DO UPDATE
          SET
            exercise_count = user_challenge_progress.exercise_count + 1,
            last_attendance_date = $2;
        `, [userId, today]);
        // ✅ [5] 레벨 업 조건 확인
        await checkAndUpdateLevel(userId);
      }
    }

    res.json({ message: '운동 처리 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ 사용자 이름, 레벨, 코인 + 챌린지 진행률 반환
app.get('/api/user-challenge-progress/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

  if (isNaN(userId)) {
    return res.status(400).json({ message: "유효하지 않은 사용자 ID" });
  }

  try {
    // 1. 사용자 정보 조회 (이름, 레벨, 코인)
    const userResult = await pool.query(
      `SELECT name, level, coin, COALESCE(profile_image, '') AS profile_image FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "사용자 없음" });
    }

    const user = userResult.rows[0];

    // 2. 챌린지 진행 정보 조회
    const progressResult = await pool.query(
      `SELECT * FROM user_challenge_progress WHERE user_id = $1`,
      [userId]
    );

    if (progressResult.rows.length === 0) {
      return res.status(404).json({ message: "챌린지 진행 정보 없음" });
    }

    const progress = progressResult.rows[0];

    // 3. 퍼센트 계산 함수
    const calculatePercent = (current, required) =>
      Math.min(100, Math.floor((current / required) * 100));

    // 4. 클라이언트에 반환할 JSON 구성
    const response = {
      nickname: user.name,
      level: user.level,
      coin: user.coin,
      current: {
        attendance: progress.attendance_count,
        exercise: progress.exercise_count,
        photo: progress.photo_count,
      },
      required: {
        attendance: 5,
        exercise: 3,
        photo: 1
      },
      progress: {
        attendancePercent: calculatePercent(progress.attendance_count, 5),
        exercisePercent: calculatePercent(progress.exercise_count, 3),
        photoPercent: calculatePercent(progress.photo_count, 1),
      }
    };

    console.log("✅ 사용자 챌린지 정보 반환:", response);
    res.json(response);

  } catch (e) {
    console.error("❌ 사용자 챌린지 정보 불러오기 실패:", e);
    res.status(500).json({ message: "서버 오류" });
  }
});
  
// ✅ 특정 사용자가 소유한 모든 아이템 ID 목록을 반환하는 API
app.get('/api/store/owned-items', async (req, res) => {
    const userId = parseInt(req.query.userId);

    if (isNaN(userId)) {
        return res.status(400).json({ message: "userId는 필수입니다." });
    }

    try {
        const result = await pool.query(
            'SELECT item_id FROM user_owned_items WHERE user_id = $1',
            [userId]
        );
        // DB에서 가져온 item_id가 숫자 타입이므로, 그대로 배열로 만듭니다.
        const ownedItemIds = result.rows.map(row => row.item_id);
        
        console.log(`[소유 아이템 조회] userId: ${userId}, 소유 아이템 수: ${ownedItemIds.length}`);
        res.json(ownedItemIds); // 예시: [1, 101, 102, 401] 형태의 숫자 배열 반환

    } catch (error) {
        console.error('❌ 소유 아이템 조회 실패:', error);
        res.status(500).json({ message: '서버 오류' });
    }
});


// ✅ 아이템 구매 API (userId와 itemId만 사용)
app.post('/api/store/purchase', async (req, res) => {
    // Retrofit의 FieldNamingPolicy에 따라 snake_case로 전달됨
    const { user_id, item_id } = req.body;
    const userId = parseInt(user_id);
    const itemId = parseInt(item_id);

    console.log(`[아이템 구매 요청] userId: ${userId}, itemId: ${itemId}`);

    if (isNaN(userId) || isNaN(itemId)) {
        return res.status(400).json({ success: false, message: '사용자 ID와 아이템 ID는 필수입니다.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ★ DB에서 아이템 정보(가격, 필요 레벨) 조회 (하드코딩된 배열 제거)
        const itemResult = await client.query('SELECT price, required_level FROM items WHERE id = $1', [itemId]);
        if (itemResult.rows.length === 0) {
            // ROLLBACK 후 에러 응답
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: '존재하지 않는 아이템입니다.' });
        }
        const itemToPurchase = itemResult.rows[0];
        const itemPrice = itemToPurchase.price;
        const requiredLevel = itemToPurchase.required_level;

        // 1. 유저 레벨 및 코인 확인 (FOR UPDATE로 동시성 문제 방지)
        const userResult = await client.query('SELECT level, coin FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userResult.rows.length === 0) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const user = userResult.rows[0];

        // 2. 조건 확인 (레벨, 코인, 이미 소유 여부)
        if (user.level < requiredLevel) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: `레벨 ${requiredLevel}이 필요합니다.` });
        }
        if (user.coin < itemPrice) { ///.
          //커밋하려고 억지로 적은 주석.
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: '코인이 부족합니다.' });
        }

        const ownedResult = await client.query('SELECT * FROM user_owned_items WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        if (ownedResult.rows.length > 0) { //
             await client.query('ROLLBACK');
             return res.status(400).json({ success: false, message: '이미 소유하고 있는 아이템입니다.' });
        }

        // 3. 코인 차감
        const newCoin = user.coin - itemPrice;
        await client.query('UPDATE users SET coin = $1 WHERE id = $2', [newCoin, userId]);

        // 4. 아이템 소유 정보 기록
        await client.query(
            'INSERT INTO user_owned_items (user_id, item_id) VALUES ($1, $2)',
            [userId, itemId]
        );

        await client.query('COMMIT');
        console.log(`✅ [구매 성공] userId: ${userId}, itemId: ${itemId}, price: ${itemPrice}, 남은 코인: ${newCoin}`);
        res.json({ success: true, message: '구매에 성공했습니다!', updatedCoin: newCoin });

    } catch (error) {
        // try 블록 내에서 오류 발생 시 ROLLBACK
        await client.query('ROLLBACK');
        console.error('❌ 아이템 구매 실패:', error);
        res.status(500).json({ success: false, message: '구매 처리 중 서버 오류가 발생했습니다.' });
    } finally {
        // 항상 연결 해제
        client.release();
    }
});


// 월별 운동 완료율 조회 API
app.get('/api/records/monthly-completion', async (req, res) => {
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

        console.log(`[월별 기록 조회] userId: ${userId}, ${year}-${month}, 결과 수: ${result.rows.length}`);
        res.json(result.rows); // ex: [{ date: '2025-06-10', completion_rate: 100 }]
    } catch (error) {
        console.error('❌ 월별 운동 완료율 조회 실패:', error);
        res.status(500).json({ message: '서버 오류' });
    }
});

// 특정 날짜의 운동 기록 조회 API
app.get('/api/records/daily', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const date = req.query.date; // "YYYY-MM-DD"

    if (isNaN(userId) || !date) {
        return res.status(400).json({ message: 'userId와 date는 필수입니다.' });
    }

    try {
        const planResult = await pool.query(
            `SELECT id FROM exercise_plan WHERE user_id = $1 AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
            [userId, date]
        );

        if (planResult.rowCount === 0) {
            return res.json([]); // 해당 날짜에 계획이 없으면 빈 배열 반환
        }
        const planId = planResult.rows[0].id;

        const schedResult = await pool.query(`
            SELECT
                s.id AS schedule_id, s.is_completed,
                e.name AS exercise_name, e.is_time_type
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
                    `SELECT COUNT(*) AS count, MAX(elapsed_time_millis) AS max_seconds FROM exercise_time WHERE schedule_id = $1`,
                    [sched.schedule_id]
                );
                sets = parseInt(timeRes.rows[0].count || 0);
                seconds = Math.floor(parseInt(timeRes.rows[0].max_seconds || 0) / 1000);
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
                reps: reps,
                sets: sets,
                seconds: seconds,
                is_completed: sched.is_completed,
                is_time_type: sched.is_time_type
            });
        }

        console.log(`[일별 기록 조회] userId: ${userId}, date: ${date}, 결과 수: ${records.length}`);
        res.json(records);
    } catch (error) {
        console.error('❌ 특정 날짜 운동 기록 조회 실패:', error);
        res.status(500).json({ message: '서버 오류' });
    }
});

// 이번 달 주요 운동 정보 조회 API 
app.get('/api/records/monthly-summary', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ message: 'userId는 필수입니다.' });
    }

    try {
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

        // 공통 테이블 표현식(CTE)은 그대로 사용
        const baseQuery = `
            WITH monthly_completed_workouts AS (
                SELECT 
                    s.exercise_id,
                    (r.time_seconds * 1000) AS duration_ms
                FROM exercise_schedule s
                JOIN exercise_plan p ON s.exercise_plan_id = p.id
                JOIN exercise_reps r ON s.id = r.schedule_id
                WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 AND r.is_completed = true AND r.time_seconds > 0
                UNION ALL
                SELECT 
                    s.exercise_id,
                    t.elapsed_time_millis AS duration_ms
                FROM exercise_schedule s
                JOIN exercise_plan p ON s.exercise_plan_id = p.id
                JOIN exercise_time t ON s.id = t.schedule_id
                WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 AND t.is_completed = true AND t.elapsed_time_millis > 0
            )
        `;

        // ★★★ 1. 가장 많이 한 운동 부위 조회를 위해 로직 변경 ★★★
        // 먼저 모든 운동 기록을 가져와서 서버에서 직접 계산
        const allWorkoutsResult = await pool.query(`
            ${baseQuery}
            SELECT e.part, w.duration_ms
            FROM monthly_completed_workouts w
            JOIN exercise e ON w.exercise_id = e.id;
        `, [userId, firstDay, lastDay]);

        // JavaScript에서 부위별로 시간을 분배하고 합산
        const partDurationMap = {};
        allWorkoutsResult.rows.forEach(row => {
            const parts = row.part.split(',').map(p => p.trim());
            const duration = parseFloat(row.duration_ms);
            if (parts.length > 0) {
                const durationPerPart = duration / parts.length;
                parts.forEach(part => {
                    partDurationMap[part] = (partDurationMap[part] || 0) + durationPerPart;
                });
            }
        });
        
        // 가장 시간이 긴 단일 부위 찾기
        let topPartName = null;
        let maxDuration = -1;
        for (const part in partDurationMap) {
            if (partDurationMap[part] > maxDuration) {
                maxDuration = partDurationMap[part];
                topPartName = part;
            }
        }
        
        const mostFrequentPart = topPartName ? { part: topPartName, count: Math.round(maxDuration) } : null;

        // 2. 가장 많이 한 운동 이름 조회 (이 로직은 기존과 동일)
        const exerciseResult = await pool.query(`
            ${baseQuery}
            SELECT e.name, SUM(w.duration_ms) as total_duration
            FROM monthly_completed_workouts w
            JOIN exercise e ON w.exercise_id = e.id
            GROUP BY e.name
            ORDER BY total_duration DESC
            LIMIT 1;
        `, [userId, firstDay, lastDay]);

        const summary = {
            mostFrequentPart: mostFrequentPart,
            mostFrequentExercise: exerciseResult.rows[0] || null
        };

        res.json(summary);

    } catch (error) {
        console.error('❌ 월간 요약 조회 실패:', error);
        res.status(500).json({ message: '서버 오류' });
    }
});

// ✅ 기간별 레이더 차트 데이터 조회 API 
app.get('/api/records/radar-data', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const period = req.query.period;
    if (isNaN(userId) || !period) {
        return res.status(400).json({ message: 'userId와 period는 필수입니다.' });
    }

    try {
        const now = new Date();
        let startDate;

        switch (period) {
            case 'week':
                startDate = new Date(new Date().setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case 'all':
                startDate = new Date(0);
                break;
            default:
                return res.status(400).json({ message: '잘못된 period 값입니다.' });
        }
        
        const startDateString = startDate.toISOString().split('T')[0];

        // 1. 시간 기반 운동의 운동량 조회
        const timeResult = await pool.query(`
            SELECT 
                e.part,
                -- ★★★ 밀리초(ms)는 60000으로 나누어 분으로 변환 ★★★
                (t.elapsed_time_millis / 60000.0 * e.mets) as volume
            FROM exercise_time t
            JOIN exercise_schedule s ON t.schedule_id = s.id
            JOIN exercise_plan p ON s.exercise_plan_id = p.id
            JOIN exercise e ON t.exercise_id = e.id
            WHERE p.user_id = $1 AND s.date >= $2 AND t.is_completed = true AND t.elapsed_time_millis > 0;
        `, [userId, startDateString]);

        // 2. 횟수 기반 운동의 운동량 조회
        const repsResult = await pool.query(`
            SELECT 
                e.part,
                -- ★★★ 초(s)는 60으로 나누어 분으로 변환 ★★★
                (r.time_seconds / 60.0 * e.mets) as volume
            FROM exercise_reps r
            JOIN exercise_schedule s ON r.schedule_id = s.id
            JOIN exercise_plan p ON s.exercise_plan_id = p.id
            JOIN exercise e ON r.exercise_id = e.id
            WHERE p.user_id = $1 AND s.date >= $2 AND r.is_completed = true AND r.time_seconds > 0;
        `, [userId, startDateString]);

        // 3. 서버에서 두 결과를 합산하고 부위별로 집계
        const partVolumeMap = { "가슴": 0, "등": 0, "하체": 0, "어깨": 0, "팔": 0, "복근": 0, "유산소": 0 };
        
        const processRows = (rows) => {
            rows.forEach(row => {
                if (row.part in partVolumeMap) {
                    partVolumeMap[row.part] += parseFloat(row.volume);
                }
            });
        };

        processRows(timeResult.rows);
        processRows(repsResult.rows);

        // 소수점 둘째 자리까지 반올림
        for (const key in partVolumeMap) {
            partVolumeMap[key] = parseFloat(partVolumeMap[key].toFixed(2));
        }
        
        console.log(`[레이더 차트 데이터] 최종 집계:`, partVolumeMap);
        res.json(partVolumeMap);

    } catch (error) {
        console.error('❌ 레이더 차트 데이터 조회 실패:', error);
        res.status(500).json({ message: '서버 오류' });
    }
});


// 사용자의 모든 신체 기록 가져오기
app.get('/api/records/weight', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ message: 'userId는 필수입니다.' });
    }

    try {
        const result = await pool.query(
            `SELECT 
                id, 
                user_id,
                to_char(date, 'YYYY-MM-DD') AS date, 
                weight, 
                body_fat_percentage, 
                skeletal_muscle_mass 
             FROM weight_records 
             WHERE user_id = $1 
             ORDER BY date ASC`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('❌ 신체 기록 조회 실패:', error);
        res.status(500).json({ message: '서버 오류' });
    }
});

// 신체 기록 추가 또는 업데이트
app.post('/api/records/weight', async (req, res) => {
    const { userId, date, weight, bodyFatPercentage, skeletalMuscleMass } = req.body;
    
    if (!userId || !date || !weight) {
        return res.status(400).json({ message: 'userId, date, weight는 필수입니다.' });
    }

    try {
        // ON CONFLICT를 사용하여 날짜가 이미 존재하면 UPDATE, 없으면 INSERT 실행
        const query = `
            INSERT INTO weight_records (user_id, date, weight, body_fat_percentage, skeletal_muscle_mass)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, date)
            DO UPDATE SET
                weight = EXCLUDED.weight,
                body_fat_percentage = EXCLUDED.body_fat_percentage,
                skeletal_muscle_mass = EXCLUDED.skeletal_muscle_mass;
        `;
        
        await pool.query(query, [userId, date, weight, bodyFatPercentage, skeletalMuscleMass]);
        res.status(201).json({ message: '신체 기록이 성공적으로 저장되었습니다.' });

    } catch (error) {
        console.error('❌ 신체 기록 저장 실패:', error);
        res.status(500).json({ message: '서버 오류' });
    }
});

// ✅ 서버 시작
app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 서버가 http://0.0.0.0:${port} 에서 실행 중입니다.`);
});