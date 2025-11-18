// utils/emailTemplates.js (refined)
const fs = require('fs');
const path = require('path');

// === 브랜드 설정 ===
const BRAND = {
  name: 'FitBuddy',
  primary: '#2569ED',     // 메인 브랜드 컬러
  primaryDark: '#1D4ED8', // 버튼/그라데이션 보조
  text: '#0F172A',        // 거의 블랙
  subText: '#475569',     // 중간 그레이
  bg: '#F4F6FA',          // 전체 배경
  card: '#FFFFFF',
  border: '#E2E8F0',
  heroBgTop: '#2569ED',   // 히어로 그라데이션 시작
  heroBgBottom: '#5BA8FF',// 히어로 그라데이션 종료
  appUrl: process.env.APP_BASE_URL || '#',
  logoUrl: process.env.MALMUNGCHI_LOGO_URL || null,
};

// === 텍스트 버전 ===
function renderOtpPlain(name, code, minutes = 5) {
  return `[${BRAND.name}] 개발용 OTP 코드

${name ? `${name}님, ` : ''}아래 일회용 코드로 인증을 진행하세요. (유효기간 ${minutes}분)

${code}

만약 본인이 요청한 내용이 아니라면 이 메일을 무시해 주세요.`;
}

// === HTML 버전 ===
// 옵션: { logoDataUri, pretendardSemiBoldDataUri, appUrl }
function renderOtpHtml(name, code, minutes = 5, opts = {}) {
  const safeCode = String(code).replace(/\s+/g, '');
  const year = new Date().getFullYear();
  const appUrl = opts.appUrl ?? BRAND.appUrl;

  // 폰트 임베드 (가능한 메일앱에서만 적용됨)
  const fontFace = opts.pretendardSemiBoldDataUri
    ? `
@font-face {
  font-family: 'Pretendard';
  src: url('${opts.pretendardSemiBoldDataUri}') format('truetype');
  font-weight: 600;
  font-style: normal;
}
    `
    : '';

  // 로고 src: 우선순위 dataURI > 환경변수 URL > (없으면 숨김)
  const logoSrc = opts.logoDataUri || BRAND.logoUrl || '';

  // CTA (앱으로 돌아가기) 안전 처리
  const ctaHtml = appUrl && appUrl !== '#'
    ? `<a href="${appUrl}"
          style="display:inline-block; padding:14px 22px; color:#FFFFFF; text-decoration:none; font-weight:700; font-size:14px; border-radius:12px; letter-spacing:.2px;">
         앱으로 돌아가기
       </a>`
    : `<div role="button"
            style="display:inline-block; padding:14px 22px; color:#FFFFFF; text-decoration:none; font-weight:700; font-size:14px; border-radius:12px; letter-spacing:.2px;">
         앱 내 인증 화면으로 이동해 주세요
       </div>`;

  return `
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>[${BRAND.name}] 개발용 OTP 코드</title>
  <style>
    ${fontFace}
    /* iOS 다크모드 강제색 방지 소량 힌트 */
    @media (prefers-color-scheme: dark) {
      .force-bg { background: ${BRAND.card} !important; }
      .force-text { color: ${BRAND.text} !important; }
    }
    /* 모바일 최적화 */
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
      .px { padding-left: 20px !important; padding-right: 20px !important; }
      .otp { font-size: 28px !important; letter-spacing: 4px !important; }
      .title { font-size: 18px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:${BRAND.bg};">
  <!-- Preheader(받은편지함 요약) -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    인증용 일회용 코드가 도착했어요. 유효기간은 ${minutes}분입니다.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BRAND.bg}; padding:28px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="container" style="width:600px; max-width:600px; background:${BRAND.card}; border:1px solid ${BRAND.border}; border-radius:18px; overflow:hidden; box-shadow:0 8px 24px rgba(15, 23, 42, 0.08);">
          
          <!-- Hero/Header (그라데이션 + 로고 + 브랜드) -->
          <tr>
            <td style="padding:32px 28px 26px 28px; background: linear-gradient(135deg, ${BRAND.heroBgTop} 0%, ${BRAND.heroBgBottom} 100%);" align="center">
              ${logoSrc ? `
                <img src="${logoSrc}" width="72" height="72" alt="${BRAND.name} 로고"
                     style="display:block; width:56px; height:56px; border:0; margin:0 auto 12px auto; border-radius:14px; background:rgba(255,255,255,.08);">
              ` : ``}
              <div style="font-family: ${opts.pretendardSemiBoldDataUri ? 'Pretendard, ' : ''}system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Apple SD Gothic Neo, '맑은 고딕', sans-serif; font-size:20px; font-weight:700; color:#FFFFFF; letter-spacing:.2px;">
                ${BRAND.name}
              </div>
              <div style="height:6px;"></div>
              <div style="font-family: ${opts.pretendardSemiBoldDataUri ? 'Pretendard, ' : ''}system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Apple SD Gothic Neo, '맑은 고딕', sans-serif; font-size:13px; font-weight:600; color:#EAF2FF; opacity:0.95;">
                AI를 활용한 사용자 정보 기반 운동 코칭 서비스
              </div>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td align="left" class="px" style="padding:26px 32px 10px 32px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Apple SD Gothic Neo, '맑은 고딕', sans-serif; color:${BRAND.text};">
              <div class="title" style="font-size:22px; font-weight:800; letter-spacing:.2px;">
                [${BRAND.name}] OTP 코드
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="px" style="padding:0 32px 0 32px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Apple SD Gothic Neo, '맑은 고딕', sans-serif; color:${BRAND.text};">
              <p style="margin:0; font-size:15px; line-height:24px; color:${BRAND.subText};">
                ${name ? `<strong style="color:${BRAND.text};">${name}</strong>님, ` : ''}아래 <strong>일회용 코드</strong>로 인증을 진행해 주세요. (유효기간 ${minutes}분)
              </p>
              <div style="height:16px;"></div>

              <!-- OTP 카드 -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                     style="border:1px dashed ${BRAND.border}; border-radius:14px; background:#F9FBFF;">
                <tr>
                  <td align="center" style="padding:26px 22px;">
                    <div class="otp" style="font-size:34px; line-height:42px; font-weight:800; letter-spacing:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; color:${BRAND.text};">
                      ${safeCode}
                    </div>
                    <div style="height:8px;"></div>
                    <div style="font-size:12px; color:${BRAND.subText};">
                      만료까지 약 ${minutes}분 남았어요
                    </div>
                  </td>
                </tr>
              </table>

              <div style="height:20px;"></div>

              <!-- CTA 버튼 -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td align="center" style="border-radius:12px; background:${BRAND.primary}; box-shadow:0 6px 14px rgba(37,105,237,.28);">
                    ${ctaHtml}
                  </td>
                </tr>
              </table>

              <div style="height:26px;"></div>
              <p style="margin:0; font-size:12px; line-height:18px; color:${BRAND.subText};">
                본인이 요청하지 않았다면 이 메일을 무시해 주세요. 보안을 위해 이 코드는 <strong>1회용</strong>입니다.
              </p>

              <div style="height:28px;"></div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 24px;">
              <div style="height:1px; background:${BRAND.border}; width:100%;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:16px 24px 18px 24px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Apple SD Gothic Neo, '맑은 고딕', sans-serif; color:${BRAND.subText}; font-size:12px;">
              © ${year} | ${BRAND.name}
              &nbsp;&nbsp; <a href="#" style="color:${BRAND.subText}; text-decoration:underline;">Unsubscribe</a>
              &nbsp; | &nbsp;
              <a href="#" style="color:${BRAND.subText}; text-decoration:underline;">Preferences</a>
            </td>
          </tr>
        </table>

        <div style="height:12px;"></div>

        <!-- 헬프텍스트 -->
        <div style="width:600px; max-width:600px; font-size:12px; color:${BRAND.subText}; text-align:center; font-family: system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Apple SD Gothic Neo, '맑은 고딕', sans-serif;">
          메일이 잘 보이지 않으면 브라우저에서 열어보거나, 스팸함을 확인해 주세요.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

module.exports = { renderOtpHtml, renderOtpPlain };

/* =========================
   미리보기 전용 실행(안전)
   node utils/emailTemplates.js
   ========================= */
if (require.main === module) {
  // 1) 로고 PNG/WEBP → Base64 data URI (미리보기 편의)
  const LOCAL_LOGO_PATH = process.env.LOCAL_LOGO_PATH ||
    path.join(__dirname, 'malmungchi.png');

  let logoDataUri = null;
  try {
    if (fs.existsSync(LOCAL_LOGO_PATH)) {
      const mime = LOCAL_LOGO_PATH.endsWith('.webp') ? 'image/webp'
                 : LOCAL_LOGO_PATH.endsWith('.jpg') || LOCAL_LOGO_PATH.endsWith('.jpeg') ? 'image/jpeg'
                 : 'image/png';
      const b64 = fs.readFileSync(LOCAL_LOGO_PATH).toString('base64');
      logoDataUri = `data:${mime};base64,${b64}`;
    }
  } catch {}

  // 2) Pretendard-SemiBold.ttf → Base64 data URI (가능한 메일앱에서만 적용)
  const LOCAL_FONT_PATH = process.env.LOCAL_FONT_PATH ||
    path.join(__dirname, 'Pretendard-SemiBold.ttf');

  let pretendardSemiBoldDataUri = null;
  try {
    if (fs.existsSync(LOCAL_FONT_PATH)) {
      const b64 = fs.readFileSync(LOCAL_FONT_PATH).toString('base64');
      pretendardSemiBoldDataUri = `data:font/ttf;base64,${b64}`;
    }
  } catch {}

  const html = renderOtpHtml('채영', '123456', 5, {
    logoDataUri,
    pretendardSemiBoldDataUri,
    appUrl: process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || '#',
  });

  const out = path.join(__dirname, 'otp_preview.html');
  fs.writeFileSync(out, html, 'utf8');

  console.log('✅ otp_preview.html 파일이 생성되었습니다.');
  console.log('👉 파일을 크롬/엣지로 열어 디자인을 확인하세요.');
  console.log('   로고 경로 바꾸기:  LOCAL_LOGO_PATH="C:\\\\Users\\\\office\\\\Downloads\\\\전달사항\\\\malmungchi.png"');
  console.log('   폰트 경로 바꾸기:  LOCAL_FONT_PATH="C:\\\\Users\\\\office\\\\Downloads\\\\전달사항\\\\Pretendard-SemiBold.ttf"');
}
