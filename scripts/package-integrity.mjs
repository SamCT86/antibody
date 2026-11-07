/** E1 local bundle integrity. SHA-256 proves byte consistency, NOT authorship or safety. */
import {createHash} from 'node:crypto';
import {constants,existsSync,readdirSync,lstatSync,realpathSync,writeFileSync,renameSync,unlinkSync,openSync,fstatSync,readSync,closeSync} from 'node:fs';
import {resolve,join,relative,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dirs=['docs','scripts','src','tests'];
const tops=['.gitignore','.gitattributes','CHANGELOG.md','README.md','package.json','tsconfig.json','LICENSE','SECURITY.md','CONTRIBUTING.md','SOURCE_PROVENANCE.md'];
const nameOK=/^[A-Za-z0-9_.\/-]+$/;
const hex=/^[0-9a-f]{64}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const byteSha=file=>hash(readLocalBytes(file,4*1024*1024));
function reject(message){throw new Error(message)}
// Source and manifest are data. Bounds apply to the descriptor read itself.
function readLocalBytes(path,maximum){
 const before=lstatSync(path);
 if(!before.isFile()||before.isSymbolicLink()||before.size>maximum)reject('BAD_FILE');
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{
  const opened=fstatSync(fd);
  if(!opened.isFile()||opened.size>maximum||opened.dev!==before.dev||opened.ino!==before.ino)reject('BAD_FILE');
  const bytes=Buffer.alloc(Math.min(maximum+1,opened.size+1));let used=0;
  while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(n===0)break;used+=n;}
  const after=fstatSync(fd);
  if(used>maximum||used!==opened.size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)reject('BAD_FILE');
  return bytes.subarray(0,used);
 }finally{closeSync(fd);}
}
function publicReason(error){
 const reason=typeof error?.message==='string'?error.message:'';
 return /^(?:[A-Z][A-Z_]+|HASH_MISMATCH:[A-Za-z0-9_.\/-]+)$/.test(reason)?reason:'SOURCE_INPUT_UNAVAILABLE';
}
function ensureFile(path,base){
 const actual=realpathSync(path),realBase=realpathSync(base);
 if(!(actual.startsWith(realBase+sep)))reject('OUTSIDE_ROOT');
 const stat=lstatSync(path);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>4*1024*1024)reject('BAD_FILE');
}
export function packageFiles(base=root){
 const files=[];
 // The source root is closed, not only its named subdirectories. Git metadata
 // is deliberately outside the source manifest; never follow redirected metadata.
 const allowedRoot=new Set([...tops,...dirs,'SHA256SUMS.txt','.git']);
 for(const name of readdirSync(base)){
  if(!allowedRoot.has(name))reject('UNLISTED_ROOT_ENTRY');
  if(name==='.git'){
   const metadata=lstatSync(join(base,name));
   if(metadata.isSymbolicLink()||(!metadata.isFile()&&!metadata.isDirectory()))reject('BAD_GIT_METADATA');
  }
 }
 function recurse(rel){
  const path=join(base,...rel.split('/'));
  if(realpathSync(path)!==path||lstatSync(path).isSymbolicLink())reject('REDIRECTED_DIRECTORY');
  for(const name of readdirSync(path).sort()){
   const childRel=rel+'/'+name,full=join(path,name),st=lstatSync(full);
   if(!nameOK.test(childRel)||st.isSymbolicLink())reject('BAD_PATH');
   if(st.isDirectory())recurse(childRel);
   else if(st.isFile()) {ensureFile(full,base);files.push(childRel);}
   else reject('UNEXPECTED_OBJECT');
  }
 }
 for(const file of tops){const full=join(base,file);ensureFile(full,base);files.push(file);}
 for(const dir of dirs)recurse(dir);
 return files.sort();
}
export function buildManifest(base=root){
 const files=packageFiles(base);
 return files.map(rel=>byteSha(join(base,...rel.split('/')))+'  '+rel).join('\n')+'\n';
}
export function verifyManifestRaw(raw,base=root){
 try {
  if(typeof raw!=='string'||raw.length>128000||!raw.endsWith('\n'))reject('BAD_MANIFEST_BYTES');
  const lines=raw.slice(0,-1).split('\n');
  if(!lines.length||lines.length>500)reject('INVALID_ENTRY_COUNT');
  const entries=lines.map(line=>{
   const m=/^([0-9a-f]{64})  ([A-Za-z0-9_.\/-]+)$/.exec(line);
   if(!m)reject('BAD_ENTRY');
   const rel=m[2];
   if(rel.includes('..')||rel.startsWith('/')||rel.includes('\\')||!nameOK.test(rel))reject('PATH_UNSAFE');
   return {sha:m[1],rel};
  });
  const listed=entries.map(x=>x.rel),actual=packageFiles(base);
  if(listed.join('\n')!==[...listed].sort().join('\n'))reject('UNSORTED');
  if(new Set(listed).size!==listed.length)reject('DUPLICATED_PATH');
  if(listed.join('\n')!==actual.join('\n'))reject('MISSING_OR_EXTRA_FILE');
  for(const e of entries){if(byteSha(join(base,...e.rel.split('/')))!==e.sha)reject('HASH_MISMATCH:'+e.rel);}
  return {ok:true,files:entries.length,manifestSha256:hash(raw)};
 }catch(e){return {ok:false,reason:publicReason(e)};}
}
export function verifyOnDisk(base=root){
 const file=join(base,'SHA256SUMS.txt');
 try{
  if(!existsSync(file))return {ok:false,reason:'MISSING_MANIFEST'};
  const raw=readLocalBytes(file,128000),text=raw.toString('utf8');
  if(!Buffer.from(text,'utf8').equals(raw))return {ok:false,reason:'BAD_MANIFEST_BYTES'};
  return verifyManifestRaw(text,base);
 }catch(e){return {ok:false,reason:publicReason(e)};}
}
function main(){
 const op=process.argv[2]||'verify';
 if(op==='verify'){
  const verdict=verifyOnDisk();console.log(JSON.stringify(verdict));if(!verdict.ok)process.exitCode=2;
 }else if(op==='generate'){
  const option=process.argv[3]||'';
  const expected=option.startsWith('--prestate=')?option.slice(11):'';
  const path=join(root,'SHA256SUMS.txt');
  if(!existsSync(path)||!hex.test(expected)||byteSha(path)!==expected)reject('NO_MATCHING_PRESTATE_HASH');
  const next=buildManifest();
  const temp=join(root,'SHA256SUMS.txt.new');
  if(existsSync(temp))reject('TEMP_ALREADY_EXISTS');
  try{writeFileSync(temp,next,{encoding:'utf8',flag:'wx',mode:0o600});renameSync(temp,path);}
  finally{if(existsSync(temp))unlinkSync(temp);}
  const verdict=verifyOnDisk();console.log(JSON.stringify(verdict));if(!verdict.ok)process.exitCode=2;
 }else reject('UNSUPPORTED_COMMAND');
}
function invokedDirectly(){
 if(typeof import.meta.main==='boolean')return import.meta.main;
 try{return Boolean(process.argv[1])&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}
 catch{return false;}
}
if(invokedDirectly()){
 try{main();}catch{console.error('HOLD: source manifest operation failed');process.exitCode=2;}
}
