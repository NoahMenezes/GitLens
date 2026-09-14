// esbuild bundler for the CodeBeam extension.
//
// Why esbuild and not webpack?
// - Much faster, zero-config, single file.
// - VS Code only needs one output file: dist/extension.js
//   (pointed to by the "main" field in package.json).
//
// Usage (always via Bun, per project convention):
//   bun run compile   -> one-off dev build (+ sourcemap)
//   bun run watch     -> rebuild on every save (dev loop + F5)
//   bun run package   -> minified production build (for `vsce package`)

const esbuild = require("esbuild");

const isWatch = process.argv.includes("--watch");
const isProd = process.argv.includes("--production");

async function main() {
  // `vscode` must stay external — VS Code injects it at runtime,
  // so we must NOT bundle it.
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs", // VS Code extension host expects CommonJS
    platform: "node",
    target: "node18",
    external: ["vscode"],
    outfile: "dist/extension.js",
    sourcemap: !isProd,
    minify: isProd,
    logLevel: "info",
  });

  if (isWatch) {
    // Long-lived: re-bundles whenever src/ changes.
    await ctx.watch();
    console.log("👀 esbuild watching for changes... (Ctrl+C to stop)");
  } else {
    // One-off build, then free resources.
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
