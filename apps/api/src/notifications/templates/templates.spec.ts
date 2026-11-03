import { appLink } from './links';
import { html } from './html';
import { renderEmail } from './registry';

describe('email templates', () => {
  it('[NT-U-02] login-code: subject, HTML and plain-text parts', () => {
    const email = renderEmail('login-code', { code: '042917' });

    expect(email.subject).toBe('Your Gate Pass sign-in code: 042917');
    expect(email.text).toContain('042917');
    expect(email.text).toContain('expires in 10 minutes');
    expect(email.html).toContain('042917');
    expect(email.html).toContain('Coditas Gate Pass');
    expect(email.html).not.toMatch(/https?:\/\//); // login codes carry no links (NT-4)
  });

  it('[NT-U-02] login-code marks the code as a secret to scrub after sending', () => {
    expect(renderEmail('login-code', { code: '042917' }).secretFields).toEqual(['code']);
  });

  it('[NT-U-04] links are built from APP_BASE_URL and carry no tokens', () => {
    expect(appLink('https://gatepass.coditas.com', '/approvals/abc')).toBe(
      'https://gatepass.coditas.com/approvals/abc',
    );
    expect(appLink('https://gatepass.coditas.com/', 'approvals/abc')).toBe(
      'https://gatepass.coditas.com/approvals/abc',
    );
  });

  it('[NT-U-05] interpolated values are HTML-escaped', () => {
    const name = '<script>alert("x")</script> & co';
    expect(html`<p>${name}</p>`).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co</p>');
    expect(html`<p>${42}</p>`).toBe('<p>42</p>');
  });
});
