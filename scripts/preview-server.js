const { createNexusServer } = require('../src/server/create-server');

const port = Number(process.env.PORT || 4173);
const nexus = createNexusServer({
  dataFile: null,
  enablePreview: true,
  host: process.env.HOST || '127.0.0.1',
});

nexus.start(port).then(() => {
  console.log(`Nexus Chat preview running at http://127.0.0.1:${port}/preview?gameId=visual-test`);
}).catch((error) => {
  console.error('[NexusChat] Preview failed to start', error);
  process.exitCode = 1;
});
