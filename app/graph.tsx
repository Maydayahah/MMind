import { api } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// ── HTML 模板：力导向图（Canvas + 纯JS，无外部依赖）────────────────────────────

const GRAPH_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#FAFAF9;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#c{display:block;touch-action:none}
#bar{
  display:none;position:fixed;bottom:0;left:0;right:0;
  background:#fff;padding:14px 16px 24px;
  border-top:1px solid #E8E6E0;
  flex-direction:row;align-items:center;gap:12px;
  box-shadow:0 -4px 16px rgba(0,0,0,0.06);
}
#bar-text{flex:1;font-size:14px;color:#1a1a1a;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#bar-btn{
  flex-shrink:0;background:#534AB7;color:#fff;border:none;
  padding:9px 18px;border-radius:10px;font-size:13px;font-weight:600;
}
#hint{
  position:fixed;top:16px;left:50%;transform:translateX(-50%);
  background:rgba(83,74,183,0.12);color:#534AB7;
  padding:6px 14px;border-radius:20px;font-size:12px;
  pointer-events:none;
}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="bar"><span id="bar-text"></span><button id="bar-btn">查看详情</button></div>
<div id="hint">拖动节点重排 · 点击查看内容</div>
<script>
const C=document.getElementById('c');
const ctx=C.getContext('2d');
let W,H;
function resize(){W=C.width=window.innerWidth;H=C.height=window.innerHeight;}
resize();
window.addEventListener('resize',resize);

const TAG_COLORS={
  '创作与灵感':'#534AB7','生活观察':'#2E7D6E',
  '技术思考':'#3C3489','阅读笔记':'#8B5E1A'
};
const EMO_COLORS={
  '开心':'#4CAF50','兴奋':'#FF9800','平静':'#2196F3',
  '思考':'#9C27B0','焦虑':'#FF5722','低落':'#78909C'
};
function nodeColor(n){
  if(n.emotion&&EMO_COLORS[n.emotion])return EMO_COLORS[n.emotion];
  const t=(n.tags||'').split(',')[0].trim();
  return TAG_COLORS[t]||'#534AB7';
}

let nodes=[],edges=[],sel=null;
const byId={};

// Pan state
let panX=0,panY=0,panStartX=0,panStartY=0,panning=false;

function initPositions(){
  nodes.forEach((n,i)=>{
    const a=(i/nodes.length)*Math.PI*2;
    const r=Math.min(W,H)*0.27;
    n.x=W/2+r*Math.cos(a)+(Math.random()-.5)*50;
    n.y=H/2+r*Math.sin(a)+(Math.random()-.5)*50;
    n.vx=0;n.vy=0;n.r=22;n.pinned=false;
  });
  nodes.forEach(n=>byId[n.id]=n);
}

// Force constants
const REPEL=5000,SLEN=140,SK=0.045,GRAV=0.022,DAMP=0.80;

function tick(){
  // Repulsion between all node pairs
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      let dx=b.x-a.x,dy=b.y-a.y;
      const d2=dx*dx+dy*dy||1,d=Math.sqrt(d2);
      const f=REPEL/d2;
      const fx=f*dx/d,fy=f*dy/d;
      if(!a.pinned){a.vx-=fx;a.vy-=fy;}
      if(!b.pinned){b.vx+=fx;b.vy+=fy;}
    }
  }
  // Spring attraction along edges
  for(let k=0;k<edges.length;k++){
    const e=edges[k];
    const a=byId[e.source],b=byId[e.target];
    if(!a||!b)continue;
    const dx=b.x-a.x,dy=b.y-a.y;
    const d=Math.sqrt(dx*dx+dy*dy)||1;
    const f=SK*(d-SLEN);
    const fx=f*dx/d,fy=f*dy/d;
    if(!a.pinned){a.vx+=fx;a.vy+=fy;}
    if(!b.pinned){b.vx-=fx;b.vy-=fy;}
  }
  // Gravity toward canvas center
  const cx=W/2-panX,cy=H/2-panY;
  nodes.forEach(n=>{
    if(n.pinned)return;
    n.vx+=(cx-n.x)*GRAV;
    n.vy+=(cy-n.y)*GRAV;
    n.vx*=DAMP;n.vy*=DAMP;
    n.x+=n.vx;n.y+=n.vy;
  });
}

function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(panX,panY);

  // Draw edges
  for(let k=0;k<edges.length;k++){
    const e=edges[k];
    const a=byId[e.source],b=byId[e.target];
    if(!a||!b)continue;
    ctx.beginPath();
    ctx.moveTo(a.x,a.y);
    ctx.lineTo(b.x,b.y);
    ctx.strokeStyle='rgba(83,74,183,'+(e.weight*0.32)+')';
    ctx.lineWidth=0.8+e.weight*1.8;
    ctx.stroke();
  }

  // Draw nodes
  nodes.forEach(n=>{
    const color=nodeColor(n);
    const isSel=sel&&sel.id===n.id;
    if(isSel){ctx.shadowColor=color;ctx.shadowBlur=16;}
    ctx.beginPath();
    ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
    ctx.fillStyle=isSel?color:color+'BB';
    ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.9)';
    ctx.lineWidth=2;
    ctx.stroke();
    ctx.shadowBlur=0;
    // Label (first 6 chars)
    ctx.fillStyle='#fff';
    ctx.font='bold 10px -apple-system,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(n.preview.slice(0,6),n.x,n.y);
  });

  ctx.restore();
}

let raf=null;
function loop(){tick();draw();raf=requestAnimationFrame(loop);}

