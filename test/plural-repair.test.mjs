import 'fake-indexeddb/auto';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/js/store.js';
import {idb} from '../public/js/db.js';

const word = (lemma='Fahrrad',plural='Fahrradräder') => ({
  ...S.makeWord({lemma,plural,article:'das',pos:'noun',zh:'bicycle',notes:'my note',tags:['lesson']}),
  createdAt:100,updatedAt:300,editedAt:100,batch:90,dirty:false,artMiss:2,resetAt:10,
  cards:{meaning:{state:'review',reps:7,lapses:2,last:200,due:9000,s:12,d:4},article:{state:'review',reps:3,last:180,due:8000}},
});
const dump=async()=>({words:await idb.all('words'),logs:await idb.all('logs'),kv:await idb.all('kv')});
const content=w=>{const{plural,updatedAt,editedAt,dirty,...rest}=w;return rest};
beforeEach(async()=>{await Promise.all(['words','logs','kv'].map(store=>idb.clear(store)))});

test('opening an old library repairs only the plural and sync metadata, exactly once',async()=>{
  const bad=word(),good=word('Kellnerin','Kellnerinnen'),manual=word('Fahrrad','Fahrradräder / Fahrräder'),deleted={...word(),deleted:true};
  await idb.putMany('words',[bad,good,manual,deleted]);
  await idb.putMany('logs',[{id:'history',w:bad.id,t:'meaning',ts:200,g:3,ms:1234,synced:true}]);
  for(const [key,value]of Object.entries({settings:{value:{...S.DEFAULT_SETTINGS,newPerDay:8},dirty:false},token:'personal-library',cursor:123,lastSync:456,days:{'2026-01-01':{id:'2026-01-01',n:10,again:2,ms:500}},extraNew:{day:100,n:3},lastBackup:999}))await idb.setKV(key,value);
  const before=await dump();await S.load();const after=await dump(),fixed=after.words.find(w=>w.id===bad.id);
  assert.equal(fixed.plural,'Fahrräder');assert.deepEqual(content(fixed),content(bad));assert(fixed.updatedAt>bad.updatedAt);assert(fixed.editedAt>bad.editedAt);assert(fixed.dirty);
  for(const w of [good,manual,deleted])assert.deepEqual(after.words.find(x=>x.id===w.id),w);
  assert.deepEqual(after.logs,before.logs);assert.deepEqual(after.kv,before.kv);
  assert.deepEqual(S.state.words.get(bad.id).cards,bad.cards);
  await S.load();assert.deepEqual(await dump(),after,'a second opening does not write or bump timestamps again');
});

test('a newer review or edit committed before the repair lock is preserved',async()=>{
  const bad=word();await idb.put('words',bad);
  const latest={...structuredClone(bad),notes:'new note',updatedAt:500,cards:{...bad.cards,meaning:{...bad.cards.meaning,reps:8,last:400,due:15000}}};
  const patch=idb.patchMany;
  idb.patchMany=async(...args)=>{await idb.put('words',latest);return patch.apply(idb,args)};
  try{await S.load()}finally{idb.patchMany=patch}
  const fixed=await idb.get('words',bad.id);assert.equal(fixed.plural,'Fahrräder');assert.deepEqual(content(fixed),content(latest));
  assert.deepEqual(S.state.words.get(bad.id).cards,latest.cards);
});

test('a failed repair rolls back the whole batch and leaves the library usable for retry',async()=>{
  const a=word(),b=word('Lieblingsfach','Lieblingsfachfächer');await idb.putMany('words',[a,b]);
  await idb.put('logs',{id:'keep',w:a.id,ts:200,g:2});await idb.setKV('token','keep-token');const before=await dump();
  const put=IDBObjectStore.prototype.put;let writes=0;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='words'&&++writes===2)throw new DOMException('test quota failure','QuotaExceededError');return put.apply(this,args)};
  try{await S.load()}finally{IDBObjectStore.prototype.put=put}
  assert.equal(writes,2);assert.deepEqual(await dump(),before);assert.equal(S.state.words.get(a.id).plural,a.plural);
  await S.load();assert.equal((await idb.get('words',a.id)).plural,'Fahrräder');assert.equal((await idb.get('words',b.id)).plural,'Lieblingsfächer');
  assert.deepEqual((await dump()).logs,before.logs);assert.deepEqual((await dump()).kv,before.kv);
});

test('syncing the correction keeps review cards and cannot restore an older bad plural',async()=>{
  const original=word();await idb.put('words',original);await S.load();const fixed=await idb.get('words',original.id);
  assert.equal(S.reconcile(fixed,original),null);
  const other={...structuredClone(original),updatedAt:600,cards:{...original.cards,meaning:{...original.cards.meaning,last:550,reps:8,due:18000}}};
  const merged=S.reconcile(fixed,other);assert.equal(merged.plural,'Fahrräder');assert.deepEqual(merged.cards,other.cards);assert.equal(merged.id,original.id);
});
