// src/route/store.route.js
import express from "express";
import * as storeController from "../controller/store.controller.js";

export default function storeRouter({ pool }) {
    const router = express.Router();

    // GET /api/store/owned-items
    router.get("/owned-items", (req, res) => storeController.getOwnedItems(req, res, pool));

    // POST /api/store/purchase
    router.post("/purchase", (req, res) => storeController.purchaseItem(req, res, pool));

    return router;
}
