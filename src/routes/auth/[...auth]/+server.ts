// Auth routes (/auth/signin, /auth/signout, /auth/callback/*)
// are handled by the SvelteKitAuth `handle` in src/hooks.server.ts.
// This file exists so SvelteKit acknowledges the [...auth] segment;
// actual request handling is done by the auth handle before routing.
export {}
