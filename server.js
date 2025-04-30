const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = 3000;

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL 연결
const pool = new Pool({
    user: 'katet',
    host: 'localhost',
    database: 'katet',
    password: '12345678',
    port: 5432,
});

// Nodemailer 설정 (이메일 발송)
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 메모리 안에 임시 저장
const otpStore = {};       // 이메일 → OTP
const pendingUsers = {};   // 이메일 → { email, password }

// ✅ 회원가입 API (DB 저장하지 않고 메모리에 임시 저장)
app.post('/signup', (req, res) => {
    const { email, password } = req.body;

    pendingUsers[email] = { email, password };
    console.log('회원가입 요청 저장됨:', pendingUsers);

    res.status(200).send({ message: '회원가입 정보 임시 저장 완료' });
});

// ✅ OTP 전송 API (이메일로 인증번호 보내기)
app.post('/send-otp', async (req, res) => {
    const { email } = req.body;

    // 6자리 랜덤 OTP 생성
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: '챌린저스 회원가입 인증번호',
            text: `인증번호는 ${otp} 입니다.`,
        });

        otpStore[email] = otp; // 메모리에 저장
        console.log(`[OTP 전송] ${email} → OTP: ${otp}`);

        res.status(200).send({ message: 'OTP 전송 완료' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'OTP 전송 실패' });
    }
});

// ✅ OTP 검증 API (성공 시 DB에 저장)
app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    // 🛠️ 디버깅용 서버 로그 추가
    console.log(`[OTP 검증 요청] email: ${email}, 사용자 입력 OTP: ${otp}`);
    console.log(`[서버 저장된 OTP] ${otpStore[email]}`);

    if (otpStore[email] && otpStore[email] === otp) {
        // 인증 성공
        delete otpStore[email]; // OTP 삭제

        const userData = pendingUsers[email];
        if (userData) {
            try {
                await pool.query(
                    'INSERT INTO users (email, password) VALUES ($1, $2)',
                    [userData.email, userData.password]
                );
                delete pendingUsers[email]; // 메모리에서도 삭제

                console.log(`[회원가입 성공] email: ${email}`);
                res.status(200).send({ message: '회원가입 완료' });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: '회원가입 실패: DB 저장 에러' });
            }
        } else {
            res.status(400).send({ message: '회원가입 정보 없음' });
        }
    } else {
        // 인증 실패
        console.log(`[인증 실패] email: ${email}, 입력 OTP: ${otp}, 저장된 OTP: ${otpStore[email]}`);
        res.status(400).send({ message: '인증 실패: 인증번호가 틀렸습니다.' });
    }
});

// ✅ 🔥 프로필 정보 업데이트 API 추가
app.post('/update-profile', async (req, res) => {
    const {
        email,
        name,
        age_group,
        gender,
        height,
        weight,
        diseases,
        workout_level,
        preferred_workouts,
        equipment
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

// ✅ 서버 시작
app.listen(3000, "0.0.0.0", () => {
    console.log(`🚀 서버가 http://0.0.0.0:3000 에서 실행 중입니다.`);
});