// Start at the first decoded sample, independently of native media stream
// switching between short replies. Keep the native element as a fallback.
export class RecordedVoice {
  constructor(native,mixer){
    this.native=native;this.mixer=mixer;this.listeners=new Map();this.version=0;this.playSerial=0;
    this._src='';this._rate=1;this.offset=0;this.buffer=null;this.source=null;this.buffered=false;this._ended=false;
    for(const event of ['loadedmetadata','canplay','timeupdate','ended','error'])native.addEventListener(event,e=>{if(!this.buffered)this.emit(event,e);});
  }
  addEventListener(event,listener,options={}){const list=this.listeners.get(event)||new Map();list.set(listener,options);this.listeners.set(event,list);}
  removeEventListener(event,listener){this.listeners.get(event)?.delete(listener);}
  emit(event,detail={}){for(const [listener,options]of [...this.listeners.get(event)||[]]){if(options.once)this.removeEventListener(event,listener);listener({...detail,type:event,target:this});}}
  get preload(){return this.native.preload;}set preload(value){this.native.preload=value;}
  get volume(){return this.native.volume;}set volume(value){this.native.volume=value;}
  get src(){return this._src;}set src(value){this.pause();this.version++;this._src=value;this.buffer=null;this.offset=0;this._ended=false;}
  removeAttribute(name){if(name==='src'){this.src='';this.native.removeAttribute(name);}else this.native.removeAttribute(name);}
  get readyState(){return this.buffered?(this.buffer?4:0):this.native.readyState;}
  get duration(){return this.buffered?(this.buffer?.duration??NaN):this.native.duration;}
  get error(){return this.buffered?null:this.native.error;}
  get ended(){return this.buffered?this._ended:this.native.ended;}
  get currentTime(){return this.buffered?Math.min(this.duration||Infinity,this.offset+(this.source?Math.max(0,this.mixer.context.currentTime-this.startedAt)*this._rate:0)):this.native.currentTime;}
  set currentTime(value){
    if(!this.buffered){this.native.currentTime=value;return;}
    const playing=Boolean(this.source);this.pause();this.offset=Math.max(0,Math.min(this.buffer?.duration??Infinity,Number(value)||0));this._ended=false;
    if(playing)void this.play();
  }
  get playbackRate(){return this._rate;}set playbackRate(value){
    if(value===this._rate){this.native.playbackRate=value;return;}
    if(!this.buffered&&(!this.buffer||value!==1)){this._rate=value;this.native.playbackRate=value;return;}
    const at=this.currentTime,playing=Boolean(this.source)||(!this.buffered&&this.native.paused===false);
    this.pause();this._rate=value;this.native.playbackRate=value;
    // The native element preserves speech pitch at alternate listening speeds.
    // Buffer playback changes pitch with speed, so reserve it for normal speed.
    if(this.buffer&&value===1){this.buffered=true;this.offset=at;this._ended=false;}
    else if(this.buffered){this.buffered=false;this.native.src=this._src;this.native.load();this.native.playbackRate=value;this.native.currentTime=at;}
    if(playing)void this.play();
  }
  load(){
    this.pause();const version=++this.version;this.offset=0;this._ended=false;
    if(!this._src){this.buffered=false;this.native.removeAttribute('src');this.native.load();return;}
    this.buffered=Boolean(this.mixer.context)&&this._rate===1;
    if(!this.buffered){this.native.src=this._src;this.native.load();return;}
    this.buffer=null;this.native.removeAttribute('src');this.native.load();
    this.loading=this.mixer.voiceBuffer(this._src).then(buffer=>{
      if(version!==this.version)return;
      this.buffer=buffer;this.emit('loadedmetadata');this.emit('canplay');
    }).catch(()=>{
      if(version!==this.version)return;
      // Keep native decoding available when Web Audio cannot decode a file.
      this.buffered=false;this.native.src=this._src;this.native.load();
    });
  }
  async play(){
    if(!this.buffered)return this.native.play();
    const version=this.version,serial=++this.playSerial;await this.loading;
    if(version!==this.version||serial!==this.playSerial)throw Object.assign(new Error('Prise abandonnée'),{name:'AbortError'});
    if(!this.buffered)return this.native.play();
    if(!this.buffer)throw new Error('Prise non chargée');
    if(this.source)return;
    const context=this.mixer.context,source=context.createBufferSource();source.buffer=this.buffer;source.playbackRate.value=this._rate;source.connect(this.mixer.voice);
    this.startedAt=context.currentTime;this.source=source;this._ended=false;
    source.onended=()=>{
      if(this.source!==source)return;this.source=null;this.offset=this.buffer.duration;this._ended=true;clearInterval(this.timer);source.disconnect();this.emit('timeupdate');this.emit('ended');
    };
    source.start(this.startedAt,this.offset);this.timer=setInterval(()=>this.emit('timeupdate'),50);this.emit('timeupdate');
  }
  pause(){
    this.playSerial++;this.native.pause();clearInterval(this.timer);
    if(!this.source)return;
    this.offset=this.currentTime;const source=this.source;this.source=null;source.onended=null;try{source.stop();}catch{}source.disconnect();
  }
}