// ── Touch handling ────────────────────────────────────────────────────────────

let dragNode=null,dragOX=0,dragOY=0;

function worldHit(cx,cy){
  const wx=cx-panX,wy=cy-panY;
  const R=30;
  return nodes.find(n=>{
    const dx=n.x-wx,dy=n.y-wy;
    return dx*dx+dy*dy<=R*R;
  });
}

C.addEventListener('touchstart',function(e){
  e.preventDefault();
  const t=e.touches[0];
  const hit=worldHit(t.clientX,t.clientY);
  if(hit){
    dragNode=hit;
    dragOX=t.clientX-panX-hit.x;
    dragOY=t.clientY-panY-hit.y;
    hit.pinned=true;
    sel=hit;
    showBar(hit);
    panning=false;
  } else {
    dragNode=null;
    panStartX=t.clientX-panX;
    panStartY=t.clientY-panY;
    panning=true;
    sel=null;
    hideBar();
  }
},{passive:false});

C.addEventListener('touchmove',function(e){
  e.preventDefault();
  const t=e.touches[0];
  if(dragNode){
    dragNode.x=t.clientX-panX-dragOX;
    dragNode.y=t.clientY-panY-dragOY;
    dragNode.vx=0;dragNode.vy=0;
  } else if(panning){
    panX=t.clientX-panStartX;
    panY=t.clientY-panStartY;
  }
},{passive:false});

C.addEventListener('touchend',function(){
  if(dragNode){dragNode.pinned=false;dragNode=null;}
  panning=false;
},{passive:false});

// ── Info bar ──────────────────────────────────────────────────────────────────

function showBar(n){
  document.getElementById('bar-text').textContent=n.preview;
  document.getElementById('bar').style.display='flex';
  document.getElementById('hint').style.display='none';
}
function hideBar(){
  document.getElementById('bar').style.display='none';
}

document.getElementById('bar-btn').addEventListener('click',function(){
  if(sel&&window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'open',id:sel.id}));
  }
});

// ── Receive graph data ────────────────────────────────────────────────────────

function loadGraph(data){
  nodes=data.nodes||[];
  edges=data.edges||[];
  if(raf)cancelAnimationFrame(raf);
  initPositions();
  loop();
}

document.addEventListener('message',function(e){
  try{const d=JSON.parse(e.data);if(d.type==='graph')loadGraph(d);}catch(err){}
});
window.addEventListener('message',function(e){
  try{const d=JSON.parse(e.data);if(d.type==='graph')loadGraph(d);}catch(err){}
});
</script>
</body>
</html>`;

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function GraphScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const webviewRef = useRef<WebView>(null);
  const graphDataRef = useRef<any>(null);
  const webviewLoadedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => { fetchGraph(); }, []);

  async function fetchGraph() {
    try {
      const res = await api.get('/api/thoughts/graph');
      const data = res.data;
      setNodeCount(data.nodes?.length ?? 0);
      graphDataRef.current = data;
      if (webviewLoadedRef.current) injectGraph(data);
    } catch {
      setErrorMsg('加载失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }

  function injectGraph(data: any) {
    const msg = JSON.stringify({ type: 'graph', nodes: data.nodes, edges: data.edges });
    const escaped = msg.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webviewRef.current?.injectJavaScript(`
      (function(){
        var e=new MessageEvent('message',{data:'${escaped}'});
        window.dispatchEvent(e);
      })();
      true;
    `);
  }

  function handleWebViewLoad() {
    webviewLoadedRef.current = true;
    if (graphDataRef.current) injectGraph(graphDataRef.current);
  }

  function handleMessage(e: any) {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'open') router.push(`/thought/${data.id}`);
    } catch {}
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#534AB7" />
        </TouchableOpacity>
        <Text style={styles.title}>思维导图</Text>
        <Text style={styles.subtitle}>
          {nodeCount > 0 ? `${nodeCount} 条随想` : ''}
        </Text>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color="#534AB7" size="large" />
          <Text style={styles.loadingText}>正在构建关系图…</Text>
        </View>
      )}

      {!loading && errorMsg !== '' && (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={40} color="#E53935" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {!loading && errorMsg === '' && nodeCount === 0 && (
        <View style={styles.center}>
          <Ionicons name="git-network-outline" size={40} color="#D0CFC8" />
          <Text style={styles.emptyText}>随想数量不足或尚未生成向量</Text>
          <Text style={styles.emptyHint}>记录更多随想后再来查看</Text>
        </View>
      )}

      <WebView
        ref={webviewRef}
        source={{ html: GRAPH_HTML }}
        style={[styles.webview, (loading || errorMsg !== '' || nodeCount === 0) && styles.hidden]}
        onLoad={handleWebViewLoad}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

import { ColorScheme } from '@/constants/Colors';

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
      backgroundColor: c.bg,
    },
    backBtn: { padding: 4 },
    title: { flex: 1, fontSize: 17, fontWeight: '700', color: c.text, marginLeft: 4 },
    subtitle: { fontSize: 13, color: c.textTertiary },
    webview: { flex: 1 },
    hidden: { opacity: 0, position: 'absolute' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    loadingText: { fontSize: 14, color: c.textSecondary, marginTop: 8 },
    errorText: { fontSize: 14, color: c.danger, textAlign: 'center' },
    emptyText: { fontSize: 15, color: c.textTertiary, textAlign: 'center' },
    emptyHint: { fontSize: 13, color: c.placeholder, textAlign: 'center' },
  });
}
