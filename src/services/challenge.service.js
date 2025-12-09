// src/services/challenge.service.js

import {
    getAllChallengeLevels,
    getLevelRequirement,
    getLevelRequirementWithRewards,
  
    // 사용자 및 진행도
    getUserBasicInfo,
    getUserChallengeProgress,
    updateUserAttendance,
    updateUserExercise,
    upsertExerciseProgress,
    getExerciseDone,
  
    // 레벨업
    getUserLevel,
    updateUserLevel,
    checkAndUpdateLevel,
  
    // 사진 인증
    findExistingPhoto,
    updatePhoto,
    insertPhoto,
    increasePhotoCount,
    getMonthlyPhotos,
    getWeeklyPhotos,
  
    // 보상
    updateUserCoin,
    updateProgressAfterReward,
  
    // 기록
    getMonthlyCompletion,
    getDailyPlan,
    getDailySchedule,
    getTimeRecord,
    getRepsRecord,
  
    // 체중
    getWeightRecords,
    upsertWeightRecord,
  
    // 스토어
    getItems,
    getOwnedItems,
    getStoreUser,
    findItem,
    findUser,
    insertUserItem
  } from "../repositories/challenge.repository.js";
  
  
  // ------------------------------------------------------------
  //  레벨업
  // ------------------------------------------------------------
  // export async function checkAndUpdateLevel(db, userId) {
  //   // db 는 pool 또는 client 둘 다 가능함
  
  //   const progress = await getUserChallengeProgress(db, userId);
  //   const userInfo = await getUserLevel(db, userId);
  
  //   if (!progress.rows.length || !userInfo.rows.length) return;
  
  //   const currentLevel = userInfo.rows[0].level;
  //   const nextLevel = currentLevel + 1;
  
  //   const req = await getLevelRequirement(db, nextLevel);
  //   if (!req.rows.length) return;
  
  //   const p = progress.rows[0];
  //   const r = req.rows[0];
  
  //   const canLevelUp =
  //     p.attendance_count >= r.required_attendance &&
  //     p.photo_count >= r.required_photo &&
  //     p.exercise_count >= r.required_exercise;
  
  //   if (canLevelUp) {
  //     await updateUserLevel(db, userId, nextLevel);
  //   }
  // }
  
  // ------------------------------------------------------------
  //  출석 처리
  // ------------------------------------------------------------
  export async function handleAttendance(pool, userId, today) {
    const progress = await getUserChallengeProgress(pool, userId);
    if (!progress.rows.length) return { error: "User progress not found" };
  
    const lastDate = progress.rows[0].last_attendance_date;
    const already = lastDate && lastDate.toISOString().split("T")[0] === today;
  
    if (already) return { already: true };
  
    await updateUserAttendance(pool, userId, today);
  
    const updated = await getUserChallengeProgress(pool, userId);
  
    if (updated.rows[0].attendance_count === 5) {
        const user = await getUserBasicInfo(pool, userId);
        const newCoin = user.rows[0].coin + 300;
        await updateUserCoin(pool, userId, newCoin);
      }
  
    await checkAndUpdateLevel(pool, userId);
    return { success: true };
  }
  
  
  // ------------------------------------------------------------
  //  운동 처리
  // ------------------------------------------------------------
  export async function handleExercise(pool, userId, today) {
    const done = await getExerciseDone(pool, userId, today);
    const completed = parseInt(done.rows[0].count, 10) > 0;
  
    if (!completed) return { success: false, reason: "No completed exercise" };
  
    await updateUserExercise(pool, userId, today);
    await upsertExerciseProgress(pool, userId, today);
  
    await checkAndUpdateLevel(pool, userId);
    return { success: true };
  }
  
  
  // ------------------------------------------------------------
  //  사진 인증 처리
  // ------------------------------------------------------------
  export async function handlePhotoUpload(pool, client, userId, date, imageUrl) {
    const exist = await findExistingPhoto(client, userId, date);
  
    if (exist.rows.length > 0) {
      await updatePhoto(client, userId, date, imageUrl);
      return { updated: true };
    }
  
    await insertPhoto(client, userId, date, imageUrl);
    await increasePhotoCount(client, userId);
  
    await checkAndUpdateLevel(client, userId);
    return { created: true };
  }
  
  
  // ------------------------------------------------------------
  //  챌린지 보상 처리
  // ------------------------------------------------------------
  export async function claimReward(client, userId, challengeType) {
    const result = await client.query(
      `SELECT u.level, u.coin,
              p.attendance_count, p.photo_count, p.exercise_count,
              cl.required_attendance, cl.required_photo, cl.required_exercise,
              cl.reward_attendance, cl.reward_photo, cl.reward_exercise
       FROM users u
       JOIN user_challenge_progress p ON u.id = p.user_id
       JOIN challenge_level cl ON u.level = cl.level
       WHERE u.id = $1 FOR UPDATE`,
      [userId]
    );
  
    if (!result.rows.length) {
      throw new Error("사용자 정보를 찾을 수 없습니다.");
    }
  
    const data = result.rows[0];
  
    let required, current, reward, column;
  
    if (challengeType === "attendance") {
      required = data.required_attendance;
      current = data.attendance_count;
      reward = data.reward_attendance;
      column = "attendance_count";
    } else if (challengeType === "exercise") {
      required = data.required_exercise;
      current = data.exercise_count;
      reward = data.reward_exercise;
      column = "exercise_count";
    } else if (challengeType === "photo") {
      required = data.required_photo;
      current = data.photo_count;
      reward = data.reward_photo;
      column = "photo_count";
    } else {
      throw new Error("Invalid challenge type");
    }
  
    if (current < required) {
      return { success: false, message: "아직 목표 미달" };
    }
  
    const newCoin = data.coin + reward;
    await updateUserCoin(client, userId, newCoin);
    await updateProgressAfterReward(client, userId, column, required);
  
    await checkAndUpdateLevel(client, userId);
  
    return { success: true, updatedCoin: newCoin };
  }

  // ------------------------------------------------------------
  //  월간 사진 인증 기록 조회 (절대 URL 변환)
  // ------------------------------------------------------------
  export async function getMonthlyRecord(pool, userId, year, month) {
    const result = await getMonthlyPhotos(pool, userId, year, month);

    return {
      rows: result.rows.map(r => ({
        ...r,
        image_url: `${process.env.BASE_URL}${r.image_url}`
      }))
    };
  }

  // ------------------------------------------------------------
  //  주간 사진 인증 기록 조회 (절대 URL 변환)
  // ------------------------------------------------------------
  export async function getWeeklyRecord(pool, userId, startDate) {
    const result = await getWeeklyPhotos(pool, userId, startDate);

    return {
      rows: result.rows.map(r => ({
        ...r,
        image_url: `${process.env.BASE_URL}${r.image_url}`
      }))
    };
  }
  
  
  // // ------------------------------------------------------------
  // //  사진 기록 조회
  // // ------------------------------------------------------------
  // export async function getMonthlyRecord(pool, userId, year, month) {
  //   return getMonthlyPhotos(pool, userId, year, month);
  // }
  
  // export async function getWeeklyRecord(pool, userId, startDate) {
  //   return getWeeklyPhotos(pool, userId, startDate);
  // }
  
  
  // ------------------------------------------------------------
  //  월간 운동 완료율
  // ------------------------------------------------------------
  export async function getMonthlyCompletionRate(pool, userId, year, month) {
    const start = new Date(year, month - 1, 1).toISOString().split("T")[0];
    const end = new Date(year, month, 0).toISOString().split("T")[0];
  
    return getMonthlyCompletion(pool, userId, start, end);
  }
  
  
  // ------------------------------------------------------------
  //  일별 운동 기록
  // ------------------------------------------------------------
  export async function getDailyRecord(pool, userId, date) {
    const plan = await getDailyPlan(pool, userId, date);
    if (!plan.rows.length) return [];
  
    const planId = plan.rows[0].id;
    const schedules = await getDailySchedule(pool, planId, date);
  
    const records = [];
  
    for (const sched of schedules.rows) {
      if (sched.is_time_type) {
        const t = await getTimeRecord(pool, sched.schedule_id);
        records.push({
          exercise_name: sched.exercise_name,
          sets: parseInt(t.rows[0].count),
          seconds: Math.floor(t.rows[0].max_ms / 1000),
          reps: null,
          is_completed: sched.is_completed,
          is_time_type: true
        });
      } else {
        const r = await getRepsRecord(pool, sched.schedule_id);
        records.push({
          exercise_name: sched.exercise_name,
          sets: parseInt(r.rows[0].count),
          reps: parseInt(r.rows[0].max_reps),
          seconds: null,
          is_completed: sched.is_completed,
          is_time_type: false
        });
      }
    }
  
    return records;
  }
  
  
  // ------------------------------------------------------------
  //  체중 기록
  // ------------------------------------------------------------
  export async function getWeightHistory(pool, userId) {
    return getWeightRecords(pool, userId);
  }
  
  export async function saveWeightRecord(pool, userId, date, weight, bodyFat, muscle) {
    return upsertWeightRecord(pool, userId, date, weight, bodyFat, muscle);
  }
  
  
  // ------------------------------------------------------------
  //  스토어
  // ------------------------------------------------------------
  export async function getStoreItems(pool) {
    return getItems(pool);
  }
  
  export async function getUserOwnedItems(pool, userId) {
    return getOwnedItems(pool, userId);
  }
  
  export async function getStoreUserInfo(pool, userId) {
    return getStoreUser(pool, userId);
  }
  
  
  //중복 구매 체크
  export async function purchaseItem(client, userId, itemId) {
    // 1. 아이템 찾기 (FOR UPDATE)
    const item = await client.query(
      `SELECT price, required_level 
       FROM items 
       WHERE id = $1
       FOR UPDATE`,
      [itemId]
    );
  
    // 2. 사용자 정보 (FOR UPDATE)
    const user = await client.query(
      `SELECT level, coin 
       FROM users 
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );
  
    if (!item.rows.length || !user.rows.length) {
      throw new Error("not found");
    }
  
    const { price, required_level } = item.rows[0];
    const { coin, level } = user.rows[0];
  
    // 3. 중복 구매 체크
    const owned = await client.query(
      `SELECT 1 FROM user_owned_items 
       WHERE user_id = $1 AND item_id = $2`,
      [userId, itemId]
    );
  
    if (owned.rows.length) {
      return { success: false, message: "이미 소유" };
    }
  
    // 4. 조건 체크
    if (level < required_level) {
      return { success: false, message: "레벨 부족" };
    }
  
    if (coin < price) {
      return { success: false, message: "코인 부족" };
    }
  
    // 5. 구매 처리
    const newCoin = coin - price;
  
    await updateUserCoin(client, userId, newCoin);
    await insertUserItem(client, userId, itemId);
  
    return { success: true, updatedCoin: newCoin };
  }

  export { checkAndUpdateLevel };
