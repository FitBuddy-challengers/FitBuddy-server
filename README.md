# 🏋️‍♂️ FitBuddy Server

FitBuddy는 사용자의 맞춤형 운동 루틴 생성, 운동 진행 체크, 인증 사진 업로드, 챌린지 진행률 계산 등을 제공하는 헬스케어 플랫폼입니다.  
본 서버는 FitBuddy **Android 앱과 통신**하며, 모든 운동·챌린지·기록·상점 로직을 처리합니다.

---

## 🧱 Tech Stack

| 영역 | 기술 |
|------|------|
| Backend Framework | Node.js (Express) |
| Database | PostgreSQL |
| Deployment | Render |
| File Upload | multer (local storage) – *추후 AWS S3 연동 가능* |
| API Testing | Postman |
| Auth | OTP 기반 이메일 인증 + 사용자 정보 저장 |
| User Info | JWT 로그인(선택) + UserPreference 기반 캐싱 구조 |

---

## 📂 Project Structure (Actual Directory Structure)

SERVER_NEW/
├─ node_modules/  
├─ src/  
│  ├─ controller/  
│  │  ├─ exercise/  
│  │  │  ├─ checkExistingPlan.controller.js  
│  │  │  ├─ deleteDummyPlan.controller.js  
│  │  │  ├─ exerciseAi.controller.js  
│  │  │  ├─ master.controller.js  
│  │  │  ├─ plan.controller.js  
│  │  │  ├─ planList.controller.js  
│  │  │  ├─ reps.controller.js  
│  │  │  ├─ schedule.controller.js  
│  │  │  ├─ submitAi.controller.js  
│  │  │  ├─ time.controller.js  
│  │  │  └─ todayPlan.controller.js  
│  │  ├─ records/  
│  │  │  └─ records.controller.js  
│  │  ├─ auth.controller.js  
│  │  ├─ challenge.controller.js  
│  │  └─ store.controller.js  
│  │  
│  ├─ generated/  
│  │  └─ (Prisma 또는 기타 코드 생성 파일)  
│  
│  ├─ repositories/  
│  │  ├─ auth.repository.js  
│  │  ├─ challenge.repository.js  
│  │  └─ store.repository.js  
│  
│  ├─ route/  
│  │  ├─ challenge.route.js  
│  │  ├─ exercise.route.js  
│  │  ├─ records.route.js  
│  │  └─ store.route.js  
│  
│  ├─ middleware/  
│  │  └─ (auth, upload 등)  
│  
│  ├─ db/  
│  │  └─ index.js  
│  
│  └─ app.js  
│  
├─ uploads/  
├─ .env  
├─ package.json  
└─ README.md  

---

## 🏋️‍♂️ Core Features

### ✔ 1. 운동 플랜 생성 API
- OpenAI GPT 기반 자동 운동 루틴 구성  
- 결과는 다음 테이블에 저장됨:  
  - `exercise_plan`  
  - `exercise_schedule`  
  - `exercise_reps`  
  - `exercise_time`

---

### ✔ 2. 오늘의 운동 조회 API

```json
{
  "plan": { "id": 151, "date": "2025-12-10" },
  "schedules": [
    {
      "schedule_id": 336,
      "exercise_name": "덤벨 벤치 프레스",
      "set_count": 4,
      "reps": 12,
      "display_detail": "12회 × 4세트"
    }
  ]
}
```

---

### ✔ 3. 운동 진행 체크 API
반복 운동 → `/schedule/update/reps-set-completion`  
시간 운동 → `/schedule/update/time-set-completion`  

- 세트 완료 상태 저장  
- 모든 세트 완료 시 운동 완료 처리  
- 운동 완료 시 챌린지 연동됨

---

### ✔ 4. 챌린지 시스템 (레벨 / 코인)
- 출석, 운동 완료, 사진 업로드 시 포인트 증가  
- 조건 충족 시 레벨업  
- 각 챌린지 타입별로 보상 지급  
- API 예시:
  - `/api/challenge/attendance/:userId`
  - `/api/challenge/exercise/:userId`
  - `/api/challenge/upload-photo`
  - `/challenge/claim` (보상 수령)

---

### ✔ 5. 기록 · 통계 API
#### 🗓 월별 운동 완료율
- 날짜별 운동 완료 퍼센트 계산  
- `/api/records/monthly-completion`

#### 📝 특정 날짜 운동 기록 조회
- `/api/records/daily`

#### 📊 월간 요약 (많이 한 부위 / 적게 한 부위 / 가장 많이 한 운동)
- METs × 운동 시간 기반 계산

#### 🕸 레이더 차트 데이터
- 부위별운동량 계산  
- week / month / year / all 지원

#### ⚖ 체중 기록 관리
- 체중/골격근량/체지방률 저장 & 조회  
- `/api/records/weight`

---

### ✔ 6. 상점 시스템 (Store)
- 아이템 목록 조회  
- 보유 아이템 조회  
- 아이템 구매 시 coin 차감  
- 관련 API:  
  - `/api/store/items`  
  - `/api/store/owned-items`  
  - `/api/store/purchase`

---

## 🚀 Server Architecture Summary

| 영역 | 설명 |
|------|------|
| **Controllers** | 모든 API 비즈니스 로직 처리 |
| **Repositories** | SQL 쿼리 관리 (PostgreSQL) |
| **Routes** | API 엔드포인트 라우팅 |
| **Services** | 이메일 OTP, 챌린지 계산 등 핵심 기능 |
| **uploads/** | 인증 사진 저장 디렉토리 |
| **db/index.js** | PostgreSQL 커넥션 풀 관리 |

---

## 🧪 API Test 방법
1. **npm install**
2. `.env` 설정  
3. **npm start**
4. Postman에서 엔드포인트 호출하여 테스트

---

## 🛠 Environment Variables (.env)

```
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME
MAIL_USER=...
MAIL_PASS=...
JWT_SECRET=...
```

---

## 📌 Notes
- multer → S3 연동 가능 구조  
- Controller/Service/Repository 구조로 확장성 극대화  
- Android 앱과 실시간 기능 동기화 완료  

---



