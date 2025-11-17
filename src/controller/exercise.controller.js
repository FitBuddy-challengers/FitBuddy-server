// src/controllers/exercise.controller.js

export default function exerciseController({ pool, upload, openai, uploadDir }) {
    console.log("✅ exercise 컨트롤러 로드됨");
  
    // ───────────────────────────── 공용 함수 ─────────────────────────────
    const isRender = !!process.env.RENDER;
  
    async function getUserInfo(userId) {
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
  
    async function getMonthlySummary(userId) {
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
        if (partDurationMap[part] > maxDuration) {
          maxDuration = partDurationMap[part];
          topPartName = part;
        }
      }
      const mostFrequentPart = topPartName ? { part: topPartName, count: Math.round(maxDuration) } : null;
  
      let leastPartName = null, minDuration = Infinity;
      for (const part in partDurationMap) {
        if (partDurationMap[part] < minDuration) {
          minDuration = partDurationMap[part];
          leastPartName = part;
        }
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
        mostFrequentPart,
        leastFrequentPart,
        mostFrequentExercise: exerciseResult.rows[0] || null,
      };
    }
  
    // ───────────────────────────── GPT 라우트 ai 채팅 ─────────────────────────────
    async function welcomeChat(req, res) {
      const prompt = `
      당신은 밝고 에너지 넘치는 한국어 AI 트레이너입니다.
      아래 조건을 모두 만족하는 인사 문구를 한두 문장으로 작성하세요.
  
      [조건]
      - 이름이나 닉네임 언급 X
      - 오늘의 운동을 응원하고 동기부여하는 말
      - 문장 끝에는 "오늘도 운동 루틴 같이 세워볼까요?" 또는 유사한 자연스러운 표현
      - 밝고 자연스럽게, 너무 길지 않게 (1~2문장)
      - 💪🔥✨🏋️‍♀️😊 등의 이모지 랜덤 사용
      - 매번 다른 문장으로 표현
  
      [예시]
      - "오늘도 몸이 달아오를 준비 되셨나요?🔥 이번엔 함께 운동 루틴을 세워볼까요?💪"
      - "기분 좋은 하루예요😊 오늘의 목표를 향해 같이 운동 계획을 만들어봐요!"
      - "근육에 활력을 불어넣을 시간이에요✨ 오늘 루틴은 어떤 느낌으로 가볼까요?"
      `;
  
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a bright and energetic Korean personal trainer AI.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.9,
          max_tokens: 60,
        });
  
        const message = completion.choices[0].message.content.trim();
        console.log('🤖 Generated greeting message:', message);
        res.json({ message });
      } catch (error) {
        console.error('❌ GPT call failed:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create greeting message' });
      }
    }
  
    // 하루치 루틴 생성
    async function generateRoutine(req, res) {
      const { user_info, schedule_info } = req.body;
      if (!user_info || !schedule_info) {
        return res.status(400).json({ error: '필수 정보 누락되었습니다.' });
      }
  
      const prompt = `
      당신은 전문 퍼스널 트레이너이자 친근한 운동 상담 AI입니다.
      아래 정보를 참고하여 사용자의 하루 운동 루틴을 **한국어로 자연스럽게 대화하듯 작성**해주세요.
  
      [사용자 정보]
      이름: ${user_info.name}
      연령대: ${user_info.age_group}
      성별: ${user_info.gender}
      키: ${user_info.height}cm
      몸무게: ${user_info.weight}kg
      질병 이력: ${user_info.disease}
      운동 수준: ${user_info.exercise_level}
      선호하는 운동: ${user_info.preferred_exercise?.join(', ') || '없음'}
      운동 도구: ${user_info.exercise_equipment?.join(', ') || '없음'}
  
      [운동 계획 정보]
      운동 시작일: ${schedule_info.start_date}
      운동 종료일: ${schedule_info.end_date}
      운동 요일: ${schedule_info.days_of_week?.join(', ') || '없음'}
      강화 부위: ${schedule_info.focus_area}
  
      [요청 사항]
      1️⃣ 아래 순서를 반드시 지켜서 **친근하고 자연스러운 말투로** 작성해주세요.
  
      ① 첫 문장은 인사와 격려 문장으로 시작해주세요.
        예: "오늘도 운동 화이팅🔥"
  
      ② 다음 문장에서는 사용자의 목표나 강화 부위를 언급하며,
        “${schedule_info.focus_area}를 강화하기 위해 이런 루틴을 추천드려요!”
        **그다음 줄에 줄바꿈을 넣고**,
        “${schedule_info.focus_area} 강화를 통해 어떤 효과를 얻을 수 있는지 한 문장으로 설명해주세요.”
  
      ③ 그 다음 하루치 운동 루틴을 아래 형식으로 작성해주세요.
        - 하루치 루틴만 작성
        - 각 줄은 번호로 시작하고, 운동 이름 뒤에 '-' 또는 ':' 사용
        - 횟수는 '회', 세트는 '세트' 단위를 붙이기
        - 시간 기반 표현은 사용하지 않기 (단, 플랭크 등은 1분 가능)
  
      ④ 마지막 문장은 항상 **응원 문장**으로 마무리합니다.
      `;
  
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: '너는 전문적인 퍼스널 트레이너 AI야.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        });
  
        const result = completion.choices[0].message.content;
        console.log('🤖 GPT 루틴 생성 완료');
        res.json({ plan_text: result.trim() });
      } catch (error) {
        console.error('❌ GPT 호출 실패:', error.response?.data || error.message);
        res.status(500).json({ error: '루틴 생성 실패' });
      }
    }
  
    // 추천 운동 생성
    async function recommendExercise(req, res) {
      const userId = req.body.userId;
      if (!userId) return res.status(400).json({ error: 'userId가 필요합니다.' });
  
      try {
        const userInfo = await getUserInfo(parseInt(userId));
        const summaryData = await getMonthlySummary(parseInt(userId));
        const mostPart = summaryData.mostFrequentPart?.part || '없음';
        const leastPart = summaryData.leastFrequentPart?.part || '없음';
  
        const prompt = `
        당신은 전문 퍼스널 트레이너 AI입니다. 아래 정보를 반영하여 추천 운동을 작성해 주세요.
        ...
        `;
  
        const gptResponse = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: '너는 퍼스널 트레이너 역할을 하는 AI야.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        });
  
        const result = gptResponse.choices[0].message.content?.trim() || '추천 생성 실패';
        console.log(`[🤖 추천 생성 완료] userId: ${userId}`);
        res.json({ recommendation: result });
      } catch (error) {
        console.error('❌ 추천 생성 실패:', error.message);
        res.status(500).json({ error: '추천 생성 중 서버 오류가 발생했습니다.' });
      }
    }
  
    // ───────────────────────────── 운동 마스터/토글 ─────────────────────────────
    // 전체 운동 조회
    async function getExercises(req, res) {
        try {
          const result = await pool.query("SELECT * FROM exercise");
          console.log(`📦 운동 목록 조회: ${result.rowCount}개`);
          res.json(result.rows);
        } catch (error) {
          console.error("❌ 운동 목록 조회 실패:", error);
          res.status(500).json({ message: "서버 오류" });
        }
      }
    
      // 즐겨찾기 토글
      async function toggleFavorite(req, res) {
        const exerciseIdFromParam = parseInt(req.params.exerciseId, 10);
        const { isFavorite: requestedIsFavorite } = req.body;
    
        if (requestedIsFavorite === undefined || typeof requestedIsFavorite !== 'boolean' || isNaN(exerciseIdFromParam)) {
          return res.status(400).json({ message: "필수 정보(exerciseId, isFavorite)가 누락되었거나 형식이 잘못되었습니다." });
        }
    
        try {
          const result = await pool.query(
            "UPDATE exercise SET is_favorite = $1 WHERE id = $2 RETURNING id, name, is_favorite",
            [requestedIsFavorite, exerciseIdFromParam]
          );
    
          if (result.rowCount === 0)
            return res.status(404).json({ message: "해당 ID의 운동을 찾을 수 없습니다." });
    
          const updated = result.rows[0];
          console.log(`[⭐ 즐겨찾기 변경] id=${updated.id}, is_favorite=${updated.is_favorite}`);
          res.status(200).json({
            message: "즐겨찾기 상태가 변경되었습니다.",
            exerciseId: updated.id,
            isFavorite: updated.is_favorite
          });
        } catch (error) {
          console.error("❌ 즐겨찾기 상태 변경 실패:", error);
          res.status(500).json({ message: "서버 오류 발생" });
        }
      }
    
      // 숨김 토글
      async function toggleHidden(req, res) {
        const exerciseId = parseInt(req.params.exerciseId, 10);
        const { isHidden } = req.body;
    
        if (isHidden === undefined || typeof isHidden !== 'boolean' || isNaN(exerciseId)) {
          return res.status(400).json({ message: "필수 정보(exerciseId, isHidden)가 누락되었거나 형식이 잘못되었습니다." });
        }
    
        try {
          const result = await pool.query(
            "UPDATE exercise SET is_hidden = $1 WHERE id = $2 RETURNING id, name, is_hidden, is_favorite",
            [isHidden, exerciseId]
          );
    
          if (result.rowCount === 0)
            return res.status(404).json({ message: "해당 ID의 운동을 찾을 수 없습니다." });
    
          const updated = result.rows[0];
          console.log(`[🙈 숨김 상태 변경] id=${updated.id}, is_hidden=${updated.is_hidden}`);
          res.status(200).json({
            message: "운동 숨김 상태가 변경되었습니다.",
            exerciseId: updated.id,
            isHidden: updated.is_hidden,
            isFavorite: updated.is_favorite
          });
        } catch (error) {
          console.error("❌ 운동 숨김 상태 변경 실패:", error);
          res.status(500).json({ message: "서버 오류 발생" });
        }
      }
    
      // ───────────────────────────── 플랜/스케줄 CRUD ─────────────────────────────
    
      // 더미 플랜 생성
      async function createDummyPlan(req, res) {
        console.log("[🧪 더미 플랜 요청] 전체 req.body:", req.body);
        const { user_id, date } = req.body;
    
        if (!user_id || isNaN(user_id)) {
          console.error("❌ 유효하지 않은 user_id:", user_id);
          return res.status(400).json({ message: "유효하지 않은 user_id입니다. 실제 존재하는 유저 ID를 전달하세요." });
        }
    
        const userId = user_id;
        console.log(`[🧪 더미 플랜 요청] userId: ${userId}, date: ${date}`);
    
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
    
          const existing = await client.query(
            `SELECT id FROM exercise_plan WHERE user_id = $1 AND start_date = $2 FOR UPDATE`,
            [userId, date]
          );
    
          if (existing.rows.length > 0) {
            const planId = existing.rows[0].id;
            const result = await client.query(
              `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM exercise_plan WHERE id = $1`,
              [planId]
            );
            const formattedDate = result.rows[0]?.start_date || null;
    
            await client.query('ROLLBACK');
            console.log("ℹ️ 이미 오늘 플랜이 있어 그대로 반환");
            return res.status(200).send({ message: "이미 오늘 플랜이 존재합니다", planId, date: formattedDate });
          }
    
          const planResult = await client.query(`
            INSERT INTO exercise_plan (
              user_id, start_date, end_date, day, day_pattern, completed_days, is_dummy
            ) VALUES ($1, $2, $2, $3, $4, $5, true) RETURNING id
          `, [
            userId,
            date,
            [new Date(date).getDate()],
            ['dummy'],
            null
          ]);
          const planId = planResult.rows[0].id;
    
          const dummyExercises = [
            { exerciseId: 15, exOrder: 1, sets: 3, reps: 12 },
            { exerciseId: 120, exOrder: 2, sets: 3, reps: 10 },
            { exerciseId: 8, exOrder: 3, sets: 1, reps: 60 }
          ];
    
          for (const item of dummyExercises) {
            const schedResult = await client.query(`
              INSERT INTO exercise_schedule (
                exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
              ) VALUES ($1, $2, $3, false, true, $4) RETURNING id
            `, [planId, date, item.exOrder, item.exerciseId]);
    
            const schedId = schedResult.rows[0].id;
    
            const typeResult = await client.query(
              `SELECT is_time_type FROM exercise WHERE id = $1`,
              [item.exerciseId]
            );
            const isTime = Boolean(typeResult.rows[0]?.is_time_type);
    
            if (isTime) {
              await client.query(`
                INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
                VALUES ($1, $2, 1, $3, false)
              `, [schedId, item.exerciseId, item.reps * 1000]);
            } else {
              for (let i = 1; i <= item.sets; i++) {
                await client.query(`
                  INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
                  VALUES ($1, $2, $3, 0, $4, false)
                `, [schedId, item.exerciseId, i, item.reps]);
              }
            }
          }
    
          const result = await client.query(
            `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM exercise_plan WHERE id = $1`,
            [planId]
          );
          const formattedDate = result.rows[0]?.start_date || null;
    
          await client.query('COMMIT');
          console.log("✅ 더미 플랜 및 운동 삽입 완료");
    
          res.status(200).send({
            message: '더미 운동 계획 생성 완료',
            planId,
            date: formattedDate
          });
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('❌ 더미 계획 생성 실패:', error);
          res.status(500).send({ message: '서버 오류' });
        } finally {
          client.release();
        }
      }
    
      // 오늘 플랜 + 스케줄
      async function getTodayPlan(req, res) {
        const userId = parseInt(req.query.userId);
        if (!userId) return res.status(400).json({ message: "userId가 필요합니다." });
    
        const today = new Date().toISOString().split("T")[0];
    
        try {
          const planResult = await pool.query(
            `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                    to_char(end_date, 'YYYY-MM-DD') AS end_date,
                    day, day_pattern, completed_days, is_dummy
             FROM exercise_plan
             WHERE user_id = $1 AND $2::date BETWEEN start_date AND end_date
             LIMIT 1`,
            [userId, today]
          );
    
          if (planResult.rowCount === 0) {
            return res.status(404).json({ message: "오늘 운동 계획이 없습니다." });
          }
    
          const plan = planResult.rows[0];
    
          const schedResult = await pool.query(
            `SELECT 
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
              ORDER BY s.exercise_order`,
            [plan.id]
          );
    
          // 원본 그대로: reps/time 세트 계산 및 display_detail 생성
          for (const sched of schedResult.rows) {
            const scheduleId = sched.schedule_id;
    
            const repsCountRes = await pool.query(
              `SELECT COUNT(*) AS count, MAX(reps) AS max_reps FROM exercise_reps WHERE schedule_id = $1`,
              [scheduleId]
            );
            const timeCountRes = await pool.query(
              `SELECT COUNT(*) AS count, MAX(elapsed_time_millis) AS max_seconds FROM exercise_time WHERE schedule_id = $1`,
              [scheduleId]
            );
    
            const repsCount = parseInt(repsCountRes.rows[0].count || 0);
            const repsVal = parseInt(repsCountRes.rows[0].max_reps || 0);
            const timeCount = parseInt(timeCountRes.rows[0].count || 0);
            const timeVal = parseInt(timeCountRes.rows[0].max_seconds || 0);
    
            sched.set_count = repsCount || timeCount;
            sched.reps = repsVal || null;
            sched.seconds = timeVal || null;
    
            if (sched.is_time_type) {
              const timeInMillis = timeVal || 0;
              let totalSeconds = Math.floor(timeInMillis / 1000);
              const hours = Math.floor(totalSeconds / 3600);
              totalSeconds %= 3600;
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              const pad = (n) => String(n).padStart(2, '0');
              const formattedTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
              sched.display_detail = `${formattedTime} × ${timeCount}세트`;
            } else {
              sched.display_detail = `${repsVal}회 × ${repsCount}세트`;
            }
          }
    
          console.log("📅 오늘 플랜+스케줄 조회 완료");
          res.json({ plan, schedules: schedResult.rows });
        } catch (error) {
          console.error("❌ /api/plan/today 실패:", error);
          res.status(500).json({ message: "서버 오류" });
        }
      }
        // 스케줄 추가
  async function addSchedule(req, res) {
    console.log("[➕ 스케줄 추가 요청 도착] body:", req.body);

    const { planId, date, exerciseOrder, exercise_id, exerciseId } = req.body;
    const rawExId = exercise_id ?? exerciseId;
    const exId = parseInt(rawExId);
    if (isNaN(exId)) {
      console.error("❌ 잘못된 exercise_id:", rawExId);
      return res.status(400).json({ message: "유효하지 않은 exercise_id" });
    }

    if (planId === undefined || date === undefined) {
      return res.status(400).json({ message: "필수 값이 누락되었습니다." });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT MAX(exercise_order) AS max_order FROM exercise_schedule WHERE exercise_plan_id = $1',
        [planId]
      );
      const newOrder = (rows[0].max_order || 0) + 1;

      const result = await client.query(
        `INSERT INTO exercise_schedule (
          exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [planId, date, newOrder, false, false, exId]
      );

      const scheduleId = result.rows[0].id;

      const typeRes = await client.query(`SELECT is_time_type FROM exercise WHERE id = $1`, [exId]);
      const isTimeType = typeRes.rows[0]?.is_time_type;

      if (isTimeType) {
        for (let i = 1; i <= 3; i++) {
          await client.query(
            `INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
             VALUES ($1, $2, $3, $4, false)`,
            [scheduleId, exId, i, 600000]
          );
        }
      } else {
        for (let i = 1; i <= 3; i++) {
          await client.query(
            `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
             VALUES ($1, $2, $3, 0, 12, false)`,
            [scheduleId, exId, i]
          );
        }
      }

      await client.query('COMMIT');
      console.log(`[✅ 스케줄 추가 완료] scheduleId=${scheduleId}, exerciseId=${exId}`);
      res.json({ scheduleId, exerciseId: exId });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("❌ 운동 추가 실패:", e);
      res.status(500).send("Error adding exercise");
    } finally {
      client.release();
    }
  }

  // 스케줄 순서 변경
  async function updateScheduleOrder(req, res) {
    const scheduleId = parseInt(req.params.id);
    const newOrder = parseInt(req.query.order);

    try {
      await pool.query(
        'UPDATE exercise_schedule SET exercise_order = $1 WHERE id = $2',
        [newOrder, scheduleId]
      );
      console.log(`[🔁 순서 변경 완료] scheduleId=${scheduleId}, order=${newOrder}`);
      res.status(200).send();
    } catch (err) {
      console.error('❌ 순서 변경 실패:', err);
      res.status(500).send('Error updating order');
    }
  }

  // 스케줄 삭제
  async function deleteSchedule(req, res) {
    const scheduleIdParam = req.params.scheduleId;
    const scheduleId = parseInt(scheduleIdParam, 10);

    console.log(`[🗑️ 스케줄 삭제 요청] scheduleId=${scheduleId}`);

    if (isNaN(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ message: `유효하지 않은 scheduleId 입니다: ${scheduleIdParam}` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
      await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);
      const scheduleDeleteResult = await client.query(
        "DELETE FROM exercise_schedule WHERE id = $1",
        [scheduleId]
      );

      if (scheduleDeleteResult.rowCount === 0) {
        await client.query('ROLLBACK');
        console.warn(`[⚠️ 스케줄 없음] scheduleId=${scheduleId}`);
        return res.status(404).json({ message: "삭제할 운동 스케줄을 찾지 못했습니다." });
      }

      await client.query('COMMIT');
      console.log(`✅ 스케줄 삭제 완료 scheduleId=${scheduleId}`);
      res.status(200).json({ message: "운동 스케줄이 성공적으로 삭제되었습니다." });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ 스케줄 삭제 실패 scheduleId=${scheduleId}:`, error);
      res.status(500).json({
        message: "운동 스케줄 삭제 중 서버 오류가 발생했습니다.",
        detail: error.message,
      });
    } finally {
      client.release();
    }
  }

  // 스케줄-운동 변경
  async function changeExercise(req, res) {
    console.log("🔁 운동 변경 요청 body:", req.body);
    const scheduleId = parseInt(req.params.scheduleId, 10);
    const { newExerciseId } = req.body;

    if (!newExerciseId || isNaN(newExerciseId)) {
      return res.status(400).json({
        success: false,
        message: "❌ 운동 ID가 누락되었거나 잘못 전달되었습니다.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query("DELETE FROM exercise_reps WHERE schedule_id = $1", [scheduleId]);
      await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [scheduleId]);

      await client.query(
        "UPDATE exercise_schedule SET exercise_id = $1 WHERE id = $2",
        [newExerciseId, scheduleId]
      );

      const result = await client.query(
        "SELECT is_time_type FROM exercise WHERE id = $1",
        [newExerciseId]
      );
      if (result.rows.length === 0)
        throw new Error(`❌ ID=${newExerciseId} 운동 없음`);

      const isTime = result.rows[0].is_time_type;

      if (isTime) {
        for (let i = 1; i <= 3; i++) {
          await client.query(
            `INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
             VALUES ($1, $2, $3, 600000, false)`,
            [scheduleId, newExerciseId, i]
          );
        }
      } else {
        for (let i = 1; i <= 3; i++) {
          await client.query(
            `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
             VALUES ($1, $2, $3, 0, 12, false)`
            ,
            [scheduleId, newExerciseId, i]
          );
        }
      }

      await client.query("COMMIT");
      console.log("✅ 운동 변경 성공");
      res.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("❌ 운동 변경 실패:", error.message);
      res.status(500).json({
        success: false,
        message: "운동 변경 실패",
        detail: error.message,
      });
    } finally {
      client.release();
    }
  }

  // scheduleId 찾기
  async function getScheduleId(req, res) {
    const { planId, exerciseId } = req.query;
    if (!planId || !exerciseId)
      return res.status(400).json({ message: "planId와 exerciseId는 필수입니다." });

    try {
      const result = await pool.query(
        `
        SELECT id FROM exercise_schedule
        WHERE exercise_plan_id = $1 AND exercise_id = $2
        ORDER BY id ASC LIMIT 1
        `,
        [planId, exerciseId]
      );

      if (result.rows.length === 0) {
        console.warn(`[⚠️ scheduleId 없음] planId=${planId}, exerciseId=${exerciseId}`);
        return res.status(404).json({
          message: "해당 운동에 대한 스케줄 정보를 찾을 수 없습니다 (scheduleId not found).",
        });
      }

      console.log(`[ℹ️ scheduleId 조회 성공] ${result.rows[0].id}`);
      res.status(200).json({ scheduleId: result.rows[0].id });
    } catch (error) {
      console.error("[❌ scheduleId 조회 실패]", error);
      res.status(500).json({
        message: "scheduleId 조회 중 서버 오류가 발생했습니다.",
      });
    }
  }

  // 특정 플랜의 스케줄 목록
  async function getPlanSchedules(req, res) {
    const planId = parseInt(req.params.planId, 10);
    if (isNaN(planId))
      return res.status(400).json({ message: "유효하지 않은 planId입니다." });

    try {
      const result = await pool.query(
        `
        SELECT id AS schedule_id, exercise_id, exercise_order
        FROM exercise_schedule 
        WHERE exercise_plan_id = $1 
        ORDER BY exercise_order ASC
        `,
        [planId]
      );

      console.log(`[ℹ️ 스케줄 조회] planId=${planId}, count=${result.rows.length}`);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error(`❌ 스케줄 조회 실패 planId=${planId}:`, error);
      res.status(500).json({
        message: "서버 오류: 스케줄 조회에 실패했습니다.",
      });
    }
  }

  // 플랜 전체 조회 (스케줄 포함)
  async function getPlans(req, res) {
    const userId = parseInt(req.query.userId);
    if (!userId)
      return res.status(400).json({ message: "userId가 필요합니다." });

    try {
      const planResult = await pool.query(
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

      const plans = [];
      for (const plan of planResult.rows) {
        const schedResult = await pool.query(
          `SELECT * FROM exercise_schedule WHERE exercise_plan_id = $1 ORDER BY exercise_order`,
          [plan.id]
        );
        plans.push({ ...plan, schedules: schedResult.rows });
      }

      console.log(`📦 플랜 목록 반환: ${plans.length}개`);
      res.json(plans);
    } catch (error) {
      console.error("❌ /api/plans 실패:", error);
      res.status(500).json({ message: "서버 오류" });
    }
  }

  // 스케줄 완료
  async function completeSchedule(req, res) {
    const scheduleId = req.params.scheduleId;
    try {
      await pool.query(
        `UPDATE exercise_schedule SET is_completed = true WHERE id = $1`,
        [scheduleId]
      );
      console.log(`✅ 스케줄 완료 처리 scheduleId=${scheduleId}`);
      res.status(200).json({ message: "Schedule marked as complete" });
    } catch (err) {
      console.error("❌ 스케줄 완료 처리 실패:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // REPS 세트 조회
  async function getRepsSets(req, res) {
    const scheduleId = parseInt(req.params.scheduleId, 10);
    if (isNaN(scheduleId))
      return res.status(400).json({ message: "유효하지 않은 scheduleId" });

    try {
      const result = await pool.query(
        `SELECT set_number, reps, weight, is_completed
         FROM exercise_reps
         WHERE schedule_id = $1
         ORDER BY set_number ASC`,
        [scheduleId]
      );

      console.log(`ℹ️ REPS 세트 조회 scheduleId=${scheduleId}`);
      res.json(result.rows);
    } catch (err) {
      console.error("❌ 세트 불러오기 실패:", err);
      res.status(500).json({ message: "서버 오류" });
    }
  }

  // REPS 세트 저장(전체 교체)
  async function saveRepsSets(req, res) {
    const scheduleId = parseInt(req.params.scheduleId, 10);
    const sets = req.body;

    if (!Array.isArray(sets))
      return res.status(400).json({ message: "잘못된 데이터 형식입니다." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM exercise_reps WHERE schedule_id = $1`, [scheduleId]);

      const result = await client.query(
        `SELECT exercise_id FROM exercise_schedule WHERE id = $1`,
        [scheduleId]
      );
      const exerciseId = result.rows[0]?.exercise_id;
      if (!exerciseId)
        throw new Error(`❌ schedule_id=${scheduleId}에 대한 exercise_id가 없음`);

      for (const set of sets) {
        await client.query(
          `INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [scheduleId, exerciseId, set.set_number, set.weight, set.reps, set.is_completed]
        );
      }

      await client.query("COMMIT");
      console.log(`✅ REPS 세트 저장 완료 scheduleId=${scheduleId}`);
      res.status(200).send();
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ REPS 세트 저장 실패:", err.message);
      res.status(500).json({ message: "서버 오류", detail: err.message });
    } finally {
      client.release();
    }
  }

  // REPS 세트 완료/시간 기록
  async function completeReps(req, res) {
    const { scheduleId, setNumber, isCompleted, time_seconds } = req.body;

    if (
      typeof scheduleId === "undefined" ||
      typeof setNumber === "undefined" ||
      typeof isCompleted !== "boolean"
    ) {
      return res.status(400).json({
        message:
          "잘못된 입력: scheduleId, setNumber는 필수이며, isCompleted는 boolean 타입이어야 합니다.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sql = `
        UPDATE exercise_reps 
        SET is_completed = $1,
            time_seconds = COALESCE($4, time_seconds)
        WHERE schedule_id = $2 AND set_number = $3
      `;
      const result = await client.query(sql, [
        isCompleted,
        scheduleId,
        setNumber,
        time_seconds,
      ]);

      if (result.rowCount > 0) {
        await client.query("COMMIT");
        console.log(
          `✅ REPS 세트 완료/시간 업데이트 scheduleId=${scheduleId} set=${setNumber}`
        );
        res.status(200).json({
          message: "세트 완료 상태가 성공적으로 업데이트되었습니다.",
        });
      } else {
        await client.query("ROLLBACK");
        console.warn(
          `⚠️ REPS 세트 찾지 못함 scheduleId=${scheduleId} set=${setNumber}`
        );
        res.status(404).json({
          message: `scheduleId ${scheduleId}, setNumber ${setNumber} 세트를 찾을 수 없습니다.`,
        });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ REPS 세트 완료 처리 실패:", err);
      res.status(500).json({
        error: "세트 완료 상태 업데이트 중 서버 오류 발생.",
        detail: err.message,
      });
    } finally {
      client.release();
    }
  }

  // TIME 세트 조회
  async function getTimeSets(req, res) {
    const scheduleId = parseInt(req.params.scheduleId, 10);
    if (isNaN(scheduleId))
      return res.status(400).json({ message: "유효하지 않은 scheduleId" });

    try {
      const result = await pool.query(
        `SELECT set_number, elapsed_time_millis, is_completed, COALESCE(weight, 0) AS weight
         FROM exercise_time WHERE schedule_id = $1 ORDER BY set_number ASC`,
        [scheduleId]
      );

      const sets = result.rows.map((row) => ({
        set_number: row.set_number,
        seconds: Math.floor(row.elapsed_time_millis / 1000),
        weight: row.weight,
      }));

      console.log(`ℹ️ TIME 세트 조회 scheduleId=${scheduleId}`);
      res.json(sets);
    } catch (err) {
      console.error("❌ TIME 세트 불러오기 실패:", err);
      res.status(500).json({ message: "서버 오류" });
    }
  }

  // TIME 세트 저장
  async function saveTimeSets(req, res) {
    const scheduleId = parseInt(req.params.scheduleId);
    const setList = req.body;
    if (!Array.isArray(setList))
      return res.status(400).json({ message: "잘못된 요청 형식입니다." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const scheduleDataResult = await client.query(
        "SELECT exercise_id FROM exercise_schedule WHERE id = $1",
        [scheduleId]
      );
      if (!scheduleDataResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: `스케줄 ID ${scheduleId}를 찾을 수 없습니다.`,
        });
      }

      const exerciseId = scheduleDataResult.rows[0].exercise_id;
      if (!exerciseId) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: `스케줄 ID ${scheduleId}에 연결된 운동 ID를 찾을 수 없습니다.`,
        });
      }

      await client.query("DELETE FROM exercise_time WHERE schedule_id = $1", [
        scheduleId,
      ]);

      if (setList.length > 0) {
        for (const set of setList) {
          const millis = set.seconds * 1000;
          await client.query(
            `
            INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, weight, is_completed)
            VALUES ($1, $2, $3, $4, $5, false)
            `,
            [
              scheduleId,
              exerciseId,
              set.set_number,
              millis,
              set.weight,
            ]
          );
        }
      }

      await client.query("COMMIT");
      console.log(`✅ TIME 세트 저장 완료 scheduleId=${scheduleId}`);
      res.sendStatus(200);
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`❌ TIME 세트 저장 실패 scheduleId=${scheduleId}:`, e);
      res.status(500).json({
        message: "세트 저장 실패",
        detail: e.message,
      });
    } finally {
      client.release();
    }
  }

  // AI 루틴 저장
  async function submitAi(req, res) {
    console.log("🔥 [submit-ai] 루틴 저장 요청 도착:", JSON.stringify(req.body, null, 2));
    const { user_id, start_date, end_date, exercises } = req.body;

    if (!Array.isArray(exercises) || exercises.length === 0) {
      console.error("❌ [submit-ai] exercises가 비어있습니다.");
      return res
        .status(400)
        .json({ error: "운동 정보가 없습니다." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 기존 플랜 삭제
      await client.query(
        `DELETE FROM exercise_plan WHERE user_id = $1 AND start_date >= $2 AND end_date <= $3`,
        [user_id, start_date, end_date]
      );

      const startDateObj = new Date(start_date);
      const dayValue = [startDateObj.getDate()];
      const dayPattern = ["ai"];

      // 새 플랜 생성
      const planResult = await client.query(
        `
        INSERT INTO exercise_plan (user_id, start_date, end_date, day, day_pattern, is_dummy)
        VALUES ($1, $2, $3, $4, $5, false)
        RETURNING id
        `,
        [user_id, start_date, end_date, dayValue, dayPattern]
      );

      const planId = planResult.rows[0].id;

      const nameToId = {};
      for (const ex of exercises) {
        const result = await client.query(
          `SELECT id FROM exercise WHERE name = $1 LIMIT 1`,
          [ex.name]
        );
        if (result.rows.length === 0) {
          throw new Error(`운동명 '${ex.name}'을 찾을 수 없습니다.`);
        }
        nameToId[ex.name] = result.rows[0].id;
      }

      // 스케줄 + reps/time 저장
      let order = 1;
      const scheduleResults = [];
      const repsResults = [];
      const timeResults = [];

      for (const ex of exercises) {
        const exId = nameToId[ex.name];

        const schedResult = await client.query(
          `
          INSERT INTO exercise_schedule (exercise_plan_id, date, exercise_order, is_completed, is_dummy, exercise_id)
          VALUES ($1, $2, $3, false, false, $4) RETURNING *
          `,
          [planId, start_date, order++, exId]
        );

        const schedRow = schedResult.rows[0];
        scheduleResults.push(schedRow);

        const schedId = schedRow.id;

        if (ex.seconds) {
          const timeRes = await client.query(
            `
            INSERT INTO exercise_time (schedule_id, exercise_id, set_number, elapsed_time_millis, is_completed)
            VALUES ($1, $2, 1, $3, false)
            RETURNING *
            `,
            [schedId, exId, ex.seconds * 1000]
          );
          timeResults.push(timeRes.rows[0]);
        } else {
          for (let i = 1; i <= ex.sets; i++) {
            const repsRes = await client.query(
              `
              INSERT INTO exercise_reps (schedule_id, exercise_id, set_number, weight, reps, is_completed)
              VALUES ($1, $2, $3, 0, $4, false)
              RETURNING *
              `,
              [schedId, exId, i, ex.reps]
            );
            repsResults.push(repsRes.rows[0]);
          }
        }
      }

      await client.query("COMMIT");

      res.json({
        plan_id: planId,
        schedules: scheduleResults,
        reps: repsResults,
        times: timeResults,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ [submit-ai] 에러 발생:", err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // ───────────────────────────── 컨트롤러 export ─────────────────────────────

  return {
    welcomeChat,
    generateRoutine,
    recommendExercise,
    getExercises,
    toggleFavorite,
    toggleHidden,
    createDummyPlan,
    getTodayPlan,
    addSchedule,
    updateScheduleOrder,
    deleteSchedule,
    changeExercise,
    getScheduleId,
    getPlanSchedules,
    getPlans,
    completeSchedule,
    getRepsSets,
    saveRepsSets,
    completeReps,
    getTimeSets,
    saveTimeSets,
    submitAi,
  };
}

    
    