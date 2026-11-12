# Caneca 360 Studio

## Goal

Turn the existing Caneca Fácil Studio into an owner-only workspace for creating, revising, approving, and printing mug artwork.

## Product name

Use **Caneca 360** in the studio interface, with the descriptor **Criação, edição e impressão**. Keep the GitHub repository name and the Caneca Fácil store identity unchanged.

## Existing system

- GitHub Pages hosts the React/Vite studio.
- The active `caneca-studio` Edge Function uses the existing OpenAI provider secret, `caneca_studio_jobs` table, and private `caneca-studio-assets` bucket.
- The current studio-only build bypasses the existing Admin AuthGate. The function is deployed without JWT verification and trusts a client-generated session UUID.
- The old workflow supports art versions and written adjustment requests. Its separate Epson L1250 print station freezes an approved art version, prints one mug per click, tracks quantity, and requires a reason for reprints.

## Behavior

1. Require an active Admin owner or operator session in the browser and again in the Edge Function. A viewer or unauthenticated visitor cannot create, edit, list, or print jobs.
2. Generate one print artwork first. Run the existing visual review, but create mockups only after an explicit user action so every creation does not automatically spend on two extra images.
3. Let the operator submit a written change request against a chosen version. Save each result as a new immutable version, keep previous versions selectable, and clear any mockups tied to an older version.
4. Require explicit approval of a particular version before adding it to the print queue. Store queue state inside the existing job JSON; do not add a Supabase project, table, bucket, or paid service.
5. Print only the approved version. Use the existing Epson L1250 paper profile: 106 × 247 mm paper, 235 × 106 mm artwork area, portrait sheet, 100% scale, one horizontal mirror, and 90° rotation. Preserve artwork proportions with contain-fit to prevent silent cropping. Confirm each completed copy after the browser print dialog closes; require a reason to reprint a completed copy.
6. Keep the app mobile-friendly. On small screens, the briefing, version history, edit controls, and print controls remain usable without horizontal scrolling.

## Cost and infrastructure constraints

- Reuse the existing Supabase Pro project, function, table, and bucket. Do not create Supabase resources or deploy another service.
- Supabase function, database, and Storage calls still count against the existing plan quota; the app cannot promise zero variable Supabase usage.
- Each generated or edited image, optional review, and optional mockup may use OpenAI API credits. Mockups are opt-in.
- Keep rate limiting and require an authenticated admin before any OpenAI request.

## Out of scope

- Store checkout, payment confirmation, order synchronization, and the historical Dona Antônia Firebase order queue. The new studio creates its own internal print queue and does not claim that an art job is paid.

## Acceptance

- The public Pages build shows a login gate instead of the studio form.
- A non-admin or unsigned Edge Function request is rejected before reading the OpenAI secret or accepting a generation.
- An edit adds a new version without overwriting the previous art.
- A selected version must be approved before it can be queued or printed.
- The print preview uses the fixed Epson profile, keeps the art proportional, mirrors exactly once, and tracks completed copies and reprint reasons.
- Existing Supabase resources are reused without schema or bucket creation.
