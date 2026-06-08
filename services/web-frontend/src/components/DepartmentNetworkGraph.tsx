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

interface LayoutNode extends GlobalNode {
    x: number;
    y: number;
}

interface LayoutLink {
    source: LayoutNode;
    target: LayoutNode;
    value: number;
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

// Hex color to rgba helper
function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    const [selectedNode, setSelectedNode] = useState<string | null>(null);

    const router = useRouter();
    const svgRef = useRef<SVGSVGElement>(null);
    const gRef = useRef<SVGGElement>(null);
    const zoomRef = useRef<any>(null);

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
        return graphData;
    }, [graphData]);

    // Pre-compute layout with d3-force
    const layoutData = useMemo(() => {
        if (!visibleData.nodes.length) return null;

        const nodes: LayoutNode[] = visibleData.nodes.map(n => ({ ...n, x: 0, y: 0 }));
        const links = visibleData.links.map(l => ({
            source: typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source,
            target: typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target,
            value: l.value,
        }));

        const depts = [...new Set(nodes.map(n => n.dept).filter(Boolean))] as string[];
        const ringRadius = Math.max(60, depts.length * 20);
        const clusterCenters = new Map<string, { x: number; y: number }>();
        depts.forEach((dept, i) => {
            const angle = (i / depts.length) * Math.PI * 2;
            clusterCenters.set(dept, {
                x: Math.cos(angle) * ringRadius,
                y: Math.sin(angle) * ringRadius
            });
        });

        const sim = d3Force.forceSimulation(nodes as any)
            .force('link', d3Force.forceLink(links as any)
                .id((d: any) => d.id)
                .distance(38)
                .strength(0.3)
            )
            .force('charge', d3Force.forceManyBody().strength(-400))
            .force('collide', d3Force.forceCollide().radius(25).strength(0.8))
            .force('center', d3Force.forceCenter(0, 0))
            .force('gravityX', d3Force.forceX(0).strength(0.06))
            .force('gravityY', d3Force.forceY(0).strength(0.06));

        sim.stop();
        for (let i = 0; i < 300; i++) {
            const alpha = sim.alpha();
            for (const node of nodes as any[]) {
                if (node.dept) {
                    const target = clusterCenters.get(node.dept) || { x: 0, y: 0 };
                    node.vx += (target.x - (node.x || 0)) * 0.05 * alpha;
                    node.vy += (target.y - (node.y || 0)) * 0.05 * alpha;
                }
            }
            sim.tick();
        }

        // Build node map
        const nodeMap = new Map<string, LayoutNode>();
        for (const n of nodes) nodeMap.set(n.id, n as LayoutNode);

        // Resolve links to layout nodes
        const resolvedLinks: LayoutLink[] = (links as any[]).map(l => ({
            source: typeof l.source === 'object' ? nodeMap.get(l.source.id)! : nodeMap.get(l.source)!,
            target: typeof l.target === 'object' ? nodeMap.get(l.target.id)! : nodeMap.get(l.target)!,
            value: l.value,
        })).filter(l => l.source && l.target);

        // Compute bounding box
        const padding = 80;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }
        const vbX = minX - padding;
        const vbY = minY - padding;
        const vbW = maxX - minX + padding * 2;
        const vbH = maxY - minY + padding * 2;

        return {
            nodes: nodes as LayoutNode[],
            links: resolvedLinks,
            viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
            width: vbW,
            height: vbH,
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
        zoomRef.current = zoom;
        svg.call(zoom);
        svg.on("dblclick.zoom", null);
    }, [layoutData]);

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

    const topAuthors = useMemo(() => {
        if (!visibleData.nodes.length) return [];
        const sorted = [...visibleData.nodes].sort((a, b) => {
            const countA = nodeJointPapers[a.id] || 0;
            const countB = nodeJointPapers[b.id] || 0;
            return countB - countA;
        });
        return sorted.slice(0, 12);
    }, [visibleData.nodes, nodeJointPapers]);

    const maxAuthorCount = topAuthors.length > 0 ? (nodeJointPapers[topAuthors[0].id] || 1) : 1;

    const hasPathSearch = searchQuery1.length > 0 && searchQuery2.length > 0;
    const singleSearchQuery = hasPathSearch ? '' : (searchQuery1 || searchQuery2);
    const pathData = useMemo(() => {
        if (!hasPathSearch || !visibleData?.nodes.length) return null;
        return findShortestPath(visibleData.nodes, visibleData.links, searchQuery1, searchQuery2);
    }, [searchQuery1, searchQuery2, visibleData, hasPathSearch]);

    // Hover/Selected-connected nodes and edges
    const hoverConnected = useMemo(() => {
        const activeNode = selectedNode || hoveredNode;
        if (!activeNode || !layoutData) return { nodeIds: new Set<string>(), edgeKeys: new Set<string>() };
        const nodeIds = new Set<string>([activeNode]);
        const edgeKeys = new Set<string>();
        for (const l of layoutData.links) {
            const sId = l.source.id;
            const tId = l.target.id;
            if (sId === activeNode || tId === activeNode) {
                nodeIds.add(sId);
                nodeIds.add(tId);
                edgeKeys.add([sId, tId].sort().join('--'));
            }
        }
        return { nodeIds, edgeKeys };
    }, [hoveredNode, selectedNode, layoutData]);

    const searchConnections = useMemo(() => {
        if (!singleSearchQuery || !layoutData) return { matched: new Set<string>(), connected: new Set<string>(), edges: new Set<string>() };
        const sq = singleSearchQuery.toLowerCase();
        const matched = new Set<string>();
        for (const n of layoutData.nodes) {
            if (n.name.toLowerCase().includes(sq)) matched.add(n.id);
        }
        const connected = new Set<string>();
        const edges = new Set<string>();
        for (const l of layoutData.links) {
            const s = l.source.id;
            const t = l.target.id;
            if (matched.has(s) || matched.has(t)) {
                connected.add(s);
                connected.add(t);
                edges.add([s, t].sort().join('--'));
            }
        }
        return { matched, connected, edges };
    }, [singleSearchQuery, layoutData]);

    const activeNodeData = useMemo(() => {
        const id = selectedNode || hoveredNode;
        if (!id || !layoutData) return null;
        return layoutData.nodes.find(n => n.id === id);
    }, [selectedNode, hoveredNode, layoutData]);

    const hoveredCollaborators = useMemo(() => {
        if (!hoveredNode) return 0;
        return visibleData.links.reduce((count, l) => {
            const s = typeof l.source === 'object' ? (l.source as GlobalNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as GlobalNode).id : l.target;
            return (s === hoveredNode || t === hoveredNode) ? count + 1 : count;
        }, 0);
    }, [hoveredNode, visibleData]);

    // Compute edge style
    function getEdgeStyle(link: LayoutLink): { stroke: string; strokeWidth: number; opacity: number } {
        const activeNode = selectedNode || hoveredNode;
        const edgeKey = [link.source.id, link.target.id].sort().join('--');
        const val = link.value || 1;
        const baseWidth = logScale(val, linkBounds.minPapers, linkBounds.maxPapers, 0.7, 3.4);

        // Path search mode
        if (pathData) {
            if (pathData.pathEdgeKeys.has(edgeKey)) {
                return { stroke: 'rgba(251, 146, 60, 0.9)', strokeWidth: 4.5, opacity: 1 };
            }
            return { stroke: 'rgba(148, 163, 184, 0.1)', strokeWidth: 0.25, opacity: 1 };
        }

        // Single search mode
        const hasActiveSearch = singleSearchQuery.length > 0;
        if (hasActiveSearch) {
            if (searchConnections.edges.has(edgeKey)) {
                return { stroke: 'rgba(148, 163, 184, 0.95)', strokeWidth: baseWidth, opacity: 1 };
            }
            return { stroke: 'rgba(226, 232, 240, 0.18)', strokeWidth: 0.25, opacity: 1 };
        }

        // Hover/Selection mode
        if (activeNode) {
            if (hoverConnected.edgeKeys.has(edgeKey)) {
                const sDept = link.source.dept;
                const tDept = link.target.dept;
                if (sDept && tDept && sDept === tDept) {
                    return { stroke: hexToRgba(getDeptColor(sDept), 0.8), strokeWidth: baseWidth * 1.3, opacity: 1 };
                }
                return { stroke: 'rgba(148, 163, 184, 0.9)', strokeWidth: baseWidth * 1.3, opacity: 1 };
            }
            return { stroke: 'rgba(226, 232, 240, 0.12)', strokeWidth: baseWidth * 0.5, opacity: 1 };
        }

        // Active department filter
        const sDept = link.source.dept;
        const tDept = link.target.dept;

        if (activeDept) {
            const isSourceActive = sDept === activeDept;
            const isTargetActive = tDept === activeDept;
            if (isSourceActive && isTargetActive) {
                return { stroke: hexToRgba(getDeptColor(sDept), 0.6), strokeWidth: baseWidth, opacity: 1 };
            } else if (isSourceActive || isTargetActive) {
                return { stroke: 'rgba(148, 163, 184, 0.4)', strokeWidth: baseWidth, opacity: 1 };
            } else {
                return { stroke: 'rgba(226, 232, 240, 0.1)', strokeWidth: baseWidth * 0.5, opacity: 1 };
            }
        }

        // Default: same dept colored, cross-dept gray
        if (sDept && tDept && sDept === tDept) {
            return { stroke: hexToRgba(getDeptColor(sDept), 0.5), strokeWidth: baseWidth, opacity: 1 };
        }

        return { stroke: 'rgba(148, 163, 184, 0.65)', strokeWidth: baseWidth, opacity: 1 };
    }

    function getNodeStyle(node: LayoutNode): { fill: string; stroke: string; strokeWidth: number; radius: number; opacity: number; textColor: string } {
        const activeNode = selectedNode || hoveredNode;
        const isSelected = activeNode === node.id;
        const isOnPath = pathData?.pathNodeIds.has(node.id);
        const hasSearch = singleSearchQuery.length > 0;
        const isSearchMatched = hasSearch && searchConnections.matched.has(node.id);
        const isSearchConnected = hasSearch && searchConnections.connected.has(node.id);
        const isDeptFiltered = !!activeDept;
        const isDeptNode = node.dept === activeDept;

        let alpha = 1;
        if (pathData) alpha = isOnPath ? 1 : 0.08;
        else if (hasSearch) alpha = isSearchConnected ? 1 : 0.08;
        else if (activeNode) alpha = hoverConnected.nodeIds.has(node.id) ? 1 : 0.12;
        else if (isDeptFiltered && !isDeptNode) alpha = 0.3;

        const radius = isOnPath ? 11 : (isSelected || isSearchMatched ? 10 : 8);
        const clusterColor = getDeptColor(node.dept);
        const fillColor = isSelected ? '#2563eb' : (isOnPath ? '#fb923c' : clusterColor);
        const borderColor = isSelected ? '#0f172a' : (isOnPath ? '#ea580c' : (isSearchMatched ? '#3b82f6' : '#ffffff'));
        const borderW = isSelected || isSearchMatched ? 2.5 : 1.2;
        const textColor = (isSelected || isSearchConnected || isOnPath) ? '#0f172a' : '#475569';

        return { fill: fillColor, stroke: borderColor, strokeWidth: borderW, radius, opacity: alpha, textColor };
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
                    width: '100%',
                    margin: '0 auto',
                    padding: '0 8%',
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
                                    border: `1px solid ${activeDept === dept ? getDeptColor(dept) : '#e2e8f0'}`,
                                    backgroundColor: activeDept === dept ? getDeptColor(dept) : '#ffffff',
                                    color: activeDept === dept ? '#ffffff' : '#64748b',
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
                                gap: '6px',
                                alignItems: 'center',
                                background: '#f8fafc',
                                padding: '6px 12px',
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
                                style={{ background: 'transparent', border: 'none', color: '#1e293b', fontSize: '0.875rem', outline: 'none', width: '100px' }}
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
                                style={{ background: 'transparent', border: 'none', color: '#1e293b', fontSize: '0.875rem', outline: 'none', width: '100px' }}
                            />
                            {searchQuery2 && (
                                <button onClick={() => setSearchQuery2('')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>✕</button>
                            )}
                        </div>
                        {searchQuery1 && searchQuery2 && !pathData && (
                            <div style={{ background: '#fef2f2', color: '#ef4444', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ⚠ No path
                            </div>
                        )}
                        {pathData && (
                            <div style={{ background: '#fff7ed', color: '#fb923c', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                🔗 {pathData.pathNodeIds.size} nodes
                            </div>
                        )}
                    </div>
                </header>

                <div
                    style={{
                        width: '100%',
                        height: '85vh',
                        minHeight: '600px',
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
                        ) : layoutData ? (
                            <>
                                {/* Node Info Box */}
                            {activeNodeData && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 15,
                                        right: 15,
                                        width: '280px',
                                        background: 'rgba(255, 255, 255, 0.95)',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        padding: '1rem',
                                        pointerEvents: selectedNode ? 'auto' : 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                                        zIndex: 20
                                    }}
                                >
                                    <div style={{ color: activeNodeData.dept ? getDeptColor(activeNodeData.dept) : '#3b82f6', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                        {activeNodeData.dept || 'UNKNOWN DEPT'}
                                    </div>

                                    <div style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                        {activeNodeData.name}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                        <span style={{ color: '#64748b' }}>Total Papers:</span>
                                        <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{nodeJointPapers[activeNodeData.id] || 0}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: '#64748b' }}>Connections:</span>
                                        <span style={{ color: '#0f172a', fontWeight: 'bold' }}>
                                            {layoutData?.links.filter(l => l.source.id === activeNodeData.id || l.target.id === activeNodeData.id).length}
                                        </span>
                                    </div>

                                    {selectedNode === activeNodeData.id && (
                                        <button
                                            onClick={() => router.push(`/authors/${activeNodeData.id}`)}
                                            style={{
                                                marginTop: '1rem',
                                                width: '100%',
                                                padding: '0.5rem',
                                                background: '#3b82f6',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '0.8rem'
                                            }}
                                        >
                                            Go to Profile →
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* SVG Graph */}
                            <svg
                                ref={svgRef}
                                className="co-authorship-svg"
                                onClick={() => setSelectedNode(null)}
                                viewBox={layoutData.viewBox}
                                style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
                                preserveAspectRatio="xMidYMid meet"
                            >
                                <style>{`
                                    .co-authorship-svg text { pointer-events: none; }
                                    .co-authorship-svg .graph-node { cursor: pointer; transition: opacity 0.2s ease; }
                                    .co-authorship-svg line { transition: stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease; }
                                    .co-authorship-svg:active { cursor: grabbing !important; }
                                `}</style>

                                <g ref={gRef}>
                                {/* Edges */}
                                <g className="edges">
                                    {layoutData.links.map((link, i) => {
                                        const style = getEdgeStyle(link);
                                        return (
                                            <line
                                                key={i}
                                                x1={link.source.x}
                                                y1={link.source.y}
                                                x2={link.target.x}
                                                y2={link.target.y}
                                                stroke={style.stroke}
                                                strokeWidth={style.strokeWidth}
                                                opacity={style.opacity}
                                            />
                                        );
                                    })}
                                </g>

                                {/* Nodes */}
                                <g className="nodes">
                                    {layoutData.nodes.map(node => {
                                        const style = getNodeStyle(node);
                                        const showLabel = style.opacity > 0.1;
                                        return (
                                                <g
                                                    key={node.id}
                                                    className="graph-node"
                                                    opacity={style.opacity}
                                                    onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id); }}
                                                    onMouseEnter={() => setHoveredNode(node.id)}
                                                    onMouseLeave={() => setHoveredNode(null)}
                                                >
                                                <circle
                                                    cx={node.x}
                                                    cy={node.y}
                                                    r={style.radius}
                                                    fill={style.fill}
                                                    stroke={style.stroke}
                                                    strokeWidth={style.strokeWidth}
                                                />
                                                {/* Invisible larger hit area for hover */}
                                                <circle
                                                    cx={node.x}
                                                    cy={node.y}
                                                    r={Math.max(style.radius, 10)}
                                                    fill="transparent"
                                                    stroke="none"
                                                />
                                                {showLabel && (
                                                    <text
                                                        x={node.x}
                                                        y={node.y + style.radius + 7}
                                                        textAnchor="middle"
                                                        fontSize={8}
                                                        fontFamily='"Courier New", Courier, monospace'
                                                        fontWeight={600}
                                                        fill={style.textColor}
                                                    >
                                                        {node.name}
                                                    </text>
                                                )}
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
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: '#1e293b',
                                    boxShadow: '0 4px 6px rgb(0 0 0 / 0.1)',
                                    zIndex: 10
                                }}
                            >
                                Recenter Network
                            </button>

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
                                    <span>Click for profile info</span>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>

                {/* New Summary Row Below Network */}
                {!loading && graphData && graphData.nodes.length > 0 && (
                    <div
                        style={{
                            marginTop: '1.5rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc',
                            padding: '1.5rem 2rem',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            flexWrap: 'wrap',
                            gap: '1.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Total Faculty
                                </div>
                                <div style={{ color: '#3b82f6', fontSize: '1.75rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                                    {totalStats.total}
                                </div>
                            </div>
                            
                            <div style={{ width: '1px', height: '40px', background: '#e2e8f0' }} />
                            
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Total Links
                                </div>
                                <div style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                                    {totalStats.links.toLocaleString()}
                                </div>
                            </div>
                            
                            <div style={{ width: '1px', height: '40px', background: '#e2e8f0' }} />
                            
                            <div style={{ display: 'flex', gap: '2rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>FENS</div>
                                    <div style={{ color: getDeptColor('FENS'), fontSize: '1.25rem', fontWeight: 'bold' }}>{totalStats.fens}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>FASS</div>
                                    <div style={{ color: getDeptColor('FASS'), fontSize: '1.25rem', fontWeight: 'bold' }}>{totalStats.fass}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>SBS</div>
                                    <div style={{ color: getDeptColor('SBS'), fontSize: '1.25rem', fontWeight: 'bold' }}>{totalStats.sbs}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                </svg>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ color: '#1e293b', fontSize: '0.9rem', fontWeight: 700 }}>Network Overview</div>
                                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Global collaboration metrics</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Top Collaborating Faculty Table */}
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
                                Top Connected Faculty (Joint Papers)
                            </h3>
                        </div>
                        <div style={{ padding: '0.5rem 0' }}>
                            {topAuthors.map((author, idx) => {
                                const count = nodeJointPapers[author.id] || 0;
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
                                            e.currentTarget.style.backgroundColor = '#eff6ff';
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
