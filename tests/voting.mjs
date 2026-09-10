import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../worker.js', import.meta.url), 'utf8'))
  .replace('import { DurableObject } from "cloudflare:workers";', 'class DurableObject { constructor(ctx, env) { this.ctx=ctx; this.env=env; } }');
const { default: worker, CampfireStore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const db = new DatabaseSync(':memory:');
const sql = { exec(query, ...args) {
  if (query.includes('CREATE TABLE IF NOT EXISTS embers')) { db.exec(query); return []; }
  const statement = db.prepare(query);
  if (statement.columns().length) return statement.all(...args);
  statement.run(...args); return [];
} };
const store = new CampfireStore({storage:{sql}}, {});
for (let i=0; i<13; i++) db.prepare(`INSERT INTO voices (id,song,quoted_line,interpretation,model,provenance,status,submitted_at,fingerprint,contribution_number) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(`voice-${i}`, 'discipline', 'A lyric', 'A substantive reading of this lyric for a database test.', 'Test', 'agent-direct', i===12?'pending':'approved', `2026-09-${String(i+1).padStart(2,'0')}T00:00:00Z`, `fp-${i}`, i+1);
const env={CAMPFIRE_HASH_SALT:'test-only-salt',CAMPFIRE:{idFromName(){return 'test';},get(){return store;}}};
async function vote(body, ip='192.0.2.1', extra={}) {
  const response = await worker.fetch(new Request('https://bloodyhopes.com/api/campfire/vote',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip,...extra},body:JSON.stringify(body)}),env,{});
  return {status:response.status,data:await response.json()};
}
assert.equal((await vote({voice_id:'voice-12'})).status,404);
assert.equal((await vote({voice_id:'missing'})).status,404);
assert.equal((await vote({voice_id:'voice-0',owner_test:'false'})).status,400);
assert.equal((await vote({voice_id:'voice-0',voter_key:'forged'})).status,400);
assert.equal((await vote({voice_id:'voice-0'},'')).status,503);
assert.equal((await vote({voice_id:'voice-0'},'192.0.2.1',{origin:'https://other.example'})).status,403);
const test = await vote({voice_id:'voice-0',owner_test:true,model:'Owner test'});
assert.equal(test.data.upvotes,0); assert.equal(test.data.test_upvotes,1);
const first=await vote({voice_id:'voice-0'}); assert.equal(first.data.upvotes,1);
const duplicate=await vote({voice_id:'voice-0',model:'Another model label'});
assert.equal(duplicate.data.already_voted,true); assert.equal(duplicate.data.upvotes,1);
const simultaneous=await Promise.all([vote({voice_id:'voice-1'}),vote({voice_id:'voice-1'})]);
assert.equal(simultaneous.filter(r=>r.data.already_voted).length,1);
for (let i=2;i<=8;i++) assert.equal((await vote({voice_id:`voice-${i}`})).status,200);
assert.equal((await vote({voice_id:'voice-9'})).status,429);
assert.equal((await vote({voice_id:'voice-0'})).data.already_voted,true);
// A different network can vote; changing a model name could not multiply votes.
assert.equal((await vote({voice_id:'voice-0'},'192.0.2.2')).data.upvotes,2);
let publicState=await (await store.fetch(new Request('https://store/public'))).json();
assert.equal(publicState.voices[0].id,'voice-0');
assert.equal(publicState.voices[0].upvotes,2);
assert.equal(publicState.voices[1].id,'voice-8');
assert.equal(publicState.voting.owner_test_votes,1);
assert.equal(publicState.voting.unverified_votes,10);
assert.equal(publicState.voting.verified_spontaneous_votes,null);
assert.ok(!JSON.stringify(publicState).includes('voter_key'));
// A previously top-ranked review disappears when moderation withdraws it.
db.prepare("UPDATE voices SET status='rejected' WHERE id='voice-0'").run();
publicState=await (await store.fetch(new Request('https://store/public'))).json();
assert.ok(!publicState.voices.some(v=>v.id==='voice-0'));
assert.equal(publicState.voting.owner_test_votes,0);
// MCP uses the same protected voting path and preserves test provenance.
const mcp=await worker.fetch(new Request('https://bloodyhopes.com/mcp',{method:'POST',headers:{'content-type':'application/json','mcp-protocol-version':'2025-11-25','cf-connecting-ip':'192.0.2.3'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'upvote_voice',arguments:{voice_id:'voice-10',owner_test:true}}})}),env,{});
const result=await mcp.json(); assert.equal(result.result.structuredContent.owner_test,true); assert.equal(result.result.structuredContent.upvotes,0);
console.log('Voting tests passed: real SQLite persistence, ranking, duplicate/retry/concurrent votes, test exclusion, rate limiting, moderation, API guards and MCP.');
db.close();
