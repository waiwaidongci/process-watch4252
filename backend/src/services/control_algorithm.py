"""Individuals/MR Phase-I estimation and Phase-II EWMA. Constants: d2=1.128, D4=3.267."""
import math,statistics
from ..utils.fingerprint import fingerprint,measurement_record
D2=1.128
D4=3.267
METHOD_V1="imr-ewma-capability-v1"
METHOD_V2="imr-ewma-capability-exclusion-v2"
MIN_RETAINED_POINTS=30
MIN_ADJACENT_PAIRS=20

def validate_values(values,min_count=5):
    if len(values)<min_count:raise ValueError(f"至少需要{min_count}个测量点")
    if any(type(v) not in (int,float) or abs(v)>1e9 or not math.isfinite(v) for v in values):raise ValueError("测量值必须为有限数字")
    if max(abs(v) for v in values)>1e9:raise ValueError("测量值超出支持范围")

def estimate_baseline(values):
    validate_values(values)
    mr=[abs(b-a) for a,b in zip(values,values[1:])]
    mean=statistics.mean(values);mrbar=statistics.mean(mr);sigma=mrbar/D2
    if sigma<=1e-12:raise ValueError("移动极差为零，无法建立统计控制界限")
    ilow,ihigh=mean-3*sigma,mean+3*sigma
    i_flags=[i+1 for i,x in enumerate(values) if x<ilow or x>ihigh]
    mr_flags=[i+2 for i,x in enumerate(mr) if x>D4*mrbar]
    return {"mean":mean,"mrbar":mrbar,"sigma":sigma,"i_lower":ilow,"i_upper":ihigh,"mr_upper":D4*mrbar,"i_signals":i_flags,"mr_signals":mr_flags,"stable":not(i_flags or mr_flags)}

def freeze_measurements(rows,sample_count):
    ordered=sorted(rows,key=lambda r:r.sequence)
    if len({r.sequence for r in ordered})!=len(ordered):raise ValueError("测量序号重复")
    if not 5<=sample_count<=len(ordered)-3:raise ValueError("基线范围不足或没有后续监测点")
    chosen=ordered[:sample_count];points=[measurement_record(x) for x in chosen]
    return {"points":points,"statistics":estimate_baseline([x.value for x in chosen]),"input_hash":fingerprint(points),"end_sequence":chosen[-1].sequence}

def _reference_rows(rows,sample_count):
    ordered=sorted(rows,key=lambda r:r.sequence)
    if len({r.sequence for r in ordered})!=len(ordered):raise ValueError("测量序号重复")
    if not 5<=sample_count<=len(ordered)-3:raise ValueError("基线范围不足或没有后续监测点")
    return ordered[:sample_count]

def normalize_exclusions(reference,exclusions):
    """校验排除请求，返回 {sequence: reason}。排除按原始测量序号定位。"""
    if not exclusions:return {}
    seq_map={r.sequence:r for r in reference}
    result={}
    for item in exclusions:
        seq=item.get("sequence");reason=(item.get("reason") or "").strip()
        if type(seq) is not int or seq not in seq_map:raise ValueError(f"排除序号 {seq} 不在参考段内")
        if len(reason)<2 or len(reason)>200:raise ValueError(f"序号 {seq} 的排除理由需为2–200字")
        if seq in result:raise ValueError(f"序号 {seq} 重复提交排除")
        result[seq]=reason
    return result

