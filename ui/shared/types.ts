export type Visibility='public'|'followers'|'private';
export type Field={visibility:Visibility;locked:boolean;value?:string};
export type Post=Field&{id:string;createdAt:string};
export type Profile={owner:string;did:string;chainId:number;cid:string;fields:Record<string,Field>;posts:Post[];isOwner:boolean;isFollower:boolean;followers:string[];following:string[]};
export type TxState={state:'pending'|'confirmed'|'failed';message:string;hash?:string;block?:number};
export const labels:Record<string,string>={displayName:'Display name',bio:'About',website:'Website',college:'College',location:'Location (legacy)',email:'Email'};
export const audienceLabels:Record<Visibility,string>={public:'Public',followers:'Followers only',private:'Only me'};
