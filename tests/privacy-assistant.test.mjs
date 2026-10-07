import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeField,reviewFields,publishReview,applySuggestion,dismissSuggestion,proceedWithCurrentChoices,PrivacyPreference} from '../ui/sovereign/privacy-assistant.mjs';
function storage(){const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),data};}
const draft=()=>({bio:{value:'Call me at 9876543210',visibility:'public'},college:{value:'GCET',visibility:'public'},email:{value:'me@example.test',visibility:'private'}});
test('assistant defaults OFF for every new wallet; settings persist only a boolean',()=>{
  const local=storage(),alice=new PrivacyPreference(local,'wallet-a');assert.equal(alice.snapshot(),false);
  alice.enableWithConsent(true);assert.equal(new PrivacyPreference(local,'wallet-a').snapshot(),true);
  assert.equal(new PrivacyPreference(local,'wallet-b').snapshot(),false);
  assert.deepEqual([...local.data.values()],['true']);
});
test('OFF means no analysis and no reading of profile content',()=>{
  const inaccessible=new Proxy({},{get(){throw new Error('Content must not be accessed');}});
  let calls=0;assert.equal(reviewFields(false,inaccessible,['bio'],()=>{calls++;}).status,'off');
  assert.equal(publishReview(false,inaccessible,['bio'],()=>{calls++;}).issues.length,0);assert.equal(calls,0);
});
test('explicit consent is required; cancelling or unsupported consent never enables',()=>{
  const p=new PrivacyPreference(storage(),'test');for(const value of [undefined,false,'true',{},1]){assert.equal(p.enableWithConsent(value),false);assert.equal(p.snapshot(),false);}
  assert.equal(p.enableWithConsent(true),true);assert.equal(p.snapshot(),true);
});
test('disabling stops analysis and does not alter the saved/draft visibility',()=>{
  const fields=draft(),before=structuredClone(fields),p=new PrivacyPreference(storage(),'test');p.enableWithConsent(true);p.disable();
  assert.equal(reviewFields(p.snapshot(),fields,['bio'],()=>{throw new Error('Must not run');}).status,'off');assert.deepEqual(fields,before);
});
test('selection is required: unselected fields are not read or analyzed',()=>{
  const fields={bio:{value:'Hi',visibility:'public'}};Object.defineProperty(fields,'email',{get(){throw new Error('Unselected secret');}});
  assert.equal(reviewFields(true,fields,[]).suggestions.length,0);
  assert.equal(reviewFields(true,fields,['bio']).status,'ok');
});
test('suggestions alone never change field value or visibility',()=>{
  const fields=draft(),before=structuredClone(fields);const r=reviewFields(true,fields,['bio','college']);assert.equal(r.suggestions.length,2);assert.deepEqual(fields,before);
});
test('Apply changes only the selected field privacy selector; Ignore changes nothing',()=>{
  const fields=draft(),before=structuredClone(fields),suggestions=reviewFields(true,fields,['bio','college']).suggestions;
  const applied=applySuggestion(fields,suggestions[0]);assert.equal(applied.bio.visibility,'private');assert.equal(applied.bio.value,fields.bio.value);
  assert.equal(applied.college,fields.college);assert.equal(applied.email,fields.email);assert.deepEqual(fields,before);
  assert.deepEqual(dismissSuggestion(suggestions,'bio').map(s=>s.fieldType),['college']);assert.deepEqual(fields,before);
});
test('manual override after Apply wins and Publish anyway uses current choices',async()=>{
  const fields=draft(),s=reviewFields(true,fields,['bio']).suggestions[0],applied=applySuggestion(fields,s);
  const overridden={...applied,bio:{...applied.bio,visibility:'public'}};let sent;
  await proceedWithCurrentChoices(()=>{sent=overridden;});assert.equal(sent.bio.visibility,'public');assert.equal(sent.bio.value,fields.bio.value);
});
test('pre-publish review detects phone-like information in a Public bio',()=>{
  const result=publishReview(true,draft(),['bio']);assert.equal(result.issues[0].recommendedVisibility,'private');assert.match(result.issues[0].warning,/phone/);
});
test('pre-publish review detects email-like information in another field',()=>{
  const fields={bio:{value:'Email me: name@example.com',visibility:'public'}};const r=publishReview(true,fields,['bio']);assert.equal(r.issues.length,1);assert.match(r.issues[0].warning,/email/);
});
test('baseline recommendations are explainable and never broaden a restricted field',()=>{
  for(const [fieldType,expected] of [['displayName','public'],['username','public'],['bio','public'],['website','public'],['college','followers'],['email','private'],['phone','private']]){
    assert.equal(analyzeField({fieldType,value:'Example text',currentVisibility:'public'}).recommendedVisibility,expected);
    assert.equal(analyzeField({fieldType,value:'Example text',currentVisibility:'private'}).recommendedVisibility,'private');
  }
});
test('possible addresses, identity details and sensitive URLs receive local warnings',()=>{
  for(const value of ['12 Green Road','passport 123456','https://example.test/?token=sensitive']){
    const result=analyzeField({fieldType:'bio',value,currentVisibility:'public'});assert.equal(result.recommendedVisibility,'private');assert.ok(result.warning);
  }
});
test('analysis failure does not block editing, Save or Publish',async()=>{
  const fields=draft(),result=publishReview(true,fields,['bio'],()=>{throw new Error('Failure containing private data');});
  assert.equal(result.status,'unavailable');assert.deepEqual(result.issues,[]);assert.ok(!JSON.stringify(result).includes('private data'));
  fields.bio.value='A manual edit after failure';let saved=0,published=0;
  await proceedWithCurrentChoices(()=>{saved++;published++;});assert.equal(saved,1);assert.equal(published,1);assert.equal(fields.bio.value,'A manual edit after failure');
});
test('analysis functions receive only field type, chosen value and current visibility',()=>{
  const fields=draft();Object.defineProperty(fields,'token',{get(){throw new Error('Auth secret accessed');}});
  Object.defineProperty(fields.bio,'privateKey',{get(){throw new Error('Wallet secret accessed');}});
  const seen=[];const r=reviewFields(true,fields,['bio','token','dm','privateKey'],input=>{seen.push(input);return analyzeField(input);});
  assert.equal(r.status,'ok');assert.equal(seen.length,1);assert.deepEqual(Object.keys(seen[0]).sort(),['currentVisibility','fieldType','value']);
  assert.equal(JSON.stringify(r).includes(fields.bio.value),false);
});
test('assistant cannot write role flags, add fields or change authorization',()=>{
  const fields=draft();const malicious={fieldType:'role',recommendedVisibility:'private',isOwner:true,isFollower:true};assert.equal(applySuggestion(fields,malicious),fields);
  const result=reviewFields(true,fields,['bio'],input=>({...analyzeField(input),isOwner:true,token:'secret',role:'owner'}));
  assert.equal('isOwner' in result.suggestions[0],false);assert.equal('role' in result.suggestions[0],false);assert.equal('token' in result.suggestions[0],false);
});
test('storage failure is noncritical; consent still works in memory, then disable stops it',()=>{
  const unavailable={getItem(){throw new Error('Blocked');},setItem(){throw new Error('Blocked');}},p=new PrivacyPreference(unavailable,'test');
  assert.equal(p.snapshot(),false);p.enableWithConsent(true);assert.equal(p.snapshot(),true);p.disable();assert.equal(p.snapshot(),false);assert.equal(p.persistent,false);
});
