# Security policy

## Scope and supported use

Agentwin is a local, single-operator MVP. Security fixes target the current
`master` branch; older snapshots are not separately maintained.

The web app has no authentication or tenant isolation. Host and Origin checks
limit local access patterns but do not provide user authorization. Keep FastAPI
and the development server on loopback, and do not expose them directly to the
Internet. Physical MQTT traffic requires a trusted private network, broker
accounts, and per-device ACLs. The included anonymous Mosquitto configuration is
for loopback-only development.

Project isolation and deterministic validation remain necessary even with a local
operator. Model-generated answers, device labels, and received telemetry must be
treated as untrusted input. AI output cannot establish physical safety or diagnosis.

## Reporting a vulnerability

Use the repository's **Security → Advisories → Report a vulnerability** option
when private vulnerability reporting is enabled:

https://github.com/SalehBaderah/Agentwin/security/advisories/new

If that option is unavailable, do not post exploit details or credentials in a
public issue. Ask the maintainer in an issue to enable a private reporting channel
without including the sensitive information. The maintainer should enable private
vulnerability reporting before the public release.

Include the affected commit, a minimal reproduction, expected and observed
behavior, and the potential impact. Use synthetic data and redact credentials,
device identities, and network details. No response-time guarantee is currently set.

## Credentials and private data

Store local credentials in ignored `.env`, broker password files, or firmware
`secrets.h`. Commit only placeholder examples. Never place server-side credentials
in frontend code or Vite variables: browser bundles are public.

Before publishing, scan the working tree **and Git history**. For example, with
[Gitleaks](https://github.com/gitleaks/gitleaks) installed:

```bash
gitleaks git --redact --log-opts="--all" .
gitleaks dir --redact .
```

A scan without findings is useful evidence, not proof that every sensitive item
has been identified. Manually review screenshots, PDFs, local network information,
team documents, and dependency/asset provenance.

If a real secret was committed, revoke or rotate it first, remove it from current
files, and coordinate any history cleanup with maintainers before publishing.
Deleting a file or adding it to `.gitignore` does not remove it from Git history.
Do not attach raw scan reports containing secrets to public issues.
