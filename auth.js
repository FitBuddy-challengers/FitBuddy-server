// auth.js
const express = require('express');
const router = express.Router();
const { sendOtpMail } = require('./services/mailer'); // 기존 파일 그대로 사용

module.exports = ({ pool }) => {
  console.log("✅ auth 라우터 로드됨");

  // 메모리 저장소 (원본 유지)
  const pendingUsers = {};
  const otpStore = new Map(); // email -> { otp, expiresAt, timer }
  const OTP_TTL_MS = 5 * 60 * 1000; // 5분

  function setOtp(email, otp, ttlMs = OTP_TTL_MS) {
    const prev = otpStore.get(email);
    if (prev?.timer) clearTimeout(prev.timer);
    const expiresAt = Date.now() + ttlMs;
    const timer = setTimeout(() => otpStore.delete(email), ttlMs).unref?.();
    otpStore.set(email, { otp, expiresAt, timer });
  }
  function getOtp(email) {
    const entry = otpStore.get(email);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      if (entry.timer) clearTimeout(entry.timer);
      otpStore.delete(email);
      return null;
    }
    return entry.otp;
  }
  function clearOtp(email) {
    const entry = otpStore.get(email);
    if (entry?.timer) clearTimeout(entry.timer);
    otpStore.delete(email);
  }

  // ───────────────── 엔드포인트: 회원/OTP/로그인/프로필 ─────────────────

  // 회원가입 정보 임시 저장
  router.post('/signup', (req, res) => {
    const { email, password } = req.body;
    pendingUsers[email] = { email, password };
    console.log('📝 회원가입 정보 임시 저장됨:', pendingUsers[email]);
    res.status(200).send({ message: '회원가입 정보 임시 저장 완료' });
  });

  // OTP 전송
  router.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: '유효한 이메일을 입력해 주세요.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      const info = await sendOtpMail(email, otp);
      setOtp(email, otp);
      console.log(`[✉️ OTP 전송 성공] ${email} → OTP: ${otp}, messageId: ${info?.messageId || 'N/A'}`);
      res.status(200).json({ message: 'OTP 전송 완료' });
    } catch (err) {
      console.error('❌ OTP 전송 실패:', err);
      res.status(500).json({ message: 'OTP 전송 실패' });
    }
  });

  // OTP 검증 + DB 저장
  router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    console.log(`[🔐 OTP 검증 요청] email: ${email}`);

    const userData = pendingUsers[email];
    if (!userData) {
      return res.status(400).send({ message: '회원가입 정보가 존재하지 않습니다.' });
    }

    try {
      const alreadyExists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
      if (alreadyExists.rows.length > 0) {
        console.log(`[ℹ️ 이미 인증 사용자] ${email}`);
        return res.status(200).send({ message: '이미 인증이 완료된 사용자입니다.' });
      }

      const stored = getOtp(email);
      if (stored && stored === otp) {
        clearOtp(email);

        // 1) 사용자 생성
        await pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', [userData.email, userData.password]);

        // 2) 생성된 사용자 ID
        const userIdResult = await pool.query('SELECT id FROM users WHERE email = $1', [userData.email]);
        const newUserId = userIdResult.rows[0].id;

        // 3) 챌린지 기본값 삽입
        await pool.query(`
          INSERT INTO user_challenge_progress (user_id, attendance_count, photo_count, exercise_count, last_attendance_date)
          VALUES ($1, 0, 0, 0, NULL)
        `, [newUserId]);

        // 4) 메모리 임시 데이터 삭제
        delete pendingUsers[email];

        console.log(`[✅ 회원가입 성공] email: ${email}`);
        return res.status(200).send({ message: '회원가입 완료' });
      } else {
        console.log(`[⚠️ 인증 실패] email: ${email}, 사유: OTP 불일치/만료`);
        return res.status(400).send({ message: '인증 실패: 인증번호가 만료되었거나 틀렸습니다.' });
      }
    } catch (error) {
      console.error('❌ 회원가입 처리 중 DB 오류:', error);
      return res.status(500).send({ message: '회원가입 실패: DB 처리 중 오류' });
    }
  });

  // 프로필 업데이트
  router.post('/update-profile', async (req, res) => {
    const {
      email, name, age_group, gender,
      height, weight, diseases,
      workout_level, preferred_workouts, equipment
    } = req.body;

    console.log(`[🛠 프로필 업데이트 요청] email: ${email}`);

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
        (diseases || []).join(','),
        workout_level,
        (preferred_workouts || []).join(','),
        (equipment || []).join(','),
        email
      ]);

      if (result.rowCount === 0) {
        return res.status(404).send({ message: '해당 이메일의 사용자가 없습니다.' });
      }

      console.log(`[✅ 프로필 저장 완료] ${email}`);
      res.status(200).send({ message: '프로필 저장 완료' });
    } catch (error) {
      console.error('❌ 프로필 저장 실패:', error);
      res.status(500).send({ message: 'DB 업데이트 실패' });
    }
  });

  // 로그인
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND password = $2',
        [email, password]
      );

      if (result.rows.length === 0) {
        return res.status(401).send({ message: '이메일 또는 비밀번호가 일치하지 않습니다.' });
      }

      console.log(`[✅ 로그인 성공] ${email}`);
      res.status(200).send({ message: '로그인 성공', user: result.rows[0] });
    } catch (error) {
      console.error('❌ 로그인 오류:', error);
      res.status(500).send({ message: '로그인 중 서버 오류' });
    }
  });

  // 이메일로 프로필 조회 (원본 users 배열 대신 DB 조회로 보완)
  router.get('/get-profile', async (req, res) => {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (!rows.length) {
        return res.status(404).json({ message: 'User not found' });
      }
      const user = rows[0];
      const profile = {
        email: user.email,
        name: user.name || '',
        age_group: user.age_group || '',
        gender: user.gender || '',
        height: user.height || 0,
        weight: user.weight || 0,
        diseases: (user.diseases || '').split(',').filter(Boolean),
        workout_level: user.workout_level || '',
        preferred_workouts: (user.preferred_workouts || '').split(',').filter(Boolean),
        equipment: (user.equipment || '').split(',').filter(Boolean)
      };
      console.log(`[ℹ️ 프로필 조회] ${email}`);
      res.json(profile);
    } catch (e) {
      console.error('❌ 프로필 조회 실패:', e);
      res.status(500).json({ message: '서버 오류' });
    }
  });

  // userId로 사용자 정보 조회
  router.get('/api/user-info/:userId', async (req, res) => {
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
      console.log(`[ℹ️ 사용자 정보 조회] userId=${userId}`);
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
      console.error('❌ 사용자 정보 조회 실패:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
