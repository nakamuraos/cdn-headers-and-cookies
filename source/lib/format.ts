import type {CapturedRequest, CookieRecord, HeaderEntry} from '@/types';

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function headersToCsv(headers: HeaderEntry[]): string {
  return toCsv([['Name', 'Value'], ...headers.map((h) => [h.name, h.value])]);
}

export function cookiesToCsv(cookies: CookieRecord[]): string {
  return toCsv([
    ['Name', 'Value', 'Domain', 'Path', 'Secure', 'HttpOnly', 'SameSite', 'Expires'],
    ...cookies.map((c) => [
      c.name,
      c.value,
      c.domain,
      c.path,
      String(c.secure),
      String(c.httpOnly),
      c.sameSite,
      c.session || !c.expirationDate
        ? 'Session'
        : new Date(c.expirationDate * 1000).toISOString(),
    ]),
  ]);
}

export function requestToJson(request: CapturedRequest, cookies: CookieRecord[]): string {
  return JSON.stringify(
    {
      url: request.url,
      method: request.method,
      type: request.type,
      status: request.statusCode,
      statusLine: request.statusLine,
      requestHeaders: Object.fromEntries(
        request.requestHeaders.map((h) => [h.name, h.value])
      ),
      responseHeaders: Object.fromEntries(
        request.responseHeaders.map((h) => [h.name, h.value])
      ),
      cookies,
    },
    null,
    2
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function requestToCurl(request: CapturedRequest): string {
  const parts = [`curl ${shellQuote(request.url)}`];

  if (request.method && request.method !== 'GET') {
    parts.push(`  -X ${request.method}`);
  }

  for (const header of request.requestHeaders) {
    // Pseudo-headers describe the HTTP/2 frame rather than the request itself.
    if (header.name.startsWith(':')) continue;
    parts.push(`  -H ${shellQuote(`${header.name}: ${header.value}`)}`);
  }

  return parts.join(' \\\n');
}

export function downloadText(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], {type: `${mime};charset=utf-8`});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export async function copyText(contents: string): Promise<void> {
  await navigator.clipboard.writeText(contents);
}

export function safeFilename(host: string, suffix: string, ext: string): string {
  const stem = host.replace(/[^a-z0-9.-]/gi, '_') || 'capture';
  return `${stem}-${suffix}.${ext}`;
}
