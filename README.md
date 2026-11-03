# Fabulka

**Every parent can be an author.** Fabulka turns a parent's voice and a photo of a favourite toy into
a fully illustrated picture book (or a comic for older kids) where the child is the hero, in their
own language, built on child-development methods, ready to read tonight or to print.

Live: **https://fabulka.com** · Built for the Meta Global AI Developer Hackathon (Indie track, "Build for Your World").

## Built from scratch during the hackathon

Everything in this repository was written during the building period (Oct 27 – Nov 4, 2026). Before it
there was only an idea. The repository was created on **Oct 28, 2026** with an empty scaffold, and
the full history is public: `git log --reverse`. No code, designs or assets from earlier projects were
reused.

| Day | Commits | What was built |
| --- | --- | --- |
| Oct 28 | 3 | Empty monorepo (Next.js + NestJS + shared zod), mock models, CI with E2E from the first commit |
| Oct 29 | 1 | CI fixes for the test runner |
| Oct 30 | 26 | The core: Muse Spark stories by child-development methods, Muse Image character sheets and pages chained for consistency, SAM 3.1 toy cut-out, PDF, page-turning reader, catalog, admin, Docker deploy, geo policy, the name **Fabulka** |
| Oct 31 | 11 | Landing, sign-in (Keycloak), accounts, order emails, voice input (Muse Voice Transcribe), journal of every model call |
| Nov 1 | 45 | Admin-managed methods, prices, cities and countries; Spanish and German; a UI kit; book themes proposed by Muse Spark and checked in code; layouts chosen from SAM masks with render QA; print formats; photo page |
| Nov 2 | 18 | Per-language samples, language in the URL (EN default), country by IP, admin SEO section with publish and history |
| Nov 3 | 37 | Examples as stories with language versions (translated by Muse Spark, same illustrations), staff roles and country managers, audit log and spend caps, multi-currency money, refusal-proof generation, a live generation screen, designed covers with SAM-placed lettering, illustrator references |

Third-party tools used, not built here: Keycloak (sign-in), Postgres, Next.js, NestJS, Prisma, and
[tapstep](https://tapstep.dev), the author's own earlier E2E testing tool, used only to test Fabulka.

## How Fabulka uses Meta models

One book is a chain of about 25–40 calls to four Meta models. Each call is logged with its cost and
latency in the admin journal (`ModelCall`).

| Step | Model | What it does |
| --- | --- | --- |
| Voice | Muse Voice Transcribe | The parent tells about the child out loud, in any of five languages. |
| Form | Muse Spark | Turns the transcript into the child's profile (name, age, interests, pet, city). |
| Toy | SAM 3.1 + Muse Spark vision | SAM cuts the favourite toy out of the parent's photo; Spark describes it for the story and the illustrator. |
| Story | Muse Spark | Writes the book as strict JSON by a child-development method and age norms: title, hero description, pages with text, scene and the method's beat, cover scene, blurb, questions to talk about after reading. |
| Review | Muse Spark | Reads the story as a children's content reviewer before anything is drawn. |
| Characters | Muse Image | Character sheets for the hero, the pet and the toy (the cut-out as a reference), chained with `previous_response_id`. |
| Pages and cover | Muse Image | Every page and the cover chain from the sheets, so the child looks the same everywhere; illustrator style references and beat composition sketches ride along as `input_image`. Pages render in parallel. |
| Refusals | Muse Spark | If the image safety filter refuses a page, the scene is softened; if refused again, Spark rewrites that one scene safely; the book always finishes. |
| Layout | SAM 3.1 | Finds the characters on each picture, so text and the child's name on the cover never cover a face. |
| Fit | Muse Spark | Render QA measures every page in Chromium; a page that overflows is shortened by Spark. |
| Languages | Muse Spark | Translates a finished book into another language with the same illustrations and the child's name in the target script. |
| Themes | Muse Spark | Proposes new book themes (fonts, colours, ornaments) that the code then checks for contrast and glyph coverage. |

A 10-page book takes about 3 minutes and $0.20–0.25 of model spend. `MODELS=mock` swaps every call
for canned output, so tests and CI never call the API.

## The product

- **Catalog and own stories.** Ready books by method (first day at kindergarten, "I can't do it yet",
  big feelings, bath time, adventure) or a story of your own, ages 2–12.
- **Five languages, launching country by country.** English (default, unprefixed URLs), Kazakh, Russian,
  Spanish, German; prices in the country's currency; print where a local partner exists.
- **Live generation screen.** Every step with the model doing it, the hero and pages appearing as they
  are drawn, an honest time estimate.
- **Print-ready books.** Designed cover with the child's name lettered in, back cover, spine and wrap
  for soft and hard covers, print formats per country.
- **Admin for a global team.** Superadmin, country managers (only their countries: prices, delivery,
  cities, landing, examples, orders), SEO staff and illustrators (style references, beat sketches,
  page review); a "what a visitor sees" matrix per country and language; audit log of every change;
  daily model-spend caps per person and country.

## Where it runs and Meta's policies

- **The backend runs in Kazakhstan**, where Meta has enabled the Model API; calls are never routed
  through another country.
- **Restricted countries** from Meta's [Geographic Use Policy](https://dev.meta.ai/legal/geographic-use-policy)
  get HTTP 451 before any model is called (`apps/api/src/geo`, country from the
  [DB-IP](https://db-ip.com) database, CC BY 4.0).
- **Children's data** of Kazakh citizens stays in Kazakhstan, as the local personal data law requires.

## Built to run

- Generation runs in the API, a few books at a time; a restart marks unfinished books failed instead
  of hanging. Spend stops at `MODEL_BUDGET_USD`, plus per-visitor, daily and per-staff caps.
- Money is integer minor units with a currency; orders snapshot their lines and exchange rate.
- Prisma migrations; CI runs typecheck, lint, unit tests and 50+ E2E flows against Postgres with mock
  models, and only then builds the images.

## Stack

- `apps/web`: Next.js 16, Tailwind 4, TanStack Query, react-hook-form + zod
- `apps/api`: NestJS 11, Prisma + Postgres, OpenAI SDK pointed at `https://api.meta.ai/v1`
- `packages/shared`: zod schemas, layout engine and types shared by web and API
- `e2e`: tapstep flows: UI, HTTP and SQL checks in one YAML

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
tapstep test e2e/flows --config e2e/config.yaml --browser managed
```
