// src/repositories/store.repository.js


// 소유 아이템 목록 조회
export const findOwnedItems = async (pool, userId) => {
    const result = await pool.query(
        "SELECT item_id FROM user_owned_items WHERE user_id = $1",
        [userId]
    );
    return result.rows.map(r => r.item_id);
};

// 특정 아이템 정보 조회
export const findItemById = async (pool, itemId) => {
    const result = await pool.query(
        "SELECT id, price, required_level FROM items WHERE id = $1",
        [itemId]
    );
    return result.rows[0];
};

// 유저 정보 조회 (FOR UPDATE)
export const findUserForUpdate = async (client, userId) => {
    const result = await client.query(
        "SELECT id, level, coin FROM users WHERE id = $1 FOR UPDATE",
        [userId]
    );
    return result.rows[0];
};

// 이미 소유한 아이템인지 확인
export const checkOwned = async (client, userId, itemId) => {
    const result = await client.query(
        "SELECT 1 FROM user_owned_items WHERE user_id = $1 AND item_id = $2",
        [userId, itemId]
    );
    return result.rows.length > 0;
};

// 코인 업데이트
export const updateUserCoin = async (client, userId, newCoin) => {
    await client.query(
        "UPDATE users SET coin = $1 WHERE id = $2",
        [newCoin, userId]
    );
};

// 아이템 소유 등록
export const insertOwnedItem = async (client, userId, itemId) => {
    await client.query(
        "INSERT INTO user_owned_items (user_id, item_id) VALUES ($1, $2)",
        [userId, itemId]
    );
};
