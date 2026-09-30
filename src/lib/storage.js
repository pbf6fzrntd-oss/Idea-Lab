let opening;
function open() {
  return opening ||= new Promise((resolve,reject)=>{const request=indexedDB.open('idea-lab',1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export const storage={
  async get(key) {const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records');const r=tx.objectStore('records').get(key);r.onsuccess=()=>resolve(r.result||legacy(key));r.onerror=()=>reject(r.error);});},
  async save(record,entry) {const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readwrite');const store=tx.objectStore('records');let list;
    const r=store.get('sessions-index');
    r.onsuccess=()=> {try {const previous=JSON.parse((r.result||legacy('sessions-index'))?.value||'[]');list=[entry,...previous.filter(s=>s.id!==entry.id)].slice(0,25);for(const old of previous)if(!list.some(s=>s.id===old.id))store.delete('session:'+old.id);store.put({key:'session:'+record.id,value:JSON.stringify(record)});store.put({key:'sessions-index',value:JSON.stringify(list)});}catch{tx.abort();}};
    tx.oncomplete=()=>resolve(list);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Session could not be saved.'));
  });}
};
function legacy(key) {const value=localStorage.getItem('idea-lab:'+key);return value===null?null:{key,value};}
