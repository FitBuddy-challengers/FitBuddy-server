import * as storeRepository from "../repositories/store.repository.js";

export const getOwnedItems = async (pool, userId) => {
    return await storeRepository.findOwnedItems(pool, userId);
};

export const purchaseItem = async (pool, userId, itemId) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const item = await storeRepository.findItemById(pool, itemId);
        if (!item) {
            throw { statusCode: 404, message: "존재하지 않는 아이템입니다." };
        }

        const user = await storeRepository.findUserForUpdate(client, userId);
        if (!user) {
            throw { statusCode: 404, message: "사용자를 찾을 수 없습니다." };
        }

        if (user.level < item.required_level) {
            throw { statusCode: 403, message: `레벨 ${item.required_level}이 필요합니다.` };
        }

        if (user.coin < item.price) {
            throw { statusCode: 400, message: "코인이 부족합니다." };
        }

        const owned = await storeRepository.checkOwned(client, userId, itemId);
        if (owned) {
            throw { statusCode: 400, message: "이미 소유하고 있는 아이템입니다." };
        }

        const newCoin = user.coin - item.price;
        await storeRepository.updateUserCoin(client, userId, newCoin);

        await storeRepository.insertOwnedItem(client, userId, itemId);

        await client.query("COMMIT");

        return {
            message: "구매에 성공했습니다!",
            updatedCoin: newCoin,
        };
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
};
