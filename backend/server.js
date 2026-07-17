require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' })); // parcel/catalog photos may come in as base64 or small payloads

app.use('/api/auth', require('./routes/auth'));
app.use('/api/catalog', require('./routes/catalog'));
app.use('/api/pickup-points', require('./routes/pickupPoints'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/parcels', require('./routes/parcels'));
app.use('/api/push', require('./routes/push'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Static frontends — customer PWA at /, admin dashboard at /admin
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Central error handler — keeps a stray thrown error from crashing the process
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Tumya API listening on port ${PORT}`);
});
