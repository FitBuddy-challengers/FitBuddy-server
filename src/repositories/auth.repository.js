// src/repositories/auth.repository.js

// 이미 pool은 controller에서 전달받기 때문에
// 이 파일에서는 pool을 파라미터로 받아서 사용한다.

// 이메일 존재 여부 확인
export function findUserByEmail(pool, email) {
    return pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
  }
  
  // 회원 생성
  export function createUser(pool, email, password) {
    return pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2)",
      [email, password]
    );
  }
  
  // 이메일로 userId 조회
  export function getUserIdByEmail(pool, email) {
    return pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
  }
  
  // user_challenge_progress 생성
  export function createUserChallengeProgress(pool, userId) {
    return pool.query(
      `INSERT INTO user_challenge_progress 
        (user_id, attendance_count, photo_count, exercise_count, last_attendance_date)
       VALUES ($1, 0, 0, 0, NULL)`,
      [userId]
    );
  }
  
  // 프로필 업데이트
  export function updateProfile(pool, data) {
    return pool.query(
      `
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
      `,
      [
        data.name,
        data.age_group,
        data.gender,
        data.height,
        data.weight,
        data.diseases.join(","),
        data.workout_level,
        data.preferred_workouts.join(","),
        data.equipment.join(","),
        data.email,
      ]
    );
  }
  
  // 로그인 (이메일 + 패스워드)
  export function loginUser(pool, email, password) {
    return pool.query(
      "SELECT * FROM users WHERE email = $1 AND password = $2",
      [email, password]
    );
  }
  
  // 이메일로 프로필 조회
  export function findProfileByEmail(pool, email) {
    return pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
  }
  
  // userId로 사용자 정보 조회
  export function findUserInfoById(pool, userId) {
    return pool.query(
      `
        SELECT name, level, coin, age_group, gender, height, weight, diseases,
              workout_level, preferred_workouts, equipment
        FROM users
        WHERE id = $1
      `,
      [userId]
    );
  }