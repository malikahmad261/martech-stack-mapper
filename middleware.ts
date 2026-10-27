// Vercel Routing Middleware: HTTP Basic Auth in front of the whole prototype.
// Set DEMO_PASSWORD (and optionally DEMO_USER, default "demo") in the Vercel project.
// With no DEMO_PASSWORD set, every request is refused so the site is never public by accident.

export const config = { matcher: '/:path*' };

export default function middleware(request: Request): Response | undefined {
  const password = process.env.DEMO_PASSWORD;
  const user = process.env.DEMO_USER || 'demo';
  if (!password) {
    return new Response('DEMO_PASSWORD is not configured for this deployment.', { status: 503 });
  }

  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const sep = decoded.indexOf(':');
    if (sep !== -1 && decoded.slice(0, sep) === user && decoded.slice(sep + 1) === password) {
      return undefined; // authorised: continue to the app
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Martech Stack Mapper", charset="UTF-8"' },
  });
}
