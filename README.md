# Fabulka

A personalized picture book where your child is the hero. A parent tells us the child's name, age,
interests, pet and city; Fabulka writes the story and illustrates every page with the same child,
then the book is printed and delivered in Kazakhstan.

Built for the Meta Global AI Developer Hackathon (Indie track, "Build for Your World").

## How Fabulka uses Meta models

| Step | Model | What it does |
| --- | --- | --- |
| Toy | SAM 3.1 (`sam-3.1`) | Finds the child's favourite toy in the parent's photo; `@meta-sam/parser` decodes the mask and the API cuts the toy out on white (`apps/api/src/toy`). |
| Toy | Muse Spark (vision) | Looks at the cut-out and describes the toy in one sentence for the story and the illustrator. |
| Story | Muse Spark (`muse-spark-1.3`) | Writes the book in Kazakh, Russian or English as strict JSON, following a child-development method and age norms: title, a hero description, per page the text and a scene prompt, and questions to talk about after reading. Invalid JSON is retried with the validation error. Everything the parent typed is passed as quoted data, never as instructions. |
| Review | Muse Spark | Reads the finished story as a children's content reviewer before anything is drawn; a story that fails stops the book. |
| Hero | Muse Image (`muse-image-1.0`) | Draws a character sheet of the child on a white background. |
| Pet | Muse Image | The pet gets its own sheet, chained from the hero's, or it changes breed and color between pages. |
| Toy sheet | Muse Image | Draws the toy as a storybook character with the cut-out as a reference image, chained after the hero, so it stays the same toy on every page. |
| Pages | Muse Image | Every page chains from the character sheets with `previous_response_id`, so the child and the pet stay the same on every page. Pages render in parallel. |

The finished book is laid out as a square 210 × 210 mm picture book (cover, one illustrated page per
story page, an end page) and printed to PDF by headless Chromium. A 4-page book takes about 90 s and
$0.07 of model spend.

All model calls live in `apps/api/src/meta/`. `MODELS=mock` swaps them for canned output, so tests and
CI never call the API.

## Limits and orders

- Each visitor gets 3 free books (`FREE_BOOKS`), then a demo checkout sells more — nothing is charged:
  a catalog book is 1 900 ₸ ($3.90), a story of your own 2 900 ₸ ($5.90). `POST /quota/purchase`
  takes `{ kind: "template" | "custom" }`. Prices and languages follow the country chosen on the site
  (Kazakhstan, Uzbekistan, Kyrgyzstan or another one; `COUNTRY_INFO` in `packages/shared`). A demo code from `DEMO_CODES` (sent as `X-Demo-Code`) skips the per-visitor limit for
  judges. Service-wide daily caps (`DAILY_BOOK_CAP`, `DEMO_DAILY_CAP`) keep a viral link from spending
  the whole model budget.
- A finished book can be ordered in print: soft (9 900 ₸) or hard (14 900 ₸) cover, free delivery in
  Almaty and Astana, 1 500 ₸ elsewhere. Payment is a demo and the print → ship → deliver timeline is
  simulated (`ORDER_STAGE_MS` per stage).

## Where it is available

I designed where the service runs and who it serves around Meta's rules from the start, not as an
afterthought:

- **The backend runs in Kazakhstan.** I already rent servers in Finland, but Meta has not enabled
  the Model API there. Routing the calls through another country would break the policy's ban on
  circumventing geographic access controls, so the service is hosted where I live, where the
  market is and where Meta has enabled access.
- **Children's data stays in Kazakhstan.** Kazakhstan's personal data law requires its citizens'
  data to be stored in the country, and a book is full of it: a child's name, age, city, and
  the parent's phone and address for a print order.
- **Restricted countries are turned away before any model call.** The "CIS market" means
  Kazakhstan and its neighbours, without Russia and Belarus.

The service follows Meta's [Geographic Use Policy](https://dev.meta.ai/legal/geographic-use-policy):
the backend runs in Kazakhstan, where Meta has enabled the Model API, and visitors from the
policy's Restricted Territories (Russia, Belarus, China, Iran and the others) and from India,
where Muse Image is not available, get HTTP 451 before any model is called
(`apps/api/src/geo`, `GEO_BLOCK=true`). The visitor's country comes from the
[DB-IP](https://db-ip.com) country database (CC BY 4.0), downloaded with
`pnpm --filter @fabulka/api geoip`. A country database cannot single out the Crimea, Donetsk
and Luhansk regions, so those are not blocked by IP.

## Built to run

- Generation runs in the API, a few books at a time (`BOOK_CONCURRENCY`). A page that fails stops
  the rest of the book, the spend so far is still recorded, and books caught by a restart are
  marked failed on start instead of hanging.
- New books stop when model spend reaches `MODEL_BUDGET_USD`, on top of per-visitor and daily caps;
  nginx limits how often one address can start a book.
- Book and order ids are random (cuid2); an order, which holds an address, is visible only to the
  browser that placed it. Unused toy photos are deleted after an hour.
- The schema ships as Prisma migrations; CI applies them to a fresh database, runs the E2E flows and
  only then builds the images, so a red commit never reaches `:latest`.

Languages live in the address: Russian unprefixed (`/catalog`), the others under `/kk`, `/en`, `/es`,
`/de` (`apps/web/src/proxy.ts`; `/ru/…` and old `?lang=` links redirect, nobody is redirected by
browser language). The visitor's country is a cookie (`fabulka_country`) the server reads, so the
first HTML already has that country's prices, catalog and FAQ.

The admin's «SEO» section (`/admin/seo`) lets SEO staff tune each page per language version without
a deploy: title, description, OG image and noindex over localized defaults, with Google and social
previews, a change history with revert, redirects (applied in the proxy) and global settings
(search console verification, analytics behind a cookie consent banner, extra robots.txt lines).
Saving keeps a draft; publishing expires the site's cached SEO data at once (the API calls the web's
`/internal/revalidate` with `REVALIDATE_SECRET`) and pings IndexNow (`INDEXNOW_KEY`). Who opens what
is `ROLE_PERMISSIONS` in `packages/shared/src/admin-access.ts`: Keycloak realm role `admin` opens
everything, `seo` only SEO.

Known limitations: generation is an in-process queue, not a durable job table; Kazakh and English
catalog text is not yet editable in the admin.

## Stack

- `apps/web`: Next.js 16, Tailwind 4, TanStack Query, react-hook-form + zod, lucide-react
- `apps/api`: NestJS 11, Prisma + Postgres, OpenAI SDK pointed at `https://api.meta.ai/v1`
- `packages/shared`: zod schemas and types shared by web and API
- `e2e`: [tapstep](https://tapstep.dev) flows: UI, HTTP and SQL checks in one YAML

## Run locally

Needs Node 22+, pnpm and Postgres.

```bash
pnpm install
createdb fabulka
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL; MODELS=meta + MODEL_API_KEY for real models
pnpm --filter @fabulka/api exec prisma migrate deploy
pnpm dev                                  # web :3000, api :4000
```

## Tests

```bash
pnpm typecheck && pnpm lint && pnpm test   # unit tests
createdb fabulka_e2e && cp e2e/.env.example e2e/.env
pnpm build && DATABASE_URL=… ./e2e/start-stack.sh
tapstep test e2e/flows --config e2e/config.yaml
```

CI (GitHub Actions) runs the same: typecheck, lint, unit tests and `tapstep validate`, then the E2E
flows against a Postgres service with mock models.
