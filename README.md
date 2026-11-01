# Daily Digest

Collects RSS news, weather (Open-Meteo) and GitHub activity, and emails one daily digest.

## Setup

```
npm install
cp config.example.json config.json   # edit sources and recipients
cp .env.example .env                 # add your SMTP credentials
npm test
```

## Usage

```
node src/index.js --dry-run   # build the digest, write out/digest-preview.html, send nothing
node src/index.js             # build and send
```

## Sending with Mailtrap (testing)

1. In Mailtrap open **Email Testing > Sandboxes > your sandbox > Integration > SMTP**.
2. Copy the host, port, username and password into `.env` (see `.env.example`).
3. Put any address in `recipients` in `config.json`. In the sandbox it is only a label, nothing is delivered.
4. Run `node src/index.js` and open the message in your Mailtrap sandbox.

Sandbox credentials only capture mail. To send to real inboxes later, replace them with
Mailtrap's live sending SMTP credentials (Sending Domains > your domain > Integration > SMTP)
or any other SMTP provider. No code changes are needed.

## Scheduling

`.github/workflows/daily-digest.yml` runs daily and can be started manually.
Add these repository secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM` and `DIGEST_CONFIG` (the full contents of your `config.json`).

## Testing

```
npm test            # all unit and end-to-end tests
npm run test:e2e    # only the end-to-end pipeline tests
npm run coverage    # tests with a coverage report
```

The end-to-end tests run the real pipeline (fetch, process, render, send) against a fake
network and a fake mail transport, so they never touch the internet or send real email.
