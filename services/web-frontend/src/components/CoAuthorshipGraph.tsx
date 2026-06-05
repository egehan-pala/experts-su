'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
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

function findShortestPath(
    nodes: { id: string; name: string }[],
    links: { source: any; target: any }[],
    query1: string,
    query2: string
): { pathNodeIds: Set<string>; pathEdgeKeys: Set<string> } | null {
    const q1 = query1.toLowerCase();
    const q2 = query2.toLowerCase();
    const startNodes = nodes.filter(n => n.name.toLowerCase().includes(q1));
    const endNodes = nodes.filter(n => n.name.toLowerCase().includes(q2));
    if (startNodes.length === 0 || endNodes.length === 0) return null;

    const adj: Record<string, string[]> = {};
    for (const n of nodes) adj[n.id] = [];
    for (const l of links) {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (adj[s]) adj[s].push(t);
        if (adj[t]) adj[t].push(s);
    }

    const endIds = new Set(endNodes.map(n => n.id));
    let bestPath: string[] | null = null;

    for (const startNode of startNodes) {
        const visited = new Set<string>([startNode.id]);
        const parent = new Map<string, string>();
        const queue: string[] = [startNode.id];
        let found: string | null = null;

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (endIds.has(current) && current !== startNode.id) { found = current; break; }
            for (const nb of (adj[current] || [])) {
                if (!visited.has(nb)) { visited.add(nb); parent.set(nb, current); queue.push(nb); }
            }
        }
        if (found) {
            const path: string[] = [];
            let cur: string | undefined = found;
            while (cur !== undefined) { path.unshift(cur); cur = parent.get(cur); }
            if (!bestPath || path.length < bestPath.length) bestPath = path;
        }
    }
    if (!bestPath) return null;

    const pathNodeIds = new Set(bestPath);
    const pathEdgeKeys = new Set<string>();
    for (let i = 0; i < bestPath.length - 1; i++) {
        pathEdgeKeys.add([bestPath[i], bestPath[i + 1]].sort().join('--'));
    }
    return { pathNodeIds, pathEdgeKeys };
}

