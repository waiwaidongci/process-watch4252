from pydantic import BaseModel,Field
class ExclusionInput(BaseModel):
    sequence:int=Field(ge=1)
    reason:str=Field(min_length=2,max_length=200)
class BaselineInput(BaseModel):
    name:str=Field(min_length=2,max_length=120)
    stream_id:int
    sample_count:int=Field(default=80,ge=30,le=190)
    exclusions:list[ExclusionInput]=Field(default_factory=list)
    preview_hash:str=Field(default="",max_length=80)
class BaselinePreviewInput(BaseModel):
    stream_id:int
    sample_count:int=Field(default=80,ge=30,le=190)
    exclusions:list[ExclusionInput]=Field(default_factory=list)
