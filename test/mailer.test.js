import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendDigest } from '../src/mailer.js';

const digest = { subject: 'Subj', html: '<p>hi</p>', text: 'hi' };
const smtp = { host: 'h', port: 587, user: 'u', pass: 'super-secret', from: 'Digest <d@example.com>' };
const config = { recipients: ['a@example.com', 'b@example.com'] };
const opts = { retryDelayMs: 0 };

const fakeTransport = (behaviour = () => {}) => {
  const calls = [];
  return {
    calls,
    sendMail: async (msg) => {
      calls.push(msg);
      await behaviour(msg, calls.length);
    },
  };
};

test('sends one separate message per recipient with the full content', async () => {
  const transport = fakeTransport();
  const result = await sendDigest(digest, config, smtp, { ...opts, transport });
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[0].to, 'a@example.com');
  assert.equal(transport.calls[1].to, 'b@example.com');
  assert.deepEqual(
    { from: transport.calls[0].from, subject: transport.calls[0].subject, html: transport.calls[0].html, text: transport.calls[0].text },
    { from: smtp.from, subject: 'Subj', html: '<p>hi</p>', text: 'hi' },
  );
  assert.deepEqual(result, { sent: ['a@example.com', 'b@example.com'], failed: [] });
});

test('retries once after a transient failure', async () => {
  const transport = fakeTransport((msg, n) => {
    if (n === 1) throw new Error('temporary glitch');
  });
  const result = await sendDigest(digest, { recipients: ['a@example.com'] }, smtp, { ...opts, transport });
  assert.equal(transport.calls.length, 2);
  assert.equal(result.sent.length, 1);
  assert.equal(result.failed.length, 0);
});

test('one failing recipient does not stop the others', async () => {
  const transport = fakeTransport((msg) => {
    if (msg.to === 'a@example.com') throw new Error('mailbox unavailable');
  });
  const result = await sendDigest(digest, config, smtp, { ...opts, transport });
  assert.deepEqual(result.sent, ['b@example.com']);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].recipient, 'a@example.com');
  assert.match(result.failed[0].error, /mailbox unavailable/);
});

test('logs never contain addresses or the SMTP password', async () => {
  const lines = [];
  const logger = { info: (m) => lines.push(m), warn: (m) => lines.push(m) };
  const transport = fakeTransport((msg, n) => {
    if (n === 1) throw new Error('boom');
  });
  await sendDigest(digest, config, smtp, { ...opts, transport, logger });
  const all = lines.join('\n');
  assert.ok(!all.includes('@example.com'));
  assert.ok(!all.includes('super-secret'));
  assert.match(all, /recipient 1\/2/);
});

test('the transport is closed even when sending fails', async () => {
  let closed = false;
  const transport = { sendMail: async () => { throw new Error('down'); }, close: () => { closed = true; } };
  await sendDigest(digest, { recipients: ['a@example.com'] }, smtp, { ...opts, transport });
  assert.equal(closed, true);
});
