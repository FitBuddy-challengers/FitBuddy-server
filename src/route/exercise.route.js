// src/route/exercise.route.js

import { Router } from "express";
import exerciseController from "../controllers/exercise.controller.js";

export default function createExerciseRouter({ pool, upload, openai, uploadDir }) {
  const router = Router();

  // controller 인스턴스 생성
  const controller = exerciseController({ pool, upload, openai, uploadDir });

  // ────────────────────────────────────────────────
  // GPT 관련
  // ────────────────────────────────────────────────
  router.post("/api/chat/welcome", controller.welcomeChat);
  router.post("/api/generate-routine", controller.generateRoutine);
  router.post("/api/recommend-exercise", controller.recommendExercise);

  // ────────────────────────────────────────────────
  // Exercise Master
  // ────────────────────────────────────────────────
  router.get("/api/exercises", controller.getExercises);
  router.patch("/api/exercises/:exerciseId/favorite", controller.toggleFavorite);
  router.patch("/api/exercises/:exerciseId/hidden", controller.toggleHidden);

  // ────────────────────────────────────────────────
  // Today Plan
  // ────────────────────────────────────────────────
  router.get("/api/plan/today", controller.getTodayPlan);

  // ────────────────────────────────────────────────
  // Dummy Plan
  // ────────────────────────────────────────────────
  router.post("/api/create-dummy-plan", controller.createDummyPlan);

  // ────────────────────────────────────────────────
  // Schedule CRUD
  // ────────────────────────────────────────────────
  router.post("/api/schedule", controller.addSchedule);
  router.patch("/api/schedule/:id/order", controller.updateScheduleOrder);
  router.delete("/api/schedule/:scheduleId", controller.deleteSchedule);
  router.post("/api/schedule/:scheduleId/change-exercise", controller.changeExercise);

  // ────────────────────────────────────────────────
  // scheduleId 조회
  // ────────────────────────────────────────────────
  router.get("/api/schedule-id", controller.getScheduleId);

  // ────────────────────────────────────────────────
  // Plans
  // ────────────────────────────────────────────────
  router.get("/api/plans", controller.getPlans);

  // ────────────────────────────────────────────────
  // Plan Schedules
  // ────────────────────────────────────────────────
  router.get("/api/plans/:planId/schedules", controller.getPlanSchedules);

  // ────────────────────────────────────────────────
  // Reps Sets
  // ────────────────────────────────────────────────
  router.get("/api/reps-sets/:scheduleId", controller.getRepsSets);
  router.patch("/api/schedule/:scheduleId/reps-sets", controller.saveRepsSets);
  router.patch("/api/sets/reps/complete", controller.completeReps);

  // ────────────────────────────────────────────────
  // Time Sets
  // ────────────────────────────────────────────────
  router.get("/api/schedule/:scheduleId/time-sets", controller.getTimeSets);
  router.patch("/api/schedule/:scheduleId/time-sets", controller.saveTimeSets);

  // ────────────────────────────────────────────────
  // Submit AI
  // ────────────────────────────────────────────────
  router.post("/api/plan/submit-ai", controller.submitAi);

  return router;
}
