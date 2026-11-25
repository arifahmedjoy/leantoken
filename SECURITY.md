# Security Policy: LeanToken Website

This policy covers the landing page at [leantoken.dev](https://leantoken.dev/) and
the source on the `website` branch. For the LeanToken CLI, see
[SECURITY.md on `main`](https://github.com/arifahmedjoy/leantoken/blob/main/SECURITY.md).

## Supported versions

Only the currently deployed site and the latest commit on `website` are supported.

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/arifahmedjoy/leantoken/security/advisories/new).
Do not open a public issue.

Include:

- The affected URL or file and commit
- The impact, for example XSS, content injection, a malicious redirect, or a dependency vulnerability
- Steps to reproduce, when safe to share

Please allow reasonable time for a fix before public disclosure.

## In scope

- Script injection or content tampering on leantoken.dev
- Vulnerable dependencies in `package.json` / `package-lock.json` that affect the built site
- Misleading install commands or links on the page that point to untrusted sources

## Out of scope

- Missing security headers with no demonstrated impact
- Automated scanner output with no proof of concept
- Denial-of-service or volumetric attacks against hosting infrastructure
- Social engineering

Never include secrets, credentials, or third-party personal data in a report.
