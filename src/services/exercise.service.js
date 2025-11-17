// src/services/exercise.service.js

import * as repo from "../repositories/exercise.repository.js";

export default function exerciseService({ pool, openai }) {

  // ─────────────────────────────────────────────
  // 1) 사용자 정보 조회
  // ─────────────────────────────────────────────
  async function getUserInfo(userId) {
    return repo.getUserInfo(userId);
  }

  // ─────────────────────────────────────────────
  // 2) 월간 운동 요약 조회
  // ─────────────────────────────────────────────
  async function getMonthlySummary(userId) {
    const summary = await repo.getMonthlySummary(userId);
    return summary;
  }

  // ─────────────────────────────────────────────
  // 3) GPT 인사 메시지 생성
  // ─────────────────────────────────────────────
  async function getWelcomeChatService() {
    const prompt = `
    당신은 밝고 에너지 넘치는 한국어 AI 트레이너입니다.
    아래 조건을 모두 만족하는 인사 문구를 한두 문장으로 작성하세요.

    [조건]
    - 이름이나 닉네임 언급 X
    - 오늘의 운동을 응원하고 동기부여하는 말
    - 문장 끝에는 "오늘도 운동 루틴 같이 세워볼까요?" 또는 유사문
    - 1~2 문장
    - 밝고 자연스럽게
    - 이모지 랜덤 사용
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a bright and energetic Korean personal trainer AI.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 60,
    });

    return completion.choices[0].message.content.trim();
  }

  // ─────────────────────────────────────────────
  // 4) AI 하루 루틴 생성
  // ─────────────────────────────────────────────
  async function generateRoutineService(user_info, schedule_info) {
    const prompt = `
    당신은 전문 퍼스널 트레이너 AI입니다.
    아래 정보를 참고하여 사용자의 하루 운동 루틴을 한국어로 자연스럽게 작성하세요.

    [사용자 정보]
    이름: ${user_info.name}
    연령대: ${user_info.age_group}
    성별: ${user_info.gender}
    키: ${user_info.height}cm
    몸무게: ${user_info.weight}kg
    질병 이력: ${user_info.disease}
    운동 수준: ${user_info.exercise_level}
    선호하는 운동: ${user_info.preferred_exercises?.join(', ') || '없음'}
    운동 도구: ${user_info.exercise_equipment?.join(', ') || '없음'}

    [운동 계획 정보]
    시작일: ${schedule_info.start_date}
    종료일: ${schedule_info.end_date}
    요일: ${schedule_info.days_of_week?.join(', ') || '없음'}
    강화 부위: ${schedule_info.focus_area}

    [요청 사항]
    - 인사 문장 → 강화부위 설명 → 하루 루틴 → 마지막 응원 문장
    - 시간 기반 대신 세트/횟수 중심
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: '너는 전문 PT AI야.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    });

    return completion.choices[0].message.content.trim();
  }

  // ─────────────────────────────────────────────
  // 5) 추천 운동 GPT
  // ─────────────────────────────────────────────
  async function recommendExerciseService(userId) {
    const userInfo = await repo.getUserInfo(userId);
    const summary = await repo.getMonthlySummary(userId);

    const mostPart = summary.mostFrequentPart?.part ?? '없음';
    const leastPart = summary.leastFrequentPart?.part ?? '없음';

    const prompt = `
    당신은 전문 PT AI입니다.
    아래 사용자 데이터를 기반으로 추천 운동을 한글로 작성하세요.

    [사용자 정보]
    이름: ${userInfo.name}
    나이: ${userInfo.age_group}
    성별: ${userInfo.gender}
    최근 가장 많이 한 부위: ${mostPart}
    최근 가장 적게 한 부위: ${leastPart}

    - 텍스트 위주 추천
    - 세트/횟수 포함 가능
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "너는 PT 트레이너다." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    return completion.choices[0].message.content?.trim() || "추천 생성 실패";
  }

  return {
    getUserInfo,
    getMonthlySummary,
    getWelcomeChatService,
    generateRoutineService,
    recommendExerciseService,
  };
}
export default function exerciseService({ pool, openai }) {

    // … (Part3-1 내용 위에 존재함)
  
  
    // ─────────────────────────────────────────────
    // 전체 운동 조회
    // ─────────────────────────────────────────────
    async function getAllExercisesService() {
      return repo.getAllExercises();
    }
  
    // ─────────────────────────────────────────────
    // 즐겨찾기 토글
    // ─────────────────────────────────────────────
    async function toggleFavoriteService(exerciseId, isFavorite) {
      const updated = await repo.updateFavorite(exerciseId, isFavorite);
  
      if (!updated) {
        throw new Error("해당 ID의 운동을 찾을 수 없습니다.");
      }
  
      return updated;
    }
  
    // ─────────────────────────────────────────────
    // 숨김 토글
    // ─────────────────────────────────────────────
    async function toggleHiddenService(exerciseId, isHidden) {
      const updated = await repo.updateHidden(exerciseId, isHidden);
  
      if (!updated) {
        throw new Error("해당 ID의 운동을 찾을 수 없습니다.");
      }
  
      return updated;
    }
  
    // ─────────────────────────────────────────────
    // 운동 타입 조회 (Time / Reps)
    // ─────────────────────────────────────────────
    async function getExerciseTypeService(exerciseId) {
      return repo.getExerciseType(exerciseId);
    }
  
  
    return {
      // Part3-1
      getUserInfo,
      getMonthlySummary,
      getWelcomeChatService,
      generateRoutineService,
      recommendExerciseService,
  
      // Part3-2
      getAllExercisesService,
      toggleFavoriteService,
      toggleHiddenService,
      getExerciseTypeService,
    };
  }
  export default function exerciseService({ pool, openai }) {

    // ... Part3-1 + Part3-2 이전 내용 포함됨
  
  
    // ─────────────────────────────────────────────
    // ✔ 더미 플랜 생성
    // ─────────────────────────────────────────────
    async function createDummyPlanService(body) {
      const { user_id, date } = body;
      const client = await pool.connect();
  
      try {
        await client.query("BEGIN");
  
        // 기존 플랜 있는지 확인
        const existing = await repo.findExistingPlan(client, user_id, date);
  
        if (existing) {
          const formatted = await repo.getPlanFormattedDate(client, existing.id);
          await client.query("ROLLBACK");
          return {
            message: "이미 오늘 플랜이 존재합니다",
            planId: existing.id,
            date: formatted,
          };
        }
  
        // 플랜 생성
        const planId = await repo.insertDummyPlan(client, user_id, date);
  
        // 더미 운동 리스트 (원본 그대로)
        const dummy = [
          { exerciseId: 15, exOrder: 1, sets: 3, reps: 12 },
          { exerciseId: 120, exOrder: 2, sets: 3, reps: 10 },
          { exerciseId: 8, exOrder: 3, sets: 1, reps: 60 },
        ];
  
        // 스케줄 삽입
        for (const item of dummy) {
          const scheduleId = await repo.insertSchedule(
            client,
            planId,
            date,
            item.exOrder,
            true,
            item.exerciseId
          );
  
          // 운동 타입 확인
          const isTime = await repo.isExerciseTimeType(client, item.exerciseId);
  
          if (isTime) {
            await repo.insertTimeSet(client, scheduleId, item.exerciseId, 1, item.reps * 1000);
          } else {
            for (let i = 1; i <= item.sets; i++) {
              await repo.insertRepsSet(client, scheduleId, item.exerciseId, i, 0, item.reps);
            }
          }
        }
  
        const formatted = await repo.getPlanFormattedDate(client, planId);
  
        await client.query("COMMIT");
  
        return {
          message: "더미 운동 계획 생성 완료",
          planId,
          date: formatted,
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  
  
    // ─────────────────────────────────────────────
    // ✔ 오늘 플랜 + 스케줄 조회
    // ─────────────────────────────────────────────
    async function getTodayPlanService(userId) {
      const today = new Date().toISOString().split("T")[0];
  
      // 플랜 조회
      const plan = await repo.getTodayPlan(userId, today);
      if (!plan) return null;
  
      // 스케줄 조회
      const schedules = await repo.getTodaySchedules(plan.id);
  
      // reps/time 조합 세트 정보 채우기
      for (const s of schedules) {
        const repsInfo = await repo.getRepsMeta(s.schedule_id);
        const timeInfo = await repo.getTimeMeta(s.schedule_id);
  
        const repsCount = parseInt(repsInfo.count || 0);
        const repsVal = parseInt(repsInfo.max_reps || 0);
  
        const timeCount = parseInt(timeInfo.count || 0);
        const timeVal = parseInt(timeInfo.max_seconds || 0);
  
        s.set_count = repsCount || timeCount;
        s.reps = repsVal || null;
        s.seconds = timeVal || null;
  
        // display_detail 계산 (원본 100% 유지)
        if (s.is_time_type) {
          let totalSeconds = Math.floor((timeVal || 0) / 1000);
          const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
          totalSeconds %= 3600;
          const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
          const sec = String(totalSeconds % 60).padStart(2, "0");
          s.display_detail = `${h}:${m}:${sec} × ${timeCount}세트`;
        } else {
          s.display_detail = `${repsVal}회 × ${repsCount}세트`;
        }
      }
  
      return { plan, schedules };
    }
  
    // ─────────────────────────────────────────────
    // ✔ 스케줄 추가
    // ─────────────────────────────────────────────
    async function createScheduleService({ planId, date, exerciseId }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
  
        // 최대 order 조회
        const maxOrder = await repo.getMaxOrder(client, planId);
        const newOrder = (maxOrder || 0) + 1;
  
        // 스케줄 생성
        const scheduleId = await repo.insertSchedule(
          client,
          planId,
          date,
          newOrder,
          false,
          exerciseId
        );
  
        // 타입 조회
        const isTime = await repo.isExerciseTimeType(client, exerciseId);
  
        // 세트 초기 생성
        if (isTime) {
          for (let i = 1; i <= 3; i++) {
            await repo.insertTimeSet(client, scheduleId, exerciseId, i, 600000);
          }
        } else {
          for (let i = 1; i <= 3; i++) {
            await repo.insertRepsSet(client, scheduleId, exerciseId, i, 0, 12);
          }
        }
  
        await client.query("COMMIT");
  
        return { scheduleId, exerciseId };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  
    return {
  
      // 이전 서비스
      getUserInfo,
      getMonthlySummary,
      getWelcomeChatService,
      generateRoutineService,
      recommendExerciseService,
      getAllExercisesService,
      toggleFavoriteService,
      toggleHiddenService,
      getExerciseTypeService,
  
      // Part3-3
      createDummyPlanService,
      getTodayPlanService,
      createScheduleService,
    };
  }
