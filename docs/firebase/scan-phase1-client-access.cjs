#!/usr/bin/env node
// Run from repository root: node docs/firebase/scan-phase1-client-access.cjs
// Defensive static scan. Never executes the application or contacts Firebase.
const fs=require('node:fs'),path=require('node:path');
const sensitive=['lasala-admin-audit-v1','lasala-config-infra-v1','lasala-qc-mediciones-v1','lasala-qc-fotos-sharepoint-v1'];
const roots=['index.html','admin','assets'];
const allowedExtensions=new Set(['.js','.mjs','.cjs','.html']);
let scanned=0,hits=[],missing=[];
function walk(p){
  if(!fs.existsSync(p)){missing.push(p);return}
  const st=fs.statSync(p);
  if(st.isDirectory()){
    for(const f of fs.readdirSync(p))if(!f.startsWith('.'))walk(path.join(p,f));
    return;
  }
  if(!allowedExtensions.has(path.extname(p)))return;
  scanned++;
  const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
  for(let i=0;i<lines.length;i++)for(const key of sensitive){
    if(lines[i].includes(key))hits.push({file:p,line:i+1,key,text:lines[i].trim().slice(0,180)});
  }
}
roots.forEach(walk);
console.log(JSON.stringify({scanned,missing,hits},null,2));
if(missing.length||hits.length)process.exitCode=1;