def estimate_baseline_with_exclusions(reference,excluded):
    """参考段估计：保留点按原序号排列；移动极差只用原本相邻且都保留的点对。"""
    retained=[r for r in reference if r.sequence not in excluded]
    if len(retained)<MIN_RETAINED_POINTS:
        raise ValueError(f"排除后至少保留{MIN_RETAINED_POINTS}个有效点，当前{len(retained)}个")
    values=[r.value for r in retained]
    validate_values(values)
    pairs=[(a,b) for a,b in zip(retained,retained[1:]) if b.sequence-a.sequence==1]
    if len(pairs)<MIN_ADJACENT_PAIRS:
        raise ValueError(f"至少需要{MIN_ADJACENT_PAIRS}对有效相邻点，当前{len(pairs)}对")
    mr=[abs(b.value-a.value) for a,b in pairs]
    mean=statistics.mean(values);mrbar=statistics.mean(mr);sigma=mrbar/D2
    if sigma<=1e-12:raise ValueError("移动极差为零，无法建立统计控制界限")
    ilow,ihigh=mean-3*sigma,mean+3*sigma
    i_signals=[r.sequence for r in retained if r.value<ilow or r.value>ihigh]
    mr_signals=[b.sequence for a,b in pairs if abs(b.value-a.value)>D4*mrbar]
    return {"mean":mean,"mrbar":mrbar,"sigma":sigma,"i_lower":ilow,"i_upper":ihigh,
            "mr_upper":D4*mrbar,"i_signals":i_signals,"mr_signals":mr_signals,
            "stable":not(i_signals or mr_signals),"retained_count":len(retained),
            "adjacent_pair_count":len(pairs),"excluded_count":len(excluded)}

def freeze_input_hash(reference,excluded):
    """冻结指纹输入：完整参考段（含排除点）+排除理由，源数据或排除变化即改变。"""
    return fingerprint({"method":METHOD_V2,"reference":[measurement_record(r) for r in reference],
                        "exclusions":[{"sequence":s,"reason":excluded[s]} for s in sorted(excluded)]})

def build_preview(rows,sample_count,exclusions):
    """根据当前源数据计算排除后的预览；不写库。返回预览内容与冻结令牌。"""
    reference=_reference_rows(rows,sample_count)
    excluded=normalize_exclusions(reference,exclusions)
    statistics=estimate_baseline_with_exclusions(reference,excluded)
    seq_map={r.sequence:r for r in reference}
    points=[measurement_record(r) for r in reference if r.sequence not in excluded]
    exclusion_records=[{"sequence":s,"reason":excluded[s],**measurement_record(seq_map[s])}
                       for s in sorted(excluded)]
    input_hash=freeze_input_hash(reference,excluded)
    snapshot={"method_version":METHOD_V2,"points":points,"statistics":statistics,
              "exclusions":exclusion_records,"input_hash":input_hash,
              "end_sequence":reference[-1].sequence,"sample_count":sample_count}
    # 冻结令牌覆盖流内完整源数据与排除请求，源数据变化后预览失效
    preview_hash=fingerprint({"stream_source":[measurement_record(r) for r in sorted(rows,key=lambda r:r.sequence)],
                              "sample_count":sample_count,
                              "exclusions":[{"sequence":s,"reason":excluded[s]} for s in sorted(excluded)]})
    return {"snapshot":snapshot,"preview_hash":preview_hash,
            "retained_count":statistics["retained_count"],"excluded_count":len(excluded),
            "adjacent_pair_count":statistics["adjacent_pair_count"],"valid":True}

def freeze_with_exclusions(rows,sample_count,exclusions):
    """排除感知冻结，返回与旧结构兼容并扩展后的快照。"""
    preview=build_preview(rows,sample_count,exclusions)
    return preview["snapshot"],preview["preview_hash"]

def monitor_values(values,baseline,smoothing=.2,ewma_l=3.,previous=None):
    validate_values(values,3)
    if not math.isfinite(smoothing) or not 0<smoothing<=1:raise ValueError("EWMA lambda必须在(0,1]内")
    if not math.isfinite(ewma_l) or not 1<=ewma_l<=5:raise ValueError("EWMA L必须在[1,5]内")
    mu,sigma,mrbar=baseline['mean'],baseline['sigma'],baseline['mrbar']
    if not all(math.isfinite(v) for v in [mu,sigma,mrbar]) or sigma<=1e-12:raise ValueError("基线参数无效")
    z=mu;points=[];previous=mu if previous is None else previous
    for i,x in enumerate(values,1):
        mr=abs(x-previous);previous=x;z=smoothing*x+(1-smoothing)*z
        width=ewma_l*sigma*math.sqrt(smoothing/(2-smoothing)*(1-(1-smoothing)**(2*i)))
        lower,upper=mu-width,mu+width
        flags=[]
        if x<mu-3*sigma or x>mu+3*sigma:flags.append('individual')
        if mr>D4*mrbar:flags.append('moving_range')
        if z<lower or z>upper:flags.append('ewma')
        points.append({"value":x,"moving_range":mr,"ewma":z,"ewma_lower":lower,"ewma_upper":upper,"signals":flags})
    return points

