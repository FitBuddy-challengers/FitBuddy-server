// -----------------------------
// CSV 변환 유틸
// -----------------------------
export function csvToArray(str) {
  return (str || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// -----------------------------
// 챌린지 레벨 데이터
// -----------------------------
export function getAllChallengeLevels(pool) {
  return pool.query(
    `SELECT level, required_attendance, required_photo, required_exercise,
            reward_attendance, reward_photo, reward_exercise
     FROM challenge_level
     ORDER BY level ASC`
  );
}

export function getLevelRequirement(pool, level) {
  return pool.query(
    `SELECT required_attendance, required_photo, required_exercise
     FROM challenge_level WHERE level = $1`,
    [level]
  );
}

export function getLevelRequirementWithRewards(pool, level) {
  return pool.query(
    `SELECT required_attendance, required_photo, required_exercise,
            reward_attendance, reward_photo, reward_exercise
     FROM challenge_level WHERE level = $1`,
    [level]
  );
}

// -----------------------------
// 사용자 기본 정보 및 진행도
// -----------------------------
export function getUserBasicInfo(pool, userId) {
  return pool.query(
    `SELECT id, level, coin 
     FROM users WHERE id = $1`,
    [userId]
  );
}

export function getUserChallengeProgress(pool, userId) {
  return pool.query(
    `SELECT attendance_count, photo_count, exercise_count, last_attendance_date
     FROM user_challenge_progress 
     WHERE user_id = $1`,
    [userId]
  );
}

export function updateUserAttendance(pool, userId, today) {
  return pool.query(
    `UPDATE user_challenge_progress
     SET attendance_count = attendance_count + 1,
         last_attendance_date = $1
     WHERE user_id = $2`,
    [today, userId]
  );
}

export function updateUserExercise(pool, userId, today) {
  return pool.query(
    `INSERT INTO user_exercise_log (user_id, date)
     VALUES ($1, $2)`,
    [userId, today]
  );
}

export function upsertExerciseProgress(pool, userId, today) {
  return pool.query(
    `INSERT INTO user_challenge_progress (user_id, exercise_count, last_attendance_date)
     VALUES ($1, 1, $2)
     ON CONFLICT (user_id) DO UPDATE
     SET exercise_count = user_challenge_progress.exercise_count + 1,
         last_attendance_date = $2`,
    [userId, today]
  );
}

export function getExerciseDone(pool, userId, date) {
  return pool.query(
    `SELECT COUNT(*) 
     FROM exercise_schedule
     WHERE DATE(date) = $1
       AND is_completed = true
       AND exercise_plan_id IN (
         SELECT id FROM exercise_plan WHERE user_id = $2
       )`,
    [date, userId]
  );
}

// -----------------------------
// 레벨 관리
// -----------------------------
export function getUserLevel(pool, userId) {
  return pool.query(
    `SELECT level FROM users WHERE id = $1`,
    [userId]
  );
}

export function updateUserLevel(pool, userId, level) {
  return pool.query(
    `UPDATE users SET level = $1 WHERE id = $2`,
    [level, userId]
  );
}

// -----------------------------
// 포토 인증
// -----------------------------
export function findExistingPhoto(pool, userId, date) {
  return pool.query(
    `SELECT id FROM photo_challenges
     WHERE user_id = $1 AND DATE(created_at) = $2`,
    [userId, date]
  );
}

export function updatePhoto(pool, userId, date, imageUrl) {
  return pool.query(
    `UPDATE photo_challenges
     SET image_url = $1
     WHERE user_id = $2 AND DATE(created_at) = $3`,
    [imageUrl, userId, date]
  );
}

export function insertPhoto(pool, userId, date, imageUrl) {
  return pool.query(
    `INSERT INTO photo_challenges (user_id, created_at, image_url)
     VALUES ($1, $2, $3)`,
    [userId, date, imageUrl]
  );
}

export function increasePhotoCount(pool, userId) {
  return pool.query(
    `UPDATE user_challenge_progress
     SET photo_count = photo_count + 1
     WHERE user_id = $1`,
    [userId]
  );
}



export function getMonthlyPhotos(pool, userId, year, month) {
  return pool.query(
    `SELECT 
        to_char(created_at, 'YYYY-MM-DD') AS date,
        image_url
     FROM photo_challenges
     WHERE user_id = $1
       AND EXTRACT(YEAR FROM created_at) = $2
       AND EXTRACT(MONTH FROM created_at) = $3
     ORDER BY created_at ASC`,
    [userId, year, month]
  );
}

export function getWeeklyPhotos(pool, userId, startDate) {
  return pool.query(
    `SELECT 
        to_char(created_at, 'YYYY-MM-DD') AS date,
        image_url
     FROM photo_challenges
     WHERE user_id = $1
       AND created_at BETWEEN $2::date AND ($2::date + INTERVAL '6 day')
     ORDER BY created_at ASC`,
    [userId, startDate]
  );
}

// -----------------------------
// 코인 및 보상 정산
// -----------------------------
export function updateUserCoin(pool, userId, coin) {
  return pool.query(
    `UPDATE users SET coin = $1 WHERE id = $2`,
    [coin, userId]
  );
}

export function updateProgressAfterReward(pool, userId, countColumn, requiredCount) {
  return pool.query(
    `UPDATE user_challenge_progress
     SET ${countColumn} = GREATEST(${countColumn} - $1, 0)
     WHERE user_id = $2`,
    [requiredCount, userId]
  );
}

// -----------------------------
// 기록 및 통계
// -----------------------------
export function getMonthlyCompletion(pool, userId, start, end) {
  return pool.query(
    `SELECT
       to_char(s.date, 'YYYY-MM-DD') AS date,
       (COUNT(CASE WHEN s.is_completed THEN 1 END) * 100.0 / COUNT(*))::integer AS completion_rate
     FROM exercise_schedule s
     JOIN exercise_plan p ON s.exercise_plan_id = p.id
     WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3
     GROUP BY s.date
     ORDER BY s.date`,
    [userId, start, end]
  );
}

export function getDailyPlan(pool, userId, date) {
  return pool.query(
    `SELECT id
     FROM exercise_plan
     WHERE user_id = $1
       AND $2::date BETWEEN start_date AND end_date
     LIMIT 1`,
    [userId, date]
  );
}

export function getDailySchedule(pool, planId, date) {
  return pool.query(
    `SELECT s.id AS schedule_id, s.is_completed,
            e.name AS exercise_name, e.is_time_type
     FROM exercise_schedule s
     JOIN exercise e ON s.exercise_id = e.id
     WHERE s.exercise_plan_id = $1 AND s.date = $2
     ORDER BY s.exercise_order`,
    [planId, date]
  );
}

export function getTimeRecord(pool, scheduleId) {
  return pool.query(
    `SELECT COUNT(*) AS count,
            MAX(elapsed_time_millis) AS max_ms
     FROM exercise_time
     WHERE schedule_id = $1`,
    [scheduleId]
  );
}

export function getRepsRecord(pool, scheduleId) {
  return pool.query(
    `SELECT COUNT(*) AS count,
            MAX(reps) AS max_reps
     FROM exercise_reps
     WHERE schedule_id = $1`,
    [scheduleId]
  );
}

// -----------------------------
// 신체 기록
// -----------------------------
export function getWeightRecords(pool, userId) {
  return pool.query(
    `SELECT id, user_id, to_char(date, 'YYYY-MM-DD') AS date,
            weight, body_fat_percentage, skeletal_muscle_mass 
     FROM weight_records 
     WHERE user_id = $1 
     ORDER BY date ASC`,
    [userId]
  );
}

export function upsertWeightRecord(pool, userId, date, weight, bodyFat, muscle) {
  return pool.query(
    `INSERT INTO weight_records (user_id, date, weight, body_fat_percentage, skeletal_muscle_mass)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, date)
     DO UPDATE SET
       weight = EXCLUDED.weight,
       body_fat_percentage = EXCLUDED.body_fat_percentage,
       skeletal_muscle_mass = EXCLUDED.skeletal_muscle_mass`,
    [userId, date, weight, bodyFat, muscle]
  );
}

// -----------------------------
// 스토어 아이템
// -----------------------------
export function getItems(pool) {
  return pool.query(
    `SELECT id, name, price, required_level, image_url, type, description
     FROM items
     ORDER BY required_level ASC, price ASC, id ASC`
  );
}

export function getOwnedItems(pool, userId) {
  return pool.query(
    `SELECT item_id 
     FROM user_owned_items 
     WHERE user_id = $1`,
    [userId]
  );
}

export function getStoreUser(pool, userId) {
  return pool.query(
    `SELECT level, coin 
     FROM users 
     WHERE id = $1`,
    [userId]
  );
}

export function findItem(pool, itemId) {
  return pool.query(
    `SELECT price, required_level 
     FROM items 
     WHERE id = $1`,
    [itemId]
  );
}

export function findUser(pool, userId) {
  return pool.query(
    `SELECT level, coin 
     FROM users 
     WHERE id = $1`,
    [userId]
  );
}

export function insertUserItem(pool, userId, itemId) {
  return pool.query(
    `INSERT INTO user_owned_items (user_id, item_id)
     VALUES ($1, $2)`,
    [userId, itemId]
  );
}