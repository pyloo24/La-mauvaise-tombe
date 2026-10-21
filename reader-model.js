import {soundEnd} from './runtime/sound-timing.js';
export function passageLayout(segments,manifest,soundscape){
 let cursor=0,tail=0;const parts=segments.map((segment,index)=>{
  const duration=manifest[segment.id].duration,entry=soundscape.segments[segment.id],start=cursor;
  cursor+=entry.before+duration+entry.after;
  tail=entry.silenceAfter?cursor:Math.max(tail,start+entry.before+soundEnd(entry,duration,soundscape.assets));
  return {index,start,length:entry.before+duration+entry.after};
 });return {parts,total:Math.max(cursor,tail)};
}
export function locateTime(layout,seconds){
 const at=Math.max(0,Math.min(layout.total,Number(seconds)||0));
 const part=[...layout.parts].reverse().find(p=>p.start<=at)||layout.parts[0];
 return {index:part.index,seconds:at-part.start};
}
export function choiceSlots(choices){
 const slots=choices.length===2?['left','right']:['up','left','right','down'];
 return choices.map((choice,index)=>({choice,index,slot:slots[index]}));
}
