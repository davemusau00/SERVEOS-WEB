import fs from 'node:fs';
import path from 'node:path';

const file='scripts/build-help-index.mjs';
if(!fs.existsSync(file)) throw new Error(`Missing ${file}`);
let c=fs.readFileSync(file,'utf8');

if(c.includes('SERVOS_DETERMINISTIC_HELP_INDEX')){
  console.log('Deterministic help-index generator already installed.');
  process.exit(0);
}

const old=`fs.mkdirSync('src/generated',{recursive:true});
fs.writeFileSync('src/generated/help-index.json',JSON.stringify({generatedAt:new Date().toISOString(),source:'docs/user-guide',count:articles.length,articles},null,2)+'\\n');
console.log(\`Generated \${articles.length} offline help articles.\`);`;

const replacement=`fs.mkdirSync('src/generated',{recursive:true});
// SERVOS_DETERMINISTIC_HELP_INDEX
const outputPath='src/generated/help-index.json';
const payload={source:'docs/user-guide',count:articles.length,articles};
let generatedAt=new Date().toISOString();
if(fs.existsSync(outputPath)){
  try{
    const prior=JSON.parse(fs.readFileSync(outputPath,'utf8'));
    const priorPayload={source:prior.source,count:prior.count,articles:prior.articles};
    if(JSON.stringify(priorPayload)===JSON.stringify(payload) && typeof prior.generatedAt==='string' && prior.generatedAt){
      generatedAt=prior.generatedAt;
    }
  }catch{}
}
fs.writeFileSync(outputPath,JSON.stringify({generatedAt,...payload},null,2)+'\\n');
console.log(\`Generated \${articles.length} offline help articles.\`);`;

if(!c.includes(old)) throw new Error('Expected help-index write block was not found.');
c=c.replace(old,replacement);

const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backupDir=path.join('.servos-patch-help-index-backup-'+stamp,'scripts');
fs.mkdirSync(backupDir,{recursive:true});
fs.copyFileSync(file,path.join(backupDir,'build-help-index.mjs'));
fs.writeFileSync(file,c,'utf8');

console.log('Installed deterministic help-index generation.');
console.log('Backup: '+backupDir);
console.log('Next: npm run help:build twice, then git status --short');
