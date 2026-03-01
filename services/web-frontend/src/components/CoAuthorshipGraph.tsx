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
    val?: number; // optional
    image_url?: string | null;
    is_faculty?: boolean;
    hop?: number;
    joint_papers?: number;

    // computed
    isCenter?: boolean;
    component?: number;
    degree?: number;

    // force-graph runtime positions
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

interface NetworkLink {
    source: string | NetworkNode;
    target: string | NetworkNode;
    value?: number;
}

interface NetworkData {
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

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

/**
 * ✅ Build connected components (clusters) so we can place them like Rankless:
 * - each connected component pulled toward its own "component center"
 * - isolates (degree=0) become their own components too
 */
function computeComponents(nodes: NetworkNode[], links: NetworkLink[]) {
    const idToIndex = new Map<string, number>();
    nodes.forEach((n, i) => idToIndex.set(n.id, i));

    const adj: number[][] = Array.from({ length: nodes.length }, () => []);
    const degree = new Array(nodes.length).fill(0);

    links.forEach((l) => {
        const s = idToIndex.get(getNodeId(l.source));
        const t = idToIndex.get(getNodeId(l.target));
        if (s == null || t == null) return;
        adj[s].push(t);
        adj[t].push(s);
        degree[s] += 1;
        degree[t] += 1;
    });

    // annotate degree
    nodes.forEach((n, i) => (n.degree = degree[i]));

    const visited = new Array(nodes.length).fill(false);
    const components: number[][] = [];
    for (let i = 0; i < nodes.length; i++) {
        if (visited[i]) continue;
        // BFS
        const q = [i];
        visited[i] = true;
        const comp: number[] = [];
        while (q.length) {
            const u = q.shift()!;
            comp.push(u);
            for (const v of adj[u]) {
                if (!visited[v]) {
                    visited[v] = true;
                    q.push(v);
                }
            }
        }
        components.push(comp);
    }

    // assign component id
    components.forEach((comp, ci) => {
        comp.forEach((idx) => {
            nodes[idx].component = ci;
        });
    });

    return { components };
}

/**
 * ✅ Choose component centers arranged nicely (big in the middle, smaller around),
 * like Rankless "islands".
 */
function computeComponentCenters(
    comps: number[][],
    nodes: NetworkNode[],
    width: number,
    height: number
) {
    // component "mass" = sum(val or degree)
    const masses = comps.map((c) =>
        c.reduce((sum, idx) => sum + (nodes[idx].val ?? 1) + (nodes[idx].degree ?? 0), 0)
    );

    // sort by mass descending, keep mapping
    const order = masses
        .map((m, i) => ({ m, i }))
        .sort((a, b) => b.m - a.m)
        .map((x) => x.i);

    const centers = new Map<number, { x: number; y: number }>();

    const cx = width * 0.5;
    const cy = height * 0.55;

    const ringR1 = Math.min(width, height) * 0.12;
    const ringR2 = Math.min(width, height) * 0.22;

    // place the biggest in the center-ish
    if (order.length) centers.set(order[0], { x: cx, y: cy });

    // distribute remaining around rings
    const rest = order.slice(1);
    const split = Math.ceil(rest.length * 0.55);
    const ring1 = rest.slice(0, split);
    const ring2 = rest.slice(split);

    ring1.forEach((compId, k) => {
        const angle = (2 * Math.PI * k) / Math.max(1, ring1.length);
        centers.set(compId, {
            x: cx + ringR1 * Math.cos(angle),
            y: cy + ringR1 * Math.sin(angle)
        });
    });

    ring2.forEach((compId, k) => {
        const angle = (2 * Math.PI * (k + 0.5)) / Math.max(1, ring2.length);
        centers.set(compId, {
            x: cx + ringR2 * Math.cos(angle),
            y: cy + ringR2 * Math.sin(angle)
        });
    });

    return centers;
}

export default function CoAuthorshipGraph({ authorId, authorName }: Props) {
    const [rawData, setRawData] = useState<NetworkData | null>(null);
    const [loading, setLoading] = useState(true);

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
                height: Math.max(650, Math.min(900, Math.floor((el.clientWidth || 1200) * 0.58)))
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

        fetch(`http://localhost:8000/authors/${shortId}/network`)
            .then((res) => res.json())
            .then((data: NetworkData) => {
                if (!data?.nodes?.length) {
                    setRawData({ nodes: [], links: [] });
                    setLoading(false);
                    return;
                }

                // mark center node
                data.nodes.forEach((n) => {
                    n.isCenter = n.id === shortId || n.name === authorName;
                });

                setRawData(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Error fetching network:', err);
                setLoading(false);
            });
    }, [authorId, authorName]);

