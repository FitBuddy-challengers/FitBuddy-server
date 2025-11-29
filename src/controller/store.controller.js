// src/controller/store.controller.js
import * as storeService from "../services/store.service.js";

// GET 소유 아이템 조회
export const getOwnedItems = async (req, res, pool) => {
    try {
        const userId = parseInt(req.query.userId);

        if (isNaN(userId)) {
            return res.status(400).json({ message: "userId는 필수입니다." });
        }

        const items = await storeService.getOwnedItems(pool, userId);
        return res.json(items);
    } catch (err) {
        console.error("❌ getOwnedItems Error:", err);
        return res.status(500).json({ message: "서버 오류" });
    }
};

// POST 아이템 구매
export const purchaseItem = async (req, res, pool) => {
    console.log("[DEBUG] Raw Request Body:", req.body);
    try {
        const userId = parseInt(req.body.user_id);
        const itemId = parseInt(req.body.item_id);

        if (isNaN(userId) || isNaN(itemId)) {
            return res.status(400).json({
                success: false,
                message: "user_id와 item_id는 필수입니다."
            });
        }

        const result = await storeService.purchaseItem(pool, userId, itemId);

        return res.json({
            success: true,
            message: result.message,
            updatedCoin: result.updatedCoin
        });

    } catch (err) {
        console.error("❌ purchaseItem Error:", err);

        if (err.statusCode) {
            return res.status(err.statusCode).json({
                success: false,
                message: err.message
            });
        }

        return res.status(500).json({
            success: false,
            message: "구매 중 서버 오류가 발생했습니다."
        });
    }
};
