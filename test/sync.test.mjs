import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {sync,syncNow,setToken,nextPollMinutes} from '../public/js/sync.js';
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

test('a library erased elsewhere clears this device and the old changes are not sent again', async () => {
  const previousFetch = globalThis.fetch;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLibraryReset: undefined, onLine: true }, configurable: true });
  const requests = [];
  let first = true;
  globalThis.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, body });
    if (first && url === '/api/sync') {
      first = false;
      return Response.json({ reset: true, epoch: 77, rows: [], cursor: 0, more: false, accepted: 0 });
    }
    return Response.json({ rows: [], cursor: 0, epoch: 77, more: false });
  };
  try {
    await S.load();
    await S.addWords([S.makeWord({ lemma: 'Alt', zh: 'old' })]);
    await S.saveWord(S.liveWords()[0]);
    sync.token = 'erased-library-token';
    sync.epoch = 5;
    sync.cursor = 9;
    await syncNow();
    assert.equal(S.liveWords().length, 0, 'words of the erased library are still here');
    assert.deepEqual([sync.epoch, sync.cursor], [77, 0]);
    assert.equal(await idb.getKV('epoch', null), 77);
    const syncs = requests.filter((r) => r.url === '/api/sync');
    assert.equal(syncs[0].body.epoch, 5);
    assert.ok(syncs.slice(1).every((r) => r.body.epoch === 77 && r.body.since === 0));
    assert.ok(!syncs.slice(1).some((r) => r.body.changes.some((c) => c.kind === 'word')), 'old words were uploaded again');
  } finally {
    await setToken('');
    globalThis.fetch = previousFetch;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('day summaries are uploaded once, and old logs from the server are not stored again', async () => {
  const previousFetch = globalThis.fetch;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  const DAY = 86_400_000;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, body });
    const old = { kind: 'log', id: 'ancient', updated_at: Date.now() - 200 * DAY, data: { id: 'ancient', w: 'x', t: 'meaning', g: 3, ts: Date.now() - 200 * DAY, ms: 1, st: 'review' } };
    const day = { kind: 'day', id: '2025-01-02', updated_at: 8, deleted: false, data: { id: '2025-01-02', day: 1, n: 12, again: 2, ms: 100 } };
    return Response.json({ rows: requests.length === 1 ? [old, day] : [], cursor: 5, epoch: 0, more: false });
  };
  try {
    await S.load();
    await S.resetLocalLibrary();
    S.state.logs = [{ id: 'old-local', w: 'w', t: 'meaning', g: 1, ts: Date.now() - 300 * DAY, ms: 500, st: 'review', synced: true }];
    sync.token = 'days-library-token';
    sync.epoch = null;
    sync.cursor = 0;
    await syncNow();
    // received: the day summary is kept, the expired log is not
    assert.equal(S.state.days.get('2025-01-02').n, 12);
    assert.ok(!S.state.logs.some((l) => l.id === 'ancient'));
    // the local expired log was folded into a summary after that sync, and the next one uploads it
    const dayUploads = () => requests.flatMap((r) => r.body?.changes || []).filter((c) => c.kind === 'day');
    assert.equal(dayUploads().length, 0);
    assert.ok([...S.state.days.values()].some((d) => d.dirty && d.n === 1 && d.again === 1));
    await syncNow();
    assert.equal(dayUploads().length, 1);
    assert.deepEqual([dayUploads()[0].data.n, dayUploads()[0].data.again], [1, 1]);
    await syncNow();
    assert.equal(dayUploads().length, 1, 'the same summary was uploaded twice');
    assert.ok([...S.state.days.values()].every((d) => !d.dirty));
  } finally {
    await setToken('');
    globalThis.fetch = previousFetch;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('polling backs off while nothing happens, up to half an hour', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(nextPollMinutes), [5, 10, 20, 30, 30, 30]);
});
