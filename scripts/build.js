'use strict';
/**
 * Compila o frontend (client/) para dist/ com esbuild.
 * Uso: node scripts/build.js [--watch]
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outdir = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

function writeIndex(metafile) {
  const outputs = Object.keys(metafile.outputs).map((f) => path.relative(outdir, path.join(root, f)).split(path.sep).join('/'));
  const js = outputs.filter((f) => f.endsWith('.js'));
  const css = outputs.filter((f) => f.endsWith('.css'));
  let page = fs.readFileSync(path.join(root, 'client', 'index.html'), 'utf8');
  page = page
    .replace('<!--STYLES-->', css.map((f) => `<link rel="stylesheet" href="/${f}" />`).join('\n    '))
    .replace('<!--SCRIPTS-->', js.map((f) => `<script type="module" src="/${f}"></script>`).join('\n    '));
  fs.writeFileSync(path.join(outdir, 'index.html'), page);
  fs.copyFileSync(path.join(root, 'client', 'favicon.svg'), path.join(outdir, 'favicon.svg'));
}

const options = {
  entryPoints: { app: path.join(root, 'client', 'src', 'main.js') },
  bundle: true,
  outdir,
  format: 'esm',
  target: ['es2020'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  entryNames: watch ? '[name]' : '[name]-[hash]',
  metafile: true,
  logLevel: 'info',
  legalComments: 'none',
};

async function main() {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });
  if (watch) {
    const ctx = await esbuild.context({
      ...options,
      plugins: [
        {
          name: 'index-html',
          setup(build) {
            build.onEnd((result) => {
              if (result.metafile) writeIndex(result.metafile);
            });
          },
        },
      ],
    });
    await ctx.watch();
    console.log('[build] Observando alterações em client/ ...');
  } else {
    const result = await esbuild.build(options);
    writeIndex(result.metafile);
    console.log('[build] Frontend compilado em dist/');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
