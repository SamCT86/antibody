/** Detect a specific failed TAP test title, not a random failure plus a passed target. */
export function wasNamedTestFailed(tapOutput,expectedTitle) {
 if(typeof tapOutput!=='string'||typeof expectedTitle!=='string'||!expectedTitle.trim()) return false;
 return tapOutput.split(/\r?\n/).some(line=>{
   const match=line.match(/^\s*not ok\s+\d+\s+-\s+(.+?)\s*$/);
   return match!==null && match[1].includes(expectedTitle);
 });
}
