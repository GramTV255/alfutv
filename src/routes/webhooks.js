'use strict';
const express = require('express');
const { wrap } = require('../utils/errors');
const { handleWebhook } = require('../services/paymentService');

const router = express.Router();

// ClickPesa webhook (events: "PAYMENT RECEIVED", "PAYMENT FAILED"). Set this URL in the ClickPesa dashboard
// (Settings -> Developers -> your application -> Application Webhooks).
// 1) checksum verified when a checksum key is configured  2) status confirmed through ClickPesa's query API  3) idempotent.
router.post('/clickpesa', wrap(async (req, res) => {
  await handleWebhook(req.body || {});
  res.status(200).json({ received: true }); // any 2xx acknowledges receipt
}));

module.exports = router;
