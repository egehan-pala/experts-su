'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import * as d3Force from 'd3-force';

// ✅ ForceGraph2D (no SSR)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading graph engine...
        </div>
    )
});

interface NetworkNode {
    id: string;
    name: string;
    val: number; // joint_citations
    image_url?: string | null;
    is_faculty?: boolean;
    joint_papers: number;
    joint_citations: number;
    cluster_id: number;

    // force-graph runtime positions
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

interface NetworkLink {
    source: string | NetworkNode;
    target: string | NetworkNode;
    value: number; // joint_papers
    joint_citations?: number;
}

interface NetworkData {
    center_author_name: string;
    nodes: NetworkNode[];
    links: NetworkLink[];
}

interface Props {
    authorId: string;
    authorName: string;
}

function safeLastName(fullName: string) {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : fullName;
}

function logScale(value: number, minVal: number, maxVal: number, minOut: number, maxOut: number) {
    if (maxVal === minVal) return minOut;
    const logMin = Math.log(Math.max(1, minVal));
    const logMax = Math.log(Math.max(1, maxVal));
    const logVal = Math.log(Math.max(1, value));
    const normalized = (logVal - logMin) / (logMax - logMin);
    return minOut + normalized * (maxOut - minOut);
}

const CLUSTER_COLORS = [
    '#3b82f6',
    '#81C784',
    '#FFB74D',
    '#BA68C8',
    '#F06292',
    '#4DB6AC',
    '#DCE775',
    '#FF8A65',
    '#9575CD',
    '#A1887F'
];

export default function CoAuthorshipGraph({ authorId, authorName }: Props) {
    const [networkData, setNetworkData] = useState<NetworkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [yearRange, setYearRange] = useState({
        from: new Date().getFullYear() - 4,
        to: new Date().getFullYear()
    });
    const [collaboratorLimit, setCollaboratorLimit] = useState(25);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);

    const [dimensions, setDimensions] = useState({ width: 1200, height: 780 });

    // ✅ responsive sizing
    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;

