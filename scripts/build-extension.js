const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'public', 'client.js');
const extensionTarget = path.resolve(projectRoot, '..', 'NexusChatExtension', 'nexus-chat.js');

fs.copyFileSync(source, extensionTarget);
console.log(`Extension client generated from ${path.relative(projectRoot, source)}`);
