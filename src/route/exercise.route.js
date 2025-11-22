import express from "express";
import exerciseAiController, { exerciseConsultController } from "../controller/exercise/exerciseAi.controller.js";
import masterController from "../controller/exercise/master.controller.js"; 
import planController from "../controller/exercise/plan.controller.js"; 
import todayPlanController from "../controller/exercise/todayPlan.controller.js"; 
import scheduleController from "../controller/exercise/schedule.controller.js"; 
import planListController from "../controller/exercise/planList.controller.js";
import repsController from "../controller/exercise/reps.controller.js";
import timeController from "../controller/exercise/time.controller.js";
import submitAiController from "../controller/exercise/submitAi.controller.js";
import checkExistingPlanController from "../controller/exercise/checkExistingPlan.controller.js";
import deleteDummyPlanController from "../controller/exercise/deleteDummyPlan.controller.js";

export default function createExerciseRouter({ pool, upload, openai, uploadDir }) {
  const router = express.Router();
  //const router = Router();

  
  const consult = exerciseConsultController({ openai });
  const master = masterController({ pool });
  const plan = planController({ pool });
  const today = todayPlanController({ pool });
  const schedule = scheduleController({ pool });
  const planList = planListController({ pool });
  const submitAi = submitAiController({ pool, openai });
  const controller = exerciseAiController({ pool, openai });
  const reps = repsController({ pool });
  const time = timeController({ pool });


  // GPT
  router.post("/api/chat/welcome", controller.welcomeChat);
  router.post("/api/generate-routine", controller.generateRoutine);
  router.post("/api/recommend-exercise", controller.recommendExercise);
  router.post("/api/chat/consult", consult.consult);
  router.get("/api/check-plan", checkExistingPlanController({ pool }).check);


  //더미 스케줄 제거
  router.delete("/api/dummy-plan", deleteDummyPlanController({ pool }).deleteDummy);

  // 운동 마스터
  router.get("/api/exercises", master.getExercises);
  router.patch("/api/exercises/:exerciseId/favorite", master.toggleFavorite);
  router.patch("/api/exercises/:exerciseId/hidden", master.toggleHidden);

  // 더미 플랜
  router.post("/api/create-dummy-plan", plan.createDummyPlan);

  // 오늘 플랜
  router.get("/api/plan/today", today.getTodayPlan);

  // 스케줄 CRUD
  router.post("/api/schedule", schedule.addSchedule);
  router.patch("/api/schedule/:id/order", schedule.updateScheduleOrder);
  router.delete("/api/schedule/:scheduleId", schedule.deleteSchedule);
  router.post("/api/schedule/:scheduleId/change-exercise", schedule.changeExercise);

  //  scheduleId 찾기
  router.get("/api/schedule-id", planList.getScheduleId);

  //  특정 플랜의 스케줄 목록
  router.get("/api/plans/:planId/schedules", planList.getPlanSchedules);

  //  전체 플랜 (스케줄 포함)
  router.get("/api/plans", planList.getPlans);

  //  스케줄 완료 처리
  router.patch("/api/schedule/:scheduleId/complete", planList.completeSchedule);

  // REPS
  router.get("/api/reps-sets/:scheduleId", reps.getRepsSets);
  router.patch("/api/schedule/:scheduleId/reps-sets", reps.saveRepsSets);
  router.patch("/api/sets/reps/complete", reps.completeReps);

  //기록 분석
  router.post("/api/exercise-advice", controller.exerciseAdvice);
  

  // TIME
  router.get("/api/schedule/:scheduleId/time-sets", time.getTimeSets);
  router.patch("/api/schedule/:scheduleId/time-sets", time.saveTimeSets);
  router.post("/api/sets/time/complete", time.completeTime);
  router.post("/api/plan/submit-ai", submitAi.submitAi);
  return router;
}