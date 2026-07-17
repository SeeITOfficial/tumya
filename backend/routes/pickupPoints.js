const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../lib/auth');

// Public: list active pickup points
router.get('/', (req, res) => {
  const points = db.prepare(`SELECT * FROM pickup_points WHERE active = 1 ORDER BY area, name`).all();
  res.json(points);
});

// Admin: add pickup point
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, area, landmark } = req.body;
  if (!name || !area) return res.status(400).json({ error: 'name and area required' });

  const result = db
    .prepare(`INSERT INTO pickup_points (name, area, landmark) VALUES (?, ?, ?)`)
    .run(name, area, landmark || null);
  res.status(201).json(db.prepare(`SELECT * FROM pickup_points WHERE id = ?`).get(result.lastInsertRowid));
});

// Admin: deactivate pickup point (soft delete, keeps historical orders valid)
router.patch('/:id/deactivate', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare(`UPDATE pickup_points SET active = 0 WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Pickup point not found' });
  res.json({ ok: true });
});

module.exports = router;
