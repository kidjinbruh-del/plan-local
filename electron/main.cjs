const {app,BrowserWindow,ipcMain,dialog,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {portableRoot}=require('./portable-paths.cjs');
const {FileStore}=require('./file-store.cjs');
const root=portableRoot({packaged:app.isPackaged,execPath:process.execPath,portableDir:process.env.PORTABLE_EXECUTABLE_DIR,projectDir:path.join(__dirname,'..')});
const system=path.join(root,'data','system');
let startupError=null;
try{fs.mkdirSync(system,{recursive:true});app.setPath('userData',system);app.setPath('sessionData',path.join(system,'session'));app.setAppLogsPath(path.join(system,'logs'))}catch(e){startupError=e}
app.setName('ПЛАН');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
const store=new FileStore(root);
let win,allowClose=false,closing=false;
const pageURL=pathToFileURL(path.join(__dirname,'..','dist','index.html')).href;
function trusted(event){if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==pageURL)throw Error('Недопустимый источник IPC.');}
ipcMain.handle('plan:zoom',(event,factor)=>{trusted(event);const z=Number(factor);if(!Number.isFinite(z)||z<0.7||z>1.6)throw Error('Неверный масштаб.');win.webContents.setZoomFactor(z);return true});
ipcMain.handle('plan:load',event=>{trusted(event);return store.load()});
ipcMain.handle('plan:backup',async(event,json)=>{trusted(event);try{if(typeof json!=='string'||Buffer.byteLength(json)>10_000_000)throw Error('Размер резервной копии превышает 10 МБ.');return {ok:true,path:await store.backup(json),error:null}}catch(e){return {ok:false,path:null,error:'Импорт отменён: резервная копия не создана. '+e.message}}});
ipcMain.handle('plan:save',async(event,json)=>{trusted(event);try{if(typeof json!=='string'||Buffer.byteLength(json)>10_000_000)throw Error('Неверный размер данных.');await store.enqueue(json);return {ok:true,error:null}}catch(e){return {ok:false,error:'Не удалось сохранить data/plan.json. Проверьте права записи и свободное место. Предыдущий файл сохранён. '+e.message}}});
ipcMain.handle('plan:close-ready',async(event,ok)=>{trusted(event);if(!closing)return;try{if(!ok)throw Error('Есть несохранённые изменения.');await store.flush();allowClose=true;win.close()}catch{closing=false;dialog.showMessageBox(win,{type:'error',title:'ПЛАН — изменения не сохранены',message:'Окно оставлено открытым. Экспортируйте JSON перед закрытием или восстановите доступ к папке data.',buttons:['Понятно']})}});
if(!app.requestSingleInstanceLock()){app.quit()}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
 app.whenReady().then(()=>{
  if(startupError){dialog.showErrorBox('ПЛАН — папка недоступна','Не удалось создать data рядом с программой. Перенесите всю папку в каталог, в который разрешена запись. Приложение не использует AppData для пользовательских данных.\n'+startupError.message);app.quit();return}
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!['file:','data:','blob:','devtools:'].some(x=>details.url.startsWith(x))}));
  session.defaultSession.on('will-download',(_event,item)=>{const extension=path.extname(item.getFilename()).slice(1).toLowerCase();if(!['json','xmind','xlsx','md','opml','csv','txt'].includes(extension)){item.cancel();return}const target=dialog.showSaveDialogSync(win,{title:'Экспорт плана',defaultPath:path.join(root,path.basename(item.getFilename())),filters:[{name:extension.toUpperCase(),extensions:[extension]}]});if(target)item.setSavePath(target);else item.cancel()});
  win=new BrowserWindow({width:1366,height:900,minWidth:800,minHeight:600,title:'ПЛАН',backgroundColor:'#f5f7fa',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.setMenu(null);win.once('ready-to-show',()=>{win.show();win.focus()});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pageURL)event.preventDefault()});
  win.on('close',event=>{if(allowClose)return;event.preventDefault();if(closing)return;closing=true;win.webContents.send('plan:before-close');setTimeout(()=>{if(closing&&!allowClose){closing=false;dialog.showMessageBox(win,{type:'warning',title:'ПЛАН — сохранение',message:'Не удалось завершить сохранение. Экспортируйте JSON перед закрытием.',buttons:['Понятно']})}},12000).unref()});
  win.loadFile(path.join(__dirname,'..','dist','index.html'));
 });
 app.on('window-all-closed',()=>app.quit());
}
