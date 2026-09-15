const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");
const isProd = process.argv.includes("--production");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    external: ["vscode"],
    outfile: "dist/extension.js",
    sourcemap: !isProd,
    minify: isProd,
    logLevel: "info",
  });
  if (isWatch) {
    await ctx.watch();
    console.log("esbuild watching for changes... (Ctrl+C to stop)");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    if (isProd) {
      const staleMap = path.join(__dirname, "dist", "extension.js.map");
      if (fs.existsSync(staleMap)) {
        fs.unlinkSync(staleMap);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
