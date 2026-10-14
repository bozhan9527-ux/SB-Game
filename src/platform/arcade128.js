/* 128 合 1 game bridge v1. No payment credentials or wallet access in the game. */
(function(global){
 class Arcade128 {
  constructor({platformOrigin,onState=()=>{}}){
   this.activityAt=0;this.activityListener=e=>{if(e.isTrusted&&document.visibilityState==='visible'&&Date.now()-this.activityAt>1000){this.activityAt=Date.now();this.send({type:'activity'});}};
   global.addEventListener('pointerdown',this.activityListener);global.addEventListener('keydown',this.activityListener);global.addEventListener('touchstart',this.activityListener,{passive:true});
   this.origin=new URL(platformOrigin).origin;this.pending=new Map();this.onState=onState;
   this.listener=e=>{
    if(e.source!==global.parent||e.origin!==this.origin||e.data?.channel!=="128:v1")return;
    if(e.data.type==="state"){clearInterval(this.readyTimer);this.onState(e.data);}
    if(e.data.type==="result"){
     const entry=this.pending.get(e.data.requestId);if(entry){clearTimeout(entry.timer);this.pending.delete(e.data.requestId);entry.resolve(e.data);}
    }
   };
   global.addEventListener("message",this.listener);this.ready();this.readyTimer=setInterval(()=>this.ready(),3000);
  }
  send(data){global.parent.postMessage({channel:"128:v1",...data},this.origin);}
  ready(){this.send({type:"ready"});}
  gameOver(){this.send({type:"gameover",requestId:crypto.randomUUID()});}
  purchase(item){
   const requestId=crypto.randomUUID();return new Promise(resolve=>{
    const timer=setTimeout(()=>{this.pending.delete(requestId);resolve({ok:false,reason:"timeout"});},300000);
    this.pending.set(requestId,{resolve,timer});this.send({type:"purchase",item,requestId});
   });
  }
  destroy(){global.removeEventListener("pointerdown",this.activityListener);global.removeEventListener("keydown",this.activityListener);global.removeEventListener("touchstart",this.activityListener);clearInterval(this.readyTimer);global.removeEventListener("message",this.listener);for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.resolve({ok:false,reason:"closed"});}this.pending.clear();}
 }
 global.Arcade128=Arcade128;
})(window);
