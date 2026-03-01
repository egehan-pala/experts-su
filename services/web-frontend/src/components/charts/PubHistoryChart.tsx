'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PubHistoryChartProps {
    data: { year: number; pub_count: number; citations: number }[];
    type: 'publications' | 'citations';
}

export default function PubHistoryChart({ data, type }: PubHistoryChartProps) {
    if (!data || data.length === 0) return <div style={{ color: '#999' }}>No data available</div>;

    const isPub = type === 'publications';
    const color = isPub ? '#002855' : '#d6001c';
    const title = isPub ? 'Publication Count' : 'Citation Count';
    const dataKey = isPub ? 'pub_count' : 'citations';

    return (
        <div style={{ width: '100%', height: 450 }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#333' }}>{title}</h3>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{
                        top: 10,
                        right: 30,
                        left: 10,
                        bottom: 0,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="year" tick={{ fill: '#666' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: color }} axisLine={false} tickLine={false} />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        itemStyle={{ color: color }}
                    />
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.3}
                        name={title}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
