const express = require("express");
const router = express.Router();

const db = require("../db");
const { requireAuth } = require("../lib/auth");

/**
 * GET /notifications
 * Returns the 50 most recent status-history entries for the authenticated customer's orders.
 */
router.get("/", requireAuth, (req, res) => {

    let notifications;
    try {
        notifications = db.prepare(`
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
    } catch (err) {
        console.error("notifications GET / db error:", err);
        return res.status(500).json({ error: "Failed to fetch notifications" });
    }

    res.json(notifications);

});

module.exports = router;