## What

<!-- Story / requirement IDs (e.g. PV-4) and a short description -->

## Tests (TDD)

<!-- Test IDs covered, from docs/specs/<module>/test-cases.md -->

- [ ] Tests were written first and seen failing (red), then passing (green)
- [ ] Every new test name starts with its ID; new cases added to `test-cases.md`
- [ ] Role checks added to the role matrix (`AU-I-21`) for any new endpoint
- [ ] State-changing tests assert the `VisitEvent` (and `EmailOutbox` where relevant)

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit` pass
- [ ] Integration tests pass (`pnpm --filter @gatepass/api test:int`)
- [ ] Specs/test-cases updated if behaviour or a spec gap changed
- [ ] No PII (phone numbers, photo keys) in logs or emails