    // ✅ preprocess to Rankless-like clusters
    const networkData: NetworkData | null = useMemo(() => {
        if (!rawData?.nodes?.length) return rawData;

        // clone to avoid mutating state
        const nodes = rawData.nodes.map((n) => ({ ...n }));
        const links = rawData.links.map((l) => ({ ...l }));

        // ensure node ids unique
        const seen = new Set<string>();
        const filteredNodes: NetworkNode[] = [];
        for (const n of nodes) {
            if (!n?.id) continue;
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            filteredNodes.push(n);
        }

        // remove links that refer to missing nodes
        const ids = new Set(filteredNodes.map((n) => n.id));
        const filteredLinks = links.filter((l) => ids.has(getNodeId(l.source)) && ids.has(getNodeId(l.target)));

        // compute connected components + degrees
        const { components } = computeComponents(filteredNodes, filteredLinks);

        // give nodes a baseline val so sizing works
        filteredNodes.forEach((n) => {
            const d = n.degree ?? 0;
            const jp = n.joint_papers ?? 0;
            const base = (n.val ?? 1) + d * 0.25 + jp * 0.6;
            n.val = clamp(base, 1.5, 22);
        });

        return { nodes: filteredNodes, links: filteredLinks };
    }, [rawData]);

    // ✅ configure forces (Rankless-ish)
    useEffect(() => {
        if (!fgRef.current || !networkData?.nodes?.length) return;

        const fg = fgRef.current;

        // link distance based on weight => heavier link pulls closer
        // ✅ link distance: increase overall spacing (heavier links still a bit closer)
        fg.d3Force('link')?.distance((l: any) => {
            const v = l?.value ?? 1;

            // bigger base distance => less overlap
            // heavier links slightly shorter, but still long
            return clamp(700 - v * 8, 450, 900);
        });

        fg.d3Force('link')?.strength((l: any) => {
            const v = l?.value ?? 1;

            // slightly lower strength so links don't pull nodes into a tight ball
            return clamp(0.12 + v * 0.02, 0.12, 0.35);
        });

        // charge: very strong repulsion within clusters
        fg.d3Force('charge')?.strength(-2500);

        // ✅ collision: smaller node body, but enough to prevent overlap
        fg.d3Force('collide')?.radius((n: any) => {
            const vv = n?.val ?? 6;

            // smaller than before (node size down), but still prevents overlaps
            return clamp(18 + vv * 0.4, 20, 40);
        });

        // ✅ cluster centers (component separation)
        const compsMap = new Map<number, number[]>();
        networkData.nodes.forEach((n, idx) => {
            const c = n.component ?? 0;
            if (!compsMap.has(c)) compsMap.set(c, []);
            compsMap.get(c)!.push(idx);
        });

        const comps = Array.from(compsMap.values());
        const centers = computeComponentCenters(comps, networkData.nodes, dimensions.width, dimensions.height);

        // forceX/forceY pull each component to its island center — strong to keep clusters close
        fg.d3Force('x')?.strength(0.25);
        fg.d3Force('y')?.strength(0.25);

        fg.d3Force('x')?.x((n: any) => {
            const c = n?.component ?? 0;
            const center = centers.get(c) ?? { x: dimensions.width * 0.5, y: dimensions.height * 0.55 };
            return center.x;
        });

        fg.d3Force('y')?.y((n: any) => {
            const c = n?.component ?? 0;
            const center = centers.get(c) ?? { x: dimensions.width * 0.5, y: dimensions.height * 0.55 };
            return center.y;
        });

        // center overall
        fg.d3Force('center')?.strength(0.04);

        // stabilize faster
        fg.cooldownTicks(220);

        // initial zoom-to-fit after layout starts
        const t = setTimeout(() => {
            try {
                fg.zoomToFit(750, 70);
            } catch { }
        }, 450);

        return () => clearTimeout(t);
    }, [networkData, dimensions.width, dimensions.height]);

