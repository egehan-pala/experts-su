'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
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

// Logarithmic scale helper for link widths
function logScale(value: number, minVal: number, maxVal: number, minScale: number, maxScale: number) {
    if (value <= minVal) return minScale;
    if (value >= maxVal) return maxScale;
    const logV = Math.log(value);
    const logMin = Math.log(Math.max(1, minVal));
    const logMax = Math.log(Math.max(2, maxVal));
    if (logMax === logMin) return minScale;
    const ratio = (logV - logMin) / (logMax - logMin);
    return minScale + ratio * (maxScale - minScale);
}

export default function DepartmentNetworkGraph() {
    const [graphData, setGraphData] = useState<GlobalGraph | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
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
                height: Math.max(600, Math.floor((el.clientWidth || 1200) * 0.6))
            });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Fetch global network
    useEffect(() => {
        setLoading(true);
        fetch(`${API_URL}/network/global`)
            .then(res => res.json())
            .then((data: GlobalGraph) => {
                setGraphData(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load global network:', err);
                setLoading(false);
            });
    }, []);

    // Visible graph data
    const visibleData = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };
        if (!activeDept) return graphData;

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

    const totalStats = useMemo(() => {
        if (!visibleData.nodes.length) return { fens: 0, fass: 0, sbs: 0, total: 0, links: 0 };
        return {
            fens: visibleData.nodes.filter(n => n.dept === 'FENS').length,
            fass: visibleData.nodes.filter(n => n.dept === 'FASS').length,
            sbs: visibleData.nodes.filter(n => n.dept === 'SBS').length,
            total: visibleData.nodes.length,
            links: visibleData.links.length
        };
    }, [visibleData]);

    const linkBounds = useMemo(() => {
        if (!visibleData?.links.length) return { minPapers: 1, maxPapers: 1 };
        const papers = visibleData.links.map(l => l.value || 1);
        return {
            minPapers: Math.min(...papers),
            maxPapers: Math.max(...papers)
        };
    }, [visibleData]);

    const nodeJointPapers = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const l of visibleData.links) {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            counts[s] = (counts[s] || 0) + (l.value || 1);
            counts[t] = (counts[t] || 0) + (l.value || 1);
        }
        return counts;
    }, [visibleData]);

    // Force configuration
    useEffect(() => {
        if (!fgRef.current || !visibleData?.nodes?.length) return;
        const fg = fgRef.current;

        fg.d3Force('link', d3Force.forceLink()
            .id((d: any) => d.id)
            .distance(120)
            .strength(0.4)
        );
        fg.d3Force('charge', d3Force.forceManyBody().strength(-120));
        fg.d3Force('collide', d3Force.forceCollide().radius(14).strength(0.8));
        fg.d3Force('center', d3Force.forceCenter(0, 0));
        fg.d3Force('gravityX', d3Force.forceX(0).strength(0.06));
        fg.d3Force('gravityY', d3Force.forceY(0).strength(0.06));
        fg.d3ReheatSimulation();

        // Fit after a small delay to let forces settle
        const t = setTimeout(() => {
            try { fg.zoomToFit(500, 80); } catch { }
        }, 1200);
        return () => clearTimeout(t);
    }, [visibleData]);


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
            const clusterColor = getDeptColor(node.dept);
            const fillColor = isHovered ? '#2563eb' : clusterColor;
            const borderColor = isHovered ? '#0f172a' : '#ffffff';

            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fillColor;
            ctx.fill();

            const borderW = isHovered ? 2.5 / globalScale : (isMatch ? 2.0 / globalScale : 1.2 / globalScale);
            ctx.lineWidth = borderW;
            ctx.strokeStyle = borderColor;
            ctx.stroke();
            ctx.globalAlpha = 1;

            if (isHovered || isMatch) {
                const label = node.name;
                const fontSize = 12 / globalScale;

                ctx.font = `600 ${fontSize}px "Courier New", Courier, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                const textX = node.x || 0;
                const textY = (node.y || 0) + radius + 4;
                const metrics = ctx.measureText(label);
                const paddingX = 4 / globalScale;
                const paddingY = 2 / globalScale;
                const textHeight = fontSize + paddingY * 2;

                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.fillRect(
                    textX - metrics.width / 2 - paddingX,
                    textY - paddingY,
                    metrics.width + paddingX * 2,
                    textHeight
                );

                ctx.fillStyle = '#0f172a';
                ctx.fillText(label, textX, textY);
            }
        },
        [hoveredNode, searchQuery, activeDept]
    );

    const linkWidth = useCallback((l: any) => {
        const val = l.value || 1;
        let baseWidth = logScale(val, linkBounds.minPapers, linkBounds.maxPapers, 0.7, 3.4);

        const hasActiveSearch = searchQuery.length > 0;
        const sourceMatch = searchQuery && l.source?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        const targetMatch = searchQuery && l.target?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        const isRelated = sourceMatch || targetMatch;

        if (hasActiveSearch) return isRelated ? baseWidth : 0.25;
        return baseWidth;
    }, [searchQuery, linkBounds]);

    const linkColor = useCallback((l: any) => {
        const hasActiveSearch = searchQuery.length > 0;
        const isMatch = (nodeName?: string) =>
            searchQuery && nodeName && typeof nodeName === 'string' &&
            nodeName.toLowerCase().includes(searchQuery.toLowerCase());

        const isRelated = isMatch(l.source?.name) || isMatch(l.target?.name);
        if (hasActiveSearch) {
            return isRelated ? 'rgba(148, 163, 184, 0.95)' : 'rgba(226, 232, 240, 0.18)';
        }

        // Color by department if both share the same dept
        const s = typeof l.source === 'object' ? l.source.dept : null;
        const t = typeof l.target === 'object' ? l.target.dept : null;
        if (s && t && s === t) {
            return getDeptColor(s).replace(')', ', 0.6)').replace('rgb(', 'rgba(') + (getDeptColor(s).startsWith('#') ? '88' : '');
        }

        return 'rgba(148, 163, 184, 0.65)';
    }, [searchQuery]);


    // Extract hovered node full details
    const hoveredNodeData = useMemo(() => {
        if (!hoveredNode) return null;
        return visibleData.nodes.find(n => n.id === hoveredNode) || null;
    }, [hoveredNode, visibleData]);

    const hoveredCollaborators = useMemo(() => {
        if (!hoveredNode) return 0;
        return visibleData.links.reduce((count, l) => {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            return (s === hoveredNode || t === hoveredNode) ? count + 1 : count;
        }, 0);
    }, [hoveredNode, visibleData]);

    return (
        <div
            style={{
                marginTop: '0',
                display: 'flex',
                flexDirection: 'column',
                width: '100vw',
                position: 'relative',
                left: '50%',
                right: '50%',
                marginLeft: '-50vw',
                marginRight: '-50vw',
                backgroundColor: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                borderBottom: '1px solid #e2e8f0',
                padding: '3rem 0',
                boxSizing: 'border-box'
            }}
        >
            <div
                style={{
                    maxWidth: '1300px',
                    width: '100%',
                    margin: '0 auto',
                    padding: '0 2vw',
                    boxSizing: 'border-box'
                }}
            >
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1.5rem',
                        flexWrap: 'wrap',
                        gap: '1rem'
                    }}
                >
                    <div style={{ textAlign: 'left' }}>
                        <h2
                            style={{
                                fontSize: '1.5rem',
                                fontFamily: '"Courier New", Courier, monospace',
                                color: '#1e293b',
                                fontWeight: 800
                            }}
                        >
                            Global Collaboration Network
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            Visualizing joint publications across all faculties.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {/* Dept filter pills */}
                        {['FENS', 'FASS', 'SBS'].map(dept => (
                            <button
                                key={dept}
                                onClick={() => setActiveDept(activeDept === dept ? null : dept)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.4rem 1rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${activeDept === dept ? getDeptColor(dept) : '#334155'}`,
                                    backgroundColor: activeDept === dept ? getDeptColor(dept) : '#0f172a',
                                    color: activeDept === dept ? '#fff' : getDeptColor(dept),
                                    fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: activeDept === dept ? '#fff' : getDeptColor(dept), display: 'inline-block' }} />
                                {dept}
                            </button>
                        ))}
                        {activeDept && (
                            <button
                                onClick={() => setActiveDept(null)}
                                style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                                Clear ✕
                            </button>
                        )}

                        {/* Node Search */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                background: '#f8fafc',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}
                        >
                            <span style={{ fontSize: '0.9rem' }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Search author..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#1e293b',
                                    fontSize: '0.875rem',
                                    outline: 'none',
                                    width: '150px'
                                }}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#94a3b8',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                <div
                    style={{
                        width: '100%',
                        height: dimensions.height,
                        position: 'relative',
                        overflow: 'hidden',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        border: '2px solid #e2e8f0',
                        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)'
                    }}
                >
                        {loading ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 1s linear infinite' }}>⟳</div>
                                    <div>Building global network...</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#475569' }}>Connecting all researchers based on shared publications</div>
                                </div>
                            </div>
                        ) : !graphData || graphData.nodes.length === 0 ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                No collaboration data available.
                            </div>
                        ) : (
                            <>
                                {/* Summary Overlay Top Right */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 20,
                                        right: -10,
                                        zIndex: 2,
                                        background: 'rgba(255, 255, 255, 0.95)',
                                        padding: '1.5rem',
                                        borderRadius: 12,
                                        border: '1px solid #e2e8f0',
                                        width: '280px',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
                                        pointerEvents: 'none'
                                    }}
                                >
                                    <h3
                                        style={{
                                            fontSize: '0.85rem',
                                            color: '#1e293b',
                                            fontWeight: 800,
                                            borderBottom: '2px solid #3b82f6',
                                            paddingBottom: '0.5rem',
                                            fontFamily: 'var(--font-heading)',
                                            margin: '0 0 1rem 0'
                                        }}
                                    >
                                        NETWORK SUMMARY
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                                Total Faculty
                                            </div>
                                            <div style={{ color: '#3b82f6', fontSize: '1.25rem', fontWeight: 'bold' }}>
                                                {totalStats.total}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                                Total Links
                                            </div>
                                            <div style={{ color: '#10b981', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                                {totalStats.links.toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>FENS</div>
                                                <div style={{ color: getDeptColor('FENS'), fontSize: '0.9rem', fontWeight: 'bold' }}>{totalStats.fens}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>FASS</div>
                                                <div style={{ color: getDeptColor('FASS'), fontSize: '0.9rem', fontWeight: 'bold' }}>{totalStats.fass}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>SBS</div>
                                                <div style={{ color: getDeptColor('SBS'), fontSize: '0.9rem', fontWeight: 'bold' }}>{totalStats.sbs}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Node Hover Box (Absolute center or follow cursor? Let's fix to right block like before) */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 250,
                                    right: 20,
                                    zIndex: 2,
                                    background: 'rgba(255, 255, 255, 0.95)',
                                    padding: '1rem',
                                    borderRadius: 12,
                                    border: `1px solid ${hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#3b82f6'}`,
                                    width: '220px',
                                    boxShadow: '0 8px 12px -3px rgba(0, 0, 0, 0.3)',
                                    opacity: hoveredNodeData ? 1 : 0,
                                    transition: 'opacity 0.2s ease',
                                    pointerEvents: 'none'
                                }}
                            >
                                <div style={{ color: hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#3b82f6', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    {hoveredNodeData?.dept ? `${hoveredNodeData.dept} AUTHOR` : 'SELECTED AUTHOR'}
                                </div>
                                <div style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                    <span style={{ color: '#1e293b' }}>{hoveredNodeData?.name || 'None'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                    <span style={{ color: '#94a3b8' }}>Joint Papers:</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                                        {hoveredNode ? nodeJointPapers[hoveredNode] || 0 : 0}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#94a3b8' }}>Collaborators:</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                                        {hoveredCollaborators}
                                    </span>
                                </div>
                            </div>

                            <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
                                <ForceGraph2D
                                    ref={fgRef}
                                    width={dimensions.width}
                                    height={dimensions.height}
                                    graphData={visibleData}
                                    enableNodeDrag={true}
                                    enableZoomInteraction={true}
                                    enablePanInteraction={true}
                                    cooldownTicks={220}
                                    onEngineStop={() => {
                                        try {
                                            fgRef.current?.zoomToFit(300, 80);
                                        } catch { }
                                    }}
                                    nodeCanvasObject={nodeCanvasObject}
                                    nodePointerAreaPaint={(node: any, color, ctx, globalScale) => {
                                        const radius = 6 / globalScale;
                                        ctx.fillStyle = color;
                                        ctx.beginPath();
                                        ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
                                        ctx.fill();
                                    }}
                                    onNodeHover={(node: any) => setHoveredNode(node ? node.id : null)}
                                    nodeLabel={() => ''}
                                    onNodeClick={(node: any) => {
                                        if (node.id) router.push(`/authors/${node.id}`);
                                    }}
                                    linkWidth={linkWidth}
                                    linkColor={linkColor}
                                    linkDirectionalParticles={searchQuery ? 2 : 0}
                                    linkDirectionalParticleWidth={2}
                                    linkDirectionalParticleSpeed={0.005}
                                />
                            </div>

                            {/* Legend */}
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: 15,
                                    left: 15,
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    padding: '0.75rem',
                                    borderRadius: 8,
                                    border: '1px solid #e2e8f0',
                                    pointerEvents: 'none',
                                    fontSize: '0.75rem',
                                    color: '#1e293b',
                                    fontFamily: 'monospace',
                                    boxShadow: '0 4px 6px rgb(0 0 0 / 0.3)'
                                }}
                            >
                                <div
                                    style={{
                                        fontWeight: 'bold',
                                        marginBottom: '0.5rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        paddingBottom: '0.25rem'
                                    }}
                                >
                                    LEGEND
                                </div>
                                {Object.entries(DEPT_LABELS).map(([dept, label]) => (
                                    <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <div
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: '50%',
                                                background: getDeptColor(dept)
                                            }}
                                        />
                                        <span>{dept} (Node)</span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', marginTop: '6px' }}>
                                    <div style={{ width: 20, height: 2, background: '#94a3b8' }} />
                                    <span>Edge width ∝ Shared works</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: '50%',
                                            background: '#3b82f6',
                                            border: '2px solid #fff',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    <span>Hover for profile info</span>
                                </div>
                            </div>

                            {/* Recenter Button */}
                            <button
                                onClick={() => {
                                    try {
                                        fgRef.current?.zoomToFit(400, 80);
                                    } catch { }
                                }}
                                style={{
                                    position: 'absolute',
                                    bottom: 15,
                                    right: 15,
                                    zIndex: 2,
                                    background: 'rgba(255, 255, 255, 0.95)',
                                    padding: '0.6rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: '#0f172a',
                                    boxShadow: '0 4px 6px rgb(0 0 0 / 0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 12px rgb(0 0 0 / 0.15)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgb(0 0 0 / 0.1)';
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                </svg>
                                Recenter Network
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

