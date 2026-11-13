export interface User{name:string;email:string;role:string}
export interface Stream{id:number;code:string;name:string;description:string;source:string;lsl:number;usl:number;unit:string;measurement_count:number}
export interface Measurement{source_key:string;sequence:number;measured_at:string;value:number}
export interface Exclusion extends Measurement{reason:string}
export interface BaselineStats{mean:number;mrbar:number;sigma:number;i_lower:number;i_upper:number;mr_upper:number;i_signals:number[];mr_signals:number[];stable:boolean;retained_count?:number;adjacent_pair_count?:number;excluded_count?:number}
export interface BaselineSnapshot{statistics:BaselineStats;points:Measurement[];input_hash:string;end_sequence:number;method_version?:string;exclusions?:Exclusion[];sample_count?:number}
export interface Baseline{id:number;name:string;stream_id:number;sample_count:number;snapshot:BaselineSnapshot;owner:string}
export interface BaselinePreview{snapshot:BaselineSnapshot;preview_hash:string;retained_count:number;excluded_count:number;adjacent_pair_count:number;valid:boolean}
export interface ControlPoint extends Measurement{moving_range:number|null;ewma:number;ewma_lower:number;ewma_upper:number;signals:string[]}
export interface Result{stream:Stream;baseline:{id:number;name:string;sample_count:number;statistics:BaselineStats;input_hash:string;exclusions?:Exclusion[];points?:Measurement[];method_version?:string};points:ControlPoint[];signals:{sequence:number;kind:string;value:number}[];signal_counts:Record<string,number>;monitor_count:number;stable:boolean;capability:{cp:number;cpk:number;mean:number;sigma_within:number;interpretable:boolean;note:string};smoothing:number;ewma_l:number;input_hash:string;interpretation:string;assumptions:string;baseline_source_changed:boolean;exclusion_note?:string}
export interface Run{id:number;name:string;baseline_id:number;smoothing:number;ewma_l:number;status:string;result:Result;error:string;owner:string;created_at:string}
export interface Investigation{id:number;run_id:number;title:string;finding:string;action:string;status:string;owner:string;reviewer:string;review_note:string;created_at:string;reviewed_at:string}
export interface Audit{id:number;actor:string;action:string;target:string;created_at:string}
