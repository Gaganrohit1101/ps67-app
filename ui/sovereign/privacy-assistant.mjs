// Local, deterministic recommendations. No network, wallet, session or profile API.
const visibilityRank={public:0,followers:1,private:2};
const supported=new Set(['displayName','name','username','bio','website','college','email','phone','location']);
const baselines={displayName:'public',name:'public',username:'public',bio:'public',website:'public',college:'followers',email:'private',phone:'private',location:'private'};
const reasons={
  public:'This field usually works as public profile information. You may choose a smaller audience.',
  college:'Education details may reveal where you study. Followers only is a useful starting point.',
  email:'Email addresses are sensitive direct-contact information.',
  phone:'Phone numbers are sensitive direct-contact information.',
  location:'Location details may reveal where you live or spend time.',
  contact:'This field appears to contain direct contact information.',
  identity:'This field may contain an identity document or account identifier.',
  address:'This field may include a street address.',
  url:'This link may include credentials or a personal access parameter.',
};
export function analyzeField({fieldType,value,currentVisibility}){
  if(!supported.has(fieldType)||typeof value!=='string'||!Object.hasOwn(visibilityRank,currentVisibility)||value.length>2000)throw new Error('Unsupported analysis input.');
  let recommended=baselines[fieldType],reason=reasons[fieldType]||reasons.public,warning='';
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)){
    recommended='private';reason=reasons.contact;warning='Possible email address detected';
  }
  const phoneLike=(value.match(/\+?\d[\d ().-]{5,}\d/g)||[]).some(part=>{const digits=part.replace(/\D/g,'');return digits.length>=7&&digits.length<=15;});
  if(phoneLike){recommended='private';reason=reasons.contact;warning='Possible phone number detected';}
  if(/\b(passport|aadhaar|aadhar|ssn|social security|national id|account number)\b/i.test(value)&&/\d/.test(value)){
    recommended='private';reason=reasons.identity;warning='Possible identity information detected';
  }
  if(/\b\d{1,5}\s+[\p{L}\s]{2,45}\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr)\b/iu.test(value)){
    recommended='private';reason=reasons.address;warning='Possible address detected';
  }
  if(/https?:\/\/[^\s]+(?:[?&](?:token|key|api_key|password|secret|code)=|:\/\/[^\s/]+:[^\s/]+@)/i.test(value)){
    recommended='private';reason=reasons.url;warning='Possible sensitive link detected';
  }
  // Never recommend widening an existing restricted audience.
  if(visibilityRank[currentVisibility]>visibilityRank[recommended])recommended=currentVisibility;
  return {fieldType,currentVisibility,recommendedVisibility:recommended,reason,warning};
}

export function reviewFields(enabled,fields,selected,analyzer=analyzeField){
  if(!enabled)return {status:'off',suggestions:[]}; // Do not even read field content when OFF.
  try{
    const suggestions=[];
    for(const fieldType of new Set(selected)){
      if(!supported.has(fieldType))continue;
      const field=fields[fieldType];if(!field)continue;
      // Strict allowlist: no full draft/client/session object reaches the analyzer.
      const result=analyzer({fieldType,value:field.value,currentVisibility:field.visibility});
      if(result?.fieldType!==fieldType||!Object.hasOwn(visibilityRank,result.recommendedVisibility)||typeof result.reason!=='string')throw new Error('Invalid recommendation.');
      suggestions.push({fieldType,currentVisibility:field.visibility,recommendedVisibility:result.recommendedVisibility,
        reason:result.reason,warning:typeof result.warning==='string'?result.warning:''});
    }
    return {status:'ok',suggestions};
  }catch{return {status:'unavailable',suggestions:[]};}
}
export function applySuggestion(fields,suggestion){
  const key=suggestion.fieldType;
  if(!supported.has(key)||!fields[key]||!Object.hasOwn(visibilityRank,suggestion.recommendedVisibility))return fields;
  return {...fields,[key]:{...fields[key],visibility:suggestion.recommendedVisibility}};
}
export function dismissSuggestion(suggestions,key){return suggestions.filter(s=>s.fieldType!==key);}
export function publishReview(enabled,fields,selected,analyzer=analyzeField){
  const result=reviewFields(enabled,fields,selected,analyzer);
  return {...result,issues:result.suggestions.filter(s=>visibilityRank[s.recommendedVisibility]>visibilityRank[s.currentVisibility])};
}
export function proceedWithCurrentChoices(save){return save();}

// Stores only a boolean, scoped to this browser and public wallet/network reference.
export class PrivacyPreference {
  constructor(storage,scope){this.storage=storage;this.key='ps67.privacyAssistantEnabled.v1:'+scope;this.enabled=false;this.persistent=Boolean(storage);this.listeners=new Set();this.refresh();}
  refresh=()=>{try{this.enabled=this.storage?.getItem(this.key)==='true';}catch{this.enabled=false;this.persistent=false;}this.emit();};
  snapshot=()=>this.enabled;
  subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  emit=()=>{for(const listener of this.listeners)listener();};
  enableWithConsent=(confirmed)=>{if(confirmed!==true)return false;this.update(true);return true;};
  disable=()=>this.update(false);
  update=(enabled)=>{this.enabled=enabled;try{this.storage?.setItem(this.key,String(enabled));}catch{this.persistent=false;}this.emit();};
}
