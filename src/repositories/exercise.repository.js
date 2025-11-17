// src/repositories/exercise.repository.js

export default function exerciseRepository({ pool }) {
    console.log("📦 exerciseRepository 로드됨");
  
    // ─────────────────────────────────────────────
    // 공용 유틸 (쿼리 실행 헬퍼)
    // ─────────────────────────────────────────────
    async function query(sql, params) {
      return pool.query(sql, params);
    }
  
    // ─────────────────────────────────────────────
    // [1] 사용자 정보 조회
    // ─────────────────────────────────────────────
    async function getUserInfo(userId) {
      return query(
        `
        SELECT name, age_group, gender, height, weight, diseases, workout_level, preferred_workouts, equipment
        FROM users
        WHERE id = $1
        `,
        [userId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [2] 월별 분석 — 공용 baseQuery 포함
    // ─────────────────────────────────────────────
    async function getMonthlyWorkoutParts(userId, firstDay, lastDay) {
      const baseQuery = `
        WITH monthly_completed_workouts AS (
          SELECT 
            s.exercise_id, (r.time_seconds * 1000) AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_reps r ON s.id = r.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 
            AND r.is_completed = true AND r.time_seconds > 0
  
          UNION ALL
  
          SELECT 
            s.exercise_id, t.elapsed_time_millis AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_time t ON s.id = t.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 
            AND t.is_completed = true AND t.elapsed_time_millis > 0
        )
      `;
      return query(
        `
        ${baseQuery}
        SELECT e.part, w.duration_ms
        FROM monthly_completed_workouts w
        JOIN exercise e ON w.exercise_id = e.id;
        `,
        [userId, firstDay, lastDay]
      );
    }
  
    async function getMonthlyMostFrequentExercise(userId, firstDay, lastDay) {
      const baseQuery = `
        WITH monthly_completed_workouts AS (
          SELECT 
            s.exercise_id, (r.time_seconds * 1000) AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_reps r ON s.id = r.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 
            AND r.is_completed = true AND r.time_seconds > 0
  
          UNION ALL
  
          SELECT 
            s.exercise_id, t.elapsed_time_millis AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_time t ON s.id = t.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3
            AND t.is_completed = true AND t.elapsed_time_millis > 0
        )
      `;
      return query(
        `
        ${baseQuery}
        SELECT e.name, SUM(w.duration_ms) as total_duration
        FROM monthly_completed_workouts w
        JOIN exercise e ON w.exercise_id = e.id
        GROUP BY e.name 
        ORDER BY total_duration DESC 
        LIMIT 1;
        `,
        [userId, firstDay, lastDay]
      );
    }
  
    // ─────────────────────────────────────────────
    // [3] 운동 마스터 조회
    // ─────────────────────────────────────────────
    async function getAllExercises() {
      return query(`SELECT * FROM exercise`);
    }
  
    // 즐겨찾기 변경
    async function updateFavoriteStatus(isFavorite, exerciseId) {
      return query(
        `
        UPDATE exercise 
        SET is_favorite = $1 
        WHERE id = $2 
        RETURNING id, name, is_favorite
        `,
        [isFavorite, exerciseId]
      );
    }
  
    // 숨김 변경
    async function updateHiddenStatus(isHidden, exerciseId) {
      return query(
        `
        UPDATE exercise 
        SET is_hidden = $1 
        WHERE id = $2 
        RETURNING id, name, is_hidden, is_favorite
        `,
        [isHidden, exerciseId]
      );
    }
  
    // ─────────────────────────────────────────────
    // Part2-1 export
    // ─────────────────────────────────────────────
    return {
      query,
  
      // 사용자 정보
      getUserInfo,
  
      // 월간 분석
      getMonthlyWorkoutParts,
      getMonthlyMostFrequentExercise,
  
      // 운동 마스터
      getAllExercises,
      updateFavoriteStatus,
      updateHiddenStatus,
    };
  }
  // src/repositories/exercise.repository.js  (Part2-2 이어서)

export default function exerciseRepository({ pool }) {

    async function query(sql, params) {
      return pool.query(sql, params);
    }
  
    // ─────────────────────────────────────────────
    // [4] 오늘 날짜 플랜 조회
    // ─────────────────────────────────────────────
    async function findTodayPlan(userId, today) {
      return query(
        `
        SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date,
               day, day_pattern, completed_days, is_dummy
        FROM exercise_plan
        WHERE user_id = $1 AND $2::date BETWEEN start_date AND end_date
        LIMIT 1
        `,
        [userId, today]
      );
    }
  
    // 오늘 스케줄 조회
    async function getTodaySchedules(planId) {
      return query(
        `
        SELECT 
            s.id AS schedule_id,
            COALESCE(r.exercise_id, t.exercise_id) AS exercise_id,
            to_char(s.date, 'YYYY-MM-DD') AS date,
            s.exercise_order,
            s.is_completed,
            s.is_dummy,
            e.name AS exercise_name,
            e.part,
            e.equip,
            e.image_path,
            e.start_position,
            e.exercise_motion,
            e.breathing,
            e.caution,
            e.mets,
            e.is_time_type,
            e.is_noise,
            e.is_favorite,
            e.is_hidden
          FROM exercise_schedule s
          LEFT JOIN exercise_reps r ON s.id = r.schedule_id AND r.set_number = 1
          LEFT JOIN exercise_time t ON s.id = t.schedule_id
          LEFT JOIN exercise e ON e.id = COALESCE(s.exercise_id, r.exercise_id, t.exercise_id)
          WHERE s.exercise_plan_id = $1
          AND COALESCE(s.exercise_id, r.exercise_id, t.exercise_id) IS NOT NULL
          GROUP BY s.id, r.exercise_id, t.exercise_id, e.id
          ORDER BY s.exercise_order
        `,
        [planId]
      );
    }
  
    // reps 세트 수 조회
    async function getRepsStats(scheduleId) {
      return query(
        `
        SELECT COUNT(*) AS count, MAX(reps) AS max_reps 
        FROM exercise_reps 
        WHERE schedule_id = $1
        `,
        [scheduleId]
      );
    }
  
    // time 세트 수 조회
    async function getTimeStats(scheduleId) {
      return query(
        `
        SELECT COUNT(*) AS count, MAX(elapsed_time_millis) AS max_seconds 
        FROM exercise_time 
        WHERE schedule_id = $1
        `,
        [scheduleId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [5] 더미 플랜 생성 관련 쿼리
    // ─────────────────────────────────────────────
    async function findExistingPlan(userId, date) {
      return query(
        `
        SELECT id 
        FROM exercise_plan 
        WHERE user_id = $1 AND start_date = $2 
        FOR UPDATE
        `,
        [userId, date]
      );
    }
  
    async function getStartDateFromPlan(planId) {
      return query(
        `
        SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date
        FROM exercise_plan
        WHERE id = $1
        `,
        [planId]
      );
    }
  
    async function insertDummyPlan({ userId, date }) {
      return query(
        `
        INSERT INTO exercise_plan (
          user_id, start_date, end_date, day, day_pattern, completed_days, is_dummy
        ) VALUES ($1, $2, $2, $3, $4, $5, true) 
        RETURNING id
        `,
        [
          userId,
          date,
          [new Date(date).getDate()],
          ["dummy"],
          null,
        ]
      );
    }
  
    async function insertDummySchedule(planId, date, exOrder, exerciseId) {
      return query(
        `
        INSERT INTO exercise_schedule (
          exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
        ) VALUES ($1, $2, $3, false, true, $4) 
        RETURNING id
        `,
        [planId, date, exOrder, exerciseId]
      );
    }
  
    async function findExerciseType(exerciseId) {
      return query(
        `SELECT is_time_type FROM exercise WHERE id = $1`,
        [exerciseId]
      );
    }
  
    async function insertDummyTimeSet(scheduleId, exerciseId, millis) {
      return query(
        `
        INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
        VALUES ($1, $2, 1, $3, false)
        `,
        [scheduleId, exerciseId, millis]
      );
    }
  
    async function insertDummyRepsSet(scheduleId, exerciseId, setNumber, reps) {
      return query(
        `
        INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
        VALUES ($1, $2, $3, 0, $4, false)
        `,
        [scheduleId, exerciseId, setNumber, reps]
      );
    }
  
    // ─────────────────────────────────────────────
    // [6] 스케줄 추가
    // ─────────────────────────────────────────────
    async function getMaxOrder(planId) {
      return query(
        `
        SELECT MAX(exercise_order) AS max_order 
        FROM exercise_schedule 
        WHERE exercise_plan_id = $1
        `,
        [planId]
      );
    }
  
    async function insertSchedule(planId, date, newOrder, exId) {
      return query(
        `
        INSERT INTO exercise_schedule (
          exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
        ) VALUES ($1, $2, $3, false, false, $4)
        RETURNING id
        `,
        [planId, date, newOrder, exId]
      );
    }
  
    async function insertTimeSet(scheduleId, exerciseId, setNumber, millis) {
      return query(
        `
        INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
        VALUES ($1, $2, $3, $4, false)
        `,
        [scheduleId, exerciseId, setNumber, millis]
      );
    }
  
    async function insertRepsSet(scheduleId, exerciseId, setNumber, reps) {
      return query(
        `
        INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
        VALUES ($1, $2, $3, 0, $4, false)
        `,
        [scheduleId, exerciseId, setNumber, reps]
      );
    }
  
    // ─────────────────────────────────────────────
    // [7] 스케줄 삭제
    // ─────────────────────────────────────────────
    async function deleteRepsBySchedule(scheduleId) {
      return query(
        `DELETE FROM exercise_reps WHERE schedule_id = $1`,
        [scheduleId]
      );
    }
  
    async function deleteTimeBySchedule(scheduleId) {
      return query(
        `DELETE FROM exercise_time WHERE schedule_id = $1`,
        [scheduleId]
      );
    }
  
    async function deleteSchedule(scheduleId) {
      return query(
        `DELETE FROM exercise_schedule WHERE id = $1`,
        [scheduleId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [8] 스케줄 순서 변경
    // ─────────────────────────────────────────────
    async function updateScheduleOrder(scheduleId, newOrder) {
      return query(
        `
        UPDATE exercise_schedule 
        SET exercise_order = $1 
        WHERE id = $2
        `,
        [newOrder, scheduleId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [9] 스케줄-운동 변경
    // ─────────────────────────────────────────────
    async function updateScheduleExercise(scheduleId, exerciseId) {
      return query(
        `
        UPDATE exercise_schedule 
        SET exercise_id = $1 
        WHERE id = $2
        `,
        [exerciseId, scheduleId]
      );
    }
  
    // ─────────────────────────────────────────────
    // export (Part2-2 끝)
    // ─────────────────────────────────────────────
    return {
      // today plan
      findTodayPlan,
      getTodaySchedules,
      getRepsStats,
      getTimeStats,
  
      // dummy plan
      findExistingPlan,
      getStartDateFromPlan,
      insertDummyPlan,
      insertDummySchedule,
      findExerciseType,
      insertDummyTimeSet,
      insertDummyRepsSet,
  
      // schedule add/delete/order
      getMaxOrder,
      insertSchedule,
      insertTimeSet,
      insertRepsSet,
  
      deleteRepsBySchedule,
      deleteTimeBySchedule,
      deleteSchedule,
      updateScheduleOrder,
      updateScheduleExercise,
    };
  }
  // src/repositories/exercise.repository.js  (Part2-3 이어서)

export default function exerciseRepository({ pool }) {

    async function query(sql, params) {
      return pool.query(sql, params);
    }
  
    // ─────────────────────────────────────────────
    // [10] scheduleId 찾기
    // ─────────────────────────────────────────────
    async function findScheduleId(planId, exerciseId) {
      return query(
        `
        SELECT id 
        FROM exercise_schedule
        WHERE exercise_plan_id = $1 AND exercise_id = $2
        ORDER BY id ASC LIMIT 1
        `,
        [planId, exerciseId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [11] 특정 플랜의 스케줄 목록 조회
    // ─────────────────────────────────────────────
    async function getPlanSchedules(planId) {
      return query(
        `
        SELECT id AS schedule_id, exercise_id, exercise_order
        FROM exercise_schedule 
        WHERE exercise_plan_id = $1 
        ORDER BY exercise_order ASC
        `,
        [planId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [12] 전체 플랜 조회 + 스케줄 포함
    // ─────────────────────────────────────────────
    async function findPlans(userId) {
      return query(
        `
        SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date,
               day, day_pattern, completed_days, is_dummy
        FROM exercise_plan
        WHERE user_id = $1
        ORDER BY start_date DESC
        `,
        [userId]
      );
    }
  
    async function findSchedulesByPlanId(planId) {
      return query(
        `
        SELECT * 
        FROM exercise_schedule 
        WHERE exercise_plan_id = $1 
        ORDER BY exercise_order
        `,
        [planId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [13] 스케줄 완료 처리
    // ─────────────────────────────────────────────
    async function completeSchedule(scheduleId) {
      return query(
        `
        UPDATE exercise_schedule 
        SET is_completed = true 
        WHERE id = $1
        `,
        [scheduleId]
      );
    }
  
    // ─────────────────────────────────────────────
    // [14] REPS 세트 조회 / 저장
    // ─────────────────────────────────────────────
    async function getRepsSets(scheduleId) {
      return query(
        `
        SELECT set_number, reps, weight, is_completed
        FROM exercise_reps
        WHERE schedule_id = $1
        ORDER BY set_number ASC
        `,
        [scheduleId]
      );
    }
  
    async function deleteRepsSets(scheduleId) {
      return query(
        `DELETE FROM exercise_reps WHERE schedule_id = $1`,
        [scheduleId]
      );
    }
  
    async function getExerciseIdBySchedule(scheduleId) {
      return query(
        `
        SELECT exercise_id 
        FROM exercise_schedule 
        WHERE id = $1
        `,
        [scheduleId]
      );
    }
  
    async function insertRepsSetFull(scheduleId, exerciseId, setNumber, weight, reps, isCompleted) {
      return query(
        `
        INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [scheduleId, exerciseId, setNumber, weight, reps, isCompleted]
      );
    }
  
    async function updateRepsCompletion(scheduleId, setNumber, isCompleted, timeSeconds) {
      return query(
        `
        UPDATE exercise_reps 
        SET is_completed = $1,
            time_seconds = COALESCE($4, time_seconds)
        WHERE schedule_id = $2 AND set_number = $3
        `,
        [isCompleted, scheduleId, setNumber, timeSeconds]
      );
    }
  
    // ─────────────────────────────────────────────
    // [15] TIME 세트 조회 / 저장
    // ─────────────────────────────────────────────
    async function getTimeSets(scheduleId) {
      return query(
        `
        SELECT set_number, elapsed_time_millis, is_completed, COALESCE(weight, 0) AS weight
        FROM exercise_time 
        WHERE schedule_id = $1 
        ORDER BY set_number ASC
        `,
        [scheduleId]
      );
    }
  
    async function deleteTimeSets(scheduleId) {
      return query(
        `
        DELETE FROM exercise_time 
        WHERE schedule_id = $1
        `,
        [scheduleId]
      );
    }
  
    async function insertTimeSetFull(scheduleId, exerciseId, setNumber, millis, weight) {
      return query(
        `
        INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, weight, is_completed)
        VALUES ($1, $2, $3, $4, $5, false)
        `,
        [scheduleId, exerciseId, setNumber, millis, weight]
      );
    }
  
    // ─────────────────────────────────────────────
    // [16] AI 루틴 저장 — submit-ai
    // ─────────────────────────────────────────────
    async function deleteExistingAiPlan(userId, startDate, endDate) {
      return query(
        `
        DELETE FROM exercise_plan 
        WHERE user_id = $1 AND start_date >= $2 AND end_date <= $3
        `,
        [userId, startDate, endDate]
      );
    }
  
    async function insertAiPlan(userId, startDate, endDate, dayValue, dayPattern) {
      return query(
        `
        INSERT INTO exercise_plan (user_id, start_date, end_date, day, day_pattern, is_dummy)
        VALUES ($1, $2, $3, $4, $5, false)
        RETURNING id
        `,
        [userId, startDate, endDate, dayValue, dayPattern]
      );
    }
  
    async function getExerciseIdByName(name) {
      return query(
        `
        SELECT id 
        FROM exercise 
        WHERE name = $1 
        LIMIT 1
        `,
        [name]
      );
    }
  
    async function insertAiSchedule(planId, date, order, exerciseId) {
      return query(
        `
        INSERT INTO exercise_schedule (exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id)
        VALUES ($1, $2, $3, false, false, $4)
        RETURNING *
        `,
        [planId, date, order, exerciseId]
      );
    }
  
    async function insertAiTimeSet(scheduleId, exerciseId, millis) {
      return query(
        `
        INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
        VALUES ($1, $2, 1, $3, false)
        RETURNING *
        `,
        [scheduleId, exerciseId, millis]
      );
    }
  
    async function insertAiRepsSet(scheduleId, exerciseId, setNumber, reps) {
      return query(
        `
        INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
        VALUES ($1, $2, $3, 0, $4, false)
        RETURNING *
        `,
        [scheduleId, exerciseId, setNumber, reps]
      );
    }
  
    // ─────────────────────────────────────────────
    // Part2-3 export
    // ─────────────────────────────────────────────
    return {
      findScheduleId,
      getPlanSchedules,
      findPlans,
      findSchedulesByPlanId,
      completeSchedule,
  
      getRepsSets,
      deleteRepsSets,
      getExerciseIdBySchedule,
      insertRepsSetFull,
      updateRepsCompletion,
  
      getTimeSets,
      deleteTimeSets,
      insertTimeSetFull,
  
      deleteExistingAiPlan,
      insertAiPlan,
      getExerciseIdByName,
      insertAiSchedule,
      insertAiTimeSet,
      insertAiRepsSet,
    };
  }
  
  
  