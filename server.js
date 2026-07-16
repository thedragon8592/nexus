const { createNexusServer } = require('./src/server/create-server');

const nexus = createNexusServer();

nexus.start(process.env.PORT || 3000).then((port) => {
  console.log(`Nexus Chat ${nexus.version} running on port ${port}`);
}).catch((error) => {
  console.error('[NexusChat] Server failed to start', error);
  process.exitCode = 1;
});

module.exports = { createNexusServer };
