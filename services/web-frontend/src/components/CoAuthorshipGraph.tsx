'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

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

function getNodeId(n: string | NetworkNode) {
    return typeof n === 'string' ? n : n.id;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

// Log scale helper for visual mapping
function logScale(value: number, minVal: number, maxVal: number, minOut: number, maxOut: number) {
    if (maxVal === minVal) return minOut;
    const logMin = Math.log(Math.max(1, minVal));
    const logMax = Math.log(Math.max(1, maxVal));
    const logVal = Math.log(Math.max(1, value));
    const normalized = (logVal - logMin) / (logMax - logMin);
    return minOut + normalized * (maxOut - minOut);
}

const CLUSTER_COLORS = [
    '#4FC3F7', '#81C784', '#FFB74D', '#BA68C8', '#F06292', 
    '#4DB6AC', '#DCE775', '#FF8A65', '#9575CD', '#A1887F'
];

export default function CoAuthorshipGraph({ authorId, authorName }: Props) {
    const [networkData, setNetworkData] = useState<NetworkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [yearRange, setYearRange] = useState({ 
        from: new Date().getFullYear() - 10, 
        to: new Date().getFullYear() 
    });
    const [collaboratorLimit, setCollaboratorLimit] = useState(25);

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
                setNetworkData(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Error fetching network:', err);
                setLoading(false);
            });
    }, [authorId, yearRange, collaboratorLimit]);

    // Bounds for scaling
    const bounds = useMemo(() => {
        if (!networkData?.nodes.length) return { minCits: 0, maxCits: 0, minPapers: 0, maxPapers: 0 };
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
        if (!networkData?.links.length) return { minPapers: 0, maxPapers: 0 };
        const papers = networkData.links.map(l => l.value);
        return {
            minPapers: Math.min(...papers),
            maxPapers: Math.max(...papers)
        };
    }, [networkData]);

    // ✅ configure forces
    useEffect(() => {
        if (!fgRef.current || !networkData?.nodes?.length) return;
        const fg = fgRef.current;

        // Tighter grouping: 
        // 1. Lower link distance (80 -> 45)
        // Reference image style: Distinct, tight clusters scattered across the canvas
        // 1. Very short link distance (30 -> 20)
        // 2. Maximum link strength (1.0)
        // 3. Balanced charge repulsion (-150 -> -200) to keep clusters apart
        // 4. Weak centering force (1.5 -> 0.1) to allow clusters to scatter/breathe
        fg.d3Force('link')?.distance(20).strength(1.0);
        fg.d3Force('charge')?.strength(-200);
        fg.d3Force('collide')?.radius((n: any) => logScale(n.joint_citations || 0, bounds.minCits, bounds.maxCits, 12, 35) + 10);
        fg.d3Force('center')?.strength(0.1);

        const t = setTimeout(() => {
            try { fg.zoomToFit(750, 70); } catch { }
        }, 500);
        return () => clearTimeout(t);
    }, [networkData, bounds]);

    // ✅ node drawing
    const nodeCanvasObject = useCallback(
        (obj: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const node = obj as NetworkNode;
            const radius = logScale(node.joint_citations, bounds.minCits, bounds.maxCits, 3, 12);
            const borderW = logScale(node.joint_papers, bounds.minPapers, bounds.maxPapers, 0.5, 4);
            const color = CLUSTER_COLORS[(node.cluster_id - 1) % CLUSTER_COLORS.length] || '#94a3b8';

            // Fill
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = `${color}44`; // 44 => ~25% alpha
            ctx.fill();

            // Border
            ctx.lineWidth = borderW / globalScale;
            ctx.strokeStyle = color;
            ctx.stroke();

            // Label
            const label = safeLastName(node.name);
            const fontSize = logScale(node.joint_citations, bounds.minCits, bounds.maxCits, 8, 14) / globalScale;
            
            ctx.font = `600 ${fontSize}px "Courier New", Courier, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, node.x!, node.y! + radius + 2);
        },
        [bounds]
    );

    const linkWidth = useCallback((l: any) => {
        return logScale(l.value, linkBounds.minPapers, linkBounds.maxPapers, 0.5, 5);
    }, [linkBounds]);

    const totalCitations = networkData?.nodes.reduce((sum, n) => sum + n.joint_citations, 0) || 0;

    return (
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: '#1e293b', borderRadius: 12, padding: '1.5rem', border: '1px solid #334155' }}>
                <header style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap',
                    gap: '1rem'
                }}>
                    <div style={{ textAlign: 'left' }}>
                        <h2 style={{ fontSize: '1.5rem', fontFamily: '"Courier New", Courier, monospace', color: '#f8fafc', fontWeight: 800 }}>
                            Collaboration Network for {authorName}
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            Visualizing top {collaboratorLimit} collaborators by joint citations.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {/* Collaborator Limit Controls */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '12px', 
                            alignItems: 'center', 
                            background: '#0f172a', 
                            padding: '8px 16px', 
                            borderRadius: '8px', 
                            border: '1px solid #334155'
                        }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>LIMIT</div>
                            <button 
                                onClick={() => setCollaboratorLimit(Math.max(5, collaboratorLimit - 5))}
                                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#f8fafc', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                            >
                                -
                            </button>
                            <span style={{ color: '#f8fafc', fontSize: '0.875rem', fontWeight: 700, width: '25px', textAlign: 'center' }}>{collaboratorLimit}</span>
                            <button 
                                onClick={() => setCollaboratorLimit(Math.min(100, collaboratorLimit + 5))}
                                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#f8fafc', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                            >
                                +
                            </button>
                        </div>

                        {/* Year Filter Controls */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '12px', 
                            alignItems: 'center', 
                            background: '#0f172a', 
                            padding: '8px 16px', 
                            borderRadius: '8px', 
                            border: '1px solid #334155'
                        }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>YEAR RANGE</div>
                            <input 
                                type="number" 
                                value={yearRange.from}
                                onChange={(e) => setYearRange({ ...yearRange, from: parseInt(e.target.value) })}
                                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#f8fafc', padding: '2px 6px', width: '70px', fontSize: '0.875rem' }}
                                min={1900} max={2100}
                            />
                            <span style={{ color: '#334155' }}>—</span>
                            <input 
                                type="number" 
                                value={yearRange.to}
                                onChange={(e) => setYearRange({ ...yearRange, to: parseInt(e.target.value) })}
                                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#f8fafc', padding: '2px 6px', width: '70px', fontSize: '0.875rem' }}
                                min={1900} max={2100}
                            />
                        </div>
                    </div>
                </header>

                {loading ? (
                    <div style={{ height: dimensions.height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', borderRadius: 8, color: '#94a3b8' }}>
                        Re-calculating network...
                    </div>
                ) : !networkData || networkData.nodes.length === 0 ? (
                    <div style={{ height: dimensions.height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', borderRadius: 8, color: '#94a3b8' }}>
                        No collaboration data found for this range.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem', alignItems: 'start' }}>
                        <div ref={containerRef} style={{ position: 'relative', overflow: 'hidden', height: dimensions.height, background: '#0f172a', borderRadius: 8 }}>
                            <ForceGraph2D
                                ref={fgRef}
                                width={dimensions.width * 0.75}
                                height={dimensions.height}
                                graphData={networkData}
                                nodeCanvasObject={nodeCanvasObject}
                                nodePointerAreaPaint={(node: any, color, ctx) => {
                                    const radius = logScale(node.joint_citations, bounds.minCits, bounds.maxCits, 3, 12);
                                    ctx.fillStyle = color;
                                    ctx.beginPath();
                                    ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
                                    ctx.fill();
                                }}
                                nodeRelSize={4}
                                linkWidth={linkWidth}
                                linkColor={() => '#475569aa'}
                                onNodeClick={(node: any) => {
                                    if (node && node.id && node.is_faculty) window.open(`/authors/${node.id}`, '_blank');
                                }}
                                nodeLabel={(n: any) => `
                                    ${n.name}
                                    Joint Citations: ${n.joint_citations}
                                    Joint Papers: ${n.joint_papers}
                                `}
                            />

                            {/* Legend */}
                            <div style={{
                                position: 'absolute', bottom: 15, left: 15, background: 'rgba(15, 23, 42, 0.85)',
                                padding: '0.75rem', borderRadius: 8, border: '1px solid #334155', pointerEvents: 'none',
                                fontSize: '0.75rem', color: '#f8fafc', fontFamily: 'monospace'
                            }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.25rem' }}>LEGEND</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1px solid #f8fafc' }}></div>
                                    <span>Node Size ∝ Joint Citations</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: 12, height: 12, borderRadius: '50%', border: '3px solid #f8fafc', boxSizing: 'border-box' }}></div>
                                    <span>Border ∝ Joint Papers (Center)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: 20, height: 2, background: '#f8fafc' }}></div>
                                    <span>Edge Width ∝ Shared Works</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: CLUSTER_COLORS[0] }}></div>
                                    <span>Color = Cluster/Community</span>
                                </div>
                            </div>
                        </div>

                        {/* Side Panel / Summary */}
                        <div style={{ background: '#0f172a', borderRadius: 8, padding: '1rem', border: '1px solid #334155', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 700, borderBottom: '1px solid #334155', paddingBottom: '0.5rem', fontFamily: 'monospace' }}>
                                SYNOPSIS
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>CORE RESEARCHER</div>
                                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 'bold' }}>{authorName}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>DISPLAYED COLLABORATORS</div>
                                    <div style={{ color: '#f8fafc', fontSize: '1.25rem', fontWeight: 'bold' }}>{networkData.nodes.length}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>JOINT CITATIONS (TOP {collaboratorLimit})</div>
                                    <div style={{ color: '#38bdf8', fontSize: '1.25rem', fontWeight: 'bold' }}>{totalCitations}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>COMMUNITIES FOUND</div>
                                    <div style={{ color: '#c084fc', fontSize: '1.25rem', fontWeight: 'bold' }}>{new Set(networkData.nodes.map(n => n.cluster_id)).size}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>PERIOD</div>
                                    <div style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 'bold' }}>{yearRange.from} — {yearRange.to}</div>
                                </div>
                            </div>
                            <div style={{ marginTop: 'auto', fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                                Note: The central researcher is omitted from the graph to highlight inter-collaborator connections.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}