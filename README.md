# Balasore Tutors

A local-first Next.js marketplace for in-person tutoring in Balasore. The public directory and the guardian, tutor and admin workspaces use the same PostgreSQL data. [Architecture and route map](ARCHITECTURE.md)

## Run locally

Use Node.js 22.13+ and npm. The application and tests were exercised on Node.js 24 and PostgreSQL 18. On a fresh checkout:

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. Run `openssl rand -hex 32` and paste the output into `APP_SECRET` in `.env`. Keep the same key while using the database.
3. Run `npm run db:local` in a dedicated terminal. It starts a persistent local PostgreSQL instance at port 55432. Alternatively, set `DATABASE_URL` for an existing PostgreSQL instance and leave this terminal step out.
4. Run `npm run db:migrate`. Use `npm run db:seed` if you want three fictional tutor profiles with generated portraits and one example requirement.
5. Run `npm run dev` and open [the local app](http://localhost:3000).

The development server listens on localhost. Guardians and tutors use Google sign-in when configured. With Google unconfigured and `DEV_SERVICES=1`, the local test flow prints an OTP to the server terminal without sending a text. Use synthetic numbers and documents in that flow. The seed profiles have no credentials.

### Google sign-in

1. In Google Cloud, configure the consent screen under **Google Auth Platform**, then create a **Web application** OAuth client. Add this exact authorized redirect URI for local development:

   `http://localhost:3000/api/v1/auth/google/callback`

2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the existing `.env`. Keep the secret on the server and leave `TWILIO_ENABLED=0`. `APP_ORIGIN` must match the origin used by the browser and OAuth client.
3. Run `npm run db:migrate`, restart `npm run dev`, and select **Continue with Google** at `/login`. If the Google project restricts access, add the intended Google account through the project's audience settings.
4. Existing members with an active session can use **Settings → Link Google account** to keep their profile, requests, documents, and existing verified phone status. A Google account already attached to a different profile cannot be used to merge accounts.

Google sign-in verifies identity using the OpenID Connect subject. New Google accounts can save tutor drafts and manage guardian requests, but tutor submission and guardian contact disclosure still require separate phone verification. Administrator sign-in continues to use a password and authenticator. [Google’s web app OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server)

### First administrator

Run `npm run admin:bootstrap -- admin@example.invalid` locally. The address can be any unique validly formatted email. Bootstrap creates the first administrator atomically and prints a random password and a Base32 authenticator secret once. Store those values privately. Add the secret to an authenticator as a time-based account with six digits and a 30-second period. Sign in at [administrator sign-in](http://localhost:3000/login?role=admin) with the password and current code. Codes cannot be reused. In a real environment use a private operator terminal, an actual administrator address, and an audited access recovery process.

### Exercise the workflow

1. Register a tutor, fill the five-step application, and upload synthetic files for the profile photo, identity and academic evidence.
2. As admin, open **Application review**, check the files and enter a decision. Under **Onboarding fee**, enter a local test amount in paise.
3. As tutor, open **Activate profile**. Open local checkout and simulate a failure and a successful payment. The profile appears in the directory after success.
4. As guardian, add a student label and academic details. Request a tutor from their profile or publish an open requirement.
5. As the active tutor, accept the direct request or apply to an open opportunity. As guardian, choose an interested tutor if applicable and explicitly confirm contact sharing.
6. As tutor, use **Connections** to reveal the authorized guardian number. As guardian, revoke access or block the tutor. An earlier disclosure still consumes a slot.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Keep PostgreSQL running for the test commands. The scripts default to a dedicated `balasore_test` database on the local server and apply migrations there. When using external PostgreSQL, create an isolated database whose name ends in `_test` and set `TEST_DATABASE_URL`. Tests use synthetic data, empty provider credentials, and separate file storage under `.local/test-objects`. Run the two test suites sequentially if they share a database. On a machine with Google Chrome installed, `PLAYWRIGHT_CHROME=1 npm run test:e2e` uses that installation.

## Provider setup

**Phone OTP.** Twilio is paused by default. To restore the provider, set `TWILIO_ENABLED=1` and configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE`. The app asks Twilio Verify to send an SMS, then checks the submitted code against the verification SID. Review fraud controls, India delivery configuration, template and sender registration with the provider. [Twilio Verify documentation](https://www.twilio.com/docs/verify/api/verification-check)

**Private documents.** Set `S3_BUCKET` and `S3_REGION`. Use a scoped IAM role or the AWS SDK credential chain. Use `S3_ENDPOINT` only for an S3-compatible provider. Block public access, enable encryption at rest, and scope credentials to the required object actions. Images are re-encoded on upload. PDFs pass size and basic file-signature checks and are served as attachments. Authorized reviewers receive a 90-second, account-bound access link. Local storage only works with the explicit development flag. Review document scanning, retention and erasure before accepting identity files.

**Razorpay.** Leave credentials empty for local simulation. For Razorpay Test mode under `npm run dev`, set `RAZORPAY_KEY_ID` to a test key, and set its `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Configure dashboard automatic capture. The webhook endpoint is `/api/v1/webhooks/razorpay` and accepts `payment.captured`, `payment.failed` and `refund.processed`. For provider delivery, use a separately authorized HTTPS test environment with isolated credentials and data. Production runtime accepts live keys and requires a verified, captured live order for listing. The amount comes from the fee plan selected on the server and remains fixed on the issued order. Use admin reconciliation to check the provider after a missed event. [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps) · [Webhook validation](https://razorpay.com/docs/webhooks/validate-test)

**Notifications.** Events are written to the database in the same transaction as the state change. In-app notices are immediate. External SMS and WhatsApp remain paused while `TWILIO_ENABLED=0`. To restore external notifications, configure `TWILIO_SMS_FROM`, or configure `TWILIO_WHATSAPP_FROM` and the approved `TWILIO_WHATSAPP_CONTENT_SID`. For WhatsApp use a sender in Twilio's `whatsapp:+...` format and a reviewed template with variable `1` for the event text. SMS takes precedence if both are configured. Schedule `npm run notifications:deliver` as a separate process, or run it once to process a batch. Delivery uses a lease and retry delay. The provider may receive a duplicate submission if a worker stops after provider acceptance and before recording the result. With no provider configured, development records the message in the terminal without a recipient number. The production inbox remains available.

**Branding.** Set `BRAND_NAME`, optional `BRAND_LOGO`, `BRAND_CITY`, `BRAND_REGION` and `SUPPORT_EMAIL`. The admin catalog controls which cities and localities can be used in listings and requirements. Branding controls display text.

## Before launching in Balasore

- Approve separate production and staging environments with HTTPS, backups, tested restoration, secret storage, monitoring, a real support address and an operator recovery process. Turn off `DEV_SERVICES`, use clean databases and object buckets, and keep synthetic fixtures out of production.
- Set `APP_ORIGIN` to the exact canonical HTTPS origin. Configure `TRUSTED_CLIENT_IP_HEADER` only when the ingress proxy overwrites that header from a trusted client source and prevents direct access to the application origin. Add ingress body limits and edge abuse controls. Use separate PostgreSQL roles for migrations and application access. Strip signature query strings and sensitive request data from access logs.
- Finish provider testing with a staging Google OAuth client, a phone verification provider, a private object bucket, approved messaging, and Razorpay test-mode callback, webhook and refund exercises. Set the onboarding fee and approve customer-facing refund and receipt policies before enabling live checkout.
- Obtain Indian professional review for applicable DPDP obligations and effective dates, guardian verification, children's data minimization, acceptable identity documents, communications, document access and retention, deletion, incident response and marketplace safety. The included policy pages are drafts. [MeitY DPDP rules and enforcement materials](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa)
- Establish document malware scanning or safe conversion, scheduled retention and cleanup, data-rights request handling, reviewer access reviews, and a process to moderate public profile text and photos. Free text is screened for common phone and email formats. Manual moderation is needed for addresses and obfuscated contact details.
- Review localities and academics with Balasore operators, complete accessibility and load testing, and run a moderated pilot before broad availability.

No deployment or live provider use was performed as part of this build.
