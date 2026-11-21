# Security notes

No website can be promised "unhackable". This project is built to make attacks hard, to detect them, and to limit the damage. Use it with the checklist at the end.

## What protects the site (in the code)
| Risk | Protection |
|---|---|
| Guessing passwords | bcrypt hashes (never plain text); rate limit per IP + phone and per IP overall; **account lock** after 5 wrong passwords for 15 min (stored in the database); failed/locked logins in Audit Logs; wrong passwords and locked accounts get the same answer (no account guessing); weak/common passwords refused |
| Stolen session | HTTP-only, SameSite=Strict, Secure cookie; signed token bound to a per-user version (password change/reset ends all sessions); **admin sessions max 8 h**; **admin logout ends every admin session**; role and status are re-read from the database on every request |
| Cross-site attacks | CSRF token on every state-changing request; strict CSP (no inline scripts), frame blocking, nosniff, no referrer, Permissions-Policy; all page text is escaped |
| Taking data without permission | Every endpoint re-checks role, key, account and subscription on the server; API keys and proxy tokens are random 192–256 bit values, only hashes stored; wrong keys/tokens from one IP get **blocked after 30 tries in 10 min** |
| Secrets | Headers, ClearKeys, links, tokens encrypted with AES-256-GCM; no secrets in front-end code or logs; `.env` is never in the zip |
| Server abuse (SSRF) | https/http allowlist per host, public IPs only, DNS pinned, redirects re-checked, size and time limits |
| Payments | Only the ClickPesa webhook + server-side verification can activate a subscription; never the browser |
| Admin takeover | Optional `ADMIN_ALLOWED_IPS`; every admin action audited; admin never sees a user's password |
| Caching of private data | `Cache-Control: no-store` on auth/user/admin APIs; panels marked noindex |

## You must also do (outside the code)
1. Use **HTTPS only** and set `PUBLIC_BASE_URL`, `TRUST_PROXY=1` (otherwise limits and locks see the proxy's IP, not the visitor's).
2. Long random `JWT_SECRET`, `ENCRYPTION_KEY`, `API_KEY_PEPPER`, `CRON_SECRET`. Keep a safe copy of `ENCRYPTION_KEY`: without it stored links/keys cannot be read. Never change `API_KEY_PEPPER` after launch (all API keys would stop working).
3. Strong, unique admin password (12+ characters). After the first login **delete `ADMIN_PASSWORD`** from the environment.
4. Keep the admin phone/number private; consider `ADMIN_ALLOWED_IPS` if your IP is stable.
5. Share proxy links and API keys only with paying users; use "Link mpya" / regenerate if one leaks.
6. Keep dependencies updated: run `npm audit` and `npm update` regularly, and redeploy.
7. Database: private network or strong password, backups, no public access.
8. Only add sources, links and streams you are authorised to use.

## Reporting
If you notice suspicious activity: Admin → Audit Logs (`LOGIN_FAILED`, `LOGIN_LOCKED`, `ADMIN_LOGIN_BLOCKED_IP`), regenerate secrets, suspend affected accounts, and change the admin password (this ends all sessions).
