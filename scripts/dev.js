'use strict';
/**
 * Desenvolvimento: recompila o frontend a cada alteração e reinicia o servidor
 * quando arquivos do backend mudam.
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const children = [];

function run(args, name) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' } });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[dev] ${name} terminou com código ${code}`);
  });
  children.push(child);
}

run([path.join('scripts', 'build.js'), '--watch'], 'build');
setTimeout(() => {
  run(['--watch-path=server', '--watch-path=shared', path.join('server', 'index.js')], 'servidor');
}, 800);

function stop() {
  children.forEach((c) => c.kill('SIGTERM'));
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