def analyze_process(rows,baseline,stream,smoothing=.2,ewma_l=3.):
    ordered=sorted(rows,key=lambda x:x.sequence)
    if len({x.sequence for x in ordered})!=len(ordered):raise ValueError("测量序号重复")
    validate_values([x.value for x in ordered])
    snapshot=baseline.snapshot
    monitored=[x for x in ordered if x.sequence>snapshot['end_sequence']]
    if len(monitored)<50:raise ValueError("能力研究至少需要50个后续独立监测点")
    if not (math.isfinite(stream.lsl) and math.isfinite(stream.usl) and stream.lsl<stream.usl):raise ValueError("规格下限必须小于上限且均为有限数字")
    # 监测仍从原参考段末尾之后开始；排除点不回流，也不补位
    method=snapshot.get("method_version",METHOD_V1)
    excluded={e["sequence"] for e in snapshot.get("exclusions",[])}
    last_retained=next((r for r in reversed(ordered[:baseline.sample_count]) if r.sequence not in excluded),None)
    control=monitor_values([x.value for x in monitored],snapshot['statistics'],smoothing,ewma_l,last_retained.value if last_retained else None)
    points=[dict(measurement_record(row),**point) for row,point in zip(monitored,control)]
    # 参考段末保留点与首监测点之间若夹有排除点，则该极差跨缺口，不纳入MR判定并置空
    if excluded and monitored and last_retained is not None and monitored[0].sequence-last_retained.sequence>1:
        points[0]["moving_range"]=None
        points[0]["signals"]=[k for k in points[0]["signals"] if k!="moving_range"]
    signals=[{"sequence":p['sequence'],"kind":kind,"value":p['ewma'] if kind=='ewma' else p['moving_range'] if kind=='moving_range' else p['value']} for p in points for kind in p['signals']]
    from .capability_algorithm import capability
    stable=snapshot['statistics']['stable'] and not signals
    cap=capability([x.value for x in monitored],stream.lsl,stream.usl,stable)
    stream_data={"id":stream.id,"code":stream.code,"name":stream.name,"lsl":stream.lsl,"usl":stream.usl,"unit":stream.unit}
    input_data={"method":method,"stream":stream_data,"source":[measurement_record(x) for x in ordered],"baseline":snapshot,"smoothing":smoothing,"ewma_l":ewma_l}
    if method==METHOD_V2:
        # 新口径：源参考段或排除理由变化都会改变快照指纹
        current_hash=freeze_input_hash(ordered[:baseline.sample_count],
                                       {e["sequence"]:e["reason"] for e in snapshot.get("exclusions",[])})
        baseline_changed=current_hash!=snapshot['input_hash']
    else:
        # 旧数据兼容：沿用原仅保留点快照的口径
        source_baseline=[measurement_record(x) for x in ordered[:baseline.sample_count]]
        baseline_changed=fingerprint(source_baseline)!=snapshot['input_hash']
    result={"stream":stream_data,"baseline":{"id":baseline.id,"name":baseline.name,"sample_count":baseline.sample_count,**snapshot},"points":points,"signals":signals,"signal_counts":{k:sum(s['kind']==k for s in signals) for k in ['individual','moving_range','ewma']},"monitor_count":len(monitored),"stable":stable,"capability":cap,"smoothing":smoothing,"ewma_l":ewma_l,"baseline_source_changed":baseline_changed,"input_hash":fingerprint(input_data),"method_version":method,"interpretation":"未见本工具三类越界信号；能力值仍以正态近似和独立性为前提" if stable else "过程存在稳定性信号，Cp/Cpk不得用于宣称过程能力","assumptions":"正态近似、按时间独立采样；未检验正态性或自相关。控制界限由冻结基线估计，规格18–22等为外部要求，两者不同。"}
    if excluded:
        note=f"参考段已排除{len(excluded)}个量具失准点；移动极差仅使用原本相邻且都保留的点对。"
        if monitored and last_retained is not None and monitored[0].sequence-last_retained.sequence>1:
            note+="首监测点与末保留点之间夹有排除点，该跨缺口极差不参与MR判定。"
        result["exclusion_note"]=note
    return result
