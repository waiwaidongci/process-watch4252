import {request} from './client';import {Baseline,BaselinePreview} from '../types/domain';
export interface BaselineFreezeInput{name:string;stream_id:number;sample_count:number;exclusions?:{sequence:number;reason:string}[];preview_hash?:string}
export const getBaselines=()=>request<Baseline[]>('/baselines');
export const previewBaseline=(data:{stream_id:number;sample_count:number;exclusions:{sequence:number;reason:string}[]})=>request<BaselinePreview>('/baselines/preview',{method:'POST',body:JSON.stringify(data)});
export const freezeBaseline=(data:BaselineFreezeInput)=>request<Baseline>('/baselines',{method:'POST',body:JSON.stringify(data)});
