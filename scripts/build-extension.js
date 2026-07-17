const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'public', 'client.js');
const packageVersion = require(path.join(projectRoot, 'package.json')).version;
const extensionDirectories = [
  path.join(projectRoot, 'extension'),
  process.env.NEXUS_EXTENSION_DIR,
  path.resolve(projectRoot, '..', 'NexusChatExtension'),
  path.resolve(projectRoot, '..', '..', 'NexusChatExtension'),
].filter(Boolean).filter((directory, index, list) => list.indexOf(directory) === index);

let generated = 0;
for (const directory of extensionDirectories) {
  if (!fs.existsSync(directory)) continue;
  fs.copyFileSync(source, path.join(directory, 'nexus-chat.js'));
  const manifestPath = path.join(directory, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = packageVersion;
    manifest.host_permissions = ['https://nexus-chat-free.onrender.com/*'];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  generated += 1;
  console.log(`Extension generated in ${path.relative(projectRoot, directory) || 'extension'}`);
}

if (!generated) throw new Error('No extension directory was found.');
