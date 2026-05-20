const fs = require('fs');
const path = require('path');
const binDir = path.resolve(__dirname, '..', 'node_modules', '.bin');
fs.mkdirSync(binDir, { recursive: true });
const aliasPath = path.join(binDir, 'Pnpm');
fs.writeFileSync(aliasPath, '#!/usr/bin/env sh\nexec "$(dirname "$0")/pnpm" "$@"\n');
fs.chmodSync(aliasPath, 0o755);
