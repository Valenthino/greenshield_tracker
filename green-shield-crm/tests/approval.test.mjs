import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/lib/database.js';
import {blankLead} from '../src/lib/records.js';
test('server invalidates approval when an approved draft changes',()=>{const dir=mkdtempSync(join(tmpdir(),'gs-approval-'));try{const record={...blankLead('GS-01'),company:'Test company',approval:'Approved',stage:'Approved',approvedBy:'Reviewer',approvedAt:'2026-10-30',emailBody:'Original'};const store=createStore(join(dir,'crm.json'),[record]);const result=store.update('GS-01',{...record,emailBody:'Changed'},1);assert.equal(result.record.approval,'Not reviewed');assert.equal(result.record.stage,'Ready for review');assert.equal(result.record.approvedBy,'');assert.equal(result.record.approvedAt,'');}finally{rmSync(dir,{recursive:true,force:true});}});
