from fastapi import HTTPException
from ..models import Baseline,Measurement
from ..utils.serialize import record
from .stream_service import get_stream
from .control_algorithm import freeze_measurements,build_preview,freeze_with_exclusions
from .audit_service import log

def list_baselines(db):return [record(b) for b in db.query(Baseline).order_by(Baseline.id.desc())]

def _source_rows(db,stream_id):
    get_stream(db,stream_id)
    return db.query(Measurement).filter_by(stream_id=stream_id).order_by(Measurement.sequence).all()

def preview_baseline(db,data,user):
    rows=_source_rows(db,data.stream_id)
    if len(rows)-data.sample_count<50:raise HTTPException(422,"至少保留50个后续监测点")
    try:preview=build_preview(rows,data.sample_count,[e.model_dump() for e in data.exclusions])
    except ValueError as e:raise HTTPException(422,str(e))
    log(db,user.email,"baseline.preview",f"{data.stream_id}:{preview['retained_count']}pt")
    db.commit()
    return preview

def create_baseline(db,data,user):
    rows=_source_rows(db,data.stream_id)
    if len(rows)-data.sample_count<50:raise HTTPException(422,"至少保留50个后续监测点")
    if db.query(Baseline).filter_by(name=data.name).first():raise HTTPException(409,"基线名称已存在")
    exclusions=[e.model_dump() for e in data.exclusions]
    if exclusions:
        # 必须先预览；源数据或排除项变化会令预览令牌失效，须重新计算
        if not data.preview_hash:raise HTTPException(409,"请先预览重算，确认结果后再冻结")
        try:snapshot,current_hash=freeze_with_exclusions(rows,data.sample_count,exclusions)
        except ValueError as e:raise HTTPException(422,str(e))
        if current_hash!=data.preview_hash:
            raise HTTPException(409,"源数据或排除项已变化，预览已失效，请重新计算后再冻结")
    else:
        # 无排除：沿用原v1口径，旧结果保持可复现
        try:snapshot=freeze_measurements(rows,data.sample_count)
        except ValueError as e:raise HTTPException(422,str(e))
    row=Baseline(name=data.name,stream_id=data.stream_id,
                 sample_count=data.sample_count,snapshot=snapshot,owner=user.name)
    db.add(row);db.flush();log(db,user.email,"baseline.freeze",row.id);db.commit();return record(row)
