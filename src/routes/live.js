// Takwimu za moja kwa moja: heartbeat kutoka kwenye player (pub) na muhtasari kwa admin
const express = require('express');
const { ah } = require('../utils/validation');
const live = require('../services/live');

const pub = express.Router();
const adm = express.Router();

// Player inatuma kila sekunde 30 ikiwa inacheza. Jibu ni jepesi sana.
pub.post('/ping', ah(async (req, res) => {
  const ch = parseInt((req.body || {}).channel_id, 10);
  const b = req.body || {};
  if (ch > 0) await live.ping(req, ch, b.playing === true, b.lat, b.lon);   // bila kusoma database
  res.status(204).end();
}));

adm.get('/summary', ah(async (req, res) => {
  res.json(await live.summary());
}));

module.exports = { pub, adm };
