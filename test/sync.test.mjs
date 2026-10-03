import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {sync,syncNow,setToken} from '../public/js/sync.js';
import {idb} from '../public/js/db.js';
import * as S from '../public/js/store.js';

test('switching libraries waits for a slow old pull and resets the new cursor', async () => {
  const previousFetch=globalThis.fetch;
  const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  let release,started;
  const startedPull=new Promise(resolve=>{started=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const requests=[];
  let first=true;
  globalThis.fetch=async (url,options)=>{
    const token=options.headers.authorization,body=options.body?JSON.parse(options.body):null;
    requests.push({url,token,body});
    if(first&&url==='/api/sync'){first=false;started();await held;}
    return Response.json(url==='/api/ping'?{ok:true}:{rows:[],cursor:token==='Bearer old-library-token'?42:3,more:false});
  };
  try {
    await S.load();S.state.settingsDirty=false;
    await S.addWords([S.makeWord({lemma:'Tisch',zh:'table'})]);
    sync.token='old-library-token';sync.cursor=0;
    await idb.setKV('token',sync.token);
    const oldSync=syncNow();await startedPull;
    const switching=setToken('new-library-token');
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(sync.token,'old-library-token');
    assert.equal(requests.length,1,'new requests started before the old pull completed');
    release();await oldSync;await switching;
    assert.equal(sync.token,'new-library-token');assert.equal(sync.cursor,3);
    const newPull=requests.find(r=>r.token==='Bearer new-library-token'&&r.url==='/api/sync');
    assert.equal(newPull.body.since,0);
    assert.ok(requests.some(r=>r.token==='Bearer new-library-token'&&r.body?.changes.some(c=>c.kind==='word')));
  } finally {
    release();await setToken('');globalThis.fetch=previousFetch;
    if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else delete globalThis.navigator;
  }
});
