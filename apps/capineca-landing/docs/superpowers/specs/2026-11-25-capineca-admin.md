# CapiNeca admin design

## Goal

Give the owner one private admin area for the CapiNeca landing page, public showcase media, quote requests, offer settings, and GitHub media publishing.

## Decisions

- `/admin` becomes the focused CapiNeca dashboard; the existing commerce dashboard stays available at `/admin/legacy`.
- Public hero and showcase images are uploaded to `osvaldosereia/canecafacil` under `apps/capineca-landing/public/uploads/` and served from GitHub. No site media bytes are stored in Supabase or D1.
- D1 stores only site text/settings, image URLs, quote request metadata/status/notes, and an encrypted GitHub token. The encryption key is a Sites runtime secret.
- The existing Supabase edge function remains the temporary processing path for customer logo uploads and AI concept generation. Those private customer files are not copied to GitHub.
- The public page loads the editable content from D1 with hard-coded defaults as fallback.
- The admin contains overview, quote requests, landing content/media, offer/contact settings, and integration status.

## Admin sections

1. **Overview:** new quote requests, pending follow-up, showcase/media status, and integration readiness.
2. **Quote requests:** search, contact and order brief, lead status, internal notes, and WhatsApp follow-up link.
3. **Landing and media:** edit hero copy/image and each of the four fictional corporate mug examples; upload replacement images to GitHub.
4. **Offer and contact:** unit price, minimum quantity, free-delivery cities, card terms, site domain, and WhatsApp number.
5. **Integrations:** GitHub image publishing connection, AI generation connection, and launch status.

## Safety and privacy

- Admin read/write routes require the existing ChatGPT account allowlist.
- GitHub tokens are validated, never returned to the browser after save, and encrypted at rest with AES-GCM.
- User logos and generated customer concepts stay in the existing private generation flow; they are not public repo assets.
- Public image uploads accept PNG/JPEG/WebP up to 8 MB and receive unique names to avoid overwriting existing images.
- Quote requests are stored in the site's D1 database and can be viewed only by the authenticated admin.

## Acceptance criteria

- The public landing reads hero image and showcase image URLs from the editable site content.
- Admin can update four showcase cards and offer/contact details and save them.
- Admin can upload public site images to GitHub without using Supabase Storage.
- New quote requests are captured for follow-up, with status and internal notes editable in admin.
- Existing commerce admin is preserved at `/admin/legacy`.
- No online checkout is added; conversion remains through WhatsApp.
