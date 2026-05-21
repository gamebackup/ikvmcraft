# ikvmcraft

Minecraft 1.16.1 running in the browser via IKVM.NET + Mono/Wasm.

## Build

Requires: .NET 10 SDK, node + pnpm, Emscripten (fetched automatically).

```bash
make deps asm-jars
make build
cd frontend && pnpm install && pnpm build
```

Output is `frontend/dist/`.

## Deploy

Host the `frontend/dist/` folder anywhere that can set these response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Required for SharedArrayBuffer (Mono/Wasm threading). HTTPS is also required.

### Deploy to Cloudflare Pages

Push to GitHub, connect repo to Cloudflare Pages. The `_headers` file (included in the build output) handles headers automatically.

### Deploy to Netlify

Build locally or download the artifact from GitHub Actions, then drag-and-drop `frontend/dist/` onto Netlify's manual deploy. The `netlify.toml` at repo root handles the headers.

### Deploy manually

Upload `frontend/dist/` to your server. Configure nginx/Caddy/Apache to add the two headers above and serve over HTTPS.

## Dev server

```bash
cd frontend && pnpm dev
```

Runs on `https://localhost:5021` with Vite proxies for Mojang API calls.
