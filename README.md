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

## Visual Studio Code 에서 new Terminal를 열고, 아래의 사항을 입력하면 됩니다.
### 단, 깃이 컴퓨터에 깔려있어야 아래의 작업을 하실 수 있습니다.

### 1. 프로젝트 클론 => VisualStudioCode에서

```bash 
git clone https://github.com/KateteDeveloper/challengers-server.git
cd challengers-server
```

### 2. 의존성 설치 => VisualStudioCode에서 

```bash
npm install
```

### 3. PostgreSQL 데이터베이스 준비 => cmd에서! postgre를 인식하지 못하면,  


# PostgreSQL psql 명령어 인식 문제 해결 가이드

## 문제
Windows 명령 프롬프트에서 `psql` 명령어 실행 시 다음과 같은 오류가 발생:
```
'psql'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는 배치 파일이 아닙니다.
```

## 원인
PostgreSQL 설치는 되었지만, `psql.exe`가 위치한 `bin` 폴더가 환경 변수(PATH)에 등록되지 않아서입니다.

## 해결 방법

### 1. PostgreSQL 설치 경로 확인
보통 다음 경로 중 하나에 설치됩니다:
```
C:\Program Files\PostgreSQL\15\bin
```
> 설치한 PostgreSQL 버전에 따라 `15`는 다를 수 있습니다.

### 2. 환경 변수에 bin 디렉터리 추가
1. Windows 검색창에 `환경 변수` 입력 → **"시스템 환경 변수 편집"** 클릭
2. 하단의 **[환경 변수(N)...]** 클릭
3. "시스템 변수" 또는 "사용자 변수" 항목 중 `Path` 선택 후 → **[편집]**
4. **[새로 만들기]** 클릭 후 PostgreSQL의 `bin` 경로 입력
   예: 
   ```
   C:\Program Files\PostgreSQL\15\bin
   ```
5. **확인 → 확인 → 확인**으로 모두 닫고 적용

### 3. 명령 프롬프트 다시 열기
기존 명령 프롬프트는 적용되지 않으므로 새 창을 열어 다음 실행:
```
psql -U postgres
```

### 4. 확인 명령어
환경변수가 제대로 설정되었는지 확인하려면:
```
where psql
```
경로가 출력되면 설정 완료입니다.

---

문의나 오류가 있다면 팀에 알려주세요!



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
