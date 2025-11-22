// src/controller/records/records.controller.js
export default function recordsController({ pool }) {
    return {

        // 월별 운동 완료율 조회 API
        async getMonthlyCompletion(req, res) {
            const userId = parseInt(req.query.userId, 10);
            const year = parseInt(req.query.year, 10);
            const month = parseInt(req.query.month, 10);

            if (isNaN(userId) || isNaN(year) || isNaN(month)) {
                return res.status(400).json({ message: 'userId, year, month는 필수입니다.' });
            }

            const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];

            try {
                const result = await pool.query(`
                    SELECT
                        to_char(s.date, 'YYYY-MM-DD') AS date,
                        (COUNT(CASE WHEN s.is_completed THEN 1 END) * 100.0 / COUNT(*))::integer AS completion_rate
                    FROM exercise_schedule s
                    JOIN exercise_plan p ON s.exercise_plan_id = p.id
                    WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3
                    GROUP BY s.date
                    ORDER BY s.date;
                `, [userId, startDate, endDate]);

                res.json(result.rows);
            } catch (error) {
                console.error('❌ 월별 운동 완료율 조회 실패:', error);
                res.status(500).json({ message: '서버 오류' });
            }
        },

        // 특정 날짜의 운동 기록 조회 API
        async getDailyRecords(req, res) {
            const userId = parseInt(req.query.userId, 10);
            const date = req.query.date;

            if (isNaN(userId) || !date) {
                return res.status(400).json({ message: 'userId와 date는 필수입니다.' });
            }

            try {
                const planResult = await pool.query(
                    `SELECT id FROM exercise_plan 
                     WHERE user_id = $1 AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
                    [userId, date]
                );

                if (planResult.rowCount === 0) {
                    return res.json([]);
                }
                const planId = planResult.rows[0].id;

                const schedResult = await pool.query(`
                    SELECT
                        s.id AS schedule_id, s.is_completed,
                        e.name AS exercise_name, e.is_time_type
                    FROM exercise_schedule s
                    JOIN exercise e ON s.exercise_id = e.id
                    WHERE s.exercise_plan_id = $1 AND s.date = $2
                    ORDER BY s.exercise_order;
                `, [planId, date]);

                const records = [];
                for (const sched of schedResult.rows) {
                    let sets = 0, reps = null, seconds = null;

                    if (sched.is_time_type) {
                        const timeRes = await pool.query(
                            `SELECT COUNT(*) AS count, MAX(elapsed_time_millis) AS max_seconds 
                             FROM exercise_time WHERE schedule_id = $1`,
                            [sched.schedule_id]
                        );
                        sets = parseInt(timeRes.rows[0].count || 0);
                        seconds = Math.floor(parseInt(timeRes.rows[0].max_seconds || 0) / 1000);
                    } else {
                        const repsRes = await pool.query(
                            `SELECT COUNT(*) AS count, MAX(reps) AS max_reps 
                             FROM exercise_reps WHERE schedule_id = $1`,
                            [sched.schedule_id]
                        );
                        sets = parseInt(repsRes.rows[0].count || 0);
                        reps = parseInt(repsRes.rows[0].max_reps || 0);
                    }

                    records.push({
                        exercise_name: sched.exercise_name,
                        reps: reps,
                        sets: sets,
                        seconds: seconds,
                        is_completed: sched.is_completed,
                        is_time_type: sched.is_time_type
                    });
                }

                res.json(records);
            } catch (error) {
                console.error('❌ 특정 날짜 운동 기록 조회 실패:', error);
                res.status(500).json({ message: '서버 오류' });
            }
        },

        // 월간 요약
        async getMonthlySummary(req, res) {
            const userId = parseInt(req.query.userId, 10);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'userId는 필수입니다.' });
            }

            try {
                const date = new Date();
                const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
                const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

                const baseQuery = `
                    WITH monthly_completed_workouts AS (
                        SELECT 
                            s.exercise_id,
                            (r.time_seconds * 1000) AS duration_ms
                        FROM exercise_schedule s
                        JOIN exercise_plan p ON s.exercise_plan_id = p.id
                        JOIN exercise_reps r ON s.id = r.schedule_id
                        WHERE p.user_id = $1 AND s.date BETWEEN $2 AND $3 AND r.is_completed = true AND r.time_seconds > 0
                        UNION ALL
                        SELECT 
                            s.exercise_id,
                            t.elapsed_time_millis AS duration_ms
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
                    const parts = row.part.split(',').map(p => p.trim());
                    const duration = parseFloat(row.duration_ms);
                    if (parts.length > 0) {
                        const per = duration / parts.length;
                        parts.forEach(p => {
                            partDurationMap[p] = (partDurationMap[p] || 0) + per;
                        });
                    }
                });

                let topPart = null, topValue = -1;
                for (const part in partDurationMap) {
                    if (partDurationMap[part] > topValue) {
                        topValue = partDurationMap[part];
                        topPart = part;
                    }
                }

                let leastPart = null, leastValue = Infinity;
                for (const part in partDurationMap) {
                    if (partDurationMap[part] < leastValue) {
                        leastValue = partDurationMap[part];
                        leastPart = part;
                    }
                }

                const exerciseResult = await pool.query(`
                    ${baseQuery}
                    SELECT e.name, SUM(w.duration_ms) as total_duration
                    FROM monthly_completed_workouts w
                    JOIN exercise e ON w.exercise_id = e.id
                    GROUP BY e.name
                    ORDER BY total_duration DESC
                    LIMIT 1;
                `, [userId, firstDay, lastDay]);

                res.json({
                    mostFrequentPart: topPart ? { part: topPart, count: Math.round(topValue) } : null,
                    leastFrequentPart: leastPart ? { part: leastPart, count: Math.round(leastValue) } : null,
                    mostFrequentExercise: exerciseResult.rows[0] || null
                });

            } catch (error) {
                console.error('❌ 월간 요약 조회 실패:', error);
                res.status(500).json({ message: '서버 오류' });
            }
        },

        // 레이더 차트 데이터
        async getRadarData(req, res) {
            const userId = parseInt(req.query.userId, 10);
            const period = req.query.period;

            if (isNaN(userId) || !period) {
                return res.status(400).json({ message: 'userId와 period는 필수입니다.' });
            }

            try {
                const now = new Date();
                let startDate;

                switch (period) {
                    case 'week': startDate = new Date(now.setDate(now.getDate() - 7)); break;
                    case 'month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
                    case 'year': startDate = new Date(now.getFullYear(), 0, 1); break;
                    case 'all': startDate = new Date(0); break;
                    default:
                        return res.status(400).json({ message: '잘못된 period 값입니다.' });
                }

                const startDateString = startDate.toISOString().split('T')[0];

                const timeResult = await pool.query(`
                    SELECT e.part, (t.elapsed_time_millis / 60000.0 * e.mets) as volume
                    FROM exercise_time t
                    JOIN exercise_schedule s ON t.schedule_id = s.id
                    JOIN exercise_plan p ON s.exercise_plan_id = p.id
                    JOIN exercise e ON t.exercise_id = e.id
                    WHERE p.user_id = $1 AND s.date >= $2 AND t.is_completed = true AND t.elapsed_time_millis > 0;
                `, [userId, startDateString]);

                const repsResult = await pool.query(`
                    SELECT e.part, (r.time_seconds / 60.0 * e.mets) as volume
                    FROM exercise_reps r
                    JOIN exercise_schedule s ON r.schedule_id = s.id
                    JOIN exercise_plan p ON s.exercise_plan_id = p.id
                    JOIN exercise e ON r.exercise_id = e.id
                    WHERE p.user_id = $1 AND s.date >= $2 AND r.is_completed = true AND r.time_seconds > 0;
                `, [userId, startDateString]);

                const partVolumeMap = {
                    "가슴": 0, "등": 0, "하체": 0,
                    "어깨": 0, "팔": 0, "복근": 0,
                    "유산소": 0
                };

                const processRows = (rows) => {
                    rows.forEach(row => {
                        const parts = (row.part || '').split(',').map(p => p.trim());
                        const volume = parseFloat(row.volume);
                        if (parts.length > 0 && volume > 0) {
                            const per = volume / parts.length;
                            parts.forEach(part => {
                                if (part in partVolumeMap) {
                                    partVolumeMap[part] += per;
                                }
                            });
                        }
                    });
                };

                processRows(timeResult.rows);
                processRows(repsResult.rows);

                for (const key in partVolumeMap) {
                    partVolumeMap[key] = parseFloat(partVolumeMap[key].toFixed(2));
                }

                res.json(partVolumeMap);

            } catch (error) {
                console.error('❌ 레이더 차트 데이터 조회 실패:', error);
                res.status(500).json({ message: '서버 오류' });
            }
        },

        // 모든 신체 기록 조회
        async getWeightRecords(req, res) {
            const userId = parseInt(req.query.userId, 10);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'userId는 필수입니다.' });
            }

            try {
                const result = await pool.query(
                    `SELECT 
                        id, user_id,
                        to_char(date, 'YYYY-MM-DD') AS date, 
                        weight, 
                        body_fat_percentage, 
                        skeletal_muscle_mass 
                     FROM weight_records 
                     WHERE user_id = $1 
                     ORDER BY date ASC`,
                    [userId]
                );
                res.json(result.rows);
            } catch (error) {
                console.error('❌ 신체 기록 조회 실패:', error);
                res.status(500).json({ message: '서버 오류' });
            }
        },

        // 신체 기록 추가/업데이트
        async addOrUpdateWeightRecord(req, res) {
            const { userId, date, weight, bodyFatPercentage, skeletalMuscleMass } = req.body;

            if (!userId || !date || !weight) {
                return res.status(400).json({ message: 'userId, date, weight는 필수입니다.' });
            }

            try {
                const query = `
                    INSERT INTO weight_records (user_id, date, weight, body_fat_percentage, skeletal_muscle_mass)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (user_id, date)
                    DO UPDATE SET
                        weight = EXCLUDED.weight,
                        body_fat_percentage = EXCLUDED.body_fat_percentage,
                        skeletal_muscle_mass = EXCLUDED.skeletal_muscle_mass;
                `;

                await pool.query(query, [userId, date, weight, bodyFatPercentage, skeletalMuscleMass]);
                res.status(201).json({ message: '신체 기록 성공적으로 저장됨.' });

            } catch (error) {
                console.error('❌ 신체 기록 저장 실패:', error);
                res.status(500).json({ message: '서버 오류' });
            }
        },

    };
}
