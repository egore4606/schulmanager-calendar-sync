## Summary

<!-- What changed and why? Keep the pull request focused. -->

## Related issue

<!-- Use "Closes #123" when applicable. -->

## Verification

- [ ] `npm run verify`
- [ ] Docker image built, or this change does not affect runtime/container behavior

## Safety checklist

- [ ] No tokens, Google keys, calendar IDs, names, school details, schedules, or unredacted logs are included
- [ ] Behavioral changes include tests with synthetic data
- [ ] New configuration is documented in `.env.example` and `docs/CONFIGURATION.md`
- [ ] Google event reconciliation still touches only project-managed events

## Operational impact

<!-- Describe configuration, deployment, migration, or rollback considerations. -->
