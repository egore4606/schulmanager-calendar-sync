# Security policy

## Supported versions

Security fixes are applied to the latest release and the `main` branch.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** action under the Security tab. Do not open a public issue for vulnerabilities or accidentally exposed credentials.

Include:

- the affected version or commit;
- the impact and prerequisites;
- minimal reproduction steps using synthetic data;
- suggested mitigations, if known.

Do not include real Schulmanager tokens, Google keys, calendar IDs, names, school information, or timetable exports. Maintainers will acknowledge a complete report as soon as reasonably possible and coordinate remediation before public disclosure.

## Credential exposure

If a secret is ever committed, deleting the file in a later commit is not sufficient. Revoke or rotate the credential immediately and inspect Git history, forks, Actions logs, releases, and container layers.
