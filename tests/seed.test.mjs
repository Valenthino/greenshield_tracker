import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBackup} from '../src/lib/records.js';
test('repository seed is valid and contains no prospect or personal data',()=>{
  const records=parseBackup(JSON.parse(readFileSync(new URL('../src/data/seed.json',import.meta.url),'utf8')));
  assert.deepEqual(records,[]);
});
