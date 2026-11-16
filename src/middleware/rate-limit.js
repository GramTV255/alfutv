const rateLimit = require('express-rate-limit');
const mk = (windowMs, max, msg) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { error: msg || 'Maombi mengi mno. Jaribu tena baadaye.' },
});
module.exports = {
  apiLimiter: mk(60 * 1000, 300),
  authLimiter: mk(15 * 60 * 1000, 20, 'Majaribio mengi ya kuingia. Subiri dakika 15.'),
  paymentLimiter: mk(10 * 60 * 1000, 15),
  adminLimiter: mk(60 * 1000, 120),
  liveLimiter: mk(60 * 1000, 600),   // dashboard ya live inasasishwa kila sekunde 1
};
