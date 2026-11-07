/** Fixed local evidence reader: bounded bytes, read-only descriptors, no code loading. */
import {constants,lstatSync,openSync,fstatSync,readSync,closeSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';

const FILES = Object.freeze({
  checkoutEvidence: ['checkout-e1-experiment.json', 2 * 1024 * 1024],
  checkoutRegression: ['checkout-retry.generated.test.mjs', 64 * 1024],
  queueEvidence: ['queue-g3-experiment.json', 2 * 1024 * 1024],
  queueRegression: ['queue-lost-ack.generated.test.mjs', 64 * 1024],
  tenantEvidence: ['tenant-g3-experiment.json', 2 * 1024 * 1024],
  tenantRegression: ['tenant-read.generated.test.mjs', 64 * 1024],
});

const hold = () => new Error('LOCAL_EVIDENCE_READ_HOLD');
function sameIdentity(a,b) {return a.dev===b.dev&&a.ino===b.ino;}

export function readFixedEvidenceText(directory,key) {
  if(typeof directory!=='string'||directory.length===0||typeof key!=='string'||!Object.hasOwn(FILES,key)) throw hold();
  const root=resolve(directory);
  const rootStat=lstatSync(root);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||realpathSync(root)!==root) throw hold();
  const [name,maximum]=FILES[key];
  const path=join(root,name);
  const before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink()||before.size>maximum) throw hold();
  const flags=constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0);
  const fd=openSync(path,flags);
  try {
    const opened=fstatSync(fd);
    if(!opened.isFile()||opened.size>maximum||!sameIdentity(before,opened)) throw hold();
    const bytes=Buffer.alloc(maximum+1);
    let used=0;
    while(used<bytes.length) {
      const n=readSync(fd,bytes,used,bytes.length-used,null);
      if(n===0)break;
      used+=n;
    }
    const after=fstatSync(fd);
    const rootAfter=lstatSync(root);
    if(used>maximum||used!==opened.size||after.size!==opened.size||
       after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs||
       !sameIdentity(rootStat,rootAfter)||realpathSync(root)!==root) throw hold();
    const raw=bytes.subarray(0,used);
    const text=raw.toString('utf8');
    if(!Buffer.from(text,'utf8').equals(raw)) throw hold();
    return text;
  } finally {closeSync(fd);}
}
