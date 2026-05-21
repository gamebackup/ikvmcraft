import fs from "node:fs";
import path from "node:path";
import { get } from "node:https";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "public");

const VERSION = "1.16.1";
const CLIENT_JAR_SHA1 = "c9abbe8ee4fa490751ca70635340b7cf00db83ff";
const ASSET_INDEX_SHA1 = "f3c4aa96e12951cd2781b3e1c0e8ab82bf719cf2";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(new URL(res.headers.location, url).href, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => { file.close(); fs.unlinkSync(dest); reject(err); });
  });
}

async function sha1hex(filePath) {
  const crypto = await import("node:crypto");
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function main() {
  // 1. Client JAR
  const clientJarPath = path.join(OUT, "_piston-data", "v1", "objects", CLIENT_JAR_SHA1, "client.jar");
  if (fs.existsSync(clientJarPath)) {
    const got = await sha1hex(clientJarPath);
    if (got === CLIENT_JAR_SHA1) { console.log("✓ Client JAR already present"); }
    else { console.log("  Client JAR hash mismatch, re-downloading..."); await download(`https://piston-data.mojang.com/v1/objects/${CLIENT_JAR_SHA1}/client.jar`, clientJarPath); }
  } else {
    console.log("  Downloading client JAR...");
    await download(`https://piston-data.mojang.com/v1/objects/${CLIENT_JAR_SHA1}/client.jar`, clientJarPath);
    console.log(`  ✓ Client JAR (${(fs.statSync(clientJarPath).size / 1024 / 1024).toFixed(1)}MB)`);
  }

  // 2. Asset index
  const assetIndexPath = path.join(OUT, "_piston-meta", "v1", "packages", ASSET_INDEX_SHA1, "1.16.json");
  if (fs.existsSync(assetIndexPath)) {
    const got = await sha1hex(assetIndexPath);
    if (got === ASSET_INDEX_SHA1) { console.log("✓ Asset index already present"); }
    else { console.log("  Asset index hash mismatch, re-downloading..."); await download(`https://piston-meta.mojang.com/v1/packages/${ASSET_INDEX_SHA1}/1.16.json`, assetIndexPath); }
  } else {
    console.log("  Downloading asset index...");
    await download(`https://piston-meta.mojang.com/v1/packages/${ASSET_INDEX_SHA1}/1.16.json`, assetIndexPath);
    console.log("  ✓ Asset index");
  }

  // 3. Parse asset index and get unique hashes
  const assetIndex = JSON.parse(fs.readFileSync(assetIndexPath, "utf-8"));
  const objects = assetIndex.objects;
  if (!objects) { throw new Error("Asset index has no objects"); }
  const hashes = [...new Set(Object.values(objects).map((o) => o.hash))];
  console.log(`  Asset objects to download: ${hashes.length}`);
  const totalBytes = Object.values(objects).reduce((sum, o) => sum + (o.size || 0), 0);
  console.log(`  Total size: ~${(totalBytes / 1024 / 1024).toFixed(0)}MB`);

  // 4. Download assets with concurrency
  const CONCURRENCY = 8;
  let done = 0;
  let failed = 0;
  let skipped = 0;

  async function downloadAsset(hash) {
    const prefix = hash.slice(0, 2);
    const dest = path.join(OUT, "_resources", prefix, hash);
    if (fs.existsSync(dest)) {
      const got = await sha1hex(dest);
      if (got === hash) { skipped++; return; }
    }
    try {
      await download(`https://resources.download.minecraft.net/${prefix}/${hash}`, dest);
      done++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${hash}: ${e.message}`);
    }
    const pct = ((done + failed + skipped) / hashes.length * 100).toFixed(1);
    process.stdout.write(`\r  Assets: ${done} OK, ${skipped} cached, ${failed} failed (${pct}%)`);
  }

  async function runConcurrently(items, concurrency, worker) {
    let cursor = 0;
    const count = Math.min(concurrency, items.length);
    const runners = Array.from({ length: count }, async () => {
      while (true) {
        const i = cursor; cursor++;
        if (i >= items.length) return;
        await worker(items[i], i);
      }
    });
    await Promise.all(runners);
  }

  console.log("  Downloading assets...");
  await runConcurrently(hashes, CONCURRENCY, downloadAsset);
  console.log("\n");
  console.log(`  Done: ${done} downloaded, ${skipped} cached, ${failed} failed`);
  console.log("All done!");
}

main().catch(console.error);
