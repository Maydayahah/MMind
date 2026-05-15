import { ColorScheme } from '@/constants/Colors';
import { useRef, useEffect } from 'react';
import { Text, View } from 'react-native';
let WebView: any = null;
try { WebView = require('react-native-webview').WebView; } catch {}

interface Word { text: string; value: number; }

interface Props {
  words: Word[];
  colors: ColorScheme;
  height?: number;
}

const CLOUD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{overflow:hidden;background:transparent}
#c{display:block}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const C=document.getElementById('c');
const ctx=C.getContext('2d');
let W,H;
function resize(){W=C.width=window.innerWidth;H=C.height=window.innerHeight;}
resize();

const PALETTE=['#534AB7','#7C73D4','#2E7D6E','#FF9800','#E91E63','#3C3489','#9C27B0','#0097A7'];

function renderCloud(words){
  ctx.clearRect(0,0,W,H);
  if(!words||!words.length)return;

  // Normalize sizes
  const maxV=Math.max(...words.map(w=>w.value));
  const minSize=12, maxSize=44;

  // Place words using spiral from center
  const placed=[];

  function intersects(x,y,w,h){
    const pad=4;
    for(const p of placed){
      if(x-pad < p.x+p.w && x+w+pad > p.x &&
         y-pad < p.y+p.h && y+h+pad > p.y) return true;
    }
    return false;
  }

  function tryPlace(word, fontSize){
    ctx.font='bold '+fontSize+'px -apple-system,sans-serif';
    const tw=ctx.measureText(word.text).width;
    const th=fontSize;

    let angle=0, r=0, step=0.3;
    const cx=W/2, cy=H/2;
    while(r < Math.max(W,H)){
      const x=cx + r*Math.cos(angle) - tw/2;
      const y=cy + r*Math.sin(angle) - th/2;
      if(x>=0 && y>=0 && x+tw<=W && y+th<=H && !intersects(x,y,tw,th)){
        placed.push({x,y,w:tw,h:th});
        ctx.fillStyle=PALETTE[placed.length%PALETTE.length];
        ctx.fillText(word.text, x, y+th*0.85);
        return true;
      }
      angle+=step;
      r=step*angle/(2*Math.PI)*28;
    }
    return false;
  }

  // Sort by frequency desc
  const sorted=[...words].sort((a,b)=>b.value-a.value);
  for(const w of sorted){
    const size=Math.round(minSize+(w.value/maxV)*(maxSize-minSize));
    tryPlace(w, size);
  }
}

document.addEventListener('message',function(e){
  try{
    const d=JSON.parse(e.data);
    if(d.type==='words') renderCloud(d.words);
  }catch(err){}
});
window.addEventListener('message',function(e){
  try{
    const d=JSON.parse(e.data);
    if(d.type==='words') renderCloud(d.words);
  }catch(err){}
});
</script>
</body>
</html>`;

export default function WordCloudView({ words, colors, height = 220 }: Props) {
  const webviewRef = useRef<WebView>(null);
  const loadedRef = useRef(false);
  const pendingRef = useRef<Word[] | null>(null);

  function inject(w: Word[]) {
    const msg = JSON.stringify({ type: 'words', words: w });
    const escaped = msg.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webviewRef.current?.injectJavaScript(`
      (function(){
        var e=new MessageEvent('message',{data:'${escaped}'});
        window.dispatchEvent(e);
      })();
      true;
    `);
  }

  useEffect(() => {
    if (loadedRef.current && words.length > 0) {
      inject(words);
    } else {
      pendingRef.current = words;
    }
  }, [words]);

  function handleLoad() {
    loadedRef.current = true;
    if (pendingRef.current && pendingRef.current.length > 0) {
      inject(pendingRef.current);
      pendingRef.current = null;
    }
  }

  if (!WebView) {
    return (
      <View style={{ height, backgroundColor: colors.card, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textTertiary, fontSize: 13 }}>词云需要安装 react-native-webview</Text>
      </View>
    );
  }

  return (
    <View style={{ height, backgroundColor: colors.card, borderRadius: 8, overflow: 'hidden' }}>
      <WebView
        ref={webviewRef}
        source={{ html: CLOUD_HTML }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onLoad={handleLoad}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
