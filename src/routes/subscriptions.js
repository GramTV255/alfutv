const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const subs = require('../services/subscription-service');
const { ah } = require('../utils/validation');
router.get('/me', requireAuth, ah(async (req, res) => res.json({ subscriptions: await subs.listForUser(req.user.id), channel_purchases: await subs.listChannelPurchases(req.user.id) })));
module.exports = router;
