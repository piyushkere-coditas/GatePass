/** Absolute link into the web app. Emails never carry action tokens: actions require sign-in (NT-4). */
export function appLink(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
