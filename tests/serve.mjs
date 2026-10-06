import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';

const root=resolve('docs');
const server=createServer((req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const path=resolve(root,'.'+(pathname==='/'?'/character.html':pathname));
    if(!path.startsWith(root+sep)||!existsSync(path)||!statSync(path).isFile()){res.writeHead(404);res.end();return;}
    const mime={'.html':'text/html; charset=utf-8','.webp':'image/webp','.png':'image/png','.md':'text/plain; charset=utf-8'};
    res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(readFileSync(path));
  }catch{res.writeHead(400);res.end();}
});
server.listen(Number(process.argv[2]??0),'127.0.0.1',()=>console.log(`Character preview: http://127.0.0.1:${server.address().port}/character.html`));
