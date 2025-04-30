# Challengers Node.js Server

챌린저스 프로젝트의 백엔드 서버입니다.  
사용자 회원가입, OTP 인증, 프로필 등록 및 관리를 위한 Node.js + PostgreSQL 기반 API 서버입니다.

---

## 💻 기술 스택

- **Node.js**: v22.14.0  
- **Express.js**: 경량 서버 프레임워크  
- **PostgreSQL**: v16.8  
- **pg**: PostgreSQL 연결을 위한 Node.js 모듈  
- **CORS**, **body-parser**: 요청 파싱 및 보안 설정용

---

## 📁 디렉토리 구조

```plaintext
challengers-server/
├── server.js            # 메인 서버 실행 파일
├── package.json         # 의존성 및 스크립트 정의
├── .env                 # 환경 변수 파일 (직접 생성)
└── ...                  # 기타 라우터, 유틸, DB 설정 등
```

---

## ⚙️ 실행 방법

### 1. 프로젝트 클론

```bash
git clone https://github.com/KateteDeveloper/challengers-server.git
cd challengers-server
```

### 2. 의존성 설치

```bash
npm install
```

### 3. PostgreSQL 데이터베이스 준비

```sql
-- PostgreSQL 접속
psql -U postgres

-- DB 생성
CREATE DATABASE katet;

-- DB 접속
\c katet

-- 테이블 생성
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name TEXT,
  age_group TEXT,
  gender TEXT,
  height INTEGER,
  weight INTEGER,
  diseases TEXT,
  workout_level TEXT,
  preferred_workouts TEXT,
  equipment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> 🔑 기본 PostgreSQL 계정은 `postgres`이며, 비밀번호는 설치 시 설정한 값입니다.

### 4. 환경 변수 설정 (.env)

루트 디렉토리에 `.env` 파일을 만들고 다음을 입력하세요:

```env
PORT=3000
PG_USER=postgres
PG_PASSWORD=비밀번호
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=katet
```

### 5. 서버 실행

```bash
node server.js
```

정상 실행 시: [http://localhost:3000](http://localhost:3000) 또는 [http://0.0.0.0:3000](http://0.0.0.0:3000) 에서 백엔드가 활성화됩니다.

👉 OTP는 콘솔 로그로 확인됩니다.
