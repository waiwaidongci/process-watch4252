import {useEffect,useState} from 'react';
import {Eye,Trash2,TriangleAlert} from 'lucide-react';
import {Measurement,BaselinePreview} from '../types/domain';
import {previewBaseline} from '../api/baselines';
import {useAction} from '../hooks/useAction';
import {number} from '../utils/format';

export interface ExclusionDraft{sequence:number;reason:string}
interface Props{
  streamId:number
  sampleCount:number
  measurements:Measurement[]
  readOnly:boolean
  exclusions:ExclusionDraft[]
  onExclusionsChange:(items:ExclusionDraft[])=>void
  preview:BaselinePreview|null
  onPreviewChange:(p:BaselinePreview|null)=>void
  onStaleChange:(stale:boolean)=>void
}

export function ExclusionEditor({streamId,sampleCount,measurements,readOnly,exclusions,onExclusionsChange,preview,onPreviewChange,onStaleChange}:Props){
  const a=useAction();
  const [seq,setSeq]=useState('');
  const [reason,setReason]=useState('');
  const reference=measurements.filter(m=>m.sequence<=sampleCount);
  const excludedMap=new Map(exclusions.map(e=>[e.sequence,e]));
  const retained=reference.filter(m=>!excludedMap.has(m.sequence));

  useEffect(()=>{onStaleChange(true);onPreviewChange(null)},
    // 流、参考范围或排除清单变化都会令旧预览失效
    [streamId,sampleCount,exclusions]); // eslint-disable-line react-hooks/exhaustive-deps

  function add(){
    const n=Number(seq);
    if(!Number.isInteger(n)||!reference.some(m=>m.sequence===n)){a.execute(async()=>{throw new Error('请填写参考段内的有效测量序号')});return}
    if(excludedMap.has(n)){a.execute(async()=>{throw new Error('该序号已在排除清单中')});return}
    if(reason.trim().length<2){a.execute(async()=>{throw new Error('请填写至少2字的排除理由')});return}
    onExclusionsChange([...exclusions,{sequence:n,reason:reason.trim()}].sort((x,y)=>x.sequence-y.sequence));
    setSeq('');setReason('');
  }
  function remove(n:number){onExclusionsChange(exclusions.filter(e=>e.sequence!==n))}
  function runPreview(){
    a.execute(async()=>{
      const p=await previewBaseline({stream_id:streamId,sample_count:sampleCount,exclusions});
      onPreviewChange(p);onStaleChange(false);
    })
  }

  return <div className="exclusion-editor">
    <div className="form-heading"><span>02</span><h2>排除参考段失准点</h2></div>
    <p className="caption">按原始测量序号排除已确认的量具失准点并填写理由；移动极差只使用原本相邻且都保留的点对。排除后至少保留30个有效点与20对有效相邻点，监测仍从原参考段末尾之后开始，排除点不回流。</p>
    {!readOnly&&<div className="exclusion-input">
      <label>排除序号<input aria-label="排除序号" type="number" min={1} max={sampleCount} value={seq} onChange={e=>setSeq(e.target.value)} placeholder={`1 – ${sampleCount}`}/></label>
      <label className="reason-field">排除理由<input aria-label="排除理由" value={reason} maxLength={200} onChange={e=>setReason(e.target.value)} placeholder="例如：量具校准前异常高点，已确认失准"/></label>
      <button type="button" className="outline" onClick={add}>加入排除</button>
    </div>}
    {a.error&&<p className="alert exclusion-error">{a.error}</p>}
    <div className="exclusion-table-wrap">
      <table className="exclusion-table">
        <thead><tr><th>测量序号</th><th>膜厚 / μm</th><th>状态</th><th>排除理由</th>{!readOnly&&<th></th>}</tr></thead>
        <tbody>
          {reference.map(m=>{const ex=excludedMap.get(m.sequence);return <tr key={m.sequence} className={ex?'is-excluded':''}>
            <td>#{m.sequence}</td><td className="mono">{number(m.value,4)}</td>
            <td><span className={'phase-tag '+(ex?'excluded':'retained')}>{ex?'已排除':'保留'}</span></td>
            <td className="reason-cell">{ex?.reason||'—'}</td>
            {!readOnly&&<td>{ex&&<button type="button" aria-label={`撤销排除#${m.sequence}`} onClick={()=>remove(m.sequence)}><Trash2 size={13}/></button>}</td>}
          </tr>})}
          {!reference.length&&<tr><td colSpan={5}>正在载入测量来源…</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="exclusion-footer">
      <div className="exclusion-counts"><span>保留 <b>{retained.length}</b> 点</span><span>排除 <b className="alert">{exclusions.length}</b> 点</span>
        {preview&&<span>有效相邻对 <b>{preview.adjacent_pair_count}</b> 对</span>}</div>
      {!readOnly&&<button type="button" className="primary" disabled={a.busy} onClick={runPreview}><Eye size={15}/>预览重算</button>}
    </div>
    {a.busy&&<p className="caption">正在按当前源数据重算控制界限…</p>}
    {preview&&<div className="preview-panel">
      <div className="preview-head"><b>重算预览（未冻结）</b>
        {exclusions.length>0&&<span className="stale-tag"><TriangleAlert size={11}/>源数据或排除项变化后预览失效，须重新计算才能冻结</span>}</div>
      <div className="preview-stats">
        <div><span>均值 μ</span><b>{number(preview.snapshot.statistics.mean,4)}</b></div>
        <div><span>MR均值</span><b>{number(preview.snapshot.statistics.mrbar,4)}</b></div>
        <div><span>σ̂</span><b>{number(preview.snapshot.statistics.sigma,4)}</b></div>
        <div><span>I 界限</span><b>{number(preview.snapshot.statistics.i_lower,3)} / {number(preview.snapshot.statistics.i_upper,3)}</b></div>
        <div><span>MR 上限</span><b>{number(preview.snapshot.statistics.mr_upper,3)}</b></div>
        <div><span>基线I/MR</span><b className={preview.snapshot.statistics.stable?'safe':'alert'}>{preview.snapshot.statistics.stable?'未见越界':'存在信号'}</b></div>
      </div>
    </div>}
  </div>
}
