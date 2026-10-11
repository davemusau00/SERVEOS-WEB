import {spawnSync} from 'node:child_process';
const image='serveos-api:packaging-check';
const run=args=>{const result=spawnSync('docker',args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);};
run(['build','--file','apps/api/Dockerfile','--tag',image,'.']);
run(['run','--rm','--network','none','--entrypoint','node',image,'--input-type=module','-e',`import {readdir,access} from 'node:fs/promises';import {constants} from 'node:fs';if(process.getuid()===0)throw Error('API image runs as root');for(const name of await readdir('./src'))if(name.endsWith('.mjs'))await import('./src/'+name);await access('/app/contracts',constants.X_OK);for(const name of ['permissions.json','roles.json','pos-math.mjs','pos-inventory.mjs'])await access('/app/contracts/'+name,constants.R_OK);console.log('API_IMPORT_GRAPH=PASS CONTRACTS_READABLE=PASS NONROOT=PASS');`]);
