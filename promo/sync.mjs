// Builds the two HyperFrames projects (landscape/ and vertical/) from the shared sources in shared/.
//   node sync.mjs
// The stage and type scenes are shared; only their layout switch, the canvas size and the root differ.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = f => path.join(HERE, 'shared', f);
const audio = fs.existsSync(S('audio.html')) ? fs.readFileSync(S('audio.html'), 'utf8') : '';

for (const layout of ['landscape', 'vertical']) {
  const dir = path.join(HERE, layout);
  fs.mkdirSync(path.join(dir, 'compositions'), { recursive: true });
  const swap = s => s.replace("const LAYOUT = 'landscape'", `const LAYOUT = '${layout}'`).replace('data-composition-id="type" data-layout="landscape"', `data-composition-id="type" data-layout="${layout}"`);
  fs.writeFileSync(path.join(dir, 'compositions', 'stage.html'), swap(fs.readFileSync(S('stage.html'), 'utf8')));
  let type = swap(fs.readFileSync(S('type.html'), 'utf8'));
  if (layout === 'vertical') type = type.replace('data-width="1920" data-height="1080"', 'data-width="1080" data-height="1920"');
  fs.writeFileSync(path.join(dir, 'compositions', 'type.html'), type);
  fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(S(`index-${layout}.html`), 'utf8').replace('<!--AUDIO-->', audio));
  for (const sub of ['island', 'fonts', 'audio']) {
    if (!fs.existsSync(S(sub))) continue;
    fs.cpSync(S(sub), path.join(dir, 'assets', sub), { recursive: true });
  }
}
console.log('synced landscape/ and vertical/');
