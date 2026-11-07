/** Fail-closed local artifact writer: create once, allow identical rerun, reject a different overwrite. */
import {mkdirSync,writeFileSync,readFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {UnsafeCaseError} from './engine.mjs';
const projectRoot=resolve(join(dirname(fileURLToPath(import.meta.url)),'..'));
const artifactRoot=join(projectRoot,'artifacts');
export function writeArtifactOnce(name,data){
 if(!/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(name)||name.includes('..'))throw new UnsafeCaseError('unsupported artifact filename');
 if(typeof data!=='string'||data.length>2*1024*1024)throw new UnsafeCaseError('invalid/oversized artifact');
 mkdirSync(artifactRoot,{recursive:true});
 if(lstatSync(artifactRoot).isSymbolicLink()||realpathSync(artifactRoot)!==artifactRoot)throw new UnsafeCaseError('redirected artifact folder');
 const p=join(artifactRoot,name);
 try{writeFileSync(p,data,{flag:'wx',mode:0o600});}
 catch(e){
  if(e.code!=='EEXIST')throw e;
  if(!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()||!realpathSync(p).startsWith(artifactRoot+sep)||readFileSync(p,'utf8')!==data)throw new UnsafeCaseError('existing artifact differs: refuse overwrite');
 }
 if(readFileSync(p,'utf8')!==data)throw new Error('artifact postwrite readback failed');
 return p;
}
