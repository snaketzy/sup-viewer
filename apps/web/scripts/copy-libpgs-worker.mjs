// libpgs 需要把 worker 脚本暴露成一个可访问的静态资源，否则渲染会直接失败。
// public/ 下的文件在开发与构建时都会原样提供，因此这里直接拷贝一份。
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const source = require.resolve('libpgs/dist/libpgs.worker.js');
const targetDir = join(projectRoot, 'public');
const target = join(targetDir, 'libpgs.worker.js');

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);

console.log(`[sup-viewer] libpgs worker 已就绪: ${target}`);
