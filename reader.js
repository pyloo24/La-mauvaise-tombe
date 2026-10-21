import {newGame,choose,availableChoices,sceneSegments,validateStory} from './engine/engine.js';
import {exportGame,importGame} from './engine/persistence.js';
import {ScenePlayer} from './runtime/player.js';
import {passageLayout,locateTime,choiceSlots} from './reader-model.js';
const $=id=>document.getElementById(id),directions=['up','left','right','down'];
const scope='rakoto-lecteurs:'+new URL('./',location.href).pathname+':';
let story,manifest,soundscape,player,state,layout,unlocked=false,started=false,busy=false,scrubbing=false,seekSerial=0,sceneSerial=0,prefetched=-1,memoryState=null,savedPosition=null,persistent=true;
const fmt=seconds=>`${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`;
function notice(message=''){$('notice').textContent=message;}
function get(key){try{return localStorage.getItem(scope+key);}catch{return null;}}
function set(key,value){try{localStorage.setItem(scope+key,value);}catch{persistent=false;notice('La progression restera disponible pendant cette écoute. Ce navigateur ne permet pas de la conserver après fermeture.');}}
function saveState(){memoryState=exportGame(state);set('story',memoryState);}
function remember(){if(!started||!state||!player?.segments?.length)return;const position={run:state.run_id,revision:state.revision,index:player.index,seconds:player.playbackPosition().seconds,unlocked};set('position',JSON.stringify(position));}
function safe(action){return async(...args)=>{try{await action(...args);}catch(error){notice(error.message);busy=false;controls();}};}
function controls(){
 if(!player)return;
 $('pause').textContent=player.playing?'Ⅱ':'▶';$('pause').setAttribute('aria-label',player.playing?'Mettre en pause':player.complete?'Réécouter le passage':'Reprendre l’écoute');
 $('pause').disabled=busy;
 const decision=unlocked&&state?.ending==='none'&&availableChoices(state,story).some(c=>!c.continuation);
 for(const dir of directions){const button=$(dir);button.disabled=true;button.dataset.choice='';button.querySelector('.label').textContent='';}
 if(decision){for(const {choice,index,slot}of choiceSlots(availableChoices(state,story))){const button=$(slot);button.disabled=busy;button.dataset.choice=choice.id;button.setAttribute('aria-label',`Choix ${index+1} : ${choice.label}`);button.querySelector('.label').textContent=`CHOIX ${index+1}`;}}
 else{for(const [dir,label,aria]of [['left','−15 s','Reculer de 15 secondes'],['right','+15 s','Avancer de 15 secondes']]){$(dir).disabled=busy;$(dir).querySelector('.label').textContent=label;$(dir).setAttribute('aria-label',aria);}}
 document.querySelectorAll('#choice-list button').forEach(button=>button.disabled=busy);
 const text=busy?'Préparation…':player.playing?'Écoute en cours':unlocked?(state.ending==='none'?'À vous de choisir':'Fin de l’histoire'):'En pause';
 if($('status').textContent!==text)$('status').textContent=text;
}
function progress(){if(!layout||!player?.segments?.length)return;const local=player.playbackPosition().seconds,part=layout.parts[player.index];const seconds=player.complete?layout.total:Math.min(layout.total,part.start+local);
 if(!scrubbing)$('progress').value=String(seconds);$('time').textContent=`${fmt(seconds)} / ${fmt(layout.total)}`;
}
function prefetch(){
 if(!player?.mixer.context||prefetched===player.index)return;prefetched=player.index;
 for(const segment of player.segments.slice(player.index+1,player.index+3)){const url=player.manifest[segment.id]?.url;if(url)void player.mixer.voiceBuffer(url).catch(()=>{});}
}
function update(){controls();progress();if(started)prefetch();}
function transcript(){const container=$('transcript-copy');container.replaceChildren();for(const segment of player.segments){const p=document.createElement('p');if(segment.speaker_id!=='narrateur'){const name=document.createElement('span');name.className='speaker';name.textContent=story.speakers[segment.speaker_id].label;p.append(name);}p.append(document.createTextNode(segment.text.replace(/;;|::/gu,' ')));container.append(p);}$('text-title').textContent=story.scenes[state.scene_id].title;$('read-done').textContent=state.ending!=='none'?'Terminer cette écoute':story.scenes[state.scene_id].decision_key?'Afficher les choix':'Continuer le récit';}
function choices(){const list=$('choice-list');list.replaceChildren();availableChoices(state,story).filter(c=>!c.continuation).forEach((choice,index)=>{const li=document.createElement('li'),button=document.createElement('button'),number=document.createElement('span'),copy=document.createElement('span'),hint=document.createElement('small');number.className='number';number.textContent=String(index+1);copy.textContent=choice.label;hint.textContent=choice.hint;copy.append(hint);button.append(number,copy);button.addEventListener('click',safe(()=>decide(choice.id)));li.append(button);list.append(li);});}
async function render(position=null){
 const serial=++sceneSerial;unlocked=false;prefetched=-1;$('decision').hidden=true;$('ending').hidden=true;
 const scene=story.scenes[state.scene_id];$('chapter').textContent=`CHAPITRE ${scene.chapter_anchor} / 25 · ${scene.title}`;
 const segments=sceneSegments(state,story);layout=passageLayout(segments,player.manifest,player.soundscape);player.load(segments);$('progress').max=String(layout.total);choices();transcript();
 if(position?.run===state.run_id&&position.revision===state.revision&&Number.isInteger(position.index)){
  player.seek(position.index);if(Number.isFinite(position.seconds)&&position.seconds>0)await player.seekTime(position.seconds,{play:false});
  if(serial!==sceneSerial)return;
  if(position.unlocked){unlocked=true;showDecision(false);}
 }
 update();remember();
}
function showDecision(focus=true){$('decision').hidden=state.ending!=='none';$('ending').hidden=state.ending==='none';controls();if(focus&&state.ending==='none')$('decision-title').focus({preventScroll:true});}
async function finish(){
 unlocked=true;remember();const options=availableChoices(state,story);
 if(state.ending==='none'&&options.length===1&&options[0].continuation){await decide(options[0].id);return;}
 showDecision();
}
async function decide(id){
 if(!unlocked||busy)return;busy=true;controls();notice();
 const saved=get('story');if(persistent&&saved&&memoryState&&saved!==memoryState)throw new Error('Cette écoute a changé dans un autre onglet. Rechargez la page pour la reprendre.');
 const next=choose(state,id,story);state=next;saveState();await render();busy=false;controls();if(!$('text-dialog').open)await player.play();
}
async function seek(seconds,{resume=player.playing}={}){
 const serial=++seekSerial;player.pause();const at=locateTime(layout,seconds);
 if(at.index!==player.index)player.seek(at.index);
 await player.seekTime(at.seconds,{play:resume});if(serial!==seekSerial)return;
 if(seconds>=layout.total-.01){player.pause();unlocked=true;await finish();}progress();remember();
}
async function start(restart=false){
 if(busy)return;busy=true;$('start').disabled=true;$('load-error').textContent='';
 try{
  await player.mixer.resume();
  const first=manifest[sceneSegments(state||newGame(story,'codec-check'),story)[0].id];
  if(player.mixer.context){await player.mixer.voiceBuffer(first.url);}
  else if(!new Audio().canPlayType('audio/webm; codecs="opus"'))throw new Error('Un navigateur à jour est nécessaire pour écouter cette version.');
  if(restart||!state){state=newGame(story,globalThis.crypto?.randomUUID?.()||'lecture-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));saveState();savedPosition=null;}
  started=true;$('welcome').hidden=true;$('experience').hidden=false;await render(restart?null:savedPosition);busy=false;controls();
  if(!unlocked)await player.play();
 }catch(error){busy=false;$('start').disabled=false;$('load-error').textContent=error.message;notice(error.message);}
}
$('start').addEventListener('click',()=>void start());
$('pause').addEventListener('click',safe(async()=>{if(busy)return;await player.toggle();controls();remember();}));
$('restart').addEventListener('click',()=>{player.pause();remember();$('restart-dialog').showModal();controls();});
$('keep').addEventListener('click',()=>{$('restart-dialog').close();});
$('confirm-restart').addEventListener('click',safe(async()=>{$('restart-dialog').close();player.stop();await start(true);}));
for(const dir of directions)$(dir).addEventListener('click',safe(async()=>{const id=$(dir).dataset.choice;if(id)await decide(id);else if(['left','right'].includes(dir))await seek(Number($('progress').value)+(dir==='left'?-15:15));}));
$('progress').addEventListener('pointerdown',()=>{scrubbing=true;});
$('progress').addEventListener('input',()=>{$('time').textContent=`${fmt(Number($('progress').value))} / ${fmt(layout.total)}`;});
$('progress').addEventListener('change',safe(async()=>{scrubbing=false;await seek(Number($('progress').value));}));
$('progress').addEventListener('pointercancel',()=>{scrubbing=false;progress();});
$('transcript').addEventListener('click',()=>{player.pause();remember();$('text-dialog').showModal();controls();});
$('close-text').addEventListener('click',()=>{$('text-dialog').close();});
$('read-done').addEventListener('click',safe(async()=>{$('text-dialog').close();player.pause();await finish();}));
$('report').addEventListener('click',()=>{remember();const transcript={titre:'La mauvaise tombe',date:new Date().toISOString(),passage:state.scene_id,chapitre:state.chapter,progression:JSON.parse(get('position')||'null'),choix:state.journal.map(entry=>entry.text),fin:state.ending};const url=URL.createObjectURL(new Blob([JSON.stringify(transcript,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='mon-parcours-la-mauvaise-tombe.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.addEventListener('keydown',safe(async event=>{
 if(!started||busy||event.altKey||event.ctrlKey||event.metaKey||$('text-dialog').open||$('restart-dialog').open||['INPUT','BUTTON'].includes(event.target.tagName))return;
 const dir={ArrowUp:'up',ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down'}[event.key];
 if(event.code==='Space'){event.preventDefault();await player.toggle();controls();remember();}
 else if(dir&&!$(dir).disabled){event.preventDefault();$(dir).click();}
 else if(unlocked&&/^[1-4]$/.test(event.key)){const choice=availableChoices(state,story)[Number(event.key)-1];if(choice){event.preventDefault();await decide(choice.id);}}
}));
window.addEventListener('pagehide',()=>{remember();player?.pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)remember();});
setInterval(()=>{if(started){progress();if(player.playing)remember();}},1000);
async function boot(){
 try{
  const data=await Promise.all(['story','manifest','soundscape'].map(async name=>{const response=await fetch(`./data/${name}.json`);if(!response.ok)throw new Error('Le récit ne peut pas être chargé. Vérifiez votre connexion puis rechargez la page.');return response.json();}));
  [story,manifest,soundscape]=data;validateStory(story);
  const text=get('story');if(text)try{state=importGame(text,story);memoryState=text;savedPosition=JSON.parse(get('position')||'null');}catch{notice('La précédente progression ne correspond plus à cette version du récit. Une nouvelle écoute commencera.');}
  player=new ScenePlayer({manifest,soundscape,onUpdate:update,onComplete:()=>void safe(finish)(),onFallback:message=>notice(message.includes('prise')?'Un fichier de voix ne peut pas être lu. Rechargez la page et réessayez.':message)});
  $('start').disabled=false;$('start-label').textContent=state?`Reprendre · chapitre ${state.chapter} / 25`:'Toucher pour commencer';$('start').setAttribute('aria-label',state?'Reprendre mon écoute':'Commencer l’histoire');
 }catch(error){$('load-error').textContent=location.protocol==='file:'?'Ouvrez ce dossier depuis un site web ou avec le lanceur d’aperçu.':error.message;$('start-label').textContent='L’histoire n’a pas pu être chargée.';}
}
void boot();
