import fs from 'node:fs';
import path from 'node:path';
const dir='docs/user-guide';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.md')).sort();
const readMeta=(text,key)=>text.split('\n').find(line=>line.startsWith(`${key}: `))?.slice(key.length+2).trim()||'';
const articles=files.map(file=>{const text=fs.readFileSync(path.join(dir,file),'utf8');const title=text.match(/^#\s+(.+)$/m)?.[1]||file;const overview=text.match(/## Overview\s+([\s\S]*?)(?=\n## |$)/)?.[1].trim()||'';return {id:file.replace(/\.md$/,''),title,section:readMeta(text,'Section'),roles:readMeta(text,'Roles').split(',').map(x=>x.trim()).filter(Boolean),permissions:readMeta(text,'Permission').split(',').map(x=>x.trim()).filter(Boolean),screen:readMeta(text,'Screen'),summary:overview,body:text.replace(/^#.*\n/,'').trim(),keywords:readMeta(text,'Keywords').split(',').map(x=>x.trim()).filter(Boolean)};});
fs.mkdirSync('src/generated',{recursive:true});
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
fs.writeFileSync(outputPath,JSON.stringify({generatedAt,...payload},null,2)+'\n');
console.log(`Generated ${articles.length} offline help articles.`);
