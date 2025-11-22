// src/app.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
//import { Pool } from "pg";
import pg from "pg";
const { Pool } = pg;
import OpenAI from "openai";
import swaggerUi from "swagger-ui-express";
import mountSwagger from "./swagger/swagger.js";
import authRouter from "./controller/auth.controller.js";
// import exerciseRouter from "./controller/exercise.controller.js";
import challengeRouter from "./controller/challenge.controller.js";
// import exerciseRoute from "./route/exercise.route.js";
import exerciseRoute from "./route/exercise.route.js";
import recordsRoute from "./route/records.route.js";

const __dirname = path.resolve();

// ───────────────── Render 업로드 경로 설정 ─────────────────
const isRender = !!process.env.RENDER;

let uploadDir =
  process.env.UPLOAD_DIR ||
  (isRender ? "/tmp/uploads" : path.join(__dirname, "uploads"));

if (/^\/var\//.test(uploadDir) && isRender) {
  console.warn(
    //서버 배포는 실제 render애서 진행했음.
    ` UPLOAD_DIR='${uploadDir}' 은 Render에서 쓰기 제한이 있어 '/tmp/uploads'로 폴백합니다.`
  );
  uploadDir = "/tmp/uploads";
}

try {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`업로드 디렉토리 준비 완료: ${uploadDir}`);
} catch (e) {
  console.error(`업로드 디렉토리 생성 실패 '${uploadDir}':`, e);
  if (isRender) {
    uploadDir = "/tmp/uploads";
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`업로드 디렉토리 폴백 완료: ${uploadDir}`);
  } else {
    throw e;
  }
}

// ───────────────── Multer 스토리지 ─────────────────
const multerStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
export const upload = multer({ storage: multerStorage });

// ───────────────── DB & OPENAI ─────────────────
export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  ssl: { rejectUnauthorized: false },
});

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ───────────────── Express 앱 ─────────────────
const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

// HTTPS 리다이렉트
app.set("trust proxy", 1);
app.use((req, res, next) => {
  const proto = req.headers["x-forwarded-proto"];
  if (proto === "https" || req.secure || !isRender) return next();
  return res.redirect(`https://${req.headers.host}${req.url}`);
});

// 라우터 마운트
app.use(authRouter({ pool, upload, openai, uploadDir }));
app.use(exerciseRoute({ pool, upload, openai, uploadDir }));
//app.use(exerciseRouter({ pool, upload, openai, uploadDir }));
app.use(challengeRouter({ pool, upload }));
app.use("/api/records", recordsRoute({ pool }));

// Swagger 마운트
mountSwagger(app);

console.log("app.js 설정 완료 — express 구성 완료!");

export default app;