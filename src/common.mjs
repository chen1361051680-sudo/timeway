export class AppError extends Error { constructor(status,message){super(message);this.status=status;} }
export function check(condition,message,status=400){if(!condition)throw new AppError(status,message);}
export function text(value,label,max=2000,required=true){const s=String(value??'').trim();check((!required||s.length>0)&&s.length<=max,`${label}不能为空或超过${max}字`);return s;}
export function integer(value,label,min=0,max=100000){const n=Number(value);check(Number.isSafeInteger(n)&&n>=min&&n<=max,`${label}应为${min}至${max}之间的整数`);return n;}
export function date(value,label){const n=Date.parse(value);check(Number.isFinite(n),`${label}格式错误`);return new Date(n).toISOString();}
export const now=()=>new Date().toISOString();
export const overlaps=(a,b,c,d)=>a<d&&c<b;
export const activeApplication=a=>['accepted','checked_in','submitted','disputed','confirmed'].includes(a.status);
export const activeBooking=b=>!['cancelled','rejected'].includes(b.status);
export function cellFor(lat,lng){const y=Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*6378137;const x=lng*Math.PI/180*6378137;return `${Math.floor(x/500)}:${Math.floor(y/500)}`;}
