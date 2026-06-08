'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import * as d3Force from 'd3-force';
import * as d3 from 'd3';

// ─── Interfaces ──────────────────────────────────────────────────────

interface NetworkNode {
    id: string;
    name: string;
    val: number; // joint_citations
    image_url?: string | null;
    is_faculty?: boolean;
    joint_papers: number;
    joint_citations: number;
    cluster_id: number;

    // d3-force positions (set after simulation)
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

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── BFS Path-finding ────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────

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
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [affiliationFilter, setAffiliationFilter] = useState<'all' | 'internal' | 'external'>('all');
    const [controlsOpen, setControlsOpen] = useState(false);

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
    const svgRef = useRef<SVGSVGElement>(null);
    const gRef = useRef<SVGGElement>(null);
    const zoomRef = useRef<any>(null);

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

        const ringRadius = Math.max(40, clusterIds.length * 15);
        clusterIds.forEach((cid, i) => {
            const angle = (i / clusterIds.length) * Math.PI * 2;
            centers.set(cid, {
                x: Math.cos(angle) * ringRadius,
                y: Math.sin(angle) * ringRadius
            });
        });
        return centers;
    }, [networkData]);

    // ─── Pre-compute layout (static d3-force → SVG positions) ────────

    const layoutData = useMemo(() => {
        if (!networkData?.nodes.length) return null;

        // Clone nodes/links to avoid mutating React state
        const nodes = networkData.nodes.map(n => ({ ...n }));
        const links = networkData.links.map(l => ({
            source: typeof l.source === 'object' ? (l.source as any).id : l.source,
            target: typeof l.target === 'object' ? (l.target as any).id : l.target,
            value: l.value,
            joint_citations: l.joint_citations,
        }));

        // Run the simulation synchronously to completion
        const sim = d3Force.forceSimulation(nodes as any)
            .force(
                'link',
                d3Force.forceLink(links as any)
                    .id((d: any) => d.id)
                    .distance((link: any) => {
                        const w = link.value || 1;
                        if (w >= 6) return 38;
                        if (w >= 4) return 50;
                        if (w >= 3) return 63;
                        if (w === 2) return 75;
                        return 88;
                    })
                    .strength((link: any) => {
                        const w = link.value || 1;
                        if (w >= 6) return 1.0;
                        if (w >= 4) return 0.95;
                        if (w >= 3) return 0.9;
                        if (w === 2) return 0.82;
                        return 0.72;
                    })
            )
            .force('charge', d3Force.forceManyBody().strength(-400))
            .force('collide', d3Force.forceCollide().radius(30).strength(1))
            .force('center', d3Force.forceCenter(0, 0))
            .force('gravityX', d3Force.forceX(0).strength(0.035))
            .force('gravityY', d3Force.forceY(0).strength(0.035))
            .stop();

        // Tick 300 times with cluster-pull force applied each tick
        for (let i = 0; i < 300; i++) {
            const alpha = sim.alpha();
            for (const node of nodes as any[]) {
                const target = clusterCenters.get(node.cluster_id) || { x: 0, y: 0 };
                node.vx += (target.x - (node.x || 0)) * 0.05 * alpha;
                node.vy += (target.y - (node.y || 0)) * 0.05 * alpha;
            }
            sim.tick();
        }

        // Compute bounding box with padding
        const padding = 80;
        const xs = nodes.map(n => (n as any).x as number || 0);
        const ys = nodes.map(n => (n as any).y as number || 0);
        const minX = Math.min(...xs) - padding;
        const maxX = Math.max(...xs) + padding;
        const minY = Math.min(...ys) - padding;
        const maxY = Math.max(...ys) + padding;

        return {
            nodes: nodes as (NetworkNode & { x: number; y: number })[],
            links: links as any[],
            viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
            width: maxX - minX,
            height: maxY - minY,
        };
    }, [networkData, clusterCenters]);

    useEffect(() => {
        if (!svgRef.current || !gRef.current || !layoutData) return;
        const svg = d3.select(svgRef.current);
        const g = d3.select(gRef.current);
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });
        zoomRef.current = zoom;
        svg.call(zoom);
        svg.on("dblclick.zoom", null);
    }, [layoutData]);

    // ─── Hover-connected nodes & edges ───────────────────────────────

    const activeNodeId = selectedNode || hoveredNode;

    const { connectedNodeIds, connectedEdgeKeys } = useMemo(() => {
        if (!activeNodeId || !layoutData) {
            return { connectedNodeIds: new Set<string>(), connectedEdgeKeys: new Set<string>() };
        }

        const nodeIds = new Set<string>([activeNodeId]);
        const edgeKeys = new Set<string>();

        for (const link of layoutData.links) {
            const s = typeof link.source === 'object' ? link.source.id : link.source;
            const t = typeof link.target === 'object' ? link.target.id : link.target;
            if (s === activeNodeId || t === activeNodeId) {
                nodeIds.add(s);
                nodeIds.add(t);
                edgeKeys.add([s, t].sort().join('--'));
            }
        }

        return { connectedNodeIds: nodeIds, connectedEdgeKeys: edgeKeys };
    }, [activeNodeId, layoutData]);

    const totalCitations = networkData?.nodes.reduce((sum, n) => sum + n.joint_citations, 0) || 0;
    const hasData = !loading && networkData && networkData.nodes.length > 0 && layoutData;
    const shortAuthorId = authorId.includes('/') ? authorId.split('/').pop()! : authorId;

    // ─── Render ──────────────────────────────────────────────────────

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
                    width: '100%',
                    margin: '0 auto',
                    padding: '0 10%',
                    boxSizing: 'border-box'
                }}
            >
                {/* ── Header ──────────────────────────────────── */}
                <header style={{ marginBottom: '1.5rem' }}>
                    <h2
                        style={{
                            fontSize: '1.5rem',
                            fontFamily: '"Courier New", Courier, monospace',
                            color: '#f8fafc',
                            fontWeight: 800
                        }}
                    >
                        Co-authorship network of co-authors of {authorName}
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        Visualizing top {collaboratorLimit} collaborators by joint citations.
                    </p>
                </header>

                {/* ── Graph Area ───────────────────────────────── */}
                {loading ? (
                    <div
                        style={{
                            height: '85vh',
                            minHeight: '600px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#0f172a',
                            borderRadius: 12,
                            border: '2px solid #334155',
                            color: '#94a3b8'
                        }}
                    >
                        Re-calculating network...
                    </div>
                ) : !networkData || networkData.nodes.length === 0 ? (
                    <div
                        style={{
                            height: '85vh',
                            minHeight: '600px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#0f172a',
                            borderRadius: 12,
                            border: '2px solid #334155',
                            color: '#94a3b8'
                        }}
                    >
                        No collaboration data found for this range.
                    </div>
                ) : layoutData ? (
                    <div
                        style={{
                            width: '100%',
                            height: '85vh',
                            minHeight: '600px',
                            position: 'relative',
                            background: '#0f172a',
                            borderRadius: '12px',
                            border: '2px solid #334155',
                            overflow: 'hidden',
                            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)'
                        }}
                    >
                        {/* Static SVG Graph */}
                        <svg
                            ref={svgRef}
                            viewBox={layoutData.viewBox}
                            preserveAspectRatio="xMidYMid meet"
                            className="co-authorship-svg"
                            style={{
                                width: '100%',
                                height: '100%',
                                display: 'block',
                                background: '#0f172a',
                                cursor: 'grab'
                            }}
                            onClick={() => setSelectedNode(null)}
                        >
                            <style>{`
                                .co-authorship-svg:active { cursor: grabbing !important; }
                            `}</style>
                            <g ref={gRef}>
                            {/* ── Edges layer (behind nodes) ── */}
                            <g className="edges-layer">
                                {layoutData.links.map((link: any, i: number) => {
                                    const sourceNode = link.source as any;
                                    const targetNode = link.target as any;
                                    const sourceId = typeof sourceNode === 'object' ? sourceNode.id : sourceNode;
                                    const targetId = typeof targetNode === 'object' ? targetNode.id : targetNode;
                                    const edgeKey = [sourceId, targetId].sort().join('--');
                                    const sx = typeof sourceNode === 'object' ? sourceNode.x : 0;
                                    const sy = typeof sourceNode === 'object' ? sourceNode.y : 0;
                                    const tx = typeof targetNode === 'object' ? targetNode.x : 0;
                                    const ty = typeof targetNode === 'object' ? targetNode.y : 0;

                                    // Default visual properties
                                    let strokeColor = 'rgba(148, 163, 184, 0.3)';
                                    let strokeWidth = logScale(link.value, linkBounds.minPapers, linkBounds.maxPapers, 0.7, 3.4);
                                    let opacity = 1;

                                    if (pathData) {
                                        if (pathData.pathEdgeKeys.has(edgeKey)) {
                                            strokeColor = 'rgba(251, 146, 60, 0.95)';
                                            strokeWidth = 4.5;
                                        } else {
                                            opacity = 0.08;
                                            strokeWidth = 0.25;
                                        }
                                    } else if (singleSearchQuery) {
                                        const sName = typeof sourceNode === 'object' ? sourceNode.name : '';
                                        const tName = typeof targetNode === 'object' ? targetNode.name : '';
                                        const sourceMatch = sName?.toLowerCase().includes(singleSearchQuery.toLowerCase());
                                        const targetMatch = tName?.toLowerCase().includes(singleSearchQuery.toLowerCase());
                                        if (sourceMatch || targetMatch) {
                                            strokeColor = 'rgba(148, 163, 184, 0.95)';
                                        } else {
                                            opacity = 0.18;
                                            strokeWidth = 0.25;
                                        }
                                    } else if (activeNodeId) {
                                        if (connectedEdgeKeys.has(edgeKey)) {
                                            strokeColor = 'rgba(148, 163, 184, 0.95)';
                                        } else {
                                            opacity = 0.05;
                                        }
                                    }

                                    return (
                                        <line
                                            key={`edge-${i}`}
                                            className="edge"
                                            x1={sx}
                                            y1={sy}
                                            x2={tx}
                                            y2={ty}
                                            stroke={strokeColor}
                                            strokeWidth={strokeWidth}
                                            opacity={opacity}
                                        />
                                    );
                                })}
                            </g>

                            {/* ── Nodes layer ── */}
                            <g className="nodes-layer">
                                {layoutData.nodes.map(node => {
                                    const isOnPath = pathData?.pathNodeIds.has(node.id);
                                    const isMatch = singleSearchQuery && node.name.toLowerCase().includes(singleSearchQuery.toLowerCase());
                                    const isHovered = activeNodeId === node.id;
                                    const isConnected = connectedNodeIds.has(node.id);
                                    const isCenter = node.id.includes(shortAuthorId);

                                    // Colors
                                    const clusterColor = isCenter
                                        ? '#eab308'
                                        : (CLUSTER_COLORS[((node.cluster_id || 1) - 1) % CLUSTER_COLORS.length] || '#3b82f6');
                                    const fillColor = isHovered ? '#2563eb' : (isOnPath ? '#fb923c' : clusterColor);
                                    const borderColor = isHovered
                                        ? '#0f172a'
                                        : (isOnPath ? '#ea580c' : (isCenter ? '#fef08a' : '#ffffff'));

                                    // Sizing
                                    const baseRadius = 6;
                                    const radius = isOnPath ? baseRadius + 3 : (isHovered || isCenter ? baseRadius + 2 : baseRadius);
                                    const borderW = isHovered || isCenter
                                        ? 3.0
                                        : logScale(node.joint_papers, bounds.minPapers, bounds.maxPapers, 1.2, 2.8);

                                    // Opacity based on state
                                    let opacity = 1;
                                    if (pathData) {
                                        opacity = isOnPath ? 1 : 0.08;
                                    } else if (singleSearchQuery) {
                                        opacity = isMatch ? 1 : 0.12;
                                    } else if (activeNodeId) {
                                        opacity = isConnected ? 1 : 0.12;
                                    }

                                    const fontSize = isCenter ? 10 : 8;

                                    return (
                                        <g
                                            key={node.id}
                                            className="node-group"
                                            opacity={opacity}
                                            style={{ cursor: 'pointer' }}
                                            onMouseEnter={() => setHoveredNode(node.id)}
                                            onMouseLeave={() => setHoveredNode(null)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedNode(selectedNode === node.id ? null : node.id);
                                            }}
                                        >
                                            <circle
                                                cx={node.x}
                                                cy={node.y}
                                                r={radius}
                                                fill={fillColor}
                                                stroke={borderColor}
                                                strokeWidth={borderW}
                                            />
                                            <text
                                                x={node.x}
                                                y={(node.y || 0) + radius + fontSize + 2}
                                                textAnchor="middle"
                                                fontSize={fontSize}
                                                fill={isHovered || isOnPath || isCenter ? '#f8fafc' : '#cbd5e1'}
                                                fontFamily="'Courier New', Courier, monospace"
                                                fontWeight={isCenter ? 800 : 600}
                                            >
                                                {node.name}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                            </g>
                        </svg>

                        {/* Recenter Button */}
                        <button
                            onClick={() => {
                                if (svgRef.current && zoomRef.current) {
                                    d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity);
                                }
                            }}
                            style={{
                                position: 'absolute',
                                bottom: 15,
                                right: 15,
                                background: '#1e293b',
                                border: '1px solid #3b82f6',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: '#f8fafc',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                                zIndex: 10
                            }}
                        >
                            Recenter Network
                        </button>

                        {/* Hover Tooltip Overlay */}
                        <div
                            style={{
                                position: 'absolute',
                                top: 20,
                                right: 20,
                                zIndex: 2,
                                background: 'rgba(15, 23, 42, 0.95)',
                                padding: '1rem',
                                borderRadius: 12,
                                border: '1px solid #3b82f6',
                                width: '220px',
                                boxShadow: '0 8px 12px -3px rgba(59, 130, 246, 0.3)',
                                opacity: activeNodeId ? 1 : 0,
                                transition: 'opacity 0.2s ease',
                                pointerEvents: selectedNode ? 'auto' : 'none'
                            }}
                        >
                            <div style={{ color: '#3b82f6', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                {selectedNode ? 'SELECTED AUTHOR' : 'HOVERED AUTHOR'}
                            </div>
                            <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                {activeNodeId ? layoutData.nodes.find(n => n.id === activeNodeId)?.name : 'None'}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                <span style={{ color: '#94a3b8' }}>Joint Papers:</span>
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                                    {activeNodeId ? layoutData.nodes.find(n => n.id === activeNodeId)?.joint_papers : 0}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#94a3b8' }}>Joint Citations:</span>
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                                    {activeNodeId ? layoutData.nodes.find(n => n.id === activeNodeId)?.joint_citations : 0}
                                </span>
                            </div>
                            {selectedNode && (
                                <button
                                    onClick={() => {
                                        const nodeUrl = layoutData.nodes.find(n => n.id === selectedNode)?.id;
                                        if (nodeUrl) {
                                            router.push(`/authors/${encodeURIComponent(nodeUrl)}`);
                                        }
                                    }}
                                    style={{
                                        marginTop: '1rem',
                                        width: '100%',
                                        padding: '0.5rem',
                                        backgroundColor: '#3b82f6',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Go to Profile →
                                </button>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* ── Controls Toggle + Panel ─────────────────── */}
                {rawNetworkData && (
                    <div style={{ marginTop: '1rem' }}>
                        <button
                            onClick={() => setControlsOpen(!controlsOpen)}
                            style={{
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                color: '#f8fafc',
                                padding: '0.6rem 1.25rem',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                fontFamily: '"Courier New", Courier, monospace',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <span style={{
                                display: 'inline-block',
                                transition: 'transform 0.2s ease',
                                transform: controlsOpen ? 'rotate(90deg)' : 'rotate(0deg)'
                            }}>
                                ⚙
                            </span>
                            Controls
                        </button>

                        {controlsOpen && (
                            <div
                                style={{
                                    marginTop: '0.5rem',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem'
                                }}
                            >
                                {/* Row 1: Year Range + Limit */}
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {/* Year Range */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'center',
                                            background: '#1e293b',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid #334155'
                                        }}
                                    >
                                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>
                                            YEAR RANGE
                                        </div>
                                        <input
                                            type="number"
                                            value={yearRange.from}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setYearRange({ ...yearRange, from: isNaN(val) ? yearRange.from : val });
                                            }}
                                            style={{
                                                background: '#0f172a',
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
                                                setYearRange({ ...yearRange, to: isNaN(val) ? yearRange.to : val });
                                            }}
                                            style={{
                                                background: '#0f172a',
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

                                    {/* Collaborator Limit */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'center',
                                            background: '#1e293b',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid #334155'
                                        }}
                                    >
                                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>
                                            LIMIT
                                        </div>
                                        <button
                                            onClick={() => setCollaboratorLimit(Math.max(5, collaboratorLimit - 5))}
                                            style={{
                                                background: '#0f172a',
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
                                                background: '#0f172a',
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
                                </div>

                                {/* Row 2: Affiliation Filter */}
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: '4px',
                                        alignItems: 'center',
                                        background: '#1e293b',
                                        padding: '6px 8px',
                                        borderRadius: '8px',
                                        border: '1px solid #334155',
                                        width: 'fit-content'
                                    }}
                                >
                                    {(['all', 'internal', 'external'] as const).map((filter) => (
                                        <button
                                            key={filter}
                                            onClick={() => setAffiliationFilter(filter)}
                                            style={{
                                                background: affiliationFilter === filter
                                                    ? (filter === 'internal' ? '#166534' : filter === 'external' ? '#1e40af' : '#3b82f6')
                                                    : '#0f172a',
                                                border: affiliationFilter === filter
                                                    ? `1px solid ${filter === 'internal' ? '#22c55e' : '#60a5fa'}`
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

                                {/* Row 3: Dual Author Search */}
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: '6px',
                                            alignItems: 'center',
                                            background: '#1e293b',
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
                            </div>
                        )}
                    </div>
                )}

                {/* ── Description Text ────────────────────────── */}
                {hasData && (
                    <div
                        style={{
                            marginTop: '1.25rem',
                            padding: '1rem 1.25rem',
                            background: '#0f172a',
                            borderRadius: '10px',
                            border: '1px solid #334155',
                            color: '#94a3b8',
                            fontSize: '0.8rem',
                            lineHeight: 1.7,
                            fontFamily: '"Courier New", Courier, monospace'
                        }}
                    >
                        This figure shows the co-authorship network connecting the top{' '}
                        <strong style={{ color: '#f8fafc' }}>{collaboratorLimit}</strong>{' '}
                        collaborators of{' '}
                        <strong style={{ color: '#f8fafc' }}>{authorName}</strong>.
                        A scholar is included among the top collaborators based on the total number of
                        citations received by their joint publications.{' '}
                        <strong style={{ color: '#3b82f6' }}>Widths of edges</strong>{' '}
                        represent the number of papers authors have co-authored together.{' '}
                        <strong style={{ color: '#3b82f6' }}>Node borders</strong>{' '}
                        signify the number of papers an author published with{' '}
                        <strong style={{ color: '#f8fafc' }}>{authorName}</strong>.{' '}
                        {authorName} is excluded from the visualization to improve readability.
                    </div>
                )}

                {/* ── Legend ───────────────────────────────────── */}
                {hasData && (
                    <div
                        style={{
                            marginTop: '0.75rem',
                            padding: '0.75rem 1.25rem',
                            background: '#0f172a',
                            borderRadius: '10px',
                            border: '1px solid #334155',
                            display: 'flex',
                            gap: '2rem',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: '#f8fafc'
                        }}
                    >
                        <div style={{ fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Legend
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />
                            <span>Collaborator</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 24, height: 3, background: '#94a3b8', borderRadius: '2px' }} />
                            <span>Edge Width ∝ Shared Works</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                                style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    background: '#3b82f6',
                                    border: '2.5px solid #fff',
                                    boxSizing: 'border-box'
                                }}
                            />
                            <span>Border ∝ Joint Papers (Center)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
                            <span style={{ color: '#94a3b8' }}>Center Author</span>
                        </div>
                    </div>
                )}

                {/* ── Summary Row ─────────────────────────────── */}
                {hasData && (
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
                                    {networkData!.nodes.length}
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

                {/* ── Top Collaborators Table ─────────────────── */}
                {hasData && (
                    <div style={{
                        marginTop: '1.5rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '0.75rem 1rem',
                            borderBottom: '1px solid #e2e8f0',
                            backgroundColor: '#f1f5f9',
                        }}>
                            <h3 style={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: '#334155',
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
                                                e.currentTarget.style.backgroundColor = '#eff6ff';
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
                                        <span
                                            title={author.name}
                                            style={{
                                                fontSize: '0.8rem',
                                                color: '#1e293b',
                                                fontWeight: 600,
                                                width: '200px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
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
                                        <div style={{ flex: 1, position: 'relative', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
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