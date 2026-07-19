const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const generatedFiles = [
  [path.join(projectRoot, 'public', 'client.js'), 'nexus-chat.js'],
  [path.join(projectRoot, 'public', 'optimizer-core.js'), 'optimizer-core.js'],
  [path.join(projectRoot, 'public', 'optimizer-early.js'), 'optimizer-early.js'],
  [path.join(projectRoot, 'extension', 'background.js'), 'background.js'],
];
const packageVersion = require(path.join(projectRoot, 'package.json')).version;
const canonicalManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'extension', 'manifest.json'), 'utf8'));
const extensionDirectories = [
  path.join(projectRoot, 'extension'),
  process.env.NEXUS_EXTENSION_DIR,
  path.resolve(projectRoot, '..', 'NexusChatExtension'),
  path.resolve(projectRoot, '..', '..', 'NexusChatExtension'),
].filter(Boolean).filter((directory, index, list) => list.indexOf(directory) === index);

let generated = 0;
for (const directory of extensionDirectories) {
  if (!fs.existsSync(directory)) continue;
  generatedFiles.forEach(([source, target]) => {
    const destination = path.join(directory, target);
    if (path.resolve(source) !== path.resolve(destination)) fs.copyFileSync(source, destination);
  });
  if (path.resolve(directory) !== path.resolve(projectRoot, 'extension')) {
    fs.cpSync(path.join(projectRoot, 'extension', 'rules'), path.join(directory, 'rules'), { recursive: true });
  }
  const manifestPath = path.join(directory, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = { ...canonicalManifest };
    manifest.version = packageVersion;
    manifest.host_permissions = [
      'https://nexus-chat-free.onrender.com/*',
      'https://raw.githubusercontent.com/thedragon8592/nexus/*',
    ];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  generated += 1;
  console.log(`Extension generated in ${path.relative(projectRoot, directory) || 'extension'}`);
}

if (!generated) throw new Error('No extension directory was found.');
