const router = require('express').Router();
const { query } = require('../config/database');
const { ah } = require('../utils/validation');

router.get('/', ah(async (req, res) => {
  const r = await query(`SELECT p.id,p.name,p.description,p.price,p.duration_days,p.duration_minutes,
      COALESCE(json_agg(json_build_object('id',c.id,'name',c.name)) FILTER (WHERE c.id IS NOT NULL AND c.active),'[]') AS channels
    FROM packages p LEFT JOIN package_channels pc ON pc.package_id=p.id LEFT JOIN channels c ON c.id=pc.channel_id
    WHERE p.active GROUP BY p.id ORDER BY p.price`);
  res.json({ packages: r.rows });
}));
module.exports = router;
