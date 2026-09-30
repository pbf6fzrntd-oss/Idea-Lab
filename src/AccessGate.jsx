import React,{useEffect,useState} from 'react';
export default function AccessGate({children}) {
  const [session,setSession]=useState(null),[key,setKey]=useState(''),[error,setError]=useState('');
  async function check(){try{const res=await fetch('/api/session');if(!res.ok)throw new Error();setSession(await res.json());setError('');}catch{setError('API unavailable. Start the server, then retry.');}}
  useEffect(()=>{check();},[]);
  async function login(e){e.preventDefault();try{const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessKey:key})});const data=await res.json();if(!res.ok)throw new Error(data.error);setKey('');await check();}catch(e){setError(e.message);}}
  const style={background:'#12151c',color:'#ece7da',padding:20,fontFamily:'system-ui'};
  if(!session?.authenticated)return <main style={style}><h1>Idea Lab private pilot</h1>{session && <form onSubmit={login}><label>Access key <input type="password" autoComplete="current-password" value={key} onChange={e=>setKey(e.target.value)} required /></label><button>Sign in</button></form>}<p role="alert">{error}</p><button onClick={check}>Retry connection</button></main>;
  return <><div style={style}>{session.mode==='example'?'Fictional example mode — fixed ideas and scores; no paid calls.':'Live generation — shared private pilot with bounded request budgets.'} <span>Sessions are stored only in this browser.</span>{session.mode==='live'&&<button onClick={async()=>{await fetch('/api/logout',{method:'POST'});check();}}>Sign out</button>}</div>{children}</>;
}
