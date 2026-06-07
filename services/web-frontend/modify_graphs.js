const fs = require('fs');
const path = require('path');

const files = [
    'src/components/DepartmentNetworkGraph.tsx',
    'src/components/CitationOverlapGraph.tsx'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const isCitation = file.includes('Citation');
    const boundsVar = isCitation ? 'linkBounds.maxPapers' : 'linkBounds.maxPapers';
    const countVar = isCitation ? 'nodeSharedCitations[n.id]' : 'nodeJointPapers[n.id]';
    const linkCountVar = isCitation ? 'nodeSharedCitations[node.id]' : 'nodeJointPapers[node.id]';
    const boundsName = 'linkBounds';

    // 1. ARKA PLAN
    content = content.replace(/backgroundColor: '#ffffff'/g, "backgroundColor: '#0d1117'");
    content = content.replace(/background: '#f8fafc'/g, "background: '#0d1117'");
    content = content.replace(/<ForceGraph2D/g, '<ForceGraph2D backgroundColor="#0d1117" d3AlphaDecay={0.02} d3VelocityDecay={0.4}');

    // 2. NODE Renkleri
    content = content.replace(/const DEPT_COLORS: Record<string, string> = {[^}]+};/m, `const DEPT_COLORS: Record<string, string> = {
    FENS: '#378ADD',
    FASS: '#1D9E75',
    SBS: '#D85A30',
};`);
    
    // Node boyut ve stroke (canvas object)
    let nodeCanvasObjRegex = /const nodeCanvasObject = useCallback\([\s\S]*?ctx\.fillText\(label, textX, textY\);\n\s*}\n\s*},/m;
    
    let replacement = `const nodeCanvasObject = useCallback(
        (obj: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const node = obj as GlobalNode;
            const isHovered = hoveredNode === node.id;
            const isOnPath = pathData?.pathNodeIds.has(node.id);
            const isMatch = singleSearchQuery && node.name.toLowerCase().includes(singleSearchQuery.toLowerCase());
            const hasSearch = singleSearchQuery.length > 0;
            const isDeptFiltered = !!activeDept;
            const isDeptNode = node.dept === activeDept;

            let alpha = 1;
            if (pathData) alpha = isOnPath ? 1 : 0.08;
            else if (hasSearch) alpha = isMatch ? 1 : 0.08;
            else if (isDeptFiltered && !isDeptNode) alpha = 0.3;
            else if (hoveredNode) {
                const isConnected = visibleData.links.some(l => 
                    ((typeof l.source === 'object' ? l.source.id : l.source) === node.id && (typeof l.target === 'object' ? l.target.id : l.target) === hoveredNode) ||
                    ((typeof l.target === 'object' ? l.target.id : l.target) === node.id && (typeof l.source === 'object' ? l.source.id : l.source) === hoveredNode)
                );
                if (!isHovered && !isConnected) alpha = 0.1;
            }

            const count = ${linkCountVar} || 1;
            const radius = Math.sqrt(count) * 4 + 6;
            
            const clusterColor = getDeptColor(node.dept);
            const fillColor = isHovered ? '#ffffff' : clusterColor;
            const borderColor = '#ffffff';

            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fillColor;
            ctx.fill();

            const borderW = 1.5;
            ctx.lineWidth = borderW;
            ctx.strokeStyle = borderColor;
            ctx.stroke();
            ctx.globalAlpha = 1;

            const showLabel = alpha > 0.1;
            if (showLabel) {
                const label = node.name;
                const fontSize = 5;

                ctx.font = \`600 \${fontSize}px "Courier New", Courier, monospace\`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                const textX = node.x || 0;
                const textY = (node.y || 0) + radius + 4;
                const metrics = ctx.measureText(label);
                const paddingX = 4;
                const paddingY = 2;
                const textHeight = fontSize + paddingY * 2;

                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(
                    textX - metrics.width / 2 - paddingX,
                    textY - paddingY,
                    metrics.width + paddingX * 2,
                    textHeight
                );
                ctx.fillStyle = '#ffffff';

                ctx.globalAlpha = alpha;
                ctx.fillText(label, textX, textY);
            }
        },`;

    content = content.replace(nodeCanvasObjRegex, replacement);

    // 3. EDGE
    let linkWidthRegex = /const linkWidth = useCallback\([\s\S]*?\}, \[singleSearchQuery, linkBounds, pathData\]\);/m;
    let linkWidthRep = `const linkWidth = useCallback((l: any) => {
        const val = l.value || 1;
        let baseWidth = Math.log(val + 1) * 1.5 + 0.5;

        let multiplier = 1;
        if (hoveredNode) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (s === hoveredNode || t === hoveredNode) multiplier = 1.5;
        }

        if (pathData) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            const ek = [s, t].sort().join('--');
            return pathData.pathEdgeKeys.has(ek) ? 4.5 * multiplier : 0.25;
        }

        const hasActiveSearch = singleSearchQuery.length > 0;
        const sourceMatch = singleSearchQuery && l.source?.name?.toLowerCase().includes(singleSearchQuery.toLowerCase());
        const targetMatch = singleSearchQuery && l.target?.name?.toLowerCase().includes(singleSearchQuery.toLowerCase());
        const isRelated = sourceMatch || targetMatch;

        if (hasActiveSearch) return isRelated ? baseWidth * multiplier : 0.25;
        return baseWidth * multiplier;
    }, [singleSearchQuery, linkBounds, pathData, hoveredNode]);`;
    content = content.replace(linkWidthRegex, linkWidthRep);

    let linkColorRegex = /const linkColor = useCallback\([\s\S]*?\}, \[singleSearchQuery, .*?pathData\]\);/m;
    let linkColorRep = `const linkColor = useCallback((l: any) => {
        const sDept = typeof l.source === 'object' ? l.source.dept : null;
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const baseColor = getDeptColor(sDept);
        
        let opacity = 0.25;
        if (hoveredNode) {
            if (sId === hoveredNode || tId === hoveredNode) opacity = 0.9;
            else opacity = 0.05;
        }

        if (pathData) {
            const ek = [sId, tId].sort().join('--');
            return pathData.pathEdgeKeys.has(ek) ? \`rgba(251, 146, 60, \${opacity > 0.5 ? 1 : 0.9})\` : \`rgba(148, 163, 184, 0.05)\`;
        }

        const hex = baseColor.replace('#', '');
        const r = parseInt(hex.substring(0,2), 16) || 127;
        const g = parseInt(hex.substring(2,4), 16) || 119;
        const b = parseInt(hex.substring(4,6), 16) || 221;
        return \`rgba(\${r},\${g},\${b},\${opacity})\`;
    }, [singleSearchQuery, pathData, hoveredNode]);`;
    content = content.replace(linkColorRegex, linkColorRep);

    // 4. D3 FORCE
    let forceRegex = /fg\.d3Force\('link', d3Force\.forceLink\(\)[\s\S]*?fg\.d3ReheatSimulation\(\);/m;
    let forceRep = `fg.d3Force('link', d3Force.forceLink()
            .id((d: any) => d.id)
            .distance((l: any) => {
                const val = l.value || 1;
                const normalizedWeight = Math.min(1, val / ${boundsName}.maxPapers);
                return 160 + (1 - normalizedWeight) * 80;
            })
            .strength((l: any) => {
                const val = l.value || 1;
                const normalizedWeight = Math.min(1, val / ${boundsName}.maxPapers);
                return normalizedWeight * 0.7 + 0.1;
            })
        );
        fg.d3Force('charge', d3Force.forceManyBody().strength(-1000).distanceMax(500));
        fg.d3Force('collide', d3Force.forceCollide().radius((n: any) => {
            const count = ${countVar} || 1;
            const r = Math.sqrt(count) * 4 + 6;
            return r + 12;
        }).strength(0.8));
        fg.d3Force('center', d3Force.forceCenter(0, 0).strength(0.05));
        fg.d3Force('gravityX', d3Force.forceX(0).strength(0.06));
        fg.d3Force('gravityY', d3Force.forceY(0).strength(0.06));
        fg.d3ReheatSimulation();`;
    content = content.replace(forceRegex, forceRep);
    
    content = content.replace(/}, \[visibleData\]\);/m, `}, [visibleData, ${boundsName}, ${countVar.split('[')[0]}]);`);

    // 5. Tooltip (siyah bg)
    let tooltipRegex = /position: 'absolute',\s*top: 250,\s*right: 20,\s*zIndex: [0-9]+,\s*background: 'rgba\(255, 255, 255, 0\.95\)'[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m;
    if (!content.match(tooltipRegex)) {
        tooltipRegex = /position: 'absolute',\s*top: 280,\s*right: 20,\s*zIndex: [0-9]+,\s*background: 'rgba\(255, 255, 255, 0\.95\)'[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m;
    }
    
    let tooltipTop = isCitation ? 280 : 250;
    let stat1Label = isCitation ? 'Shared Citations:' : 'Joint Papers:';
    let stat1Val = isCitation ? 'nodeSharedCitations[hoveredNode] || 0' : 'nodeJointPapers[hoveredNode] || 0';
    let stat2Label = isCitation ? 'Intellectual Peers:' : 'Collaborators:';
    let stat2Val = isCitation ? 'hoveredPeers' : 'hoveredCollaborators';
    
    let tooltipRep = `position: 'absolute',
                                    top: ${tooltipTop},
                                    right: 20,
                                    zIndex: 10,
                                    background: '#0d1117',
                                    padding: '1rem',
                                    borderRadius: 12,
                                    border: \`1px solid \${hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#a855f7'}\`,
                                    width: '220px',
                                    boxShadow: '0 8px 12px -3px rgba(0, 0, 0, 0.5)',
                                    opacity: hoveredNodeData ? 1 : 0,
                                    transition: 'opacity 0.2s ease',
                                    pointerEvents: 'none'
                                }}
                            >
                                <div style={{ color: hoveredNodeData ? getDeptColor(hoveredNodeData.dept) : '#a855f7', fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    {hoveredNodeData?.dept ? \`\${hoveredNodeData.dept} AUTHOR\` : 'SELECTED AUTHOR'}
                                </div>
                                <div style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                    <span>{hoveredNodeData?.name || 'None'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                    <span style={{ color: '#94a3b8' }}>${stat1Label}</span>
                                    <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                        {hoveredNode ? ${stat1Val} : 0}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#94a3b8' }}>${stat2Label}</span>
                                    <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                        {${stat2Val}}
                                    </span>
                                </div>
                            </div>`;
    content = content.replace(tooltipRegex, tooltipRep);

    // 6. LEGEND
    let legendRegex = /LEGEND[\s\S]*?Hover for profile info<\/span>\s*<\/div>\s*<\/div>/m;
    let legendRep = `LEGEND
                                </div>
                                {Object.entries(DEPT_LABELS).map(([dept, label]) => (
                                    <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <div
                                            style={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: '50%',
                                                background: getDeptColor(dept),
                                                border: '1px solid #fff'
                                            }}
                                        />
                                        <span>{dept}</span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', marginTop: '8px' }}>
                                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid #fff', background: 'transparent' }} />
                                    <span>Node size ∝ Connections</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: 20, height: 3, background: '#94a3b8' }} />
                                    <span>Edge width ∝ ${isCitation ? 'Shared citations' : 'Joint papers'}</span>
                                </div>
                            </div>`;
    content = content.replace(legendRegex, legendRep);

    content = content.replace(/background: 'rgba\(255, 255, 255, 0\.9\)'/g, "background: 'rgba(13, 17, 23, 0.8)'");
    content = content.replace(/color: '#1e293b',[\s\S]*?fontFamily: 'monospace'/m, "color: '#f8fafc',\n                                    fontFamily: 'monospace'");

    // 7. BUTTON and 8. FILTER
    const useEffectFilter = `
    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3ReheatSimulation();
        }
    }, [activeDept, singleSearchQuery]);
    `;
    const hookInsertionPoint = "const hasPathSearch = ";
    content = content.replace(hookInsertionPoint, useEffectFilter + "\\n    " + hookInsertionPoint);

    if (!content.includes('Recenter Network')) {
        let closingTags = /<\/div>\s*<\/div>\s*\{\/\* Top Connected Faculty Table \*\/\}/m;
        let recenterBtn = `
                            {/* Recenter Button */}
                            <button
                                onClick={() => {
                                    try {
                                        if (fgRef.current) {
                                            fgRef.current.d3ReheatSimulation();
                                            fgRef.current.zoomToFit(400, 80);
                                        }
                                    } catch { }
                                }}
                                style={{
                                    position: 'absolute',
                                    bottom: 15,
                                    right: 15,
                                    zIndex: 2,
                                    background: '#0d1117',
                                    padding: '0.6rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #334155',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: '#f8fafc',
                                    boxShadow: '0 4px 6px rgb(0 0 0 / 0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                </svg>
                                Recenter Network
                            </button>
        `;
        content = content.replace(closingTags, recenterBtn + '\n                        </>\n                    )}\n                </div>\n\n                {/* Top Connected Faculty Table */}');
    } else {
        content = content.replace(/fgRef\.current\?\.zoomToFit\(400, 80\);/g, "if (fgRef.current) { fgRef.current.d3ReheatSimulation(); fgRef.current.zoomToFit(400, 80); }");
        content = content.replace(/background: 'rgba\(255, 255, 255, 0\.95\)',\s*padding: '0\.6rem 1rem',\s*borderRadius: '8px',\s*border: '1px solid #e2e8f0',\s*cursor: 'pointer',\s*fontSize: '0\.85rem',\s*fontWeight: 600,\s*color: '#0f172a'/g, "background: '#0d1117', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #334155', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc'");
    }
    
    content = content.replace(/\[hoveredNode, singleSearchQuery, activeDept, pathData\]/g, "[hoveredNode, singleSearchQuery, activeDept, pathData, visibleData, " + countVar.split('[')[0] + "]");

    fs.writeFileSync(file, content, 'utf8');
});

console.log('Modifications completed.');
