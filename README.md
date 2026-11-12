# SmartSolz Lead Hunter — Cloud Web Edition

A free-tier-oriented cloud-hosted website built with Cloudflare Workers, Static Assets and D1.

**Deploy steps:** See `DEPLOY.md`. This is not hosted yet; you must connect your own Cloudflare account and deploy it. It cannot be published to your account without your explicit Cloudflare login and deployment action.

This build includes cloud lead records, search, CSV import/export, consent notes, campaign drafts and dashboard statistics. Email delivery and automatic lead sourcing are not included in this cloud MVP. Free hosting does not mean unlimited usage, unlimited database size, unlimited lead discovery or unlimited email delivery.


## Free email-domain verification

New leads and CSV imports are automatically queued for free checks. The app validates email syntax, checks domain MX records using Cloudflare's public DNS-over-HTTPS resolver, checks an A-record fallback where appropriate, and flags a small built-in list of disposable domains. Results are stored as `valid`, `invalid`, `risky`, or `unknown`; you can also run **Verify unchecked emails** from the Lead Database.

**Important:** `valid` means the domain publishes mail-routing records. It does not prove that the individual mailbox exists, is monitored, or will accept a message. DNS checks use a free public resolver and may return `unknown` if the resolver is unavailable. No paid verification API is used.
