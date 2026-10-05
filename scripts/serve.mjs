import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT)||4173;
http.createServer(async(req,res)=>{
  try{
    const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(requestPath!=='/'&&requestPath!=='/index.html'){res.writeHead(404);res.end('Not found');return;}
    const file=path.join(root,'index.html');
    const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log(`A heart, for you: http://localhost:${port}`));
