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

        // 4) GPT 프롬프트 생성
        console.log("[recommendExercise] GPT 프롬프트 생성");
      
          // 4) GPT 프롬프트 생성
          const prompt = `
      당신은 전문 퍼스널 트레이너 AI입니다.
      반드시 아래 DB 운동 목록 안에서만 운동을 선택해서 스케줄을 구성하세요.
      
      [운동 DB 목록]
      ${exerciseText}

      
      위 운동 목록에 있는 운동만으로 스케줄을 구성하되,
      운동은 반드시 JSON으로 반환하세요.

      ⚠️ 출력 형식
      {
        "routine_text": "사용자에게 보여줄 간단한 설명",
        "exercises": [
          { "name": "스쿼트", "sets": 3, "reps": 12 },
          { "name": "푸시업", "sets": 2, "reps": 15 },
          { "name": "플랭크", "seconds": 60 }
        ]
      }
      
      [사용자 정보]
      이름: ${userInfo.name}
      성별: ${userInfo.gender}
      키: ${userInfo.height} cm
      몸무게: ${userInfo.weight} kg
      운동 수준: ${userInfo.exercise_level}
      지병/부상: ${userInfo.disease}
      운동 기구: ${userInfo.exercise_equipment?.join(", ") || "없음"}
      
      [기록 요약]
      많이 한 부위: ${mostPart}
      부족한 부위: ${leastPart}
      
      [요청 조건]
      기간: ${startDate} ~ ${endDate}
      운동 요일: ${days.join(", ")}
      집중 부위: ${focusArea}
      
      ⚠️ 규칙 (절대 어기지 말 것!)
      - 운동은 반드시 위 DB 목록에서만 선택
      - 날짜마다 3~5개 운동 추천
      - 같은 날 같은 운동 중복 금지
      - 포맷은 아래처럼 출력:
      
      📅 {요일} ({날짜})
      1. 운동명 - 설명
      2. 운동명 - 설명
      3. 운동명 - 설명
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

  
  