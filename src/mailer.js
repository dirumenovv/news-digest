const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSmtpTransport(smtp) {
  // Loaded lazily so tests (which inject a fake transport) do not need nodemailer.
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465, // 465 = implicit TLS, otherwise STARTTLS is negotiated
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/**
 * Sends the digest to each recipient as a separate message (recipients never see each other).
 * One failing recipient does not stop the others. Returns { sent, failed }.
 * Addresses and credentials are never written to the logs.
 */
export async function sendDigest(
  digest,
  config,
  smtp,
  { logger, transport, attempts = 2, retryDelayMs = 2000 } = {},
) {
  const tx = transport ?? (await createSmtpTransport(smtp));
  const total = config.recipients.length;
  const sent = [];
  const failed = [];

  try {
    for (const [index, recipient] of config.recipients.entries()) {
      const label = `recipient ${index + 1}/${total}`;
      let lastError = null;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await tx.sendMail({
            from: smtp.from,
            to: recipient,
            subject: digest.subject,
            text: digest.text,
            html: digest.html,
          });
          lastError = null;
          sent.push(recipient);
          logger?.info(`Sent digest to ${label}`);
          break;
        } catch (err) {
          lastError = err;
          logger?.warn(`Attempt ${attempt}/${attempts} for ${label} failed: ${err.message}`);
          if (attempt < attempts) await sleep(retryDelayMs);
        }
      }

      if (lastError) failed.push({ recipient, error: lastError.message });
    }
  } finally {
    tx.close?.();
  }

  return { sent, failed };
}
