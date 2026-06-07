'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import * as d3Force from 'd3-force';

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
    FENS: '#3b82f6',
    FASS: '#f59e0b',
    SBS: '#10b981',
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

export default function DepartmentNetworkGraph() {
    const [graphData, setGraphData] = useState<GlobalGraph | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery1, setSearchQuery1] = useState('');
    const [searchQuery2, setSearchQuery2] = useState('');
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [activeDept, setActiveDept] = useState<string | null>(null);

    const router = useRouter();

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

    // Visible graph data with dept filtering
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
        return { minPapers: Math.min(...papers), maxPapers: Math.max(...papers) };
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

    const hasPathSearch = searchQuery1.length > 0 && searchQuery2.length > 0;
    const singleSearchQuery = hasPathSearch ? '' : (searchQuery1 || searchQuery2);

    const pathData = useMemo(() => {
        if (!hasPathSearch || !visibleData.nodes.length) return null;
        return findShortestPath(visibleData.nodes, visibleData.links, searchQuery1, searchQuery2);
    }, [searchQuery1, searchQuery2, visibleData, hasPathSearch]);

    // Pre-compute layout
    const layoutData = useMemo(() => {
        if (!visibleData?.nodes.length) return null;

        const nodes = visibleData.nodes.map(n => ({ ...n }));
        const links = visibleData.links.map(l => ({
            source: typeof l.source === 'object' ? (l.source as any).id : l.source,
            target: typeof l.target === 'object' ? (l.target as any).id : l.target,
            value: l.value,
        }));

        const sim = d3Force.forceSimulation(nodes as any)
            .force('link', d3Force.forceLink(links as any).id((d: any) => d.id).distance(120).strength(0.4))
            .force('charge', d3Force.forceManyBody().strength(-120))
            .force('collide', d3Force.forceCollide().radius(14).strength(0.8))
            .force('center', d3Force.forceCenter(0, 0))
            .force('gravityX', d3Force.forceX(0).strength(0.06))
            .force('gravityY', d3Force.forceY(0).strength(0.06))
            .stop();

        for (let i = 0; i < 300; i++) sim.tick();

        const padding = 60;
        const xs = nodes.map(n => (n as any).x || 0);
        const ys = nodes.map(n => (n as any).y || 0);
        const minX = Math.min(...xs) - padding;
        const maxX = Math.max(...xs) + padding;
        const minY = Math.min(...ys) - padding;
        const maxY = Math.max(...ys) + padding;

        return {
            nodes: nodes as (GlobalNode & { x: number; y: number })[],
            links: links as any[],
            viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
        };
    }, [visibleData]);

    // Hover-connected nodes
    const { connectedNodeIds, connectedEdgeKeys } = useMemo(() => {
        if (!hoveredNode || !layoutData) return { connectedNodeIds: new Set<string>(), connectedEdgeKeys: new Set<string>() };
        const nodeIds = new Set<string>([hoveredNode]);
        const edgeKeys = new Set<string>();
        for (const link of layoutData.links) {
            const s = typeof link.source === 'object' ? link.source.id : link.source;
            const t = typeof link.target === 'object' ? link.target.id : link.target;
            if (s === hoveredNode || t === hoveredNode) {
                nodeIds.add(s); nodeIds.add(t);
                edgeKeys.add([s, t].sort().join('--'));
            }
        }
        return { connectedNodeIds: nodeIds, connectedEdgeKeys: edgeKeys };
    }, [hoveredNode, layoutData]);

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

    const hasData = !loading && graphData && graphData.nodes.length > 0 && layoutData;

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
            <div style={{ maxWidth: '1300px', width: '100%', margin: '0 auto', padding: '0 2vw', boxSizing: 'border-box' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <h2 style={{ fontSize: '1.5rem', fontFamily: '"Courier New", Courier, monospace', color: '#1e293b', fontWeight: 800 }}>
                            Global Collaboration Network
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            Visualizing joint publications across all faculties.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {['FENS', 'FASS', 'SBS'].map(dept => (
                            <button
                                key={dept}
                                onClick={() => setActiveDept(activeDept === dept ? null : dept)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.4rem 1rem', borderRadius: '8px',
                                    border: `1px solid ${activeDept === dept ? getDeptColor(dept) : '#334155'}`,
                                    backgroundColor: activeDept === dept ? getDeptColor(dept) : '#0f172a',
                                    color: activeDept === dept ? '#fff' : getDeptColor(dept),
                                    fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: activeDept === dept ? '#fff' : getDeptColor(dept), display: 'inline-block' }} />
                                {dept}
                            </button>
                        ))}
                        {activeDept && (
                            <button onClick={() => setActiveDept(null)} style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>
                                Clear ✕
                            </button>
                        )}

                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${pathData ? '#fb923c' : (searchQuery1 && searchQuery2 && !pathData ? '#ef4444' : '#e2e8f0')}` }}>
                            <span style={{ fontSize: '0.9rem' }}>🔍</span>
                            <input type="text" placeholder="Author 1..." value={searchQuery1} onChange={(e) => setSearchQuery1(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#1e293b', fontSize: '0.875rem', outline: 'none', width: '110px' }} />
                            {searchQuery1 && <button onClick={() => setSearchQuery1('')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>✕</button>}
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>↔</span>
                            <span style={{ fontSize: '0.85rem' }}>👤</span>
                            <input type="text" placeholder="Author 2..." value={searchQuery2} onChange={(e) => setSearchQuery2(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#1e293b', fontSize: '0.875rem', outline: 'none', width: '110px' }} />
                            {searchQuery2 && <button onClick={() => setSearchQuery2('')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>✕</button>}
                        </div>
                        {searchQuery1 && searchQuery2 && !pathData && (
                            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>⚠ No path found</div>
                        )}
                        {pathData && (
                            <div style={{ background: '#fff7ed', color: '#ea580c', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>🔗 Path: {pathData.pathNodeIds.size} nodes</div>
                        )}
                    </div>
                </header>

                {loading ? (
                    <div style={{ height: 650, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: 12, border: '2px solid #e2e8f0', color: '#94a3b8' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⟳</div>
                            <div>Building global network...</div>
                        </div>
                    </div>
                ) : !graphData || graphData.nodes.length === 0 ? (
                    <div style={{ height: 650, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: 12, border: '2px solid #e2e8f0', color: '#94a3b8' }}>
                        No collaboration data available.
                    </div>
                ) : layoutData ? (
                    <div style={{ width: '100%', position: 'relative', background: '#f8fafc', borderRadius: '12px', border: '2px solid #e2e8f0', overflow: 'hidden', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)' }}>
                        {/* Summary Overlay */}
                        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 2, background: 'rgba(255, 255, 255, 0.95)', padding: '1.5rem', borderRadius: 12, border: '1px solid #e2e8f0', width: '280px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)', pointerEvents: 'none' }}>
                            <h3 style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 800, borderBottom: '2px solid #3b82f6', paddingBottom: '0.5rem', margin: '0 0 1rem 0' }}>NETWORK SUMMARY</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div><div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Faculty</div><div style={{ color: '#3b82f6', fontSize: '1.25rem', fontWeight: 'bold' }}>{totalStats.total}</div></div>
                                <div><div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Links</div><div style={{ color: '#10b981', fontSize: '1.1rem', fontWeight: 'bold' }}>{totalStats.links.toLocaleString()}</div></div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div><div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>FENS</div><div style={{ color: getDeptColor('FENS'), fontSize: '0.9rem', fontWeight: 'bold' }}>{totalStats.fens}</div></div>
                                    <div><div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>FASS</div><div style={{ color: getDeptColor('FASS'), fontSize: '0.9rem', fontWeight: 'bold' }}>{totalStats.fass}</div></div>
                                    <div><div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase' }}>SBS</div><div style={{ color: getDeptColor('SBS'), fontSize: '0.9rem', fontWeight: 'bold' }}>{totalStats.sbs}</div></div>
                                </div>
                            </div>
                        </div>

                        {/* Node Hover Box */}
                        <div style={{ position: 'absolute', top: 250, right: 20, zIndex: 2, background: 'rgba(255, 255, 255, 0.95)', padding: '1rem', borderRadius: 12, border: `1px solid ${hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#3b82f6'}`, width: '220px', boxShadow: '0 8px 12px -3px rgba(0, 0, 0, 0.3)', opacity: hoveredNodeData ? 1 : 0, transition: 'opacity 0.2s ease', pointerEvents: 'none' }}>
                            <div style={{ color: hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#3b82f6', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>{hoveredNodeData?.dept ? `${hoveredNodeData.dept} AUTHOR` : 'SELECTED AUTHOR'}</div>
                            <div style={{ color: '#1e293b', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>{hoveredNodeData?.name || 'None'}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}><span style={{ color: '#94a3b8' }}>Joint Papers:</span><span style={{ fontWeight: 600, color: '#1e293b' }}>{hoveredNode ? nodeJointPapers[hoveredNode] || 0 : 0}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}><span style={{ color: '#94a3b8' }}>Collaborators:</span><span style={{ fontWeight: 600, color: '#1e293b' }}>{hoveredCollaborators}</span></div>
                        </div>

                        {/* Static SVG Graph */}
                        <svg viewBox={layoutData.viewBox} preserveAspectRatio="xMidYMid meet" className="co-authorship-svg" style={{ width: '100%', height: 'auto', maxHeight: '700px', display: 'block', background: '#f8fafc' }}>
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

                                    let strokeColor = 'rgba(148, 163, 184, 0.65)';
                                    let strokeWidth = logScale(link.value, linkBounds.minPapers, linkBounds.maxPapers, 0.7, 3.4);
                                    let opacity = 1;

                                    if (pathData) {
                                        if (pathData.pathEdgeKeys.has(edgeKey)) { strokeColor = 'rgba(251, 146, 60, 0.95)'; strokeWidth = 4.5; }
                                        else { opacity = 0.08; strokeWidth = 0.25; }
                                    } else if (singleSearchQuery) {
                                        const sName = typeof sourceNode === 'object' ? sourceNode.name : '';
                                        const tName = typeof targetNode === 'object' ? targetNode.name : '';
                                        const sourceMatch = sName?.toLowerCase().includes(singleSearchQuery.toLowerCase());
                                        const targetMatch = tName?.toLowerCase().includes(singleSearchQuery.toLowerCase());
                                        if (sourceMatch || targetMatch) { strokeColor = 'rgba(148, 163, 184, 0.95)'; }
                                        else { opacity = 0.18; strokeWidth = 0.25; }
                                    } else if (hoveredNode) {
                                        if (connectedEdgeKeys.has(edgeKey)) { strokeColor = 'rgba(148, 163, 184, 0.95)'; }
                                        else { opacity = 0.05; }
                                    } else {
                                        const sDept = typeof sourceNode === 'object' ? sourceNode.dept : null;
                                        const tDept = typeof targetNode === 'object' ? targetNode.dept : null;
                                        if (sDept && tDept && sDept === tDept) { strokeColor = getDeptColor(sDept) + '88'; }
                                    }

                                    return <line key={`edge-${i}`} className="edge" x1={sx} y1={sy} x2={tx} y2={ty} stroke={strokeColor} strokeWidth={strokeWidth} opacity={opacity} />;
                                })}
                            </g>
                            <g className="nodes-layer">
                                {layoutData.nodes.map(node => {
                                    const isOnPath = pathData?.pathNodeIds.has(node.id);
                                    const isMatch = singleSearchQuery && node.name.toLowerCase().includes(singleSearchQuery.toLowerCase());
                                    const isHovered = hoveredNode === node.id;
                                    const isConnected = connectedNodeIds.has(node.id);
                                    const isDeptNode = node.dept === activeDept;

                                    const clusterColor = getDeptColor(node.dept);
                                    const fillColor = isHovered ? '#2563eb' : (isOnPath ? '#fb923c' : clusterColor);
                                    const borderColor = isHovered ? '#0f172a' : (isOnPath ? '#ea580c' : '#ffffff');
                                    const radius = isHovered ? 7 : (isOnPath ? 6.5 : 5);
                                    const borderW = isHovered ? 2.5 : (isMatch ? 2.0 : 1.2);

                                    let opacity = 1;
                                    if (pathData) { opacity = isOnPath ? 1 : 0.08; }
                                    else if (singleSearchQuery) { opacity = isMatch ? 1 : 0.08; }
                                    else if (activeDept && !isDeptNode) { opacity = 0.3; }
                                    else if (hoveredNode) { opacity = isConnected ? 1 : 0.12; }

                                    const showLabel = isHovered || isMatch || isOnPath;

                                    return (
                                        <g key={node.id} className="node-group" opacity={opacity} style={{ cursor: 'pointer' }} onMouseEnter={() => setHoveredNode(node.id)} onMouseLeave={() => setHoveredNode(null)} onClick={() => { if (node.id) router.push(`/authors/${node.id}`); }}>
                                            <circle cx={node.x} cy={node.y} r={radius} fill={fillColor} stroke={borderColor} strokeWidth={borderW} />
                                            {showLabel && (
                                                <text x={node.x} y={(node.y || 0) + radius + 6} textAnchor="middle" fontSize={5} fill="#1e293b" fontFamily="'Courier New', Courier, monospace" fontWeight={600}>
                                                    {node.name}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>

                        {/* Legend */}
                        <div style={{ position: 'absolute', bottom: 15, left: 15, background: 'rgba(255, 255, 255, 0.9)', padding: '0.75rem', borderRadius: 8, border: '1px solid #e2e8f0', pointerEvents: 'none', fontSize: '0.75rem', color: '#1e293b', fontFamily: 'monospace', boxShadow: '0 4px 6px rgb(0 0 0 / 0.3)' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>LEGEND</div>
                            {Object.entries(DEPT_LABELS).map(([dept]) => (
                                <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: getDeptColor(dept) }} />
                                    <span>{dept} (Node)</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', marginTop: '6px' }}><div style={{ width: 20, height: 2, background: '#94a3b8' }} /><span>Edge width ∝ Shared works</span></div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
