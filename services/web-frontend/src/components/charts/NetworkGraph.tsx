'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

// Dynamic import for client-side only (ForceGraph uses window)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface NetworkNode {
    id: string;
    name: string;
    val: number;
    image_url?: string;
}

interface NetworkLink {
    source: string;
    target: string;
    value: number; // weight
}

interface NetworkData {
    nodes: NetworkNode[];
    links: NetworkLink[];
}

interface NetworkGraphProps {
    data: NetworkData;
}

export default function NetworkGraph({ data }: NetworkGraphProps) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ w: 600, h: 600 });

    useEffect(() => {
        if (containerRef.current) {
            setDimensions({
                w: containerRef.current.clientWidth,
                h: containerRef.current.clientHeight
            });
        }
    }, []);

    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('charge').strength(-200);
        }
    }, [fgRef]);

    if (!data || data.nodes.length === 0) return <div style={{ color: '#999' }}>No network data available</div>;

    return (
        <div ref={containerRef} style={{ width: '100%', height: '600px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', background: '#f9f9f9' }}>
            <h3 style={{ fontSize: '1.2rem', padding: '1rem', margin: 0, color: '#333', position: 'absolute', zIndex: 10 }}>Co-Author Network</h3>
            <ForceGraph2D
                ref={fgRef}
                width={dimensions.w}
                height={dimensions.h}
                graphData={data}
                nodeLabel="name"
                nodeColor={() => '#002855'}
                linkColor={() => '#cccccc'}
                nodeRelSize={1}
                nodeVal={(node: any) => Math.sqrt(node.val || 1) * 0.5}
                linkWidth={link => Math.sqrt((link as any).value || 0) + 1}
                backgroundColor="#f9f9f9"
                onNodeClick={(node: any) => {
                    // Navigate to author page
                    router.push(`/authors/${node.id}`);
                }}
                d3VelocityDecay={0.4}
                cooldownTicks={100}
                onEngineStop={() => {
                    if (fgRef.current) fgRef.current.zoomToFit(400);
                }}
            />
        </div>
    );
}
