# SS Circuit Products (SSCP) — Cloudflare Pages website, V3

Ready-to-upload **static website with a Cloudflare Pages Advanced Mode `_worker.js` backend** for website enquiry emails.

Contact: **sales@sscircuitproducts.com** · **+91 98454 49369**

## Included

- Responsive Home, About, Products, Capabilities, Quality, Contact and Privacy pages, plus a 404 page.
- SS chip logo derived from the **user-selected blue and orange artwork**; original approved full logo preserved in `assets/sscp-logo-approved.png` and `assets/sscp-logo-approved.webp`. Website header uses an exact crop of its SS chip symbol.
- Updated corporate navy/royal-blue/orange look; mobile navigation, floating **email / WhatsApp / back-to-top** controls.
- On-page RFQ/contact form with company, quantity, leadframe plating material/coverage, specs and optional **PDF/JPG/PNG file (up to 4 MB)**. CAD/large drawings should be emailed directly.
- Cloudflare Turnstile validation + origin checking + server-side validation.
- A server-side Resend API call emails enquiries and attachments to the Zoho sales mailbox, with the visitor address set as **Reply-To**.
- No database, package manager, or paid runtime is required to display the site. Email delivery requires third-party setup and is subject to provider limits.

## 1. Deploy the ZIP

Cloudflare dashboard → **Workers & Pages** → Pages project → **Create deployment / Upload assets**. Upload `SSCP-Cloudflare-Pages-V3-Upload.zip` using **Drag and drop**. This ZIP has `index.html` and `_worker.js` at the archive root (no extra enclosing folder). You can use a new Direct Upload Pages project or create a new deployment of your existing Direct Upload Pages project.

Cloudflare supports `_worker.js` in Pages Advanced Mode in drag-and-drop uploads; that script handles `/api/enquiry` and forwards other traffic to Cloudflare static assets.

The pages will display before mail is configured, but **Send enquiry is deliberately disabled until real provider credentials and Turnstile keys are configured**. Do not treat the site as ready to receive enquiries until the live test is complete.

## 2. Set up Resend without breaking Zoho Mail

1. Create a Resend account at <https://resend.com>.
2. Add the **sending-only subdomain** `notify.sscircuitproducts.com` to Resend → Domains.
3. Add and verify the DNS records *exactly* provided by Resend for that subdomain (SPF, DKIM and any relevant mail records). **Do not overwrite the apex domain's existing Zoho MX, SPF, DKIM or DMARC records.** Check for conflicting TXT records on the same hostname.
4. Create a restricted **sending API key** in Resend.

## 3. Cloudflare project settings → Variables and Secrets

Add these four values in the relevant Production environment:

| Variable | Example | Type |
|---|---|---|
| `RESEND_API_KEY` | `re_...` | Secret |
| `RESEND_FROM` | `SSCP Website <enquiries@notify.sscircuitproducts.com>` | Plain text |
| `TURNSTILE_SITE_KEY` | Actual site key | Plain text |
| `TURNSTILE_SECRET_KEY` | Actual secret key | Secret |

**Never** paste secret values into `script.js`, HTML, GitHub, or the ZIP.

## 4. Set up Cloudflare Turnstile

Cloudflare → Turnstile → **Create widget → Managed**. Authorize the precise domain and hostname(s) where the form is tested, e.g. `sscircuitproducts.com`, `www.sscircuitproducts.com` and your Pages `*.pages.dev` preview hostname as applicable. The widget is explicitly rendered with action `sscp_enquiry`.

Copy its site key and secret key into the four values above. **Save and redeploy** so the `_worker.js` receives the settings.

## 5. Live end-to-end test

1. Open the deployed **Contact** page, verify that the secure form is enabled, and complete Turnstile.
2. Fill out the enquiry with valid name/email, select `Leadframe Plating` or `Request a Quotation`, and optionally attach a small PDF.
3. Submit. The visible success message means the email provider **accepted** the request; it is not proof of mailbox delivery.
4. Open <https://mail.zoho.com> and verify the email arrived at **sales@sscircuitproducts.com** (check Spam if necessary). Check the attachment and hit **Reply** to see that the response goes to the visitor.
5. Confirm mobile nav and bottom-right **Email**, **WhatsApp**, **Back to top** controls work on phone.
6. Test error states: empty required field, missing privacy consent, unsupported file and a file exceeding 4 MB.

### Troubleshooting

- The form is disabled: one of the **four variables is missing**, or Turnstile script is blocked. Visit `/api/enquiry/config` for the public `configured` boolean (no secret values are exposed).
- `403`: Turnstile response failed, expired, or its action/hostname does not match the submission page. Add the **exact preview host** to the widget allowlist.
- `422`: validation problem or invalid attachment.
- `502`: Resend rejected the send request; check the Resend dashboard, API key and verified sending subdomain.
- `503`: service not yet configured, or API/Turnstile is temporarily unavailable.
- Local `file://` preview will not enable the form: the backend only runs after Cloudflare deployment.
- Providers have email free-tier quotas; review current limits before rollout.

## Technical notes

- **Backend**: `_worker.js` (Cloudflare Pages Advanced Mode). `env.ASSETS.fetch(request)` serves the rest of the site.
- **Front end**: HTML, CSS, vanilla JS, local SVG/WebP/PNG; no app framework or build pipeline.
- **Tests**: `node --test tests/worker.test.mjs` using Node 22+. Includes mocked external services; cannot prove actual delivery.
- The original `assets/sscp-logo-approved.png` can be replaced only if brand owner approves a new design.
- Marketing and manufacturing capability statements are **draft copy** and should be verified with SSCP prior to publication.

## Documentation

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages `_worker.js` Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare Workers + Resend](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/)
