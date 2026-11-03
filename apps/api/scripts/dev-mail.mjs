// Local mailbox for development, without Docker or downloads: an SMTP server on :1025 (matches SMTP_PORT in
// .env.example) and an inbox page on http://localhost:8025. Messages live in memory only.
// Usage: pnpm mail:dev   (Ctrl+C to stop)
import http from 'node:http';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

const SMTP_PORT = Number(process.env.DEV_SMTP_PORT ?? 1025);
const WEB_PORT = Number(process.env.DEV_MAIL_WEB_PORT ?? 8025);
const messages = [];

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, _session, callback) {
    simpleParser(stream)
      .then((mail) => {
        const to = (Array.isArray(mail.to) ? mail.to[0] : mail.to)?.text ?? '';
        messages.unshift({
          id: messages.length + 1,
          to,
          subject: mail.subject ?? '',
          text: mail.text ?? '',
          html: typeof mail.html === 'string' ? mail.html : '',
          receivedAt: new Date().toISOString(),
        });
        console.log(`mail to ${to}: ${mail.subject}`);
        callback();
      })
      .catch(callback);
  },
});

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>Dev inbox</title>
<meta http-equiv="refresh" content="3">
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#f5f3f7}
.m{background:#fff;border-radius:8px;padding:1rem;margin-bottom:1rem}.s{font-weight:600;font-size:1.1rem}
.meta{color:#5c5c66;font-size:.9rem}pre{white-space:pre-wrap}</style></head><body>
<h1>Dev inbox</h1><p class="meta">${messages.length} message(s), newest first. Refreshes every 3 s.</p>
${messages
  .map(
    (m) => `<div class="m"><div class="s">${escape(m.subject)}</div>
<div class="meta">to ${escape(m.to)} · ${escape(m.receivedAt)}</div><pre>${escape(m.text)}</pre></div>`,
  )
  .join('')}</body></html>`;

const web = http.createServer((req, res) => {
  if (req.url === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(messages));
  } else if (req.url === '/api/messages/clear' && req.method === 'POST') {
    messages.length = 0;
    res.writeHead(204).end();
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page());
  }
});

smtp.listen(SMTP_PORT, '127.0.0.1', () => console.log(`SMTP listening on localhost:${SMTP_PORT}`));
web.listen(WEB_PORT, '127.0.0.1', () => console.log(`Inbox: http://localhost:${WEB_PORT}`));

const stop = () => {
  smtp.close();
  web.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
