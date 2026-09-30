import fs from 'node:fs';
import path from 'node:path';
const dir='docs/user-guide';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.md')).sort();
const readMeta=(text,key)=>text.split('\n').find(line=>line.startsWith(`${key}: `))?.slice(key.length+2).trim()||'';
const section=(text,name)=>text.match(new RegExp(`^## ${name}\\s+([\\s\\S]*?)(?=^## |^# |$)`,'m'))?.[1].trim()||'';
const paragraphs=value=>value.split(/\n\s*\n/).map(item=>item.replace(/^\s*(?:\d+\.|[-*])\s+/gm,'').trim()).filter(Boolean);
const articles=files.map(file=>{const text=fs.readFileSync(path.join(dir,file),'utf8');const title=text.match(/^#\s+(.+)$/m)?.[1]||file;const overview=section(text,'Overview');const procedure=section(text,'Procedure');const example=readMeta(text,'Example')||paragraphs(`${overview}\n\n${procedure}`).find(value=>/\bexample\b/i.test(value))||'';const steps=paragraphs(procedure).flatMap(value=>value.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(step=>step.trim()).filter(Boolean));return {id:file.replace(/\.md$/,''),title,section:readMeta(text,'Section'),roles:readMeta(text,'Roles').split(',').map(x=>x.trim()).filter(Boolean),permissions:readMeta(text,'Permission').split(',').map(x=>x.trim()).filter(Boolean),screen:readMeta(text,'Screen'),summary:overview,example,steps,systemHandles:paragraphs(section(text,'What ServOS handles')||section(text,'What ServOS records')),commonMistakes:paragraphs(section(text,'Common mistakes and correction')||section(text,'Common mistakes')),relatedTasks:readMeta(text,'Related tasks').split(',').map(x=>x.trim()).filter(Boolean),guideId:readMeta(text,'Guide'),estimatedMinutes:Number(readMeta(text,'Duration'))||null,body:text.replace(/^#.*\n/,'').trim(),keywords:readMeta(text,'Keywords').split(',').map(x=>x.trim()).filter(Boolean)};});
for(const article of articles){if(!article.relatedTasks.length)article.relatedTasks=articles.filter(other=>other.id!==article.id&&other.section===article.section).slice(0,3).map(other=>other.id);if(!article.estimatedMinutes)article.estimatedMinutes=Math.max(1,Math.ceil(article.steps.length/4));}
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
