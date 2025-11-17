// src/controller/auth.controller.js
import express from "express";
import { sendOtpMail } from "../services/mailer.js";
import {
  setOtp,
  getOtp,
  clearOtp,
  pendingUsers,
} from "../services/auth.service.js";

import {
  findUserByEmail,
  createUser,
  getUserIdByEmail,
  createUserChallengeProgress,
  updateProfile,
  loginUser,
  findProfileByEmail,
  findUserInfoById,
} from "../repositories/auth.repository.js";

const router = express.Router();

export default ({ pool }) => {
  console.log(" auth 라우터 로드됨 (controller)");

  // ───────────────── 회원가입 정보 임시 저장 ─────────────────
  router.post("/signup", (req, res) => {
    const { email, password } = req.body;
    pendingUsers[email] = { email, password };
    console.log("📝 회원가입 정보 임시 저장됨:", pendingUsers[email]);
    res.status(200).send({ message: "회원가입 정보 임시 저장 완료" });
  });

  // ───────────────── OTP 전송 ─────────────────
  router.post("/send-otp", async (req, res) => {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "유효한 이메일을 입력해 주세요." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const info = await sendOtpMail(email, otp);
      setOtp(email, otp);

      console.log(
        `[OTP 전송 성공] ${email} → OTP: ${otp}, messageId: ${
          info?.messageId || "N/A"
        }`
      );
      res.status(200).json({ message: "OTP 전송 완료" });
    } catch (err) {
      console.error(" OTP 전송 실패:", err);
      res.status(500).json({ message: "OTP 전송 실패" });
    }
  });

  // ───────────────── OTP 검증 + 회원가입 저장 ─────────────────
  router.post("/verify-otp", async (req, res) => {
    const { email, otp } = req.body;

    console.log(`[OTP 검증 요청] email: ${email}`);

    const userData = pendingUsers[email];
    if (!userData) {
      return res
        .status(400)
        .send({ message: "회원가입 정보가 존재하지 않습니다." });
    }

    try {
      // 이미 존재하는 사용자 검사
      const alreadyExists = await findUserByEmail(pool, email);
      if (alreadyExists.rows.length > 0) {
        console.log(`[ℹ️ 이미 인증 사용자] ${email}`);
        return res
          .status(200)
          .send({ message: "이미 인증이 완료된 사용자입니다." });
      }

      const stored = getOtp(email);
      if (stored && stored === otp) {
        clearOtp(email);

        // 1) 사용자 생성
        await createUser(pool, userData.email, userData.password);

        // 2) 생성된 사용자 ID
        const userId = await getUserIdByEmail(pool, email);
        const newUserId = userId.rows[0].id;

        // 3) 챌린지 초기값 저장
        await createUserChallengeProgress(pool, newUserId);

        // 4) 임시 데이터 삭제
        delete pendingUsers[email];

        console.log(`[회원가입 성공] email: ${email}`);
        return res.status(200).send({ message: "회원가입 완료" });
      } else {
        console.log(`[인증 실패] email: ${email}`);

        return res
          .status(400)
          .send({
            message: "인증 실패: 인증번호가 만료되었거나 틀렸습니다.",
          });
      }
    } catch (err) {
      console.error(" 회원가입 처리 중 DB 오류:", err);
      return res.status(500).send({ message: "회원가입 실패: DB 처리 중 오류" });
    }
  });

  // ───────────────── 프로필 업데이트 ─────────────────
  router.post("/update-profile", async (req, res) => {
    const body = req.body;

    try {
      const result = await updateProfile(pool, {
        ...body,
        diseases: body.diseases || [],
        preferred_workouts: body.preferred_workouts || [],
        equipment: body.equipment || [],
      });

      if (result.rowCount === 0) {
        return res
          .status(404)
          .send({ message: "해당 이메일의 사용자가 없습니다." });
      }

      console.log(`[프로필 저장 완료] ${body.email}`);
      res.status(200).send({ message: "프로필 저장 완료" });
    } catch (err) {
      console.error("프로필 저장 실패:", err);
      res.status(500).send({ message: "DB 업데이트 실패" });
    }
  });

  // ───────────────── 로그인 ─────────────────
  router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
      const result = await loginUser(pool, email, password);

      if (result.rows.length === 0) {
        return res
          .status(401)
          .send({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
      }

      console.log(`[로그인 성공] ${email}`);
      res.status(200).send({ message: "로그인 성공", user: result.rows[0] });
    } catch (err) {
      console.error("로그인 오류:", err);
      res.status(500).send({ message: "로그인 중 서버 오류" });
    }
  });

  // ───────────────── 이메일로 프로필 조회 ─────────────────
  router.get("/get-profile", async (req, res) => {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    try {
      const result = await findProfileByEmail(pool, email);

      if (!result.rows.length) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = result.rows[0];

      const profile = {
        email: user.email,
        name: user.name || "",
        age_group: user.age_group || "",
        gender: user.gender || "",
        height: user.height || 0,
        weight: user.weight || 0,
        diseases: (user.diseases || "").split(",").filter(Boolean),
        workout_level: user.workout_level || "",
        preferred_workouts: (user.preferred_workouts || "")
          .split(",")
          .filter(Boolean),
        equipment: (user.equipment || "").split(",").filter(Boolean),
      };

      res.json(profile);
    } catch (err) {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ───────────────── userId로 사용자 정보 조회 ─────────────────
  router.get("/api/user-info/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId, 10);

    try {
      const result = await findUserInfoById(pool, userId);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const row = result.rows[0];

      res.json({
        nickname: row.name,
        name: row.name,
        level: row.level,
        coin: row.coin,
        age_group: row.age_group,
        gender: row.gender,
        height: row.height,
        weight: row.weight,
        disease: row.diseases,
        exercise_level: row.workout_level,
        preferred_exercises: row.preferred_workouts?.split(",") ?? [],
        exercise_equipment: row.equipment?.split(",") ?? [],
      });
    } catch (err) {
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};