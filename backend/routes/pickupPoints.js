const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../lib/auth');

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Returns true when val coerces to a positive safe integer. */
const isPositiveInteger = (val) =>
  Number.isInteger(Number(val)) && Number(val) > 0;

/** Returns true when val is a non-empty string after trimming. */
const isNonEmptyString = (val) =>
  typeof val === 'string' && val.trim().length > 0;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /
 * Public: list all active pickup points ordered by area then name.
 */
router.get('/', (req, res) => {
  try {
    const points = db
      .prepare(`SELECT * FROM pickup_points WHERE active = 1 ORDER BY area, name`)
      .all();
    res.json(points);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /
 * Admin: create a new pickup point. name and area are required non-empty strings;
 * landmark is optional but must be a string when supplied.
 */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, area, landmark } = req.body;

  if (!isNonEmptyString(name)) {
    return res.status(400).json({ error: 'name must be a non-empty string' });
  }
  if (!isNonEmptyString(area)) {
    return res.status(400).json({ error: 'area must be a non-empty string' });
  }
  if (landmark !== undefined && landmark !== null && typeof landmark !== 'string') {
    return res.status(400).json({ error: 'landmark must be a string' });
  }

  let result;
  try {
    result = db
      .prepare(`INSERT INTO pickup_points (name, area, landmark) VALUES (?, ?, ?)`)
      .run(name.trim(), area.trim(), landmark ? landmark.trim() : null);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create pickup point' });
  }

  res.status(201).json(
    db.prepare(`SELECT * FROM pickup_points WHERE id = ?`).get(result.lastInsertRowid)
  );
});

/**
 * PATCH /:id/deactivate
 * Admin: soft-delete a pickup point by setting active = 0.
 * Keeps historical parcel orders referencing this point intact.
 */
router.patch('/:id/deactivate', requireAuth, requireAdmin, (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ error: 'Invalid pickup point ID' });
  }

  let result;
  try {
    result = db
      .prepare(`UPDATE pickup_points SET active = 0 WHERE id = ?`)
      .run(req.params.id);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to deactivate pickup point' });
  }

  if (result.changes === 0) return res.status(404).json({ error: 'Pickup point not found' });
  res.json({ ok: true });
});

module.exports = router;
