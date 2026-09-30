const string=(value,max=2000)=> {if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Invalid generated text.'); return value;};
export function validateBrief(data) {
  string(data.scout_note);string(data.strategist_note);
  if(!Array.isArray(data.ideas)||data.ideas.length!==5)throw new Error('Expected five ideas.');
  return {...data,ideas:data.ideas.map(idea=>({id:crypto.randomUUID(),title:string(idea.title,120),pitch:string(idea.pitch),sector:string(idea.sector,120)}))};
}
export function validateRanking(data,ideas) {
  string(data.skeptic_note);
  if(!Array.isArray(data.ranked)||data.ranked.length!==ideas.length)throw new Error('Incomplete ranking.');
  const seen=new Set();
  return data.ranked.map(r=>{const idea=ideas.find(i=>i.id===r.id);if(!idea||seen.has(r.id)||!Number.isInteger(r.score)||r.score<1||r.score>10)throw new Error('Mismatched ranking.');seen.add(r.id);return {...idea,score:r.score,verdict:string(r.verdict)};}).sort((a,b)=>b.score-a.score);
}
export function validatePrototype(data) {string(data.html,150000);string(data.architect_note);string(data.stack,120);return data;}
export function isolatedDocument(html) {
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">'+html;
}
