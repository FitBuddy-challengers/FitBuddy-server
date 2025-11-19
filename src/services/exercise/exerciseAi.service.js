// src/services/exercise/exerciseAi.service.js

export async function getUserInfoService(pool, userId) {
    if (isNaN(userId)) throw new Error("유효하지 않은 사용자 ID입니다.");
    const result = await pool.query(`
        SELECT name, age_group, gender, height, weight, diseases, workout_level, preferred_workouts, equipment
        FROM users
        WHERE id = $1
      `, [userId]);
  
    if (result.rows.length === 0) throw new Error("사용자를 찾을 수 없습니다.");
    const row = result.rows[0];
    return {
      name: row.name,
      age_group: row.age_group,
      gender: row.gender,
      height: row.height,
      weight: row.weight,
      disease: row.diseases,
      exercise_level: row.workout_level,
      preferred_exercises: (row.preferred_workouts || '').split(',').filter(Boolean),
      exercise_equipment: (row.equipment || '').split(',').filter(Boolean),
    };
  }
  
  
  export async function getMonthlySummaryService(pool, userId) {
    if (isNaN(userId)) throw new Error("유효하지 않은 사용자 ID입니다.");
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
  
    const baseQuery = `
        WITH monthly_completed_workouts AS (
          SELECT 
            s.exercise_id, (r.time_seconds * 1000) AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_reps r ON s.id = r.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 AND r.is_completed = true AND r.time_seconds > 0
          UNION ALL
          SELECT 
            s.exercise_id, t.elapsed_time_millis AS duration_ms
          FROM exercise_schedule s
          JOIN exercise_plan p ON s.exercise_plan_id = p.id
          JOIN exercise_time t ON s.id = t.schedule_id
          WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 AND t.is_completed = true AND t.elapsed_time_millis > 0
        )
      `;
  
    const allWorkoutsResult = await pool.query(`
        ${baseQuery}
        SELECT e.part, w.duration_ms
        FROM monthly_completed_workouts w
        JOIN exercise e ON w.exercise_id = e.id;
      `, [userId, firstDay, lastDay]);
  
    const partDurationMap = {};
    allWorkoutsResult.rows.forEach(row => {
      const parts = (row.part || '').split(',').map(p => p.trim());
      const duration = parseFloat(row.duration_ms);
      if (parts.length > 0 && duration > 0) {
        const per = duration / parts.length;
        parts.forEach(part => {
          if (part) partDurationMap[part] = (partDurationMap[part] || 0) + per;
        });
      }
    });
  
    let topPartName = null, maxDuration = -1;
    for (const part in partDurationMap) {
      if (partDurationMap[part] > maxDuration) { maxDuration = partDurationMap[part]; topPartName = part; }
    }
    const mostFrequentPart = topPartName ? { part: topPartName, count: Math.round(maxDuration) } : null;
  
    let leastPartName = null, minDuration = Infinity;
    for (const part in partDurationMap) {
      if (partDurationMap[part] < minDuration) { minDuration = partDurationMap[part]; leastPartName = part; }
    }
    const leastFrequentPart = leastPartName ? { part: leastPartName, count: Math.round(minDuration) } : null;
  
    const exerciseResult = await pool.query(`
        ${baseQuery}
        SELECT e.name, SUM(w.duration_ms) as total_duration
        FROM monthly_completed_workouts w
        JOIN exercise e ON w.exercise_id = e.id
        GROUP BY e.name ORDER BY total_duration DESC LIMIT 1;
      `, [userId, firstDay, lastDay]);
  
    return {
      mostFrequentPart, leastFrequentPart,
      mostFrequentExercise: exerciseResult.rows[0] || null
    };
  }

  // DB의 운동 목록 가져오기 (숨김 처리된 운동 제외)
  export async function getAllExercisesService(pool) {
    const { rows } = await pool.query(`
      SELECT id, name, part
      FROM exercise
      WHERE is_hidden = false
    `);
    return rows;
  }
  