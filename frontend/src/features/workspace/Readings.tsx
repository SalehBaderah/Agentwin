import type { State } from "@/types";
import { useState } from "react";
import { Activity } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { time } from "@/types";
import { metricValue } from "@/lib/format";

export function Readings({ state }: { state: State }) {
  const [field, setField] = useState(state.project.graph.primary_field);
  const [transitionLimit, setTransitionLimit] = useState(5);
  const metric = state.project.graph.fields[field];
  const rows = state.readings.map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const transitions = state.readings.filter((reading,index,all)=>index===0 || reading.readings[field]!==all[index-1].readings[field]).reverse();
  return <div className="readings-view"><div className="chart-header"><div><h3>Readings</h3><p>{metric.data_type === "number" ? "Stored observations for this project and selected session." : "State changes only; repeated samples with the same value are collapsed."}</p></div><label>Metric<select value={field} onChange={(event) => {setField(event.target.value);setTransitionLimit(5);}}>{Object.entries(state.project.graph.fields).map(([key, item]) => <option value={key} key={key}>{item.label} {item.unit}</option>)}</select></label></div>{!rows.length ? <div className="chart-empty"><Activity/><strong>No readings in this session</strong><p>Readings appear here when the selected source reports telemetry. Stored values from other sessions remain separate.</p></div> : metric.data_type === "number" ? <div className="metric-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><Line dataKey="value" stroke="var(--chart-line)" isAnimationActive={false} dot={false} connectNulls={false}/><XAxis dataKey="received" tickFormatter={(value) => time(Number(value))}/><YAxis/><Tooltip labelFormatter={(value) => time(Number(value))}/></LineChart></ResponsiveContainer></div> : <><div className="transition-list">{transitions.slice(0,transitionLimit).map((reading) => <div key={reading.id}><span>{time(reading.received)}</span><strong>{metricValue(reading.readings[field], metric.precision)}</strong></div>)}</div>{transitions.length>5&&<button className="transition-more" type="button" onClick={()=>setTransitionLimit(transitionLimit>=transitions.length?5:Math.min(transitionLimit+10,transitions.length))}>{transitionLimit>=transitions.length?"Show less":`Show more (${transitions.length-transitionLimit})`}</button>}</>}</div>;
}
