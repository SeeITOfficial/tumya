const express = require("express");
const router = express.Router();

const db = require("../db");
const { requireAuth } = require("../lib/auth");

router.get("/", requireAuth, (req, res) => {

    const notifications = db.prepare(`
        SELECT
            sh.status,
            sh.note,
            sh.timestamp,
            o.tracking_code
        FROM status_history sh
        JOIN orders o
            ON o.id = sh.order_id
        WHERE o.customer_id = ?
        ORDER BY sh.timestamp DESC
        LIMIT 50
    `).all(req.user.id);

    res.json(notifications);

});

module.exports = router;