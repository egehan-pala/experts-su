'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import * as d3Force from 'd3-force';
import * as d3 from 'd3';

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

export default function CitationOverlapGraph() {
    const [graphData, setGraphData] = useState<GlobalGraph | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery1, setSearchQuery1] = useState('');
    const [searchQuery2, setSearchQuery2] = useState('');
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [activeDept, setActiveDept] = useState<string | null>(null);

    const router = useRouter();
    const svgRef = useRef<SVGSVGElement>(null);
    const gRef = useRef<SVGGElement>(null);

    useEffect(() => {
        let cancelled = false;

        async function fetchWithRetry(retries = 2) {
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 90_000); // 90s timeout
                    const res = await fetch(`${API_URL}/network/citation-overlap`, {
                        signal: controller.signal
                    });
                    clearTimeout(timeout);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data: GlobalGraph = await res.json();
                    if (!cancelled) {
                        setGraphData(data);
                        setLoading(false);
                    }
                    return;
                } catch (err) {
                    console.warn(`Citation overlap fetch attempt ${attempt + 1} failed:`, err);
                    if (attempt === retries) {
                        if (!cancelled) setLoading(false);
                    }
                    // Wait 2s before retry
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        setLoading(true);
        fetchWithRetry();

        return () => { cancelled = true; };
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

    // Pre-computed d3-force layout
    const layoutData = useMemo(() => {
        if (!visibleData.nodes.length) return null;

        const nodes: GlobalNode[] = visibleData.nodes.map(n => ({ ...n }));
        const links = visibleData.links.map(l => ({
            source: typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source,
            target: typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target,
            value: l.value,
        }));

        const sim = d3Force.forceSimulation(nodes as any)
            .force('link', d3Force.forceLink(links as any)
                .id((d: any) => d.id)
                .distance(75)
                .strength(0.3)
            )
            .force('charge', d3Force.forceManyBody().strength(-400))
            .force('collide', d3Force.forceCollide().radius(25).strength(0.8))
            .force('center', d3Force.forceCenter(0, 0))
            .force('gravityX', d3Force.forceX(0).strength(0.06))
            .force('gravityY', d3Force.forceY(0).strength(0.06));

        sim.stop();
        for (let i = 0; i < 300; i++) sim.tick();

        const padding = 80;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
            const nx = n.x ?? 0;
            const ny = n.y ?? 0;
            if (nx < minX) minX = nx;
            if (nx > maxX) maxX = nx;
            if (ny < minY) minY = ny;
            if (ny > maxY) maxY = ny;
        }
        minX -= padding; minY -= padding;
        maxX += padding; maxY += padding;
        const width = maxX - minX;
        const height = maxY - minY;

        const nodeMap = new Map<string, GlobalNode>();
        for (const n of nodes) nodeMap.set(n.id, n);

        const resolvedLinks = links.map(l => {
            const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
            const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
            return {
                source: nodeMap.get(sId)!,
                target: nodeMap.get(tId)!,
                value: l.value,
            };
        });

        return {
            nodes,
            links: resolvedLinks,
            viewBox: `${minX} ${minY} ${width} ${height}`,
            width,
            height,
        };
    }, [visibleData]);

    useEffect(() => {
        if (!svgRef.current || !gRef.current || !layoutData) return;
        const svg = d3.select(svgRef.current);
        const g = d3.select(gRef.current);
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });
        svg.call(zoom);
        svg.on("dblclick.zoom", null);
    }, [layoutData]);

    // Hover-connected nodes and edges
    const hoverConnected = useMemo(() => {
        if (!hoveredNode || !layoutData) return { nodeIds: new Set<string>(), edgeKeys: new Set<string>() };
        const nodeIds = new Set<string>([hoveredNode]);
        const edgeKeys = new Set<string>();
        for (const l of layoutData.links) {
            const sId = l.source.id;
            const tId = l.target.id;
            if (sId === hoveredNode || tId === hoveredNode) {
                nodeIds.add(sId);
                nodeIds.add(tId);
                edgeKeys.add([sId, tId].sort().join('--'));
            }
        }
        return { nodeIds, edgeKeys };
    }, [hoveredNode, layoutData]);

    const totalStats = useMemo(() => {
        if (!visibleData.nodes.length) return { fens: 0, fass: 0, sbs: 0, total: 0, links: 0, totalSharedCitations: 0 };
        const totalSharedCitations = visibleData.links.reduce((sum, l) => sum + (l.value || 0), 0);
        return {
            fens: visibleData.nodes.filter(n => n.dept === 'FENS').length,
            fass: visibleData.nodes.filter(n => n.dept === 'FASS').length,
            sbs: visibleData.nodes.filter(n => n.dept === 'SBS').length,
            total: visibleData.nodes.length,
            links: visibleData.links.length,
            totalSharedCitations
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

    const nodeSharedCitations = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const l of visibleData.links) {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            counts[s] = (counts[s] || 0) + (l.value || 1);
            counts[t] = (counts[t] || 0) + (l.value || 1);
        }
        return counts;
    }, [visibleData]);

    const topAuthors = useMemo(() => {
        if (!visibleData.nodes.length) return [];
        const sorted = [...visibleData.nodes].sort((a, b) => {
            const countA = nodeSharedCitations[a.id] || 0;
            const countB = nodeSharedCitations[b.id] || 0;
            return countB - countA;
        });
        return sorted.slice(0, 12);
    }, [visibleData.nodes, nodeSharedCitations]);

    const maxAuthorCount = topAuthors.length > 0 ? (nodeSharedCitations[topAuthors[0].id] || 1) : 1;

    // Dual search derived values
    const hasPathSearch = searchQuery1.length > 0 && searchQuery2.length > 0;
    const singleSearchQuery = hasPathSearch ? '' : (searchQuery1 || searchQuery2);

    const pathData = useMemo(() => {
        if (!hasPathSearch || !visibleData.nodes.length) return null;
        return findShortestPath(visibleData.nodes, visibleData.links, searchQuery1, searchQuery2);
    }, [searchQuery1, searchQuery2, visibleData, hasPathSearch]);

    const hoveredNodeData = useMemo(() => {
        if (!hoveredNode) return null;
        return visibleData.nodes.find(n => n.id === hoveredNode) || null;
    }, [hoveredNode, visibleData]);

    const hoveredPeers = useMemo(() => {
        if (!hoveredNode) return 0;
        return visibleData.links.reduce((count, l) => {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            return (s === hoveredNode || t === hoveredNode) ? count + 1 : count;
        }, 0);
    }, [hoveredNode, visibleData]);

    // -- Edge style helpers --
    function getEdgeWidth(link: { source: GlobalNode; target: GlobalNode; value: number }): number {
        const val = link.value || 1;
        let baseWidth = logScale(val, linkBounds.minPapers, linkBounds.maxPapers, 0.7, 3.4);

        if (pathData) {
            const ek = [link.source.id, link.target.id].sort().join('--');
            return pathData.pathEdgeKeys.has(ek) ? 4.5 : 0.25;
        }

        const hasActiveSearch = singleSearchQuery.length > 0;
        const sourceMatch = singleSearchQuery && link.source.name?.toLowerCase().includes(singleSearchQuery.toLowerCase());
        const targetMatch = singleSearchQuery && link.target.name?.toLowerCase().includes(singleSearchQuery.toLowerCase());
        const isRelated = sourceMatch || targetMatch;

        if (hasActiveSearch) return isRelated ? baseWidth : 0.25;

        if (hoveredNode) {
            const ek = [link.source.id, link.target.id].sort().join('--');
            return hoverConnected.edgeKeys.has(ek) ? baseWidth : 0.25;
        }

        return baseWidth;
    }

    function getEdgeColor(link: { source: GlobalNode; target: GlobalNode; value: number }): string {
        if (pathData) {
            const ek = [link.source.id, link.target.id].sort().join('--');
            return pathData.pathEdgeKeys.has(ek) ? 'rgba(251, 146, 60, 0.95)' : 'rgba(226, 232, 240, 0.08)';
        }

        const hasActiveSearch = singleSearchQuery.length > 0;
        const isMatch = (nodeName?: string) =>
            singleSearchQuery && nodeName && typeof nodeName === 'string' &&
            nodeName.toLowerCase().includes(singleSearchQuery.toLowerCase());

        const isRelated = isMatch(link.source.name) || isMatch(link.target.name);
        if (hasActiveSearch) {
            return isRelated ? 'rgba(148, 163, 184, 0.95)' : 'rgba(226, 232, 240, 0.18)';
        }

        if (hoveredNode) {
            const ek = [link.source.id, link.target.id].sort().join('--');
            if (hoverConnected.edgeKeys.has(ek)) {
                const s = link.source.dept;
                const t = link.target.dept;
                if (s && t && s === t) {
                    return getDeptColor(s) + '99';
                }
                return 'rgba(148, 163, 184, 0.85)';
            }
            return 'rgba(226, 232, 240, 0.10)';
        }

        const s = link.source.dept;
        const t = link.target.dept;
        if (s && t && s === t) {
            return getDeptColor(s) + '88';
        }
        return 'rgba(148, 163, 184, 0.65)';
    }

    // -- Node style helpers --
    function getNodeOpacity(node: GlobalNode): number {
        const isOnPath = pathData?.pathNodeIds.has(node.id);
        const isMatch = singleSearchQuery && node.name.toLowerCase().includes(singleSearchQuery.toLowerCase());
        const hasSearch = singleSearchQuery.length > 0;
        const isDeptFiltered = !!activeDept;
        const isDeptNode = node.dept === activeDept;

        if (pathData) return isOnPath ? 1 : 0.08;
        if (hasSearch) return isMatch ? 1 : 0.08;
        if (hoveredNode) {
            return hoverConnected.nodeIds.has(node.id) ? 1 : 0.12;
        }
        if (isDeptFiltered && !isDeptNode) return 0.3;
        return 1;
    }

    function getNodeRadius(node: GlobalNode): number {
        const isHovered = hoveredNode === node.id;
        const isOnPath = pathData?.pathNodeIds.has(node.id);
        return isHovered ? 7 : (isOnPath ? 6.5 : 5);
    }

    function getNodeFill(node: GlobalNode): string {
        const isHovered = hoveredNode === node.id;
        const isOnPath = pathData?.pathNodeIds.has(node.id);
        const clusterColor = getDeptColor(node.dept);
        return isHovered ? '#2563eb' : (isOnPath ? '#fb923c' : clusterColor);
    }

    function getNodeStroke(node: GlobalNode): string {
        const isHovered = hoveredNode === node.id;
        const isOnPath = pathData?.pathNodeIds.has(node.id);
        return isHovered ? '#0f172a' : (isOnPath ? '#ea580c' : '#ffffff');
    }

    function getNodeStrokeWidth(node: GlobalNode): number {
        const isHovered = hoveredNode === node.id;
        const isMatch = singleSearchQuery && node.name.toLowerCase().includes(singleSearchQuery.toLowerCase());
        return isHovered ? 2.5 : (isMatch ? 2.0 : 1.2);
    }

    function getTextColor(node: GlobalNode): string {
        const isHovered = hoveredNode === node.id;
        const isOnPath = pathData?.pathNodeIds.has(node.id);
        const isMatch = singleSearchQuery && node.name.toLowerCase().includes(singleSearchQuery.toLowerCase());
        return (isHovered || isMatch || isOnPath) ? '#0f172a' : '#475569';
    }

    return (
        <div
            style={{
                marginTop: '0',
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '2rem 1rem',
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
                            Citation Overlap Network
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            Connecting faculty who cite the same research papers.
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

                        {/* Dual Author Search */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                                background: '#f8fafc',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${pathData ? '#fb923c' : (searchQuery1 && searchQuery2 && !pathData ? '#ef4444' : '#e2e8f0')}`
                            }}
                        >
                            <span style={{ fontSize: '0.9rem' }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Author 1..."
                                value={searchQuery1}
                                onChange={(e) => setSearchQuery1(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: '#1e293b', fontSize: '0.875rem', outline: 'none', width: '110px' }}
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
                                style={{ background: 'transparent', border: 'none', color: '#1e293b', fontSize: '0.875rem', outline: 'none', width: '110px' }}
                            />
                            {searchQuery2 && (
                                <button onClick={() => setSearchQuery2('')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>✕</button>
                            )}
                        </div>
                        {searchQuery1 && searchQuery2 && !pathData && (
                            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ⚠ No path found
                            </div>
                        )}
                        {pathData && (
                            <div style={{ background: '#fff7ed', color: '#ea580c', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                🔗 Path: {pathData.pathNodeIds.size} nodes
                            </div>
                        )}
                    </div>
                </header>

                <div
                    style={{
                        width: '100%',
                        position: 'relative',
                        overflow: 'hidden',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        border: '2px solid #e2e8f0',
                        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)'
                    }}
                >
                    {loading ? (
                        <div style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 1s linear infinite' }}>⟳</div>
                                <div>Building citation overlap network...</div>
                                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#475569' }}>Analyzing shared references across all faculty publications</div>
                                <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', color: '#334155' }}>First load may take up to a minute</div>
                            </div>
                        </div>
                    ) : !graphData || graphData.nodes.length === 0 ? (
                        <div style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                            No citation overlap data available.
                        </div>
                    ) : layoutData ? (
                        <>
                            {/* Summary Overlay Top Right */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 20,
                                    right: -10,
                                    zIndex: 10,
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
                                        borderBottom: '2px solid #a855f7',
                                        paddingBottom: '0.5rem',
                                        fontFamily: 'var(--font-heading)',
                                        margin: '0 0 1rem 0'
                                    }}
                                >
                                    CITATION OVERLAP SUMMARY
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                            Total Faculty
                                        </div>
                                        <div style={{ color: '#a855f7', fontSize: '1.25rem', fontWeight: 'bold' }}>
                                            {totalStats.total}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                            Intellectual Links
                                        </div>
                                        <div style={{ color: '#10b981', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                            {totalStats.links.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                            Total Shared Citations
                                        </div>
                                        <div style={{ color: '#f59e0b', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                            {totalStats.totalSharedCitations.toLocaleString()}
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

                            {/* Node Hover Box */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 280,
                                    right: 20,
                                    zIndex: 10,
                                    background: 'rgba(255, 255, 255, 0.95)',
                                    padding: '1rem',
                                    borderRadius: 12,
                                    border: `1px solid ${hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#a855f7'}`,
                                    width: '220px',
                                    boxShadow: '0 8px 12px -3px rgba(0, 0, 0, 0.3)',
                                    opacity: hoveredNodeData ? 1 : 0,
                                    transition: 'opacity 0.2s ease',
                                    pointerEvents: 'none'
                                }}
                            >
                                <div style={{ color: hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#a855f7', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    {hoveredNodeData?.dept ? `${hoveredNodeData.dept} AUTHOR` : 'SELECTED AUTHOR'}
                                </div>
                                <div style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                    <span style={{ color: '#1e293b' }}>{hoveredNodeData?.name || 'None'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                    <span style={{ color: '#94a3b8' }}>Shared Citations:</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                                        {hoveredNode ? nodeSharedCitations[hoveredNode] || 0 : 0}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#94a3b8' }}>Intellectual Peers:</span>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                                        {hoveredPeers}
                                    </span>
                                </div>
                            </div>

                            {/* SVG Graph */}
                            <svg
                                ref={svgRef}
                                className="co-authorship-svg"
                                viewBox={layoutData.viewBox}
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    maxHeight: '750px',
                                    display: 'block',
                                    cursor: 'grab',
                                }}
                                preserveAspectRatio="xMidYMid meet"
                            >
                                <style>{`
                                    .co-authorship-svg text {
                                        pointer-events: none;
                                        user-select: none;
                                    }
                                    .co-authorship-svg .graph-node {
                                        cursor: pointer;
                                        transition: opacity 0.2s ease;
                                    }
                                    .co-authorship-svg line {
                                        transition: stroke-opacity 0.2s ease, stroke-width 0.15s ease;
                                    }
                                    .co-authorship-svg:active { cursor: grabbing !important; }
                                `}</style>

                                <g ref={gRef}>
                                {/* Edges */}
                                {layoutData.links.map((link, i) => {
                                    const sx = link.source.x ?? 0;
                                    const sy = link.source.y ?? 0;
                                    const tx = link.target.x ?? 0;
                                    const ty = link.target.y ?? 0;
                                    return (
                                        <line
                                            key={`edge-${i}`}
                                            x1={sx}
                                            y1={sy}
                                            x2={tx}
                                            y2={ty}
                                            stroke={getEdgeColor(link)}
                                            strokeWidth={getEdgeWidth(link)}
                                        />
                                    );
                                })}

                                {/* Nodes */}
                                {layoutData.nodes.map(node => {
                                    const nx = node.x ?? 0;
                                    const ny = node.y ?? 0;
                                    const radius = getNodeRadius(node);
                                    const opacity = getNodeOpacity(node);
                                    const showLabel = opacity > 0.1;

                                    return (
                                        <g
                                            key={node.id}
                                            className="graph-node"
                                            opacity={opacity}
                                            onMouseEnter={() => setHoveredNode(node.id)}
                                            onMouseLeave={() => setHoveredNode(null)}
                                            onClick={() => { if (node.id) router.push(`/authors/${node.id}`); }}
                                        >
                                            <circle
                                                cx={nx}
                                                cy={ny}
                                                r={radius}
                                                fill={getNodeFill(node)}
                                                stroke={getNodeStroke(node)}
                                                strokeWidth={getNodeStrokeWidth(node)}
                                            />
                                            {showLabel && (
                                                <text
                                                    x={nx}
                                                    y={ny + radius + 8}
                                                    textAnchor="middle"
                                                    dominantBaseline="hanging"
                                                    fontSize={5}
                                                    fontWeight={600}
                                                    fontFamily='"Courier New", Courier, monospace'
                                                    fill={getTextColor(node)}
                                                >
                                                    {node.name}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                                </g>
                            </svg>

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
                                    <span>Edge width ∝ Shared citations</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: '50%',
                                            background: '#a855f7',
                                            border: '2px solid #fff',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    <span>Hover for profile info</span>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>

                {/* Top Connected Faculty Table */}
                {!loading && graphData && graphData.nodes.length > 0 && (
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
                                Top Connected Faculty (Shared Citations)
                            </h3>
                        </div>
                        <div style={{ padding: '0.5rem 0' }}>
                            {topAuthors.map((author, idx) => {
                                const count = nodeSharedCitations[author.id] || 0;
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
                                            cursor: 'pointer',
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.backgroundColor = '#faf5ff';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                        onClick={() => router.push(`/authors/${author.id}`)}
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
                                            color: '#1e293b',
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
                                            color: getDeptColor(author.dept),
                                            fontWeight: 700,
                                            width: '3rem',
                                        }}>
                                            {author.dept || ''}
                                        </span>
                                        <div style={{ flex: 1, position: 'relative', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${barWidth}%`,
                                                height: '100%',
                                                backgroundColor: '#a855f7',
                                                borderRadius: '3px',
                                                transition: 'width 0.6s ease',
                                            }} />
                                        </div>
                                        <span style={{
                                            fontSize: '0.8rem',
                                            color: '#a855f7',
                                            fontWeight: 700,
                                            minWidth: '3rem',
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
