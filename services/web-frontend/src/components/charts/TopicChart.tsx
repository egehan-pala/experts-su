'use client';

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface TopicChartProps {
    data: { name: string; count: number }[];
}

export default function TopicChart({ data }: TopicChartProps) {
    if (!data || data.length === 0) return <div style={{ color: '#999' }}>No topic data available</div>;

    // Sort and take top 8 (Radar gets cluttered easily)
    const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 8);

    // Normalize for fullmark if needed, but simple count is fine
    // We reverse slice to put biggest at top usually, but radar works cyclically

    return (
        <div style={{ width: '100%', height: 500 }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: '#333', textAlign: 'center' }}>Topic Fingerprint</h3>
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart outerRadius="70%" data={sortedData}>
                    <PolarGrid stroke="#eee" />
                    <PolarAngleAxis
                        dataKey="name"
                        tick={{ fill: '#444', fontSize: '0.75rem', fontWeight: 500 }}
                    />
                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                    <Radar
                        name="Documents"
                        dataKey="count"
                        stroke="#d6001c"
                        strokeWidth={2}
                        fill="#d6001c"
                        fillOpacity={0.4}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        itemStyle={{ color: '#d6001c' }}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
