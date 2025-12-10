# 🏋️‍♂️ FitBuddy Server

FitBuddy는 사용자의 맞춤형 운동 루틴 생성, 운동 진행 체크, 인증 사진 업로드, 챌린지 진행률 계산 등을 제공하는 헬스 케어 플랫폼입니다.  
본 서버는 FitBuddy **Android 앱과 통신**하며, 모든 운동·챌린지 로직을 처리합니다.

---

## 🧱 Tech Stack

| 영역 | 기술 |
|------|------|
| Backend Framework | Node.js (Express) |
| Database | PostgreSQL |
| Deployment | Render |
| File Upload | multer (local storage) – *추후 AWS S3 연동 가능* |
| API Testing | Postman |
| Auth / User Info | JWT 기반 로그인(선택), UserPreference 기반 캐싱 |

---

## 📂 Project Structure
FitBuddy-Server/
├─ src/
│ ├─ routes/
│ │ ├─ auth.js
│ │ ├─ plan.js
│ │ ├─ schedule.js
│ │ ├─ challenge.js
│ │ └─ upload.js
│ ├─ controllers/
│ ├─ middleware/
│ ├─ db/
│ │ └─ index.js
│ └─ app.js
├─ uploads/
├─ .env
├─ package.json
└─ README.md

## 🏋️‍♂️ Core Features

### ✔ 1. 운동 플랜 생성 API
- OpenAI GPT 기반 맞춤 운동 루틴 자동 생성  
- 생성된 운동은 `plans`, `schedules`, `reps_sets`, `time_sets` 테이블에 저장됨


### ✔ 2. 오늘의 운동 조회 API

json
{
  "plan": { "id": 151, "date": "2025-12-10" },
  "schedules": [
    { "schedule_id": 336, "exercise_name": "덤벨 벤치 프레스" }
  ]
}

### 3. 운동 진행 체크 API

반복 운동: /schedule/update/reps-set-completion
시간 운동: /schedule/update/time-set-completion
세트별 completion 저장 → 모든 세트 완료 시 운동 완료 처리

###4. 챌린지 시스템

운동 완료 여부 기록
인증 사진 업로드 시 챌린지 포인트 증가
챌린지 보상(레벨/코인) 지급 API 제공










