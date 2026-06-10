# Security Policy

## Supported Versions

Athena Code is in early development. Security fixes are applied to the latest
code on the `main` branch and to the latest published release when practical.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/luckeyfaraday/athena-code/security/advisories/new>

Include:

- the affected version or commit;
- reproduction steps or a proof of concept;
- the expected security impact;
- any suggested mitigation.

Please avoid accessing data that does not belong to you and do not include real
credentials, private keys, or sensitive memory contents in a report.

## Scope

Relevant areas include command execution, installer integrity, provider
credentials, prompt or memory injection boundaries, local memory permissions,
session-index data exposure, and release artifact integrity.
