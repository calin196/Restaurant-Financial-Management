# TrueCost: Restaurant Cost Management (Proof of Concept)

TrueCost shows owners and managers of small independent restaurants the **true cost and profit of every dish**: ingredients **plus labour and overhead**, not food cost alone. This prototype implements the design described in `report/team_80_final_report.md`.

The demo restaurant *Bistro De Haven* reproduces the report's worked example (Bounded Contexts 3.5). In September 2026 the **Seafood Risotto** costs €8.90 in ingredients, €9.17 in labour and €2.00 in overhead, for a true cost of €20.07 against a net price of €19.27. It loses **€0.80 per portion (−€256 per month)**, even though its food cost is only 46%.

## Running it

Requirements: Node.js 20 or newer.

```bash
cd poc
npm install
npm run dev        # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the domain tests (the risotto example to the cent, guards, roster rules) |
| `npm run build` | Typechecks and builds a static site into `dist/` (opens from any web server) |
| `npm run preview` | Serves the production build |

All data lives in the browser's `localStorage`. **Settings → Reset demo data** restores the original demo restaurant. The prototype's "today" is fixed at **29 Oct 2026**, so the seeded story always behaves the same way.

## Experiment 1: split state

The seven contexts and shared infrastructure use independent stores and keys:
`truecost.v1.{identity,inventory,menu,sales,workforce,finance,insights,shared}`.
The legacy `truecost.prototype.v1` key is ignored; the first load uses seed values
for any missing slice. Existing legacy demo edits are not migrated. Reset restores
all eight stored slices. Settings still offers a full JSON demo backup.

Pages read owned slices through `src/state/sliceHooks.ts` and cross-context
results through `src/state/published.ts` or Workforce's filtered publications.
Ingredient-price, role-rate and overhead-close events invalidate receiving caches;
events are delivered after the owning slice commits. The boundary test checks
presentation access as well as domain imports.

From the repository root, run `node poc/scripts/experiment1.mjs` to compare the
existing `experiment-1-before` tag with the working tree. Run `npm test` and
`npm run build` in `poc` for validation. See [the measurement record](../report/experiment-1-results.md)
for the before/after table, scope and limitations.

## Suggested demo walkthrough

1. **Dashboard**: a loss alert for the Seafood Risotto, two budgets exceeded, KPIs, true margin per dish, cost distribution and data health.
2. **Menu & profitability**: switch between *Food cost only* and *True cost* (experiment E2), change the **overhead allocation policy** (per portion / revenue share / prep minute), and use *Compare all three policies* (E3).
3. Click **Seafood Risotto**. The cost breakdown shows every input, its source and its age. The *What if…* panel lets you try €23.50 or a 12-minute prep time.
4. **Ingredients & stock**: open *Shrimp* and record a new price. You get a preview of the effect on dish margins, the price history is kept, and the ×1000 unit-error guard triggers if you type e.g. `23400`.
5. **Sales**: daily entry, then *Import CSV → Load example*. Unmatched lines ("Truffle fries") are flagged for mapping.
6. **Staff & roster**: this week's draft has working-time violations (rest time, under-18 night work). Publishing shows them first and requires an explicit acknowledgement.
7. **Finance**: P&L, costs spread over the months they cover, budget, VAT overview, **close September** (it becomes immutable) and the accountant export.
8. **Insights**: suggestions with reason and confidence. Accepting one applies it as a new menu version, and the acceptance rate is tracked (E4). There is also an aggregate demand forecast.
9. **Role switcher** (top right): as an *employee* you see only your own published schedule. As the *accountant* you get read-only finance; opening Staff & roster is denied and logged under **Activity & audit**.

## How the report maps to the code

| Report concept | Where |
|---|---|
| Bounded contexts A–G | `src/domain/{menuCosting,sales,inventory,workforce,finance,insights,identity}` |
| Menu Costing reads only published copies (prices per base unit, rate per role, overhead pool, portions sold) | `src/state/selectors.ts` → `costingInputs` |
| CostBreakdown / explainability | `src/domain/menuCosting/costing.ts` (`costDish`) and the dish page |
| Exact decimals, rounding per component to the cent | `decimal.js-light`, `src/domain/shared/money.ts` |
| Dated price history, stale-price warnings, unit guard | `src/domain/inventory/inventory.ts` |
| Labour per role only (privacy, tradeoff 1.3) | `src/domain/workforce/workforce.ts` (`publishedLabourRates`) |
| Working-time rules as data (S12) | `WORKING_TIME_RULES` in `workforce.ts` |
| No hard deletes, immutable closed periods (7-year retention) | archive actions and `assertOpen` / period snapshots in `src/state/store.ts` |
| Domain events (event-based domain model) | Post-commit `emit(...)` in `store.ts`, `eventBus.ts` and cache consumers in `published.ts`; history under *Activity & audit* |
| Role-based access, denied access logged (GDPR) | `src/domain/identity/access.ts`, `Guard` in `src/main.tsx` |
| AI advice with reason, confidence and a recorded decision; aggregate-only forecast (EU AI Act) | `src/domain/insights/insights.ts` |
| Experiments E2–E5 as feature flags | *Settings* page |

## Scope of the prototype

- Single-page app (React + TypeScript + Vite + Tailwind CSS, Recharts for charts). There is no backend: persistence is `localStorage`, and the bounded contexts are separated as modules rather than services.
- POS and payroll integrations are simulated (CSV import, payroll bookings in the seed data, a POS-outage toggle).
- AI suggestions come from a transparent rule engine. An LLM behind its own interface is planned for phase 3.
- No payments, payroll calculation, supplier ordering or tax filing (non-goals in the report).

## GitLab CI pipeline

The repository root contains `.gitlab-ci.yml`. It uses Node.js 24 and runs on
branch/tag pushes, merge requests, and manual runs from GitLab's pipeline page.
When a branch has an open merge request, its push runs use the merge request
pipeline to avoid duplicate pipelines.

1. **test** installs the exact dependencies from `package-lock.json` using
   `npm ci` and runs the domain tests with `npm test`.
2. **build** runs after the tests pass, installs dependencies, and runs
   `npm run build` to check TypeScript and produce the static site.

Both jobs cache npm downloads. The build job stores `poc/dist/` as a downloadable
artifact for one week. This pipeline validates and packages the prototype; it
does not deploy it.

To enable it, commit and push `.gitlab-ci.yml` and this README to GitLab. The
project needs an available Linux runner with a Docker or Kubernetes executor
that accepts jobs without runner tags and can download the Node image and npm
packages. Check **Settings > CI/CD > Runners** if jobs stay pending, then view
the jobs under **Build > Pipelines**. No deployment credentials are required.

You can check the YAML in GitLab's **Build > Pipeline editor > Validate** tab.
To run the same checks locally:

```bash
cd poc
npm ci
npm test
npm run build
```
