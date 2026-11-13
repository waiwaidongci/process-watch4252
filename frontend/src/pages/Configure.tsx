import {FormEvent,useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowRight,Snowflake} from 'lucide-react';
import {useProcessData} from '../hooks/useProcess';
import {useAuth} from '../stores/auth';
import {useAction} from '../hooks/useAction';
import {freezeBaseline} from '../api/baselines';
import {createRun} from '../api/runs';
import {StreamSelector} from '../components/StreamSelector';
import {ExclusionEditor,ExclusionDraft} from '../components/ExclusionEditor';
import {BaselinePreview} from '../types/domain';
import {Notice} from '../components/common/Notice';
import {number} from '../utils/format';

export function Configure(){
  const s=useProcessData(),{user}=useAuth(),a=useAction(),navigate=useNavigate();
  const readOnly=user?.role==='viewer';
  const [sid,setSid]=useState(0),[bname,setBname]=useState(''),[count,setCount]=useState(80);
  const [bid,setBid]=useState(0),[name,setName]=useState(''),[smoothing,setSmoothing]=useState(.2),[width,setWidth]=useState(3);
  const [exclusions,setExclusions]=useState<ExclusionDraft[]>([]);
  const [preview,setPreview]=useState<BaselinePreview|null>(null);
  const [stale,setStale]=useState(false);
  const stream=s.streams.find(x=>x.id===sid)||s.streams.find(x=>x.code==='T-03')||s.streams[0];
  const baselines=s.baselines.filter(x=>x.stream_id===stream?.id);
  const baseline=baselines.find(x=>x.id===bid)||baselines[0];

  useEffect(()=>{
    if(stream)s.loadMeasurements(stream.id);
    setExclusions([]);setPreview(null);setStale(false);
  },[stream?.id,s.loadMeasurements]);

  function freeze(e:FormEvent){
    e.preventDefault();
    a.execute(async()=>{
      if(exclusions.length&&(!preview||stale))throw new Error('存在排除项时请先预览重算，确认结果后再冻结');
      const b=await freezeBaseline({
        name:bname,stream_id:stream!.id,sample_count:count,
        exclusions:exclusions.map(x=>({sequence:x.sequence,reason:x.reason})),
        preview_hash:preview?.preview_hash||''
      });
      setBid(b.id);setBname('');setExclusions([]);setPreview(null);setStale(false);
      await s.refresh();
    });
  }
  function run(e:FormEvent){
    e.preventDefault();
    a.execute(async()=>{
      const r=await createRun({name,baseline_id:baseline!.id,smoothing,ewma_l:width});
      navigate('/results?run='+r.id);
    });
  }
  const freezeDisabled=a.busy||(exclusions.length>0&&(!preview||stale));

  return <div className="page"><div className="page-title"><div>
    <p className="eyebrow">BASELINE & EXECUTION / 03</p>
    <h1>基线与运行<span>先冻结参考区间，再监测后续点；失准点可按序号排除后重算。</span></h1>
  </div><Snowflake size={27}/></div>
  <Notice message={s.error||a.error} retry={s.refresh}/>
  <div className="editor-grid"><section>
    <StreamSelector streams={s.streams} value={stream?.id||0} onChange={n=>{setSid(n);setBid(0)}}/>
    <form className="baseline-form" onSubmit={freeze}>
      <div className="form-heading"><span>01</span><h2>建立冻结基线</h2></div>
      <div className="form-row">
        <label>基线名称<input aria-label="基线名称" value={bname} onChange={e=>setBname(e.target.value)} minLength={2} placeholder="例如：T-03 工艺复核前80点" required disabled={readOnly}/></label>
        <label>前置样本数<input aria-label="前置样本数" type="number" min="30" max="190" value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
      </div>
      <p className="caption">统计控制界限从参考段保留点计算并冻结；规格界限来自外部要求，不参与控制界限估计。</p>
      <ExclusionEditor streamId={stream?.id||0} sampleCount={count} measurements={s.measurements} readOnly={!!readOnly}
        exclusions={exclusions} onExclusionsChange={setExclusions} preview={preview}
        onPreviewChange={setPreview} onStaleChange={setStale}/>
      {exclusions.length>0&&(!preview||stale)&&!readOnly&&<p className="alert role-note">存在排除项：必须先点击“预览重算”，且预览未失效时才能冻结。</p>}
      {!readOnly&&<button className="outline" disabled={freezeDisabled}>{exclusions.length?'按预览结果冻结基线':'冻结基线'}</button>}
    </form>
    <form className="run-form" onSubmit={run}>
      <div className="form-heading"><span>03</span><h2>提交后续监测</h2></div>
      <label>使用基线<select aria-label="使用基线" value={baseline?.id||''} onChange={e=>setBid(Number(e.target.value))}>{baselines.map(b=><option key={b.id} value={b.id}>{b.name} / {b.sample_count} 点{b.snapshot.statistics.excluded_count?` / 排除${b.snapshot.statistics.excluded_count}点`:''}</option>)}</select></label>
      {baseline&&<div className="baseline-snapshot"><span>μ {number(baseline.snapshot.statistics.mean)} / σ̂ {number(baseline.snapshot.statistics.sigma)}</span><b className={baseline.snapshot.statistics.stable?'safe':'alert'}>{baseline.snapshot.statistics.stable?'基线未见I/MR越界':'基线已有I/MR信号'}</b>{baseline.snapshot.statistics.excluded_count?<small>已排除 {baseline.snapshot.statistics.excluded_count} 点 / 保留 {baseline.snapshot.statistics.retained_count} 点</small>:null}</div>}
      <label>观察任务名称<input aria-label="观察任务名称" value={name} onChange={e=>setName(e.target.value)} minLength={2} placeholder="例如：T-03 夜班漂移复核" required disabled={readOnly}/></label>
      <div className="form-row">
        <label>EWMA λ<input type="number" aria-label="EWMA lambda" min="0.01" max="1" step="0.01" value={smoothing} onChange={e=>setSmoothing(Number(e.target.value))}/></label>
        <label>EWMA L<input type="number" aria-label="EWMA L" min="1" max="5" step="0.1" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>
      </div>
      {readOnly?<p className="role-note">观察员可阅读配置；建立基线和运行需要分析师权限。</p>:<button className="primary" disabled={a.busy||!baseline}>排队计算 <ArrowRight size={16}/></button>}
    </form>
  </section>
  <aside className="method-panel">
    <span className="eyebrow">FROZEN REFERENCE / 01</span><h2>把两条线分开。</h2>
    <div className="method-item"><b>统计控制界限</b><p>由基线保留点的均值与移动极差估计sigma，表示过程自身的波动范围。</p></div>
    <div className="method-item"><b>失准点排除口径</b><p>仅可排除已确认的量具失准点并记录理由；移动极差只取原本相邻且都保留的点对，排除点不回流监测段，监测仍从原参考段末尾之后开始。</p></div>
    <div className="method-item"><b>外部规格界限</b><p>当前18–22μm，表示产品要求；不是控制界限。</p></div>
    <div className="method-item"><b>能力解释先决</b><p>基线与监测段均无I/MR/EWMA信号，且独立采样、近似正态时，才讨论Cp/Cpk。此处不检验正态性。</p></div>
  </aside></div></div>
}
