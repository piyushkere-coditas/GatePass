const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Tagged template that HTML-escapes every interpolated value (NT-U-05). */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? escapeHtml(values[i]) : ''), '');
}

/** Shared Coditas-branded email shell. `body` must already be escaped (built with `html`). */
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f3f7;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<tr><td style="font-size:14px;font-weight:bold;color:#9900E6;padding-bottom:16px">Coditas Gate Pass</td></tr>
<tr><td><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}</td></tr>
</table></body></html>`;
}
