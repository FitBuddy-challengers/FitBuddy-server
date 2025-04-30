# Challengers Node.js Server

챌린저스 프로젝트의 백엔드 서버입니다.  
사용자 회원가입, OTP 인증, 프로필 등록 및 관리를 위한 Node.js + PostgreSQL 기반 API 서버입니다.

---

## 💻 기술 스택

- **Node.js**: v22.14.0
- **Express.js**: 경량 서버 프레임워크
- **PostgreSQL**: v16.8
- **pg**: PostgreSQL 연결을 위한 Node.js 모듈
- **CORS / body-parser**: 요청 파싱 및 보안

---

## 📁 디렉토리 구조

⚙️ 실행 방법
1. 프로젝트 클론
bash
코드 복사
git clone https://github.com/KateteDeveloper/challengers-server.git
cd challengers-server
2. 의존성 설치
bash
코드 복사
npm install
3. PostgreSQL 데이터베이스 준비
PostgreSQL을 설치한 뒤, 아래와 같이 데이터베이스와 테이블을 생성하세요:

sql
코드 복사
-- PostgreSQL 접속
psql -U postgres

-- DB 생성
CREATE DATABASE katet;

🛠 PostgreSQL 데이터베이스 준비
PostgreSQL 접속

bash
코드 복사
psql -U postgres
데이터베이스 생성

sql
코드 복사
CREATE DATABASE katet;
데이터베이스 접속

sql
코드 복사
\c katet
users 테이블 생성

sql
코드 복사
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
🔑 기본 PostgreSQL 계정은 postgres이며, 비밀번호는 설치 시 설정한 값입니다.

4. 환경변수 설정 (.env)
.env 파일을 루트 디렉토리에 만들어 다음 내용을 입력하세요:

env
코드 복사
PORT=3000
PG_USER=postgres
PG_PASSWORD=비밀번호
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=katet
5. 서버 실행
bash
코드 복사
node server.js
실행되면: http://localhost:3000 또는 http://0.0.0.0:3000 에서 백엔드가 활성화됩니다.

OTP는 콘솔 로그로 확인 가능합니다.


