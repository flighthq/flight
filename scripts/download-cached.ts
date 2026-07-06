import { resolve } from 'node:path';

import { downloadConsumerAssets } from './asset-cache';

// The monorepo predev/prebuild entry: download one consumer's manifest into the shared cache (or its
// own public/assets when the cache is disabled). The consumer directory defaults to the current
// working directory (an example runs this from its own folder); a suite passes its assets/<suite>
// directory as the first argument.
const manifestDir = process.argv[2] ? resolve(process.argv[2]) : process.cwd();

downloadConsumerAssets(manifestDir)
  .then((target) => {
    console.log(`Assets ready → ${target.usingCache ? 'cache' : 'public/assets'}: ${target.outDir}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
