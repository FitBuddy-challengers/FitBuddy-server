// src/controller/exercise/exerciseAi.controller.js

import {
    getUserInfoService,
    getMonthlySummaryService,
    getAllExercisesService
  } from "../../services/exercise/exerciseAi.service.js";
  
  export default function exerciseAiController({ pool, openai }) {
    return {
      // ───────────────────────────── GPT 인사 ─────────────────────────────
      async welcomeChat(req, res) {
        const prompt = `
      너는 밝고 귀여운 한국어 퍼스널 트레이너야.
      2줄만 출력해.
      
      1줄차: 오늘 운동을 가볍게 응원하는 매우 짧은 인사 1문장 (최대 15자). 
      - 이름 언급 X
      - 너무 설명적이면 안 됨
      - 불🔥, 근육💪, 반짝✨ 중 0~2개 랜덤 포함
      - 매번 표현이 달라야 함
      
      2줄차: "원하시는 상담 내용을 알려주세요!" 라고 정확히 출력.
      `;
  
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "You are a bright and energetic Korean personal trainer AI." },
              { role: "user", content: prompt },
            ],
            temperature: 0.9,
            max_tokens: 60,
          });
  
          const message = completion.choices[0].message.content.trim();
          res.json({ message });
        } catch (error) {
          res.status(500).json({ error: "Failed to create greeting message" });
        }
      },
  
      // ───────────────────────────── 하루 루틴 생성 ─────────────────────────────
      async generateRoutine(req, res) {
        const { user_info, schedule_info } = req.body;
        if (!user_info || !schedule_info) {
          return res.status(400).json({ error: "필수 정보 누락되었습니다." });
        }
  
        const prompt = `
        당신은 전문 퍼스널 트레이너이자 친근한 운동 상담 AI입니다.
        아래 정보를 참고하여 사용자의 하루 운동 루틴을 **한국어로 자연스럽게 대화하듯 작성**해주세요.

        ## 반드시 이 형식을 지키세요 ##
        1) 먼저 "routine_text"를 한국어 대화체로 작성합니다.
        2) 그 다음, "exercises" 배열을 JSON으로 출력합니다.
        3) exercises 배열에는 다음 정보가 들어갑니다:
          - name: 운동 이름 (DB에 있는 실제 운동명 그대로)
          - sets: 세트 수 (정수)
          - reps: 반복 수 (정수)
        4) 어떤 문장도 JSON 밖에 쓰지 마세요.

         ## ⚠️ 출력 규칙 (절대 어기면 안 됨) ##
        - 출력은 JSON 객체 하나만!
        - JSON 밖에 텍스트, 설명, 인사말 절대 쓰지 말기
        - 아래 형식을 그대로 출력

        {
          "routine_text": "대화체 설명...",
          "exercises": [
            { "name": "스쿼트", "sets": 3, "reps": 15 },
            ...
          ]
        }

        ### 사용자 정보 ###
  
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
          - 각 줄은 번호로 시작  
          - '-' 또는 ':' 사용  
          - '회', '세트' 단위 붙임  
          - 시간 기반 표현은 사용하지 않기  
  
        ④ 마지막 문장은 항상 **응원 문장**으로 마무리합니다. 
        
        반드시 JSON만 출력하세요. 
        `;
  
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "너는 전문적인 퍼스널 트레이너 AI야." },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
          });
      
          const raw = completion.choices[0].message.content.trim();
      
          try {
            const parsed = JSON.parse(raw);  // 👈 GPT 답변 JSON 파싱
            return res.json(parsed);         // 👈 JSON 그대로 반환
          } catch (err) {
            console.error("❌ JSON parse 실패:", err);
            return res.status(400).json({
              error: "INVALID_JSON",
              raw  // 디버깅용
            });
          }
        } catch (error) {
          console.error("❌ generateRoutine 오류:", error);
          return res.status(500).json({ error: "루틴 생성 실패" });
        }
      },

      
  
      // ───────────────────────────── 추천 운동 ─────────────────────────────
      async recommendExercise(req, res) {

         // API 호출 로그
      console.log("[recommendExercise] req.body =", req.body);

      const { userId, startDate, endDate, days, focusArea } = req.body;

      if (!userId) {
        console.log("[recommendExercise] userId 없음");
        return res.status(400).json({ error: "userId가 필요합니다." });
      }

      try {
        // 1) 사용자 정보
        console.log("[recommendExercise] 사용자 정보 조회");
        const userInfo = await getUserInfoService(pool, parseInt(userId));
        console.log("[recommendExercise] userInfo =", userInfo);

        // 2) 기존 기록 요약
        console.log("[recommendExercise] 월간 기록 요약 조회");
        const summaryData = await getMonthlySummaryService(pool, parseInt(userId));
        console.log("[recommendExercise] summaryData =", summaryData);

        const mostPart = summaryData?.mostFrequentPart?.part || "없음";
        const leastPart = summaryData?.leastFrequentPart?.part || "없음";

        // 3) 운동 DB 목록
        console.log("[recommendExercise] 운동 DB 가져오기");
        const exerciseList = await getAllExercisesService(pool);
        console.log("[recommendExercise] exerciseList length =", exerciseList.length);

        const exerciseText = exerciseList
          .map((e) => `- ${e.name} (${e.part})`)
          .join("\n");

        // 안전 처리
        const safeEquipment = Array.isArray(userInfo.exercise_equipment)
        ? userInfo.exercise_equipment.join(", ")
        : (userInfo.exercise_equipment || "없음");

        const safeDays = Array.isArray(days)
        ? days.join(", ")
        : "없음";

        const safeDisease = userInfo.disease || "없음";
        const safeLevel = userInfo.exercise_level || "중";

        // 4) GPT 프롬프트 생성
        console.log("[recommendExercise] GPT 프롬프트 생성");
      
          // 4) GPT 프롬프트 생성
          const prompt = `
      당신은 전문 퍼스널 트레이너 AI입니다.
      반드시 아래 DB 운동 목록 안에서만 운동을 선택해서 스케줄을 구성하세요.
      
      [운동 DB 목록]
      ${exerciseText}

      
      운동은 반드시 JSON으로만 반환하세요.

      ⚠️ 출력 구조 설명 (예시 아님!)
        - JSON 객체 1개만 반환
        - routine_text: 한국어 간단 설명 (문장 1~2개)
        - exercises: 운동 리스트 배열
        - 각 운동은 { name, sets 또는 seconds, reps } 형식을 사용
        - 세트/횟수 기반 운동은 { name, sets, reps }
        - 버티기 기반 운동은 { name, seconds }

        routine_text는 반드시 아래 내용을 포함해야 한다:
        1) 오늘 추천한 부위를 먼저 언급한다.
        2) 왜 이 부위를 선택했는지 이유를 설명한다.
        3) 이 부위를 강화하면 어떤 효과가 있는지 1문장으로 설명한다.
        4) 사용자의 운동 수준(${safeLevel})에 맞춰 왜 이 강도를 추천했는지 설명한다.
        5) 마지막은 짧은 응원 문장으로 마무리한다.

        ⚠️ 절대 규칙
        - JSON 외 텍스트 출력 금지
        - JSON 앞뒤로 설명 금지
        - routine_text 외부에 어떤 문장도 쓰면 안 됨
        - exercises 배열은 하루 운동 3~5개만 포함
        - DB 목록에 없는 운동 금지


      
      [사용자 정보]
      이름: ${userInfo.name}
      성별: ${userInfo.gender}
      키: ${userInfo.height} cm
      몸무게: ${userInfo.weight} kg
      운동 수준: ${userInfo.exercise_level}
      지병/부상: ${userInfo.disease}
      운동 기구: ${safeEquipment}
      
      [기록 요약]
      많이 한 부위: ${mostPart}
      부족한 부위: ${leastPart}
      
      [요청 조건]
      기간: ${startDate || "미정"} ~ ${endDate || "미정"}
      운동 요일: ${safeDays}
      집중 부위: ${focusArea || "무관"}

      
      ⚠️ 규칙 (절대 어기지 말 것!)
      - 운동은 반드시 위 DB 목록에서만 선택
      - JSON 하나만 출력
      - JSON 위/아래 추가 텍스트 절대 금지
      - routine_text 안에서만 설명 작성
      - exercises 배열은 하루 운동 3~5개만 포함
          `;
      
          // 5) GPT 호출
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "너는 한국어 운동 전문 트레이너 AI야. DB 외 운동 사용 금지." },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
          });
      
          let result = completion.choices[0].message.content.trim();
          console.log("[recommendExercise] GPT result raw=", result);

          // GPT 출력에서 JSON만 추출
          let jsonStart = result.indexOf("{");
          let jsonEnd = result.lastIndexOf("}");
          if (jsonStart === -1 || jsonEnd === -1) {
            return res.status(400).json({ error: "JSON 형태가 아닙니다.", raw: result });
          }

          let jsonString = result.substring(jsonStart, jsonEnd + 1);

          let parsed;
          try {
            parsed = JSON.parse(jsonString);
          } catch (err) {
            console.error("[recommendExercise] JSON 파싱 실패:", err);
            return res.status(400).json({ error: "INVALID_JSON", raw: jsonString });
          }

          console.log("[recommendExercise] parsed =", parsed);

          // 🔥 안드가 원하는 구조로 응답!
          return res.json({
            routine_text: parsed.routine_text,
            exercises: parsed.exercises,
          });

        } catch (error) {
          console.error("[recommendExercise] 오류 발생:", error);
          return res.status(500).json({ error: "추천 생성 중 서버 오류가 발생했습니다." });
        }
      }
      ,
      async exerciseAdvice(req, res) {

        console.log(" [exerciseAdvice] req.body =", req.body);

        const userId = req.body.userId || req.body.user_id;

        console.log(" [exerciseAdvice] typeof userId =", typeof req.body?.userId);

        
      
        if (!userId) {
          return res.status(400).json({ error: "userId가 필요합니다." });
        }
      
        try {
          // 1) 지난 기록 불러오기
          const summary = await getMonthlySummaryService(pool, userId);
      
          const most = summary?.mostFrequentPart?.part || "없음";
          const least = summary?.leastFrequentPart?.part || "없음";
      
          // 2) GPT 프롬프트 구성
          const prompt = `
          당신은 전문 퍼스널 트레이너이자 운동 분석 전문가입니다.
          아래 사용자의 한 달 운동 데이터를 바탕으로 트레이너가 직접 코칭하듯,
          구체적이고 전문적인 분석 + 현실적인 조언을 3~4문장으로 작성하세요.

          ### 출력 규칙
          - 문장만 출력 (JSON, 목록, 번호 금지)
          - 사용자 이름 언급 금지
          - 과한 표현, 유튜브식 자극적인 말투 금지
          - 너무 과학 용어 남발 금지 (일반인 이해 수준)
          - 실제 PT 트레이너가 회원에게 말하듯 "따뜻하지만 단호"한 톤
          - 운동 부위 간 불균형, 부족한 패턴, 개선 전략을 하나 이상 반드시 포함

          ### 사용자 최근 운동 패턴
          - 가장 많이 한 부위: ${most}
          - 가장 적게 한 부위: ${least}

          ### 조언 가이드
          - 특정 부위에 치우친 패턴 → 왜 문제가 되는지 간단히 설명
          - 보완해야 하는 부위 → 어떤 종류의 운동이 필요한지 조언
          - 앞으로의 루틴 방향 제안
          - 실천 가능한 한 가지 팁 포함
          `;
      
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 120
          });
      
          const advice = completion.choices[0].message.content.trim();
      
          return res.json({ advice });
      
        } catch (err) {
          console.error("exerciseAdvice error:", err);
          return res.status(500).json({ error: "AI 조언 생성 실패" });
        }
      }
      
    };
  }

  // 운동 상담(자유 GPT) Controller — "named export"
export function exerciseConsultController({ openai }) {
  return {
    async consult(req, res) {
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "message is required" });
      }

      const prompt = `
      너는 한국인 퍼스널 트레이너 AI야.
      사용자 운동 고민에 대해 자연스럽고 친절하게 2~3문장으로 답해줘.
      너무 길지 않게, 핵심만 짚어서 설명해줘.
      이모지 0~2개 정도 자연스럽게 포함해도 좋아.
      `;

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: message }
          ],
          max_tokens: 150,
          temperature: 0.8,
        });

        const answer = completion.choices[0].message.content.trim();
        return res.json({ answer });

      } catch (err) {
        console.error("exerciseConsult error:", err);
        return res.status(500).json({ error: "GPT 상담 오류" });
      }
    }
  }
}

  
  