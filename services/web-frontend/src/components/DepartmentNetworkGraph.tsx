'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import * as d3Force from 'd3-force';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading graph engine...
        </div>
    )
});

interface GlobalNode {
    id: string;
    name: string;
    dept: string | null;
    image_url?: string | null;
    // d3 runtime fields
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

interface GlobalLink {
    source: string | GlobalNode;
    target: string | GlobalNode;
    value: number;
}

interface GlobalGraph {
    nodes: GlobalNode[];
    links: GlobalLink[];
}

const DEPT_COLORS: Record<string, string> = {
    FENS: '#3b82f6',  // blue
    FASS: '#f59e0b',  // amber
    SBS: '#10b981',   // green
};

const DEPT_LABELS: Record<string, string> = {
    FENS: 'Faculty of Engineering & Natural Sciences',
    FASS: 'Faculty of Art & Social Sciences',
    SBS: 'Sabancı Business School',
};

function getDeptColor(dept: string | null): string {
    if (!dept) return '#94a3b8';
    return DEPT_COLORS[dept] || '#94a3b8';
}

export default function DepartmentNetworkGraph() {
    const [graphData, setGraphData] = useState<GlobalGraph | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoveredNodeData, setHoveredNodeData] = useState<GlobalNode | null>(null);
    const [stats, setStats] = useState({ fens: 0, fass: 0, sbs: 0, links: 0 });
    const [activeDept, setActiveDept] = useState<string | null>(null);

    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 1200, height: 750 });

    // Responsive sizing
    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const ro = new ResizeObserver(() => {
            setDimensions({
                width: el.clientWidth || 1200,
                height: Math.max(600, Math.floor((el.clientWidth || 1200) * 0.55))
            });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Fetch global network
    useEffect(() => {
        setLoading(true);
        fetch('http://localhost:8000/network/global')
            .then(res => res.json())
            .then((data: GlobalGraph) => {
                setGraphData(data);
                setStats({
                    fens: data.nodes.filter(n => n.dept === 'FENS').length,
                    fass: data.nodes.filter(n => n.dept === 'FASS').length,
                    sbs: data.nodes.filter(n => n.dept === 'SBS').length,
                    links: data.links.length,
                });
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load global network:', err);
                setLoading(false);
            });
    }, []);

    // Configure D3 forces
    useEffect(() => {
        if (!fgRef.current || !graphData?.nodes?.length) return;
        const fg = fgRef.current;

        fg.d3Force('link', d3Force.forceLink()
            .id((d: any) => d.id)
            .distance(60)
            .strength(0.5)
        );
        fg.d3Force('charge', d3Force.forceManyBody().strength(-80));
        fg.d3Force('collide', d3Force.forceCollide().radius(10).strength(0.8));
        fg.d3Force('center', d3Force.forceCenter(0, 0));
        fg.d3Force('gravityX', d3Force.forceX(0).strength(0.05));
        fg.d3Force('gravityY', d3Force.forceY(0).strength(0.05));
        fg.d3ReheatSimulation();

        const t = setTimeout(() => {
            try { fg.zoomToFit(500, 60); } catch { }
        }, 1500);
        return () => clearTimeout(t);
    }, [graphData]);

    // Memoize visible graph (filter by activeDept if set)
    const visibleData = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };
        if (!activeDept) return graphData;

        // When a dept filter is active, show that dept + its direct neighbours
        const deptNodeIds = new Set(graphData.nodes.filter(n => n.dept === activeDept).map(n => n.id));
        const neighbourIds = new Set<string>();
        for (const l of graphData.links) {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            if (deptNodeIds.has(s)) neighbourIds.add(t);
            if (deptNodeIds.has(t)) neighbourIds.add(s);
        }
        const allVisible = new Set([...deptNodeIds, ...neighbourIds]);
        return {
            nodes: graphData.nodes.filter(n => allVisible.has(n.id)),
            links: graphData.links.filter(l => {
                const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
                const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
                return allVisible.has(s) && allVisible.has(t);
            })
        };
    }, [graphData, activeDept]);

    const nodeCanvasObject = useCallback(
        (obj: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const node = obj as GlobalNode;
            const isHovered = hoveredNode === node.id;
            const isMatch = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase());
            const hasSearch = searchQuery.length > 0;
            const isDeptFiltered = !!activeDept;
            const isDeptNode = node.dept === activeDept;

            let alpha = 1;
            if (hasSearch) alpha = isMatch ? 1 : 0.08;
            else if (isDeptFiltered && !isDeptNode) alpha = 0.3;

            const radius = isHovered ? 7 / globalScale : 5 / globalScale;
            const color = getDeptColor(node.dept);

            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = isHovered ? '#ffffff' : color;
            ctx.fill();

            ctx.lineWidth = isHovered ? 2 / globalScale : 1.2 / globalScale;
            ctx.strokeStyle = isHovered ? color : 'rgba(255,255,255,0.4)';
            ctx.stroke();
            ctx.globalAlpha = 1;

            if (isHovered || isMatch) {
                const label = node.name;
                const fontSize = 11 / globalScale;
                ctx.font = `600 ${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                const textX = node.x || 0;
                const textY = (node.y || 0) + radius + 3 / globalScale;
                const metrics = ctx.measureText(label);
                const px = 3 / globalScale, py = 1.5 / globalScale;
                const textH = fontSize + py * 2;

                ctx.fillStyle = 'rgba(15,23,42,0.88)';
                ctx.fillRect(textX - metrics.width / 2 - px, textY - py, metrics.width + px * 2, textH);

                ctx.fillStyle = '#f8fafc';
                ctx.fillText(label, textX, textY);
            }
        },
        [hoveredNode, searchQuery, activeDept]
    );

    const linkColor = useCallback((l: any) => {
        const s = typeof l.source === 'object' ? l.source.dept : null;
        const t = typeof l.target === 'object' ? l.target.dept : null;
        if (s && t && s === t) {
            return getDeptColor(s).replace(')', ', 0.6)').replace('rgb(', 'rgba(') + (getDeptColor(s).startsWith('#') ? '99' : '');
        }
        return 'rgba(148, 163, 184, 0.25)';
    }, []);

    const linkWidth = useCallback((l: any) => {
        return Math.min(3, 0.5 + (l.value || 1) * 0.3);
    }, []);

    // Total joint papers and collaborator count for hovered node
    const hoveredJointPapers = useMemo(() => {
        if (!hoveredNode || !graphData) return 0;
        return graphData.links.reduce((sum, l) => {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            return (s === hoveredNode || t === hoveredNode) ? sum + (l.value || 0) : sum;
        }, 0);
    }, [hoveredNode, graphData]);

    const hoveredCollaborators = useMemo(() => {
        if (!hoveredNode || !graphData) return 0;
        return graphData.links.reduce((count, l) => {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            return (s === hoveredNode || t === hoveredNode) ? count + 1 : count;
        }, 0);
    }, [hoveredNode, graphData]);

    return (
        <div style={{ padding: '2rem 0', backgroundColor: '#0f172a', minHeight: '70vh' }}>
            <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1.5rem' }}>

                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace', marginBottom: '0.25rem' }}>
                        Faculty Collaboration Network
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                        Co-authorship connections between all Sabancı University faculty members, clustered by department.
                    </p>
                </div>

                {/* Controls Row */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>

                    {/* Dept filter pills */}
                    {['FENS', 'FASS', 'SBS'].map(dept => (
                        <button
                            key={dept}
                            onClick={() => setActiveDept(activeDept === dept ? null : dept)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.4rem 1rem',
                                borderRadius: '999px',
                                border: `2px solid ${getDeptColor(dept)}`,
                                backgroundColor: activeDept === dept ? getDeptColor(dept) : 'transparent',
                                color: activeDept === dept ? '#fff' : getDeptColor(dept),
                                fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: getDeptColor(dept), display: 'inline-block' }} />
                            {dept}
                        </button>
                    ))}

                    {activeDept && (
                        <button
                            onClick={() => setActiveDept(null)}
                            style={{ padding: '0.4rem 0.8rem', borderRadius: '999px', border: '1px solid #475569', background: 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                            Clear filter ✕
                        </button>
                    )}

                    {/* Search */}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.4rem 0.75rem' }}>
                        <span style={{ fontSize: '0.875rem' }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search faculty..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '0.875rem', outline: 'none', width: '180px' }}
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>✕</button>
                        )}
                    </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    {Object.entries(DEPT_COLORS).map(([dept, color]) => (
                        <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, color }}>{dept}</span>
                            <span>— {dept === 'FENS' ? stats.fens : dept === 'FASS' ? stats.fass : stats.sbs} researchers</span>
                        </div>
                    ))}
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: 'auto' }}>
                        {stats.links} collaboration links
                    </div>
                </div>

                {/* Graph Canvas */}
                <div
                    ref={containerRef}
                    style={{
                        width: '100%',
                        height: dimensions.height,
                        position: 'relative',
                        overflow: 'hidden',
                        background: '#0b1120',
                        borderRadius: '12px',
                        border: '2px solid #1e293b',
                        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)'
                    }}
                >
                    {loading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 1s linear infinite' }}>⟳</div>
                                <div>Building collaboration network...</div>
                                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#475569' }}>This may take a moment on first load</div>
                            </div>
                        </div>
                    ) : !graphData || graphData.nodes.length === 0 ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                            No collaboration data available.
                        </div>
                    ) : (
                        <ForceGraph2D
                            ref={fgRef}
                            graphData={visibleData}
                            width={dimensions.width}
                            height={dimensions.height}
                            backgroundColor="#0b1120"
                            nodeCanvasObject={nodeCanvasObject}
                            nodePointerAreaPaint={(node: any, color, ctx) => {
                                const r = 8;
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(node.x || 0, node.y || 0, r, 0, 2 * Math.PI);
                                ctx.fill();
                            }}
                            linkWidth={linkWidth}
                            linkColor={linkColor}
                            onNodeHover={(node: any) => {
                                setHoveredNode(node ? node.id : null);
                                setHoveredNodeData(node ? node as GlobalNode : null);
                            }}
                            onNodeClick={(node: any) => {
                                if (node?.id) router.push(`/authors/${node.id}`);
                            }}
                            enableNodeDrag={true}
                            enableZoomInteraction={true}
                            cooldownTicks={200}
                        />
                    )}

                    {/* Hover Info Panel */}
                    <div style={{
                        position: 'absolute', top: 16, right: 16,
                        background: 'rgba(15,23,42,0.95)', border: `1px solid ${hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#1e293b'}`,
                        borderRadius: '10px', padding: '1rem 1.25rem',
                        width: '220px',
                        opacity: hoveredNodeData ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                        pointerEvents: 'none',
                        boxShadow: hoveredNodeData ? `0 0 12px ${getDeptColor(hoveredNodeData?.dept)}44` : 'none'
                    }}>
                        <div style={{ color: hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#3b82f6', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                            {hoveredNodeData?.dept || 'Faculty'}
                        </div>
                        <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: 1.3 }}>
                            {hoveredNodeData?.name || ''}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#64748b' }}>Joint Papers</span>
                                <span style={{ color: '#f8fafc', fontWeight: 700 }}>{hoveredJointPapers}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#64748b' }}>Collaborators</span>
                                <span style={{ color: '#f8fafc', fontWeight: 700 }}>{hoveredCollaborators}</span>
                            </div>
                        </div>
                        <div style={{ marginTop: '0.75rem', fontSize: '0.65rem', color: '#475569' }}>Click to view profile →</div>
                    </div>

                    {/* Legend overlay */}
                    <div style={{
                        position: 'absolute', bottom: 16, left: 16,
                        background: 'rgba(15,23,42,0.92)', border: '1px solid #1e293b',
                        borderRadius: '8px', padding: '0.75rem 1rem',
                        fontSize: '0.75rem', color: '#cbd5e1',
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legend</div>
                        {Object.entries(DEPT_LABELS).map(([dept, label]) => (
                            <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: getDeptColor(dept), display: 'inline-block', flexShrink: 0 }} />
                                <span>{dept} – {label}</span>
                            </div>
                        ))}
                        <div style={{ marginTop: '0.5rem', borderTop: '1px solid #1e293b', paddingTop: '0.4rem', color: '#475569' }}>
                            Edge thickness = joint papers · Click node = profile
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
