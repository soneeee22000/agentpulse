import { config } from './config.js';
import { buildServer } from './server.js';

/** Entry point: build the server and start listening. */
async function main(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(
      `[agentpulse] listening on http://${config.HOST}:${config.PORT} ` +
        `(bus=${config.BUS_DRIVER}, sim=${config.SIM_AUTOSTART ? 'on' : 'off'})`,
    );
  } catch (err) {
    console.error('[agentpulse] failed to start', err);
    process.exit(1);
  }
}

void main();