    // ✅ node drawing (Rankless-style)
    const nodeCanvasObject = useCallback(
        (node: NetworkNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const isCenter = !!node.isCenter;

            const baseR = 1.5 + (node.val ?? 6) * 0.12;
            const radius = clamp(baseR, 2, 4);

            // fill
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'rgba(76, 118, 160, 0.40)'; // translucent blue-gray
            ctx.fill();

            // border: joint papers + center emphasis
            const jp = node.joint_papers ?? 0;
            const borderWidth = clamp(0.5 + jp * 0.1 + (isCenter ? 0.5 : 0), 0.5, 2);
            ctx.lineWidth = borderWidth;
            ctx.strokeStyle = isCenter ? 'rgba(110, 170, 230, 0.95)' : 'rgba(86, 144, 200, 0.85)';
            ctx.stroke();

            // label
            const label = safeLastName(node.name);
            const deg = node.degree ?? 0;

            // Rankless vibe: bigger labels for stronger nodes; scale w/ zoom
            const fontSize = clamp((isCenter ? 14 : 9) + (deg * 0.3) + (node.val ?? 6) * 0.1, 8, 16);
            const scaled = fontSize / globalScale;

            ctx.font = `700 ${scaled}px "Courier New", Courier, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // subtle shadow for readability
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 6 / globalScale;

            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, node.x!, node.y!);

            ctx.shadowBlur = 0;
        },
        []
    );

    // ✅ link thickness
    const linkWidth = useCallback((l: any) => {
        const v = l?.value ?? 1;
        return clamp(1 + v * 0.9, 1, 9);
    }, []);

    if (loading) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                Loading network...
            </div>
        );
    }

    if (!networkData || networkData.nodes.length === 0) {
        return null;
    }

    return (
        <div style={{ marginTop: '1.5rem' }}>
            <div
                style={{
                    background: '#545454', // Rankless-like gray
                    borderRadius: 10,
                    padding: '1.25rem',
                    border: '1px solid #3e3e3e'
                }}
            >
                <h2
                    style={{
                        fontSize: '1.25rem',
                        fontFamily: '"Courier New", Courier, monospace',
                        color: '#ffffff',
                        marginBottom: '0.75rem',
                        textAlign: 'center',
                        fontWeight: 800,
                        letterSpacing: '0.08em'
                    }}
                >
                    Co-authorship network of co-authors of {authorName}
                </h2>

                <div ref={containerRef} style={{ overflow: 'hidden', height: dimensions.height }}>
                    <ForceGraph2D
                        ref={fgRef}
                        width={dimensions.width}
                        height={dimensions.height}
                        graphData={networkData}
                        backgroundColor="rgba(0,0,0,0)" // show container bg
                        nodeLabel={(n: any) =>
                            `${n?.name ?? ''}${n?.joint_papers ? `\nJoint papers: ${n.joint_papers}` : ''}`
                        }
                        nodeCanvasObject={nodeCanvasObject}
                        linkWidth={linkWidth}
                        linkColor={() => 'rgba(205, 175, 55, 0.75)'} // gold
                        linkDirectionalParticles={0}
                        linkDirectionalParticleWidth={0}
                        linkCurvature={0}

                        // UX
                        enableNodeDrag={true}
                        cooldownTicks={220}
                        onNodeHover={(node: any) => {
                            if (!containerRef.current) return;
                            containerRef.current.style.cursor = node && node.is_faculty ? 'pointer' : 'default';
                        }}
                        onNodeClick={(node: any) => {
                            if (node && node.id && node.is_faculty) window.open(`/authors/${node.id}`, '_blank');
                        }}
                    />
                </div>
            </div>
        </div>
    );
}