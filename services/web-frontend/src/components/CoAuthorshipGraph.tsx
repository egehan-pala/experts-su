'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import data to avoid SSR issues with Canvas
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading graph engine...</div>
});

interface NetworkNode {
    id: string;
    name: string;
    val: number;
    image_url?: string | null;
}

interface NetworkLink {
    source: string;
    target: string;
    value: number;
}

interface NetworkData {
    nodes: NetworkNode[];
    links: NetworkLink[];
}

interface Props {
    authorId: string;
    authorName: string;
}

export default function CoAuthorshipGraph({ authorId, authorName }: Props) {
    const [networkData, setNetworkData] = useState<NetworkData | null>(null);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(undefined);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    // Custom force configuration
    useEffect(() => {
        if (fgRef.current) {
            // Extreme repulsion to force clusters apart
            fgRef.current.d3Force('charge').strength(-3000);
            // Much longer links to create space
            fgRef.current.d3Force('link').distance(200);
            // Add centering force to keep the whole graph on screen despite expansion
            fgRef.current.d3Force('center').strength(0.05);
        }
    }, [networkData]);

    // Handle resize
    useEffect(() => {
        if (containerRef.current) {
            setDimensions({
                width: containerRef.current.clientWidth,
                height: 500 // Fixed height
            });
        }
    }, [containerRef]);

    // Fetch network data
    useEffect(() => {
        if (authorId) {
            const shortId = authorId.includes('/') ? authorId.split('/').pop() : authorId;
            fetch(`http://localhost:8000/authors/${shortId}/network`)
                .then(res => res.json())
                .then(data => {
                    // Pre-process to ensure valid graph data
                    if (data && data.nodes) {
                        // Mark the central node
                        data.nodes.forEach((n: any) => {
                            n.isCenter = n.id === shortId || n.name === authorName;
                        });
                    }
                    setNetworkData(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching network:', err);
                    setLoading(false);
                });
        }
    }, [authorId, authorName]);

    // Custom node rendering
    const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        // Node size based on 'val' (pub count)
        const radius = node.isCenter ? 12 : Math.max(4, Math.sqrt(node.val) * 1.5);

        // Draw circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.isCenter ? '#3b82f6' : '#64748b'; // Blue for center, Gray for others
        ctx.fill();

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = node.isCenter ? 2 : 1;
        ctx.stroke();

        // Label
        const label = node.name.split(' ').pop(); // Last name only
        if (label) {
            const fontSize = node.isCenter ? 14 : 10;
            ctx.font = `${node.isCenter ? 'bold' : ''} ${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            // Draw text shadow for readability
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 3;
            ctx.fillText(label, node.x, node.y + radius + fontSize);
            ctx.shadowBlur = 0;
        }
    }, []);

    if (loading) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Loading network...
            </div>
        );
    }

    if (!networkData || networkData.nodes.length === 0) {
        return null;
    }

    return (
        <div style={{ marginTop: '2rem' }}>
            <h2 style={{
                fontSize: '1.5rem',
                fontFamily: 'var(--font-serif)',
                color: '#111',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                <span style={{ fontSize: '1.25rem' }}>🔗</span>
                Co-authorship Network
            </h2>

            <div ref={containerRef} style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' // Dark theme
            }}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={networkData}
                    nodeLabel="name"
                    nodeCanvasObject={nodeCanvasObject}
                    linkWidth={link => Math.min(Math.sqrt(link.value || 1) * 0.5, 5)}
                    linkColor={() => 'rgba(245, 158, 11, 0.5)'} // Orange with 0.5 opacity
                    backgroundColor="rgba(0,0,0,0)" // Transparent to let container bg show
                    d3AlphaDecay={0.05}     // Slower decay for better settling
                    d3VelocityDecay={0.3}
                    cooldownTicks={100}
                    warmupTicks={100} // Pre-calculate layout before showing
                    onNodeClick={node => {
                        if (node.id) window.open(`/authors/${node.id}`, '_blank');
                    }}
                />
            </div>
            <div style={{
                marginTop: '0.5rem',
                fontSize: '0.8rem',
                color: '#64748b',
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end'
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }}></span>
                    Current Faculty
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b' }}></span>
                    Co-author
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 20, height: 2, background: '#f59e0b' }}></span>
                    Connections (min. 5 papers)
                </span>
            </div>
        </div>
    );
}
