const fs=require('node:fs/promises');
const path=require('node:path');
const {parseBackup,exportBackup}=require('./model.cjs');
class FileStore {
 constructor(root){this.dir=path.join(root,'data');this.file=path.join(this.dir,'plan.json');this.backups=path.join(this.dir,'backups');this.pending=null;this.timer=null;this.tail=Promise.resolve();this.sequence=0;}
 async load(){try{const text=await fs.readFile(this.file,'utf8');const parsed=JSON.parse(text);const data=parseBackup(text);if(parsed.version===1){await fs.mkdir(this.backups,{recursive:true});const target=path.join(this.backups,'before-migration-v16.json');try{await fs.writeFile(target,text,{encoding:'utf8',flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}}return {data,error:null}}catch(e){if(e.code==='ENOENT')return {data:null,error:null};return {data:null,error:'Не удалось прочитать data/plan.json: файл повреждён или недоступен. Исходник сохранён. Импортируйте исправную копию из data/backups или свой JSON-бэкап.'}}}
 async atomic(json){
  const valid=exportBackup(parseBackup(json));
  await fs.mkdir(this.backups,{recursive:true});
  const temp=path.join(this.dir,`plan.${process.pid}.${++this.sequence}.tmp`);
  try{
   const handle=await fs.open(temp,'wx');try{await handle.writeFile(valid,'utf8');await handle.sync()}finally{await handle.close()}
   try{await fs.copyFile(this.file,path.join(this.backups,`plan-${new Date().toISOString().replace(/[:.]/g,'-')}-${this.sequence}.json`))}catch(e){if(e.code!=='ENOENT')throw e}
   let replaced=false;for(let attempt=0;attempt<4;attempt++){try{await fs.rename(temp,this.file);replaced=true;break}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt===3)throw e;await new Promise(r=>setTimeout(r,75*(attempt+1)))}}
   if(!replaced)throw Error('Не удалось заменить файл.');
   // Ротация копий никогда не отменяет уже успешную запись плана.
   try{const names=(await fs.readdir(this.backups)).filter(x=>/^plan-.*\.json$/.test(x)).sort().reverse();await Promise.all(names.slice(10).map(x=>fs.unlink(path.join(this.backups,x))))}catch{}
  }finally{await fs.unlink(temp).catch(()=>{})}
 }
 enqueue(json){parseBackup(json);return new Promise((resolve,reject)=>{if(!this.pending)this.pending={json,waiters:[]};this.pending.json=json;this.pending.waiters.push({resolve,reject});clearTimeout(this.timer);this.timer=setTimeout(()=>this.drain(),160)})}
 drain(){clearTimeout(this.timer);this.timer=null;const job=this.pending;this.pending=null;if(job){this.tail=this.tail.catch(()=>{}).then(()=>this.atomic(job.json));this.tail.then(()=>job.waiters.forEach(x=>x.resolve()),error=>job.waiters.forEach(x=>x.reject(error)))}return this.tail}
 async flush(){await this.drain()}
 async backup(json){const valid=exportBackup(parseBackup(json));await fs.mkdir(this.backups,{recursive:true});const file=path.join(this.backups,`before-import-${Date.now()}-${require('node:crypto').randomUUID()}.json`);const handle=await fs.open(file,'wx');try{await handle.writeFile(valid,'utf8');await handle.sync()}finally{await handle.close()}return file;}
}
module.exports={FileStore};
