(() => {
  'use strict';
  const KEY='chokin-event-app.catCoins.v1',BACKUP_KEY=`${KEY}.recovery`,SCHEMA_VERSION=1;
  const nowIso=()=>new Date().toISOString();
  const localDate=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const empty=()=>({schemaVersion:SCHEMA_VERSION,balance:0,totalEarned:0,totalSpent:0,lastDailyAwardDate:null,updatedAt:nowIso(),welcomeCoinGranted:false});
  let data=empty();
  const safeInt=value=>Number.isInteger(value)&&value>=0?value:0;
  function normalize(source){const next=empty();if(!source||typeof source!=='object')return next;next.balance=safeInt(source.balance);next.totalEarned=Math.max(next.balance,safeInt(source.totalEarned));next.totalSpent=safeInt(source.totalSpent);next.lastDailyAwardDate=typeof source.lastDailyAwardDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(source.lastDailyAwardDate)?source.lastDailyAwardDate:null;next.updatedAt=typeof source.updatedAt==='string'?source.updatedAt:next.updatedAt;next.welcomeCoinGranted=source.welcomeCoinGranted===true;return next;}
  function save(){data.schemaVersion=SCHEMA_VERSION;data.updatedAt=nowIso();try{localStorage.setItem(KEY,JSON.stringify(data));return true;}catch{return false;}}
  function load(){const raw=localStorage.getItem(KEY);if(raw===null){data=empty();save();return;}try{data=normalize(JSON.parse(raw));}catch{try{localStorage.setItem(`${BACKUP_KEY}.${Date.now()}`,raw);}catch{}data=empty();}save();}
  function snapshot(){return JSON.parse(JSON.stringify(data));}
  function grantWelcome(){if(data.welcomeCoinGranted)return false;const before=snapshot();data.welcomeCoinGranted=true;data.balance+=1;data.totalEarned+=1;if(!save()){data=before;return false;}return true;}
  function awardDaily(date=new Date()){const today=localDate(date);if(data.lastDailyAwardDate===today)return false;const before=snapshot();data.lastDailyAwardDate=today;data.balance+=1;data.totalEarned+=1;if(!save()){data=before;return false;}return true;}
  function hasDailyAward(date=new Date()){return data.lastDailyAwardDate===localDate(date);}
  function canSpend(count=1){return Number.isInteger(count)&&count>0&&data.balance>=count;}
  function spend(count=1){if(!canSpend(count))return false;const before=snapshot();data.balance-=count;data.totalSpent+=count;if(!save()){data=before;return false;}return true;}
  function reset(){data=empty();data.welcomeCoinGranted=true;save();}
  function exportData(){return snapshot();}
  function importData(value){data=normalize(value);save();}
  load();
  window.ChokinCoins={key:KEY,localDate,getState:snapshot,grantWelcome,awardDaily,hasDailyAward,canSpend,spend,reset,exportData,importData};
})();
