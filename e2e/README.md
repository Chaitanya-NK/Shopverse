# End-to-end tests

Playwright tests for the main journeys, plus the accessibility audit:

| File                    | What it covers                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `global.setup.ts`       | Owner signs up with an emailed code, onboarding creates the business; catalogue seeded           |
| `checkout.spec.ts`      | Guest cash-on-delivery checkout with the emailed code, confirmation email (via the job queue)    |
| `fulfilment.spec.ts`    | Staff pack, hand over, send out and deliver with the delivery code; invoice; tracking page       |
| `returns.spec.ts`       | Shopper signs in and asks for a return; staff approve, receive (stock back), refund, credit note |
| `design.spec.ts`        | Design editor: layout, new section, draft hidden from shoppers until published                   |
| `hindi.spec.ts`         | Switching to Hindi, checkout in Hindi, Hindi confirmation email, switching back                  |
| `accessibility.spec.ts` | axe (WCAG 2.2 AA) on every main page in light and dark mode; keyboard-only shopping              |

## Running them

They need a local Supabase stack (Docker) and a production build:

```bash
npx supabase start                       # also starts Mailpit on :54324 (SMTP on :54325)
npx supabase status -o env               # copy API_URL and the keys into .env.local
export SMTP_HOST=127.0.0.1 SMTP_PORT=54325 MAIL_FROM="Shop <shop@example.test>"
NEXT_PUBLIC_APP_URL=http://localhost:3100 npm run build
npx playwright install chromium          # once
npm run test:e2e                         # or: npm run audit:a11y
```

Playwright starts the app on port 3100 itself. The tests create a business
called "E2E Threads" (`e2e-threads`) and reuse it on later runs; `npx supabase
db reset` starts over. Set `E2E_DATABASE_URL` and `MAILPIT_URL` if your stack
uses other ports.

When a test fails, `npx playwright show-trace e2e/.results/<test>/trace.zip`
replays it step by step. In CI the traces are uploaded as the
`playwright-report` artifact.