export default function CoAuthorshipGraph({ authorId, authorName }: Props) {
    const [rawNetworkData, setRawNetworkData] = useState<NetworkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [yearRange, setYearRange] = useState({
        from: new Date().getFullYear() - 4,
        to: new Date().getFullYear()
    });
    const [collaboratorLimit, setCollaboratorLimit] = useState(25);
    const [searchQuery1, setSearchQuery1] = useState('');
    const [searchQuery2, setSearchQuery2] = useState('');
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [affiliationFilter, setAffiliationFilter] = useState<'all' | 'internal' | 'external'>('all');

    // ✅ Derived filtered network data based on affiliation filter
    const networkData = useMemo(() => {
        if (!rawNetworkData) return null;
        if (affiliationFilter === 'all') return rawNetworkData;

        const filteredNodes = rawNetworkData.nodes.filter(n =>
            affiliationFilter === 'internal' ? n.is_faculty === true : n.is_faculty !== true
        );
        const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = rawNetworkData.links.filter(l => {
            const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
            return filteredNodeIds.has(s) && filteredNodeIds.has(t);
        });

        return {
            ...rawNetworkData,
            nodes: filteredNodes,
            links: filteredLinks
        };
    }, [rawNetworkData, affiliationFilter]);

    const router = useRouter();
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

        fetch(`${API_URL}/authors/${shortId}/network?${params.toString()}`)
            .then((res) => res.json())
            .then((data: NetworkData) => {
                // Critical Safety Filter: Ensure all links point to existing nodes
                const nodeIds = new Set(data.nodes.map(n => n.id));
                const filteredLinks = data.links.filter(l => {
                    const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
                    const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
                    return nodeIds.has(s) && nodeIds.has(t);
                });

                setRawNetworkData({
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

        const linkPapers = networkData.links.map(l => l.value);
        return {
            minPapers: Math.min(...linkPapers),
            maxPapers: Math.max(...linkPapers)
        };
    }, [networkData]);

    const topAuthors = useMemo(() => {
        if (!networkData?.nodes?.length) return [];
        const sorted = [...networkData.nodes].sort((a, b) => (b.joint_papers || 0) - (a.joint_papers || 0));
        return sorted.slice(0, 12);
    }, [networkData]);

    const maxAuthorCount = topAuthors.length > 0 ? (topAuthors[0].joint_papers || 1) : 1;

    // Dual search derived values
    const hasPathSearch = searchQuery1.length > 0 && searchQuery2.length > 0;
    const singleSearchQuery = hasPathSearch ? '' : (searchQuery1 || searchQuery2);

    const pathData = useMemo(() => {
        if (!hasPathSearch || !networkData?.nodes.length) return null;
        return findShortestPath(networkData.nodes, networkData.links, searchQuery1, searchQuery2);
    }, [searchQuery1, searchQuery2, networkData, hasPathSearch]);

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

        // Larger ring so components can spread out without overlapping
        const ringRadius = Math.max(150, clusterIds.length * 50);

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
                    if (w >= 6) return 120;
                    if (w >= 4) return 160;
                    if (w >= 3) return 200;
                    if (w === 2) return 250;
                    return 300;
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
            d3Force.forceManyBody().strength(-1500)
        );

        // Small collision so nodes don't overlap but can stay tightly packed
        fg.d3Force(
            'collide',
            d3Force.forceCollide().radius(45).strength(0.95)
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
                // Gentle pull so nodes can still repel each other
                node.vx += (target.x - (node.x || 0)) * 0.05 * alpha;
                node.vy += (target.y - (node.y || 0)) * 0.05 * alpha;
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
            const isOnPath = pathData?.pathNodeIds.has(node.id);
            const isMatch = singleSearchQuery && node.name.toLowerCase().includes(singleSearchQuery.toLowerCase());
            const hasActiveSearch = singleSearchQuery.length > 0;

            const alpha = pathData ? (isOnPath ? 1 : 0.08) : (hasActiveSearch ? (isMatch ? 1 : 0.12) : 1);

            const radius = isOnPath ? 7.5 : 5;

            // Use cluster color when available, otherwise default blue
            const clusterColor =
                CLUSTER_COLORS[((node.cluster_id || 1) - 1) % CLUSTER_COLORS.length] || '#3b82f6';

            const fillColor = isHovered ? '#2563eb' : (isOnPath ? '#fb923c' : clusterColor);
            const borderColor = isHovered ? '#0f172a' : (isOnPath ? '#ea580c' : '#ffffff');

            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fillColor;
            ctx.fill();

            // Border width can still hint at center-joint paper count
            const borderW = isHovered
                ? 2.5
                : logScale(node.joint_papers, bounds.minPapers, bounds.maxPapers, 1.2, 2.4);

            ctx.lineWidth = borderW;
            ctx.strokeStyle = borderColor;
            ctx.stroke();
            ctx.globalAlpha = 1;

            const label = node.name;
            const fontSize = 5;

            ctx.font = `600 ${fontSize}px "Courier New", Courier, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            // soft white background for readability
            const textX = node.x || 0;
            const textY = (node.y || 0) + radius + 4;
            const metrics = ctx.measureText(label);
            const paddingX = 4;
            const paddingY = 2;
            const textHeight = fontSize + paddingY * 2;

            if (isHovered || isMatch || isOnPath) {
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.fillRect(
                    textX - metrics.width / 2 - paddingX,
                    textY - paddingY,
                    metrics.width + paddingX * 2,
                    textHeight
                );
                ctx.fillStyle = '#0f172a';
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fillRect(
                    textX - metrics.width / 2 - paddingX,
                    textY - paddingY,
                    metrics.width + paddingX * 2,
                    textHeight
                );
                ctx.fillStyle = '#475569';
            }

            ctx.globalAlpha = alpha;
            ctx.fillText(label, textX, textY);
        },
        [hoveredNode, singleSearchQuery, bounds, pathData]
    );

    const linkWidth = useCallback((l: any) => {
        const val = l.value || 1;

        let baseWidth = logScale(val, linkBounds.minPapers, linkBounds.maxPapers, 0.7, 3.4);

        if (pathData) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            const ek = [s, t].sort().join('--');
            return pathData.pathEdgeKeys.has(ek) ? 4.5 : 0.25;
        }

        const hasActiveSearch = singleSearchQuery.length > 0;
        const sourceMatch = singleSearchQuery && l.source?.name?.toLowerCase().includes(singleSearchQuery.toLowerCase());
        const targetMatch = singleSearchQuery && l.target?.name?.toLowerCase().includes(singleSearchQuery.toLowerCase());
        const isRelated = sourceMatch || targetMatch;

        if (hasActiveSearch) {
            return isRelated ? baseWidth : 0.25;
        }

        return baseWidth;
    }, [singleSearchQuery, linkBounds, pathData]);

    const linkColor = useCallback((l: any) => {
        if (pathData) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            const ek = [s, t].sort().join('--');
            return pathData.pathEdgeKeys.has(ek) ? 'rgba(251, 146, 60, 0.95)' : 'rgba(226, 232, 240, 0.08)';
        }

        const hasActiveSearch = singleSearchQuery.length > 0;
        const isMatch = (nodeName?: string) =>
            singleSearchQuery &&
            nodeName &&
            typeof nodeName === 'string' &&
            nodeName.toLowerCase().includes(singleSearchQuery.toLowerCase());

        const isRelated = isMatch(l.source?.name) || isMatch(l.target?.name);

        if (hasActiveSearch) {
            return isRelated ? 'rgba(148, 163, 184, 0.95)' : 'rgba(226, 232, 240, 0.18)';
        }

        return 'rgba(148, 163, 184, 0.75)';
    }, [singleSearchQuery, pathData]);

    const totalCitations = networkData?.nodes.reduce((sum, n) => sum + n.joint_citations, 0) || 0;

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
                backgroundColor: '#1e293b',
                borderTop: '1px solid #334155',
                borderBottom: '1px solid #334155',
                padding: '3rem 0',
                boxSizing: 'border-box'
            }}
        >
            <div
                style={{
                    maxWidth: '1200px',
                    width: '100%',
                    margin: '0 auto',
                    padding: '0 5vw',
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
                        {/* Affiliation Filter (Internal/External/All) */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '4px',
                                alignItems: 'center',
                                background: '#0f172a',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                border: '1px solid #334155'
                            }}
                        >
                            {(['all', 'internal', 'external'] as const).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setAffiliationFilter(filter)}
                                    style={{
                                        background: affiliationFilter === filter
                                            ? (filter === 'internal' ? '#166534' : filter === 'external' ? '#1e40af' : '#3b82f6')
                                            : '#1e293b',
                                        border: affiliationFilter === filter
                                            ? `1px solid ${filter === 'internal' ? '#22c55e' : filter === 'external' ? '#60a5fa' : '#60a5fa'}`
                                            : '1px solid #334155',
                                        borderRadius: 6,
                                        color: affiliationFilter === filter ? '#f8fafc' : '#94a3b8',
                                        padding: '5px 12px',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        fontWeight: affiliationFilter === filter ? 700 : 500,
                                        fontFamily: 'monospace',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {filter === 'all' ? '🌐 All' : filter === 'internal' ? '🏛 Internal' : '🌍 External'}
                                </button>
                            ))}
                        </div>

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
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setYearRange({
                                        ...yearRange,
                                        from: isNaN(val) ? yearRange.from : val
                                    });
                                }}
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
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setYearRange({
                                        ...yearRange,
                                        to: isNaN(val) ? yearRange.to : val
                                    });
                                }}
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

                        {/* Dual Author Search */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                                background: '#0f172a',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${pathData ? '#fb923c' : (searchQuery1 && searchQuery2 && !pathData ? '#ef4444' : '#334155')}`
                            }}
                        >
                            <span style={{ fontSize: '0.9rem' }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Author 1..."
                                value={searchQuery1}
                                onChange={(e) => setSearchQuery1(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '0.875rem', outline: 'none', width: '110px' }}
                            />
                            {searchQuery1 && (
                                <button onClick={() => setSearchQuery1('')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>✕</button>
                            )}
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>↔</span>
                            <span style={{ fontSize: '0.85rem' }}>👤</span>
                            <input
                                type="text"
                                placeholder="Author 2..."
                                value={searchQuery2}
                                onChange={(e) => setSearchQuery2(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '0.875rem', outline: 'none', width: '110px' }}
                            />
                            {searchQuery2 && (
                                <button onClick={() => setSearchQuery2('')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>✕</button>
                            )}
                        </div>
                        {searchQuery1 && searchQuery2 && !pathData && (
                            <div style={{ background: '#451a03', color: '#fb923c', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ⚠ No path found
                            </div>
                        )}
                        {pathData && (
                            <div style={{ background: '#431407', color: '#fb923c', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                🔗 Path: {pathData.pathNodeIds.size} nodes
                            </div>
                        )}
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
                            background: '#0f172a', /* Darker background to separate from the outer container */
                            borderRadius: '12px',
                            border: '2px solid #334155', /* Visible frame for the network area */
                            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)'
                        }}
                    >
                        {/* Summary Overlay removed and moved below */}

                        {/* Hover Overlay */}
                        <div
                            style={{
                                position: 'absolute',
                                top: 20,
                                right: 300,
                                zIndex: 2,
                                background: 'rgba(15, 23, 42, 0.95)',
                                padding: '1rem',
                                borderRadius: 12,
                                border: '1px solid #3b82f6',
                                width: '220px',
                                boxShadow: '0 8px 12px -3px rgba(59, 130, 246, 0.3)',
                                opacity: hoveredNode ? 1 : 0,
                                transition: 'opacity 0.2s ease',
                                pointerEvents: 'none'
                            }}
                        >
                            <div style={{ color: '#3b82f6', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                SELECTED AUTHOR
                            </div>
                            <div style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                <span style={{ color: '#f8fafc' }}>{hoveredNode ? networkData.nodes.find(n => n.id === hoveredNode)?.name : 'None'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                <span style={{ color: '#94a3b8' }}>Joint Papers:</span>
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                                    {hoveredNode ? networkData.nodes.find(n => n.id === hoveredNode)?.joint_papers : 0}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#94a3b8' }}>Joint Citations:</span>
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>
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
                                    const radius = 6;
                                    ctx.fillStyle = color;
                                    ctx.beginPath();
                                    ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
                                    ctx.fill();
                                }}
                                onNodeHover={(node: any) => setHoveredNode(node ? node.id : null)}
                                nodeLabel={() => ''}
                                onNodeClick={(node: any) => {
                                    if (node.is_faculty) {
                                        router.push(`/authors/${node.id}`);
                                    }
                                }}
                                linkWidth={linkWidth}
                                linkColor={linkColor}
                                linkDirectionalParticles={(singleSearchQuery || pathData) ? 2 : 0}
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
                                    background: 'rgba(15, 23, 42, 0.9)',
                                    padding: '0.75rem',
                                    borderRadius: 8,
                                    border: '1px solid #334155',
                                    pointerEvents: 'none',
                                    fontSize: '0.75rem',
                                    color: '#f8fafc',
                                    fontFamily: 'monospace',
                                    boxShadow: '0 4px 6px rgb(0 0 0 / 0.3)'
                                }}
                            >
                                <div
                                    style={{
                                        fontWeight: 'bold',
                                        marginBottom: '0.5rem',
                                        borderBottom: '1px solid #334155',
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
                                    background: 'rgba(15, 23, 42, 0.95)',
                                    padding: '0.6rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #334155',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: '#f8fafc',
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
                        </div>
                )}

                {/* New Summary Row Below Network */}
                {!loading && networkData && networkData.nodes.length > 0 && (
                    <div
                        style={{
                            marginTop: '1.5rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#0f172a',
                            padding: '1.5rem 2rem',
                            borderRadius: '12px',
                            border: '1px solid #334155',
                            flexWrap: 'wrap',
                            gap: '1.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Core Researcher
                                </div>
                                <div style={{ color: '#f8fafc', fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                                    {authorName}
                                </div>
                            </div>
                            
                            <div style={{ width: '1px', height: '40px', background: '#334155' }} />
                            
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Filtered Collaborators
                                </div>
                                <div style={{ color: '#3b82f6', fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                                    {networkData.nodes.length}
                                </div>
                            </div>
                            
                            <div style={{ width: '1px', height: '40px', background: '#334155' }} />
                            
                            <div style={{ display: 'flex', gap: '2.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Joint Citations</div>
                                    <div style={{ color: '#10b981', fontSize: '1.25rem', fontWeight: 'bold' }}>{totalCitations.toLocaleString()}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Active Period</div>
                                    <div style={{ color: '#f8fafc', fontSize: '1.25rem', fontWeight: 'bold' }}>{yearRange.from} — {yearRange.to}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                </svg>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 700 }}>Network Overview</div>
                                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>* Central researcher omitted</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Top Connected Faculty Table */}
                {!loading && networkData && networkData.nodes.length > 0 && (
                    <div style={{
                        marginTop: '1.5rem',
                        backgroundColor: '#0f172a',
                        borderRadius: '10px',
                        border: '1px solid #334155',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '0.75rem 1rem',
                            borderBottom: '1px solid #334155',
                            backgroundColor: '#1e293b',
                        }}>
                            <h3 style={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: '#cbd5e1',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                margin: 0,
                            }}>
                                Top Collaborators (Joint Papers)
                            </h3>
                        </div>
                        <div style={{ padding: '0.5rem 0' }}>
                            {topAuthors.map((author, idx) => {
                                const count = author.joint_papers || 0;
                                const barWidth = Math.max(4, (count / maxAuthorCount) * 100);
                                return (
                                    <div
                                        key={author.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '0.4rem 1rem',
                                            gap: '0.75rem',
                                            transition: 'background 0.15s',
                                            cursor: author.is_faculty ? 'pointer' : 'default',
                                        }}
                                        onMouseOver={(e) => {
                                            if (author.is_faculty) {
                                                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (author.is_faculty) {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }
                                        }}
                                        onClick={() => {
                                            if (author.is_faculty) {
                                                router.push(`/authors/${author.id}`);
                                            }
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '0.7rem',
                                            color: '#94a3b8',
                                            fontWeight: 600,
                                            width: '1.5rem',
                                            textAlign: 'right',
                                        }}>
                                            {idx + 1}
                                        </span>
                                        <span style={{
                                            fontSize: '0.8rem',
                                            color: '#f8fafc',
                                            fontWeight: 600,
                                            width: '200px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {author.name}
                                        </span>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            color: author.is_faculty ? '#3b82f6' : '#94a3b8',
                                            fontWeight: 700,
                                            width: '3rem',
                                        }}>
                                            {author.is_faculty ? 'Faculty' : 'External'}
                                        </span>
                                        <div style={{ flex: 1, position: 'relative', height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${barWidth}%`,
                                                height: '100%',
                                                backgroundColor: '#3b82f6',
                                                borderRadius: '3px',
                                                transition: 'width 0.6s ease',
                                            }} />
                                        </div>
                                        <span style={{
                                            fontSize: '0.8rem',
                                            color: '#3b82f6',
                                            fontWeight: 700,
                                            minWidth: '2rem',
                                            textAlign: 'right',
                                        }}>
                                            {count}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}