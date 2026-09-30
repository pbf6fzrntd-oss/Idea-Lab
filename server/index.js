import dotenv from 'dotenv';
import {createApp} from './app.js';
dotenv.config();
const origin=process.env.APP_ORIGIN||'http://localhost:5173';
if(process.env.NODE_ENV==='production' && !origin.startsWith('https://')) throw new Error('Production requires an HTTPS APP_ORIGIN.');
const {app,close}=createApp({demo:process.env.IDEA_LAB_DEMO==='1',accessKey:process.env.IDEA_LAB_ACCESS_KEY,apiKey:process.env.ANTHROPIC_API_KEY,origin,database:process.env.IDEA_LAB_DATABASE||'.local/requests.sqlite'});
const server=app.listen(process.env.PORT||3001,process.env.HOST||'127.0.0.1',()=>console.log('Idea Lab API started.'));
process.on('SIGTERM',()=>server.close(()=>{close();process.exit(0);}));
