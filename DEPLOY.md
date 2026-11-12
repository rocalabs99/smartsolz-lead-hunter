# Deploy SmartSolz Lead Hunter free on Cloudflare

## What is free, and what is not
This project uses Cloudflare Workers + Static Assets + D1. It is designed to fit free-tier usage, subject to Cloudflare's current quotas and policies. Free-tier limits can change. This starter has no automatic lead discovery source and does not send email. You need lawful contact sources; email providers set their own quotas. No unlimited lead or email volume is promised.

## 1. Create Cloudflare account
Create an account at https://dash.cloudflare.com/ and install Node.js LTS.

## 2. Install and create D1
In this project folder:
```bash
npm install
npx wrangler login
npx wrangler d1 create smartsolz-leads
```
Copy the returned database ID into `wrangler.jsonc` replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

Apply the schema:
```bash
npx wrangler d1 migrations apply smartsolz-leads --remote
```

## 3. Set a workspace password
Use a long unique password:
```bash
npx wrangler secret put APP_PASSWORD
```
Do not use a weak password. This initial build uses one shared workspace password, not multi-user accounts.

## 4. Deploy
```bash
npm run deploy
```
Wrangler prints the public `https://...workers.dev` URL.

## 5. Open your website
Visit the URL. Enter the APP_PASSWORD secret you configured.

## Current features
- Cloud-hosted static website and API
- Cloudflare D1 persistent lead database
- Workspace password gate
- Lead creation, search, CSV import (up to 500 rows per batch), CSV export
- Duplicate email prevention
- Consent status and evidence-note field
- Campaign draft management
- Dashboard statistics

## Not yet implemented
- Email sending / SMTP provider integration
- Contact discovery / scraping
- Email verification / enrichment
- Multi-user roles and team accounts
- Production-grade CSRF, audit trail and advanced security controls

## Security warning
This is an MVP. Before storing sensitive customer data or using it for a business team, add stronger authentication (individual accounts, secure sessions, CSRF protection, rate limiting, audit logs), data retention controls, backups, and privacy notices. Do not upload purchased/scraped personal data without checking its lawful basis and the rules in each recipient's jurisdiction.


### Email verification update

This package includes migration `0002_email_verification.sql`. If you already deployed version 1, run `npm run db:migrate` again before deploying the updated app so the three email-check columns are added. Then run `npm run deploy`.
