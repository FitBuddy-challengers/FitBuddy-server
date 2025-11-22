// src/route/records.route.js
import express from "express";
import recordsController from "../controller/records/records.controller.js";

export default function recordsRoute({ pool }) {
    const router = express.Router();
    const controller = recordsController({ pool });

    router.get("/monthly-completion", controller.getMonthlyCompletion);
    router.get("/daily", controller.getDailyRecords);
    router.get("/monthly-summary", controller.getMonthlySummary);
    router.get("/radar-data", controller.getRadarData);
    router.get("/weight", controller.getWeightRecords);
    router.post("/weight", controller.addOrUpdateWeightRecord);

    return router;
}