import { config } from './config.ts';
import { migrate, seed } from './migrations.ts';
import { encryptionReady } from './crypto.ts';
import { createApp } from './app.ts';
import { registerConnector } from './connectors/registry.ts';
import { taskmarketConnector } from './connectors/taskmarket.ts';
import { setAuthHeaderResolver, setAuthQueryResolver } from './connectors/generic.ts';
import { resolvePlatformAuthHeaders, resolvePlatformAuthQuery } from './connectors/auth.ts';

migrate();
seed();
registerConnector(taskmarketConnector);
setAuthHeaderResolver(resolvePlatformAuthHeaders);
setAuthQueryResolver(resolvePlatformAuthQuery);

if (!encryptionReady()) {
  console.warn('[warn] WORKER_HUB_ENCRYPTION_KEY is not set: saving credentials is disabled. Run "npm run gen-key" and restart.');
}

if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
  console.warn('[warn] Server is not bound to localhost. Set WORKER_HUB_ACCESS_TOKEN and put it behind HTTPS before exposing it.');
}

createApp().listen(config.port, config.host, () => {
  console.log(`WORKER HUB ${config.version} listening on http://${config.host}:${config.port}`);
});
