const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('planDesktop',Object.freeze({
 load:()=>ipcRenderer.invoke('plan:load'),
 save:json=>ipcRenderer.invoke('plan:save',json),
 backup:json=>ipcRenderer.invoke('plan:backup',json),
 setZoom:z=>ipcRenderer.invoke('plan:zoom',z),
 onBeforeClose:callback=>{ipcRenderer.removeAllListeners('plan:before-close');ipcRenderer.on('plan:before-close',async()=>{try{await callback();await ipcRenderer.invoke('plan:close-ready',true)}catch{await ipcRenderer.invoke('plan:close-ready',false)}})}
}));