        const ro = new ResizeObserver(() => {
            setDimensions({
                width: el.clientWidth || 1200,
                height: Math.max(650, Math.floor((el.clientWidth || 1200) * 0.58))
            });
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ✅ fetch network
    useEffect(() => {
        if (!authorId) return;

        setLoading(true);
        const shortId = authorId.includes('/') ? authorId.split('/').pop()! : authorId;

        const params = new URLSearchParams();
        params.append('year_from', yearRange.from.toString());
        params.append('year_to', yearRange.to.toString());
        params.append('limit', collaboratorLimit.toString());

        fetch(`http://localhost:8000/authors/${shortId}/network?${params.toString()}`)
            .then((res) => res.json())
            .then((data: NetworkData) => {
                // Critical Safety Filter: Ensure all links point to existing nodes
                const nodeIds = new Set(data.nodes.map(n => n.id));
                const filteredLinks = data.links.filter(l => {
                    const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
                    const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
                    return nodeIds.has(s) && nodeIds.has(t);
                });

                setNetworkData({
                    ...data,
                    links: filteredLinks
                });
                setLoading(false);
            })
            .catch((err) => {
                console.error('Error fetching network:', err);
                setLoading(false);
            });
    }, [authorId, yearRange, collaboratorLimit]);

    // Bounds for visual scaling
    const bounds = useMemo(() => {
        if (!networkData?.nodes.length) {
            return { minCits: 0, maxCits: 0, minPapers: 0, maxPapers: 0 };
        }

        const cits = networkData.nodes.map(n => n.joint_citations);
        const papers = networkData.nodes.map(n => n.joint_papers);

        return {
            minCits: Math.min(...cits),
            maxCits: Math.max(...cits),
            minPapers: Math.min(...papers),
            maxPapers: Math.max(...papers)
        };
    }, [networkData]);

    const linkBounds = useMemo(() => {
        if (!networkData?.links.length) {
            return { minPapers: 0, maxPapers: 0 };
        }

        const papers = networkData.links.map(l => l.value);
        return {
            minPapers: Math.min(...papers),
            maxPapers: Math.max(...papers)
        };
    }, [networkData]);

    // ✅ cluster anchor points to keep disconnected communities close together
    const clusterCenters = useMemo(() => {
        const centers = new Map<number, { x: number; y: number }>();

        if (!networkData?.nodes?.length) return centers;

        const clusterIds = [...new Set(networkData.nodes.map(n => n.cluster_id).filter(Boolean))];

        if (clusterIds.length === 0) {
            centers.set(0, { x: 0, y: 0 });
            return centers;
        }

        if (clusterIds.length === 1) {
            centers.set(clusterIds[0], { x: 0, y: 0 });
            return centers;
        }

        // Small ring so all components stay visually close, like Rankless
        const ringRadius = Math.max(30, Math.min(70, clusterIds.length * 10));

        clusterIds.forEach((cid, i) => {
            const angle = (i / clusterIds.length) * Math.PI * 2;
            centers.set(cid, {
                x: Math.cos(angle) * ringRadius,
                y: Math.sin(angle) * ringRadius
            });
        });

        return centers;
    }, [networkData]);

    // ✅ configure forces - compact, rankless-like
    useEffect(() => {
        if (!fgRef.current || !networkData?.nodes?.length) return;
        const fg = fgRef.current;

        // Strong internal links so nodes in the same group stay compact
        // NOTE: We do NOT pass the links array here. ForceGraph2D will automatically
        // call .links() on this force once the simulation nodes are ready.
        fg.d3Force(
            'link',
            d3Force.forceLink()
                .id((d: any) => d.id)
                .distance((link: any) => {
                    const w = link.value || 1;
                    if (w >= 6) return 7;
                    if (w >= 4) return 8;
                    if (w >= 3) return 9;
                    if (w === 2) return 11;
                    return 13;
                })
                .strength((link: any) => {
                    const w = link.value || 1;
                    if (w >= 6) return 1.0;
                    if (w >= 4) return 0.95;
                    if (w >= 3) return 0.9;
                    if (w === 2) return 0.82;
                    return 0.72;
                })
        );

        // Low repulsion so clusters do not push away too much
        fg.d3Force(
            'charge',
            d3Force.forceManyBody().strength(-10)
        );

        // Small collision so nodes don't overlap but can stay tightly packed
        fg.d3Force(
            'collide',
            d3Force.forceCollide().radius(5.5).strength(0.95)
        );

        // Global center
        fg.d3Force(
            'center',
            d3Force.forceCenter(0, 0)
        );

        // Pull clusters to nearby anchor points
        fg.d3Force('cluster', (alpha: number) => {
            // Get active nodes from simulation rather than prop data to ensure correctly handled particle objects
            const simulationNodes = fg.getGraphBbox() ? (fg.getGraphBbox() as any).nodes : networkData.nodes;
            // Actually, ForceGraph2D provides nodes to the force if it's a d3 force, 
            // but since this is a manual lambda, we should be careful.
            // Let's use the nodes reachable via the fg instance.
            for (const node of networkData.nodes as any[]) {
                const target = clusterCenters.get(node.cluster_id) || { x: 0, y: 0 };
                node.vx += (target.x - (node.x || 0)) * 0.20 * alpha;
                node.vy += (target.y - (node.y || 0)) * 0.20 * alpha;
            }
        });

        // Light extra gravity to keep entire graph cohesive
        fg.d3Force('gravityX', d3Force.forceX(0).strength(0.035));
        fg.d3Force('gravityY', d3Force.forceY(0).strength(0.035));

        fg.d3ReheatSimulation();

        const t = setTimeout(() => {
            try {
                fg.zoomToFit(400, 80);
            } catch { }
        }, 1200);

        return () => clearTimeout(t);
    }, [networkData, clusterCenters]);

    // ✅ node drawing
    const nodeCanvasObject = useCallback(
        (obj: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const node = obj as NetworkNode;
            const isHovered = hoveredNode === node.id;
            const isMatch = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase());
            const hasActiveSearch = searchQuery.length > 0;

            const alpha = hasActiveSearch ? (isMatch ? 1 : 0.12) : 1;

            // Slightly stable screen-space radius
            const radius = 4.5 / globalScale;

            // Use cluster color when available, otherwise default blue
            const clusterColor =
                CLUSTER_COLORS[((node.cluster_id || 1) - 1) % CLUSTER_COLORS.length] || '#3b82f6';

            const fillColor = isHovered ? '#2563eb' : clusterColor;
            const borderColor = isHovered ? '#0f172a' : '#ffffff';

            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fillColor;
            ctx.fill();

            // Border width can still hint at center-joint paper count
            const borderW = isHovered
                ? 2.5 / globalScale
                : logScale(node.joint_papers, bounds.minPapers, bounds.maxPapers, 1.2, 2.4) / globalScale;

            ctx.lineWidth = borderW;
            ctx.strokeStyle = borderColor;
            ctx.stroke();
            ctx.globalAlpha = 1;

            const showLabel = isHovered || isMatch;
            if (showLabel) {
                const label = node.name;
                const fontSize = 12 / globalScale;

                ctx.font = `600 ${fontSize}px "Courier New", Courier, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                // soft white background for readability
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
        [hoveredNode, searchQuery, bounds]
    );

    const linkWidth = useCallback((l: any) => {
        const val = l.value || 1;

        let baseWidth = logScale(val, linkBounds.minPapers, linkBounds.maxPapers, 0.7, 3.4);

        const hasActiveSearch = searchQuery.length > 0;
        const sourceMatch = searchQuery && l.source?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        const targetMatch = searchQuery && l.target?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        const isRelated = sourceMatch || targetMatch;

        if (hasActiveSearch) {
            return isRelated ? baseWidth : 0.25;
        }

        return baseWidth;
    }, [searchQuery, linkBounds]);

    const linkColor = useCallback((l: any) => {
        const hasActiveSearch = searchQuery.length > 0;
        const isMatch = (nodeName?: string) =>
            searchQuery &&
            nodeName &&
            typeof nodeName === 'string' &&
            nodeName.toLowerCase().includes(searchQuery.toLowerCase());

        const isRelated = isMatch(l.source?.name) || isMatch(l.target?.name);

        if (hasActiveSearch) {
            return isRelated ? 'rgba(148, 163, 184, 0.95)' : 'rgba(226, 232, 240, 0.18)';
        }

        return 'rgba(148, 163, 184, 0.75)';
    }, [searchQuery]);

    const totalCitations = networkData?.nodes.reduce((sum, n) => sum + n.joint_citations, 0) || 0;

    return (
        <div
            style={{
                marginTop: '2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                width: '100vw',
                position: 'relative',
                left: '50%',
                right: '50%',
                marginLeft: '-50vw',
                marginRight: '-50vw',
                padding: '0 5vw',
                boxSizing: 'border-box'
            }}
        >
            <div
                style={{
                    background: '#1e293b',
                    borderRadius: 12,
                    padding: '1.5rem',
                    border: '1px solid #334155'
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
                                color: '#f8fafc',
                                fontWeight: 800
                            }}
                        >
                            Collaboration Network for {authorName}
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            Visualizing top {collaboratorLimit} collaborators by joint citations.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {/* Collaborator Limit Controls */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                background: '#0f172a',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #334155'
                            }}
                        >
                            <div
                                style={{
                                    color: '#94a3b8',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    fontFamily: 'monospace'
                                }}
                            >
                                LIMIT
                            </div>
                            <button
                                onClick={() => setCollaboratorLimit(Math.max(5, collaboratorLimit - 5))}
                                style={{
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: 4,
                                    color: '#f8fafc',
                                    width: '28px',
                                    height: '28px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold'
                                }}
                            >
                                -
                            </button>
                            <span
                                style={{
                                    color: '#f8fafc',
                                    fontSize: '0.875rem',
                                    fontWeight: 700,
                                    width: '25px',
                                    textAlign: 'center'
                                }}
                            >
                                {collaboratorLimit}
                            </span>
                            <button
                                onClick={() => setCollaboratorLimit(Math.min(100, collaboratorLimit + 5))}
                                style={{
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: 4,
                                    color: '#f8fafc',
                                    width: '28px',
                                    height: '28px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold'
                                }}
                            >
                                +
                            </button>
                        </div>

                        {/* Year Filter Controls */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                background: '#0f172a',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #334155'
                            }}
                        >
                            <div
                                style={{
                                    color: '#94a3b8',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    fontFamily: 'monospace'
                                }}
                            >
                                YEAR RANGE
                            </div>
                            <input
                                type="number"
                                value={yearRange.from}
                                onChange={(e) =>
                                    setYearRange({
                                        ...yearRange,
                                        from: parseInt(e.target.value)
                                    })
                                }
                                style={{
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: 4,
                                    color: '#f8fafc',
                                    padding: '2px 6px',
                                    width: '70px',
                                    fontSize: '0.875rem'
                                }}
                                min={1900}
                                max={2100}
                            />
                            <span style={{ color: '#334155' }}>—</span>
                            <input
                                type="number"
                                value={yearRange.to}
                                onChange={(e) =>
                                    setYearRange({
                                        ...yearRange,
                                        to: parseInt(e.target.value)
                                    })
                                }
                                style={{
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: 4,
                                    color: '#f8fafc',
                                    padding: '2px 6px',
                                    width: '70px',
                                    fontSize: '0.875rem'
                                }}
                                min={1900}
                                max={2100}
                            />
                        </div>

                        {/* Node Search */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                background: '#0f172a',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #334155'
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
                                    color: '#f8fafc',
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

                {loading ? (
                    <div
                        style={{
                            height: dimensions.height,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#0f172a',
                            borderRadius: 8,
                            color: '#94a3b8'
                        }}
                    >
                        Re-calculating network...
                    </div>
                ) : !networkData || networkData.nodes.length === 0 ? (
                    <div
                        style={{
                            height: dimensions.height,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#0f172a',
                            borderRadius: 8,
                            color: '#94a3b8'
                        }}
                    >
                        No collaboration data found for this range.
                    </div>
                ) : (
                    <div
                        style={{
                            width: '100%',
                            height: dimensions.height,
                            position: 'relative',
                            overflow: 'hidden',
                            background: '#1e293b',
                            borderRadius: 8
                        }}
                    >
                        {/* Summary Overlay Top Right */}
                        <div
                            style={{
                                position: 'absolute',
                                top: 20,
                                right: 20,
                                zIndex: 10,
                                background: 'rgba(255, 255, 255, 0.95)',
                                padding: '1.5rem',
                                borderRadius: 12,
                                border: '1px solid #e2e8f0',
                                width: '280px',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                                pointerEvents: 'none'
                            }}
                        >
                            <h3
                                style={{
                                    fontSize: '0.85rem',
                                    color: '#0f172a',
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
                                    <div
                                        style={{
                                            color: '#64748b',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        Core Researcher
                                    </div>
                                    <div style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 'bold' }}>
                                        {authorName}
                                    </div>
                                </div>
                                <div>
                                    <div
                                        style={{
                                            color: '#64748b',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        Filtered Collaborators
                                    </div>
                                    <div style={{ color: '#3b82f6', fontSize: '1.25rem', fontWeight: 'bold' }}>
                                        {networkData.nodes.length}
                                    </div>
                                </div>
                                <div>
                                    <div
                                        style={{
                                            color: '#64748b',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        Total Joint Citations
                                    </div>
                                    <div style={{ color: '#10b981', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                        {totalCitations.toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div
                                        style={{
                                            color: '#64748b',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        Active Period
                                    </div>
                                    <div style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 'bold' }}>
                                        {yearRange.from} — {yearRange.to}
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{
                                    marginTop: '1rem',
                                    fontSize: '0.65rem',
                                    color: '#94a3b8',
                                    lineHeight: 1.4
                                }}
                            >
                                * Central researcher is omitted.
                            </div>
                        </div>

                        {/* Hover Overlay */}
                        <div
                            style={{
                                position: 'absolute',
                                top: 20,
                                right: 320,
                                zIndex: 10,
                                background: 'rgba(255, 255, 255, 0.95)',
                                padding: '1rem',
                                borderRadius: 12,
                                border: '1px solid #3b82f6',
                                width: '220px',
                                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)',
                                opacity: hoveredNode ? 1 : 0,
                                transition: 'opacity 0.2s ease',
                                pointerEvents: 'none'
                            }}
                        >
                            <div style={{ color: '#3b82f6', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                SELECTED AUTHOR
                            </div>
                            <div style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                {hoveredNode ? networkData.nodes.find(n => n.id === hoveredNode)?.name : 'None'}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                <span style={{ color: '#64748b' }}>Joint Papers:</span>
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                    {hoveredNode ? networkData.nodes.find(n => n.id === hoveredNode)?.joint_papers : 0}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#64748b' }}>Joint Citations:</span>
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                    {hoveredNode ? networkData.nodes.find(n => n.id === hoveredNode)?.joint_citations : 0}
                                </span>
                            </div>
                        </div>

                        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
                            <ForceGraph2D
                                ref={fgRef}
                                width={dimensions.width}
                                height={dimensions.height}
                                graphData={networkData}
                                enableNodeDrag={false}
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
                                linkWidth={linkWidth}
                                linkColor={linkColor}
                                linkDirectionalParticles={searchQuery ? 2 : 0}
                                linkDirectionalParticleWidth={2}
                                linkDirectionalParticleSpeed={0.005}
                            />

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
                                    color: '#0f172a',
                                    fontFamily: 'monospace',
                                    boxShadow: '0 2px 4px rgb(0 0 0 / 0.05)'
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: '#3b82f6'
                                        }}
                                    />
                                    <span>Collaborator</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: 20, height: 2, background: '#94a3b8' }} />
                                    <span>Edge Width ∝ Shared Works</span>
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
                                    <span>Border ∝ Joint Papers (Center)</span>
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>
                                    Clusters are compacted for readability
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}