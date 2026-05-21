import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const localProxyDir = path.resolve(__dirname, "public");

function localProxyPlugin() {
	const contentTypes: Record<string, string> = {
		".jar": "application/java-archive",
		".json": "application/json",
		".png": "image/png",
		".ogg": "audio/ogg",
		".mp3": "audio/mpeg",
		".wav": "audio/wav",
		".txt": "text/plain",
		".xml": "application/xml",
	};
	return {
		name: "local-proxy",
		configureServer(server: any) {
			server.middlewares.use((req: any, res: any, next: any) => {
				const url = req.url;
				const match = url.match(/^\/proxy\/([^/]+)\/(.+)$/);
				if (!match) return next();
				const proxyName = match[1];
				const relPath = match[2];
				const localPath = path.join(localProxyDir, `_${proxyName}`, relPath);
				if (fs.existsSync(localPath)) {
					const ext = path.extname(localPath);
					const stat = fs.statSync(localPath);
					res.writeHead(200, {
						"Content-Type": contentTypes[ext] ?? "application/octet-stream",
						"Content-Length": stat.size,
						"Access-Control-Allow-Origin": "*",
					});
					fs.createReadStream(localPath).pipe(res);
				} else {
					next();
				}
			});
		},
	};
}

export default defineConfig({
	plugins: [basicSsl(), localProxyPlugin()],
	build: {
		target: "es2022",
	},
	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
		proxy: {
			"/proxy/meta": {
				target: "https://meta.prismlauncher.org",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/proxy\/meta/, ""),
			},
			"/proxy/piston-meta": {
				target: "https://piston-meta.mojang.com",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/proxy\/piston-meta/, ""),
			},
			"/proxy/piston-data": {
				target: "https://piston-data.mojang.com",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/proxy\/piston-data/, ""),
			},
			"/proxy/launcher": {
				target: "https://launcher.mojang.com",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/proxy\/launcher/, ""),
			},
			"/proxy/resources": {
				target: "https://resources.download.minecraft.net",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/proxy\/resources/, ""),
			},
			"/proxy/libraries": {
				target: "https://libraries.minecraft.net",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/proxy\/libraries/, ""),
			},
			"/proxy/maven-central": {
				target: "https://repo1.maven.org",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/proxy\/maven-central/, ""),
			},
			"/proxy/maven-central-alt": {
				target: "https://repo.maven.apache.org",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/proxy\/maven-central-alt/, ""),
			},
		},
		port: 5021,
		strictPort: true,
		host: true,
		allowedHosts: ["nyatop.internal.hgci.org", "100.64.0.10"]
	},
});
