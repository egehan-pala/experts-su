'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as d3Force from 'd3-force';

interface NetworkNode {
    id: string;
    name: string;
    val: number;
    image_url?: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

interface NetworkLink {
    source: string;
    target: string;
    value: number;
}

interface NetworkData {
    nodes: NetworkNode[];
    links: NetworkLink[];
}

interface NetworkGraphProps {
    data: NetworkData;
}

export default function NetworkGraph({ data }: NetworkGraphProps) {
    const router = useRouter();

    const layoutData = useMemo(() => {
        if (!data || data.nodes.length === 0) return null;

        const nodes = data.nodes.map(n => ({ ...n }));
        const links = data.links.map(l => ({ ...l }));

        const sim = d3Force.forceSimulation(nodes as any)
            .force('link', d3Force.forceLink(links as any).id((d: any) => d.id).distance(80).strength(0.3))
            .force('charge', d3Force.forceManyBody().strength(-200))
            .force('center', d3Force.forceCenter(0, 0))
            .force('collide', d3Force.forceCollide().radius(20).strength(0.8))
            .stop();

        for (let i = 0; i < 300; i++) sim.tick();

        const padding = 40;
        const xs = nodes.map(n => (n as any).x || 0);
        const ys = nodes.map(n => (n as any).y || 0);
        const minX = Math.min(...xs) - padding;
        const maxX = Math.max(...xs) + padding;
        const minY = Math.min(...ys) - padding;
        const maxY = Math.max(...ys) + padding;

        return {
            nodes: nodes as (NetworkNode & { x: number; y: number })[],
            links: links as any[],
            viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
        };
    }, [data]);

    if (!data || data.nodes.length === 0) return <div style={{ color: '#999' }}>No network data available</div>;
    if (!layoutData) return null;

    return (
        <div style={{ width: '100%', height: '600px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', background: '#f9f9f9', position: 'relative' }}>
            <h3 style={{ fontSize: '1.2rem', padding: '1rem', margin: 0, color: '#333', position: 'absolute', zIndex: 10 }}>Co-Author Network</h3>
            <svg
                viewBox={layoutData.viewBox}
                preserveAspectRatio="xMidYMid meet"
                className="co-authorship-svg"
                style={{ width: '100%', height: '100%', display: 'block', background: '#f9f9f9' }}
            >
                <g className="edges-layer">
                    {layoutData.links.map((link: any, i: number) => {
                        const s = link.source;
                        const t = link.target;
                        return (
                            <line
                                key={`e-${i}`}
                                className="edge"
                                x1={s.x}
                                y1={s.y}
                                x2={t.x}
                                y2={t.y}
                                stroke="#cccccc"
                                strokeWidth={Math.sqrt(link.value || 0) + 1}
                            />
                        );
                    })}
                </g>
                <g className="nodes-layer">
                    {layoutData.nodes.map(node => {
                        const r = Math.sqrt(node.val || 1) * 2;
                        return (
                            <g
                                key={node.id}
                                className="node-group"
                                style={{ cursor: 'pointer' }}
                                onClick={() => router.push(`/authors/${node.id}`)}
                            >
                                <circle cx={node.x} cy={node.y} r={r} fill="#002855" stroke="#fff" strokeWidth={1} />
                                <text
                                    x={node.x}
                                    y={node.y + r + 6}
                                    textAnchor="middle"
                                    fontSize={5}
                                    fill="#333"
                                    fontFamily="'Courier New', Courier, monospace"
                                >
                                    {node.name}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
}
