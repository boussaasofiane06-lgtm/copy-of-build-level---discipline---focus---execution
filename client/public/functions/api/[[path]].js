/**
 * BUILD LEVEL — Cloudflare Pages Function: API Proxy
 *
 * Proxies all /api/* requests from Cloudflare Pages to the Render backend.
 *
 * This makes the site 100% independent of Manus infrastructure.
 * No Manus APIs, no Manus storage, no Manus OAuth — just Render + Cloudflare.
 */

export async function onRequest(context) {
  const { request } = context;
  const backendUrl = context.env?.BACKEND_URL || "https://build-level.onrender.com";
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": url.origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, X-Requested-With, X-Admin-Token",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Build the target URL on the Render backend
  const targetUrl = new URL(url.pathname + url.search, backendUrl);

  // Clone request headers
  const headers = new Headers(request.headers);
  headers.set("Host", new URL(backendUrl).hostname);
  // Ensure the backend knows the real origin for CORS
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  // Forward the request to the Render backend
  const proxyRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
    redirect: "follow",
  });

  try {
    const response = await fetch(proxyRequest);

    // Pass through the response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", url.origin);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-Requested-With");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Backend unavailable", message: String(err) }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": url.origin,
        },
      }
    );
  }
}
