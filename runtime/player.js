import { Mixer } from './mixer.js';
import { defaultEntry } from './sound-library.js';
import { soundEnd } from './sound-timing.js';
import { RecordedVoice } from './recorded-voice.js';
export class ScenePlayer {
  constructor({manifest={},voices={},soundscape={},onUpdate,onComplete,onFallback}) {
    this.manifest=manifest;this.voices=voices;this.soundscape=soundscape;this.onUpdate=onUpdate;this.onComplete=onComplete;this.onFallback=onFallback;
    this.mixer=new Mixer(soundscape,onFallback);const native=new Audio();this.audio=window.AudioContext||window.webkitAudioContext?new RecordedVoice(native,this.mixer):native;this.audio.preload='auto';this.mixer.attach(this.audio);
    this.volume=.85;this.rate=1;this.token=0;this.index=0;this.playing=false;this.optionsActive=false;
    this.speechElapsed=0;this.speechStarted=null;
    this.audio.addEventListener('timeupdate',()=>this.update());
    this.audio.addEventListener('ended',()=>{if(this.mode==='asset'&&this.audio.ended)this.finishSegment();});
    this.audio.addEventListener('error',()=>{if(this.mode==='asset'&&this.playing&&this.audio.error){this.mixer.clearEffects(false);this.cuesScheduled=false;this.speak(this.segments[this.index],true);}});
  }
  load(segments){this.stop();this.segments=segments;this.index=0;this.complete=false;this.mode=null;this.update();}
  setManifest(manifest){
    const id=this.segments?.[this.index]?.id,changed=id&&this.manifest[id]?.url!==manifest[id]?.url;
    this.manifest=manifest;
    if(changed&&!this.playing)this.seek(this.index);
    else this.update();
  }
  async dispose(){this.stop();await this.mixer.close();}
  stop(){
    this.token++;this.playing=false;clearTimeout(this.timer);this.gap=null;this.mode=null;
    this.cancelMetadata?.();
    this.audio.pause();this.audio.removeAttribute('src');this.audio.load();window.speechSynthesis?.cancel();
    this.activeAsset=null;
    this.utterance=null;this.optionsActive=false;this.mixer.stop();
    this.speechElapsed=0;this.speechStarted=null;
  }
  async play(){
    if(!this.segments?.length||this.playing)return;
    if(this.complete){this.index=0;this.complete=false;this.mode=null;}
    if(this.optionsActive){window.speechSynthesis?.cancel();this.optionsActive=false;}
    this.playing=true;const token=this.token;
    try{await this.mixer.resume();}catch{this.onFallback?.('Le mixage audio est indisponible dans ce navigateur.');}
    if(this.token!==token||!this.playing)return;
    if(['before','after','tail'].includes(this.mode)){this.armGap();this.update();return;}
    if(this.mode==='preparing'){this.update();return;}
    if(this.mode==='ready'){this.startVoice();return;}
    if(this.mode==='asset'&&this.audio.src&&!this.audio.ended){await this.playAudio(token,true);this.update();return;}
    if(this.mode==='speech'&&this.utterance){this.speechStarted=performance.now();window.speechSynthesis?.resume();this.update();return;}
    this.playSegment();
  }
  async playSegment(){
    if(!this.playing)return;
    const segment=this.segments[this.index],token=++this.token;
    this.entry=this.soundscape.segments?.[segment.id]||defaultEntry(segment);this.cuesScheduled=false;this.mode='preparing';this.update();
    await this.mixer.begin(this.entry).catch(()=>this.onFallback?.('Une piste sonore n’a pas pu être chargée.'));
    if(token!==this.token)return;
    this.mode='ready';
    if(this.entry.before>0)this.startGap('before',this.entry.before,()=>this.startVoice(),true);
    else if(this.playing)this.startVoice();
    else this.update();
  }
  waitForAudio(threshold,event){
    if(typeof this.audio.readyState!=='number'||this.audio.readyState>=threshold)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timeout);this.audio.removeEventListener?.(event,ready);this.audio.removeEventListener?.('error',fail);if(this.cancelMetadata===cancel)this.cancelMetadata=null;};
      const ready=()=>{if(this.audio.readyState<threshold)return;cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Le fichier de voix ne peut pas être chargé.'));};
      const cancel=()=>{cleanup();reject(new Error('Chargement annulé.'));};
      const timeout=setTimeout(fail,10000);this.cancelMetadata=cancel;
      this.audio.addEventListener(event,ready);this.audio.addEventListener('error',fail,{once:true});
    });
  }
  async startVoice(){
    if(!this.playing)return;
    const segment=this.segments[this.index],asset=this.manifest[segment.id],token=this.token;
    this.gap=null;this.mixer.setSilence(false);this.mixer.setSpeaking(true);
    if(asset&&asset.text===segment.text&&asset.speaker_id===segment.speaker_id){
      this.mode='preparing';this.update();this.audio.pause();this.audio.src=asset.url;this.audio.load();
      try{
        await this.waitForAudio(3,'canplay');if(token!==this.token)return;
        this.audio.currentTime=0;this.audio.playbackRate=this.rate;
        this.audio.volume=this.mixer.routed?1:this.volume*this.mixer.mix.voice*this.entry.voiceGain;
        this.mixer.prepareVoice?.();this.activeAsset=asset;this.mode='asset';
        if(this.playing)this.playAudio(token,true);
      }catch(error){if(token!==this.token)return;this.onFallback?.(error.message);if(this.playing)this.speak(segment,true);else this.mode='ready';}
    }else{
      this.onFallback?.('Cette réplique attend une prise correspondant au casting actuel. Elle est lue provisoirement avec la voix du navigateur.');
      this.speak(segment,true);
    }
    this.update();
  }
  async playAudio(token,cues=false){
    try{await this.audio.play();if(this.token!==token||!this.playing)return;if(cues)this.scheduleEffects();}
    catch(error){
      if(this.token!==token||!this.playing)return;
      if(error.name==='NotAllowedError'){this.pause();this.onFallback?.('Touchez Écouter pour autoriser la lecture audio.');}
      else{this.mixer.clearEffects(false);this.cuesScheduled=false;this.speak(this.segments[this.index],true);}
    }
  }
  scheduleEffects(){
    if(this.cuesScheduled)return;this.cuesScheduled=true;
    const duration=Number.isFinite(this.audio.duration)&&this.mode==='asset'?this.audio.duration:(this.manifest[this.segments[this.index].id]?.duration||Math.max(1,this.segments[this.index].text.length/13));
    this.mixer.cueEffects(duration/this.rate);
  }
  speak(segment,cues=false){
    if(!this.playing||!segment)return;this.mode='speech';this.audio.pause();
    this.activeAsset=null;
    this.speechElapsed=0;this.speechStarted=null;
    if(!window.speechSynthesis){this.pause();this.onFallback?.('La voix provisoire est indisponible. Ouvrez la transcription pour poursuivre en lecture.');return;}
    const token=++this.token;window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(segment.text.replace(/;;|::/gu,' ')),available=window.speechSynthesis.getVoices(),config=this.voices[segment.speaker_id]||{};
    utterance.voice=available.find(v=>v.name===config.browser_voice)||available.find(v=>v.lang.startsWith('fr'))||null;
    utterance.lang='fr-FR';utterance.volume=this.volume*this.mixer.mix.voice*this.entry.voiceGain;utterance.rate=this.rate*.95;
    utterance.onend=()=>{if(this.token===token){this.utterance=null;this.finishSegment();}};
    utterance.onerror=event=>{if(this.token!==token||['canceled','interrupted'].includes(event.error))return;this.utterance=null;this.pause();this.onFallback?.('Lecture vocale indisponible. La transcription permet de poursuivre.');};
    utterance.onstart=()=>{if(this.token===token){if(this.playing)this.speechStarted=performance.now();if(cues)this.scheduleEffects();}};
    this.utterance=utterance;window.speechSynthesis.resume();window.speechSynthesis.speak(utterance);this.update();
  }
  startGap(mode,seconds,next,silent){
    this.mode=mode;this.gap={remaining:seconds*1000,next};this.mixer.setSpeaking(false);this.mixer.setSilence(silent);
    if(this.playing)this.armGap();this.update();
  }
  armGap(){
    if(!this.gap)return;clearTimeout(this.timer);const token=this.token;
    this.gap.started=performance.now();
    this.timer=setTimeout(()=>{if(this.playing&&this.token===token){const next=this.gap.next;this.gap=null;next();}},this.gap.remaining);
  }
  finishSegment(){
    if(!this.playing||!['asset','speech'].includes(this.mode))return;
    this.startGap('after',this.entry.after,()=>{
      if(this.index+1>=this.segments.length)this.finishScene();
      else{this.index++;this.playSegment();}
    },this.entry.silenceAfter);
  }
  finishScene(){
    const remaining=this.entry.silenceAfter?0:(this.mixer.tailRemaining?.()||0);
    if(remaining>.01){this.startGap('tail',remaining,()=>this.finishScene(),false);return;}
    this.complete=true;this.playing=false;this.mode=null;this.mixer.finish();this.update();this.onComplete?.();
  }
  pause(){
    if(this.speechStarted!=null){this.speechElapsed+=performance.now()-this.speechStarted;this.speechStarted=null;}
    if(this.gap?.started!=null){this.gap.remaining=Math.max(0,this.gap.remaining-(performance.now()-this.gap.started));this.gap.started=null;}
    this.playing=false;clearTimeout(this.timer);this.audio.pause();window.speechSynthesis?.pause();this.mixer.pause();this.update();
  }
  toggle(){if(this.playing)this.pause();else this.play();}
  replay(){const segments=this.segments;this.load(segments);this.play();}
  seek(index){const wasPlaying=this.playing;this.stop();this.complete=false;this.index=Math.max(0,Math.min(this.segments.length-1,index));this.update();if(wasPlaying)this.play();}
  async seekTime(seconds,{play=this.playing}={}){
    const segment=this.segments?.[this.index],asset=this.manifest[segment?.id];
    if(!asset||asset.text!==segment.text||asset.speaker_id!==segment.speaker_id)throw new Error('Le déplacement précis nécessite une prise de voix enregistrée.');
    this.stop();this.complete=false;const token=this.token;
    this.entry=this.soundscape.segments?.[segment.id]||defaultEntry(segment);this.mode='preparing';this.update();
    try{
      await this.mixer.resume();await this.mixer.pause();
      if(token!==this.token)return;
      this.audio.src=asset.url;this.audio.load();
      await this.waitForAudio(1,'loadedmetadata');
      if(token!==this.token)return;
      const duration=Number.isFinite(this.audio.duration)?this.audio.duration:asset.duration;
      const before=this.entry.before,replyEnd=before+duration+this.entry.after,total=before+soundEnd(this.entry,duration,this.soundscape.assets);
      const at=Math.max(0,Math.min(total,Number(seconds)||0)),elapsed=Math.max(0,at-before);
      await this.mixer.begin(this.entry,{elapsed,continuousElapsed:at});if(token!==this.token)return;
      this.activeAsset=asset;this.audio.playbackRate=this.rate;
      this.audio.volume=this.mixer.routed?1:this.volume*this.mixer.mix.voice*this.entry.voiceGain;
      this.audio.currentTime=Math.min(duration,elapsed);
      this.cuesScheduled=at>=before;
      if(this.cuesScheduled)this.mixer.cueEffects(duration,elapsed);
      if(at>=total){this.complete=true;this.mode=null;this.mixer.finish();}
      else if(at<before)this.startGap('before',before-at,()=>this.startVoice(),true);
      else if(at<before+duration){this.mode='asset';this.mixer.setSilence(false);this.mixer.setSpeaking(true);}
      else if(at<replyEnd)this.startGap('after',replyEnd-at,()=>this.index+1>=this.segments.length?this.finishScene():(this.index++,this.playSegment()),this.entry.silenceAfter);
      else this.startGap('tail',total-at,()=>this.finishScene(),false);
      this.update();if(play&&!this.complete)await this.play();
    }catch(error){if(token!==this.token)return;this.stop();this.update();throw error;}
  }
  setVolume(value){this.volume=value;this.audio.volume=this.mixer.routed?1:value*this.mixer.mix.voice*(this.entry?.voiceGain??1);this.mixer.setVolume(value);if(this.utterance)this.utterance.volume=value*this.mixer.mix.voice*(this.entry?.voiceGain??1);}
  setRate(value){this.rate=value;this.audio.playbackRate=value;}
  playbackPosition(){
    const segment=this.segments?.[this.index];if(!segment)return {seconds:0,total:0};
    const entry=this.soundscape.segments?.[segment.id]||defaultEntry(segment);
    const duration=['asset','after','tail'].includes(this.mode)&&Number.isFinite(this.audio.duration)?this.audio.duration:this.manifest[segment.id]?.duration||Math.max(1,segment.text.length/13);
    const before=entry.before,total=before+soundEnd(entry,duration,this.soundscape.assets);
    let seconds=0;
    if(this.complete)seconds=total;
    else if(['before','after','tail'].includes(this.mode)){
      const remaining=Math.max(0,(this.gap?.remaining||0)-(this.gap?.started!=null?performance.now()-this.gap.started:0))/1000;
      seconds=this.mode==='before'?before-remaining:this.mode==='tail'?total-remaining:before+duration+entry.after-remaining;
    }else if(this.mode==='asset')seconds=before+this.audio.currentTime;
    else if(this.mode==='speech')seconds=before+Math.min(duration,(this.speechElapsed+(this.speechStarted!=null?performance.now()-this.speechStarted:0))/1000*this.rate);
    return {seconds:Math.max(0,Math.min(total,seconds)),total};
  }
  update(){
    const local=this.mode==='asset'&&this.audio.duration?this.audio.currentTime/this.audio.duration:0;
    this.onUpdate?.({index:this.index,total:this.segments?.length||0,playing:this.playing,complete:this.complete,progress:this.complete?1:(this.index+local)/(this.segments?.length||1),mode:this.mode,asset:this.mode==='asset'?this.activeAsset:null});
  }
  readOptions(choices){
    this.pause();window.speechSynthesis?.cancel();this.utterance=null;
    if(this.mode==='speech')this.mode=null;
    if(!window.speechSynthesis)return;this.optionsActive=true;
    const text=choices.map((c,i)=>`Option ${i+1}. ${c.label}. ${c.hint} Durée narrative : ${c.duration_minutes} minutes.`).join(' ');
    const speech=new SpeechSynthesisUtterance(text);speech.lang='fr-FR';speech.volume=this.volume;window.speechSynthesis.resume();window.speechSynthesis.speak(speech);
  }
}
