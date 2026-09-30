import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { createHmac, timingSafeEqual, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const digest = s => createHash('sha256').update(String(s)).digest();
const equal = (a,b) => timingSafeEqual(digest(a), digest(b));
export function createApp({ demo=false, accessKey='', apiKey='', origin='http://localhost:5173', database='.local/requests.sqlite', upstreamFetch=fetch }={}) {
  if (!demo && (accessKey.length < 24 || !apiKey)) throw new Error('Live mode requires a 24-character access key and provider key.');
  if (database !== ':memory:') mkdirSync(dirname(database), {recursive:true});
  const db = new DatabaseSync(database);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS reservations (kind TEXT, visitor TEXT, created INTEGER); CREATE INDEX IF NOT EXISTS reservation_time ON reservations(created);');
  function reserve(kind,visitor,limit,globalLimit) {
    const now=Date.now(); db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM reservations WHERE created < ?').run(now-86400000);
      const hourly=db.prepare('SELECT count(*) AS n FROM reservations WHERE kind=? AND visitor=? AND created>?').get(kind,visitor,now-3600000).n;
      const daily=db.prepare('SELECT count(*) AS n FROM reservations WHERE kind=?').get(kind).n;
      if(hourly>=limit || daily>=globalLimit) {db.exec('ROLLBACK'); return false;}
      db.prepare('INSERT INTO reservations VALUES(?,?,?)').run(kind,visitor,now); db.exec('COMMIT'); return true;
    } catch(e) {db.exec('ROLLBACK'); throw e;}
  }
  const app=express(); app.disable('x-powered-by');
  app.use((req,res,next)=> {res.set('Cache-Control','no-store'); res.set('X-Content-Type-Options','nosniff'); if(req.method==='POST' && req.get('origin')!==origin) return res.status(403).json({error:'Unapproved origin.'}); next();});
  app.use(express.json({limit:'128kb'}));
  function authenticated(req) {
    if(demo) return true;
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('idea_session='))?.slice(13);
    if(!token) return false;
    const [payload,signature]=token.split('.');
    if(!payload || !signature || !equal(signature,createHmac('sha256',accessKey).update(payload).digest('hex'))) return false;
    try { const value=JSON.parse(Buffer.from(payload,'base64url')); return typeof value.id==='string' && value.expires>Date.now(); } catch{return false;}
  }
  const cookieOptions={httpOnly:true,sameSite:'strict',secure:origin.startsWith('https:'),path:'/api',maxAge:28800000};
  app.get('/api/session',(req,res)=>res.json({authenticated:authenticated(req),mode:demo?'example':'live'}));
  app.post('/api/login',(req,res)=> {
    if(!reserve('login',req.socket.remoteAddress,10,100)) return res.status(429).json({error:'Login limit reached. Try later.'});
    if(!demo && !equal(req.body?.accessKey,accessKey)) return res.status(401).json({error:'Incorrect access key.'});
    const payload=Buffer.from(JSON.stringify({id:randomUUID(),expires:Date.now()+28800000})).toString('base64url');
    res.cookie('idea_session',payload+'.'+createHmac('sha256',accessKey).update(payload).digest('hex'),cookieOptions); res.json({ok:true});
  });
  app.post('/api/logout',(req,res)=>{res.clearCookie('idea_session',cookieOptions);res.json({ok:true});});
  app.post('/api/agent',async(req,res)=> {
    if(!authenticated(req)) return res.status(401).json({error:'Sign in before generating.'});
    const {system,prompt,max_tokens=1500}=req.body||{};
    if (![system,prompt].every(x=>typeof x==='string' && x.trim().length>0 && x.length<=12000) || !Number.isInteger(max_tokens) || max_tokens<1 || max_tokens>8192) return res.status(400).json({error:'Invalid input or token budget.'});
    if(!reserve('agent',req.socket.remoteAddress,20,200)) return res.status(429).json({error:'Generation budget reached. Try later.'});
    if(demo) return res.json({content:[{type:'text',text:JSON.stringify(example(system,prompt))}],stop_reason:'end_turn'});
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),45000);
    const abort=()=>controller.abort(); res.on('close',abort);
    try {
      const upstream=await upstreamFetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-4-6',system,max_tokens,messages:[{role:'user',content:prompt}]})});
      if(!upstream.ok) { await upstream.body?.cancel(); return res.status(502).json({error:'Provider rejected the request. No automatic retry.'}); }
      let body=''; const reader=upstream.body.getReader(); let bytes=0; const decoder=new TextDecoder();
      while(true) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>200000){await reader.cancel();throw new Error('Oversized response');}body+=decoder.decode(value,{stream:true});}
      const data=JSON.parse(body);
      if(data.stop_reason==='max_tokens') return res.status(502).json({error:'Output exceeded its token budget. Narrow the request before trying again.'});
      res.json(data);
    } catch { if(!res.destroyed) res.status(502).json({error:'Generation failed or timed out. Previous results remain available; no automatic retry.'}); }
    finally {clearTimeout(timer);res.off('close',abort);}
  });
  app.use((error,req,res,next)=>res.status(error.status===413?413:400).json({error:'Request could not be processed.'}));
  return {app,close:()=>db.close()};
}
function example(system,prompt) {
  if(system.includes('skeptic_note')) {
    const ideas=JSON.parse(prompt.split('Ideas to score:\n')[1]);
    return {skeptic_note:'Fictional example scores illustrate comparison, not validated demand.',ranked:ideas.map((idea,i)=>({id:idea.id,score:9-i,verdict:'Test this workflow with a real user before investing.'}))};
  }
  if(system.includes('architect_note')) return {architect_note:'An offline example checklist with add and remove interactions.',stack:'HTML/CSS/JS',html:'<!doctype html><html><head><style>body{background:#19212c;color:#eee;font:18px system-ui;padding:30px}button,input{padding:12px;margin:6px}</style></head><body><h1>Example client checklist</h1><form id="form"><label>Task <input id="task" required maxlength="100"></label><button>Add task</button></form><ul id="tasks"></ul><script>form.onsubmit=e=>{e.preventDefault();const li=document.createElement("li");li.textContent=task.value;const b=document.createElement("button");b.textContent="Remove";b.onclick=()=>li.remove();li.append(b);tasks.append(li);task.value="";};</script></body></html>'};
  return {scout_note:'This is a fixed fictional example. No market research or paid generation occurred.',strategist_note:'These examples demonstrate the workflow so you can rehearse safely.',ideas:['Route Review','Sample Desk','Receipt Review','Evidence Notebook','Client Checklist'].map(title=>({title,pitch:'A small checklist for reviewing work and assigning the next action.',sector:'Example operations'}))};
}
