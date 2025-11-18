// src/services/mailer.js (ESM으로 재수정)

import nodemailer from "nodemailer";
import crypto from "crypto";
// emailTemplates.js도 ESM으로 export 되었다고 가정합니다.
import { renderOtpHtml, renderOtpPlain } from "./emailTemplates.js"; 

const {
  EMAIL_USER,
  EMAIL_PASS,
  NODE_ENV,
  APP_BASE_URL,
  PUBLIC_BASE_URL,
} = process.env;

// ───────────────────────── SMTP (Gmail) ─────────────────────────
const transporter = nodemailer.createTransport({
  pool: true,
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

// 개발 환경에서만 verify
if (NODE_ENV !== "production") {
  transporter
    .verify()
    .then(() => console.log("📧 Mailer connected OK"))
    .catch((err) => console.error("📧 Mailer verify failed:", err));
}

// ───────────────────────── Retry helper ─────────────────────────
async function sendWithRetry(mailOptions, maxRetries = 3) {
  let attempt = 0;
  let delay = 400;

  while (true) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (err) {
      attempt++;
      const isLast = attempt >= maxRetries;

      const transient =
        /ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|Too many login attempts/i.test(
          err?.message || ""
        );

      if (!transient || isLast) throw err;

      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// ───────────────────────── Template builder ─────────────────────────
function buildOtpMail({ to, name, otp, minutes = 5 }) {
  const subject = `[FitBuddy] OTP 코드`;

  const html = renderOtpHtml(name, otp, minutes, {
    appUrl: APP_BASE_URL || PUBLIC_BASE_URL || "#",
  });

  const text = renderOtpPlain(name, otp, minutes);

  const domain =
    (EMAIL_USER || "fitbuddy.local").split("@")[1] || "fitbuddy.local";

  const messageId = `<otp-${Date.now()}-${crypto
    .randomBytes(6)
    .toString("hex")}@${domain}>`;

  return {
    from: EMAIL_USER,
    to,
    subject,
    text,
    html,
    messageId,
    headers: {
      "X-Entity-Ref-ID": messageId,
      "X-Campaign": "otp",
      "Auto-Submitted": "auto-generated",
      "List-Unsubscribe": `<mailto:${EMAIL_USER}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

// ───────────────────────── Public API ─────────────────────────
// module.exports 대신 export 사용
export async function sendOtpMail(to, otp, { name, minutes = 5 } = {}) {
  const mail = buildOtpMail({ to, name, otp, minutes });
  const info = await sendWithRetry(mail);
  return info;
}



// // // services/mailer.js
// // const nodemailer = require('nodemailer');
// // const crypto = require('crypto');

// // const {
// //   EMAIL_USER,      // Gmail 주소 (예: yourname@gmail.com)
// //   EMAIL_PASS,      // Gmail 앱 비밀번호 (2단계 인증 후 발급)
// //   NODE_ENV,
// //   PUBLIC_BASE_URL, // 선택: "앱으로 돌아가기" 링크에 사용할 기본 URL
// // } = process.env;

// // // ───────────────────────── SMTP (Gmail) ─────────────────────────
// // const transporter = nodemailer.createTransport({
// //   pool: true,
// //   host: 'smtp.gmail.com',
// //   port: 465,
// //   secure: true,
// //   auth: { user: EMAIL_USER, pass: EMAIL_PASS },
// //   connectionTimeout: 10_000,
// //   greetingTimeout: 10_000,
// //   socketTimeout: 20_000,
// // });

// // // 개발/스테이징에서만 연결 검증
// // if (NODE_ENV !== 'production') {
// //   transporter.verify()
// //     .then(() => console.log('📧 Mailer connected OK'))
// //     .catch(err => console.error('📧 Mailer verify failed:', err));
// // }

// // // ───────────────────────── Retry helper ─────────────────────────
// // async function sendWithRetry(mailOptions, maxRetries = 3) {
// //   let attempt = 0, delay = 400;
// //   // 간단 지수 백오프 재시도
// //   while (true) {
// //     try {
// //       return await transporter.sendMail(mailOptions);
// //     } catch (err) {
// //       attempt++;
// //       const isLast = attempt >= maxRetries;
// //       const transient = /ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|Too many login attempts/i.test(err?.message || '');
// //       if (!transient || isLast) throw err;
// //       await new Promise(r => setTimeout(r, delay));
// //       delay *= 2;
// //     }
// //   }
// // }

// // // ───────────────────────── Template builder ─────────────────────────
// // // 스크린샷과 유사한 레이아웃의 HTML + text 대체 본문.
// // // brand/subtitle/year/appUrl은 기본값을 FitBuddy로 세팅.
// // function buildOtpMail({
// //   to,
// //   otp,
// //   brand = 'FitBuddy',
// //   subtitle = 'AI를 활용한 사용자 정보 기반 운동 코칭 서비스',
// //   year = '2025',
// //   appUrl = PUBLIC_BASE_URL || '#',
// // }) {
// //   // 제목: 요청대로 소문자 "otp 코드"
// //   const subject = `[${brand}] otp 코드`;

// //   // 프리헤더(받은편지함 미리보기 줄)
// //   const preheader = `${brand} 인증번호 ${otp} (유효기간 5분)`;

// //   // text 대체본문(스팸 필터/가독성)
// //   const text = [
// //     `[${brand}] otp 코드: ${otp}`,
// //     '',
// //     '아래 코드로 인증을 진행해 주세요. (유효기간 5분)',
// //     '',
// //     `앱으로 돌아가기: ${appUrl}`,
// //     '',
// //     '본인이 요청하지 않았다면 이 메일을 무시해 주세요. 코드 사용은 1회만 가능합니다.',
// //     '',
// //     `© ${year} ${brand}`,
// //   ].join('\n');

// //   // 고유 Message-ID
// //   const messageId = `<otp-${Date.now()}-${crypto.randomBytes(6).toString('hex')}@${EMAIL_USER.split('@')[1]}>`;

// //   // 인라인 스타일 HTML (이미지/추적 없음, 깔끔한 구조)
// //   const html = `
// // <!doctype html>
// // <html lang="ko">
// // <head>
// //   <meta charset="UTF-8">
// //   <meta name="color-scheme" content="light">
// //   <meta name="supported-color-schemes" content="light">
// //   <title>${subject}</title>
// //   <style>
// //     /* 이메일 클라이언트 호환을 위해 최소 스타일만 사용 */
// //     .container{max-width:560px;margin:0 auto;padding:0 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;}
// //     .header{background:#1f6feb;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px;}
// //     .brand{font-size:22px;font-weight:700;margin:0;}
// //     .subtitle{font-size:12px;opacity:.9;margin:6px 0 0 0;}
// //     .card{border:1px solid #e6e8eb;border-top:0;border-radius:0 0 14px 14px;padding:20px 24px;}
// //     .title{font-size:16px;font-weight:700;margin:6px 0 12px 0}
// //     .desc{color:#444;font-size:14px;margin:0 0 12px 0}
// //     .otpbox{border:1px dashed #d0d7de;background:#f6f8fa;border-radius:12px;padding:18px 16px;text-align:center}
// //     .otp{font-size:32px;letter-spacing:6px;font-weight:800}
// //     .hint{font-size:12px;color:#555;margin-top:6px}
// //     .btn{display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;margin:16px 0 2px 0}
// //     .foot{border-top:1px solid #e6e8eb;margin-top:18px;padding-top:14px;color:#666;font-size:12px}
// //     .links a{color:#666;text-decoration:underline}
// //     .preheader{display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden}
// //   </style>
// // </head>
// // <body>
// //   <span class="preheader">${preheader}</span>
// //   <div class="container">
// //     <div class="header">
// //       <h1 class="brand">${brand}</h1>
// //       <p class="subtitle">${subtitle}</p>
// //     </div>
// //     <div class="card">
// //       <div class="title">[${brand}] 개발용 OTP 코드</div>
// //       <p class="desc">아래 일회용 코드로 인증을 진행해 주세요. (유효기간 5분)</p>
// //       <div class="otpbox">
// //         <div class="otp">${otp}</div>
// //         <div class="hint">만료까지 약 5분 남았어요</div>
// //       </div>
// //       <p style="margin:16px 0 0 0;">
// //         <a class="btn" href="${appUrl}" target="_blank" rel="noopener">앱으로 돌아가기</a>
// //       </p>
// //       <p class="hint">본인이 요청하지 않았다면 이 메일을 무시해 주세요. 보안을 위해 이 코드는 1회용입니다.</p>

// //       <div class="foot">
// //         <div>© ${year} | ${brand}</div>
// //         <div class="links" style="margin-top:6px">
// //           <a href="mailto:${EMAIL_USER}?subject=Unsubscribe%20${encodeURIComponent(brand)}">Unsubscribe</a> ·
// //           <a href="${appUrl}">Preferences</a>
// //         </div>
// //         <div style="margin-top:6px;">메일이 잘 보이지 않으면 브라우저에서 열어보거나, 스팸함을 확인해 주세요.</div>
// //       </div>
// //     </div>
// //   </div>
// // </body>
// // </html>`.trim();

// //   return {
// //     from: EMAIL_USER,         // Gmail은 from=auth user가 가장 안전
// //     to,
// //     subject,
// //     text,
// //     html,
// //     messageId,
// //     headers: {
// //       'X-Entity-Ref-ID': messageId,
// //       'X-Campaign': 'otp',
// //       'Auto-Submitted': 'auto-generated',                // 자동 발송 신호
// //       'List-Unsubscribe': `<mailto:${EMAIL_USER}>`,      // 스팸함 최소화 도움(표준 수신거부)
// //       'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
// //     },
// //     // replyTo: 'support@fitbuddy.example', // 운영 메일 있으면 지정
// //   };
// // }

// // // ───────────────────────── Public API ─────────────────────────
// // // 사용법: sendOtpMail('user@example.com', '501717', { appUrl: 'https://yourapp.com' })
// // async function sendOtpMail(to, otp, options = {}) {
// //   const mail = buildOtpMail({ to, otp, ...options });
// //   const info = await sendWithRetry(mail);
// //   return info; // { messageId, response, ... }
// // }

// // module.exports = { sendOtpMail };