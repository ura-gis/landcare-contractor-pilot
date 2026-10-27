const PREFIX='landcare-draft:';
export function draftKey(assignments) {return PREFIX+JSON.stringify([assignments[0].organization,assignments[0].period,assignments.map(a=>a.parcelNumber).sort()]);}
export function readDraft(key) {
 try {const value=JSON.parse(sessionStorage.getItem(key)||'null');if(value&&Date.now()-value.savedAt<86400000) return value;} catch {}return null;
}
export function saveDraft(key,values) {
 try {sessionStorage.setItem(key,JSON.stringify({savedAt:Date.now(),comments:String(values.comments||''),did_you_fulfill_your_obligation:['Yes','No'].includes(values.did_you_fulfill_your_obligation)?values.did_you_fulfill_your_obligation:'Yes'}));} catch {}
}
export function clearDraft(key) {try {sessionStorage.removeItem(key);} catch {}}
