// src/services/auth.service.js

// 회원가입 임시 저장공간
export const pendingUsers = {};

// OTP 저장소
const otpStore = new Map();

// OTP 유효 시간 (5분)
export const OTP_TTL_MS = 5 * 60 * 1000;

// OTP 저장
export function setOtp(email, otp, ttlMs = OTP_TTL_MS) {
  const prev = otpStore.get(email);
  if (prev?.timer) clearTimeout(prev.timer);

  const expiresAt = Date.now() + ttlMs;

  const timer = setTimeout(() => otpStore.delete(email), ttlMs).unref?.();

  otpStore.set(email, { otp, expiresAt, timer });
}

// OTP 가져오기
export function getOtp(email) {
  const entry = otpStore.get(email);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    if (entry.timer) clearTimeout(entry.timer);
    otpStore.delete(email);
    return null;
  }

  return entry.otp;
}

// OTP 삭제
export function clearOtp(email) {
  const entry = otpStore.get(email);
  if (entry?.timer) clearTimeout(entry.timer);
  otpStore.delete(email);
}