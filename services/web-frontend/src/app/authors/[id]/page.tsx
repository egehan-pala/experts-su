'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import CoAuthorshipGraph from '@/components/CoAuthorshipGraph';
import SimilarExperts from '@/components/SimilarExperts';

interface Author {
    id: string;
    name: string;
    dept: string | null;
    orcid: string | null;
    image_url?: string | null;
    email?: string | null;
    phone?: string | null;
    areas_of_interest?: string | null;
    top_publication?: {
        title: string;
        year: number | null;
        citations: number | null;
        venue: string | null;
    } | null;
}

interface YearlyMetric {
    year: number;
    pub_count: number;
    citations: number;
}

interface GalaxyNode {
    name: string;
    count: number;
    children_available: boolean;
}

type GalaxyCategory = 'source' | 'subfield';

// Note: Publications data is stored in backend for future search engine implementation

interface Publication {
    id: string;
    title: string;
    year: number | null;
    citations: number | null;
    venue: string | null;
    pdf_url?: string | null;
    publication_date?: string | null;
}

function RecentArticlesSection({ authorId }: { authorId: string }) {
    const [recentPubs, setRecentPubs] = useState<Publication[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authorId) {
            fetch(`http://localhost:8000/authors/${authorId}/recent-publications`)
                .then(res => res.json())
                .then(data => {
                    setRecentPubs(data || []);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching recent publications:', err);
                    setLoading(false);
                });
        }
    }, [authorId]);

    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch { return dateStr; }
    };

    if (loading) return null;
    if (!recentPubs || recentPubs.length === 0) return null;

    return (
        <section style={{
            marginTop: '4rem',
            padding: '2rem',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e4e4e7',
            boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem', borderBottom: '1px solid #f4f4f5', paddingBottom: '1rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📰</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d6001c', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, fontFamily: 'var(--font-sans)' }}>
                    Recent Publications
                </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2.5rem' }}>
                {recentPubs.map(pub => (
                    <div key={pub.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.25rem', backgroundColor: '#f9f9fb', borderRadius: '12px', border: '1px solid #f1f1f4', transition: 'transform 0.2s' }}>
                        <span style={{ fontSize: '0.8rem', color: '#71717a', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 500 }}>
                            {formatDate(pub.publication_date)}
                        </span>
                        <h4 style={{ fontSize: '1rem', color: '#111', fontWeight: 700, lineHeight: 1.4, margin: 0, fontFamily: 'var(--font-serif)', minHeight: '2.8em' }}>
                            {pub.title}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 'auto' }}>
                            <span style={{ fontSize: '0.8rem', color: '#002855', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
                                {pub.venue || 'Unknown Venue'}
                            </span>
                        </div>
                        {pub.pdf_url && (
                            <a href={pub.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: '#d6001c', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.5rem' }}>
                                PDF AVAILABLE ↗
                            </a>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [author, setAuthor] = useState<Author | null>(null);
    const [metrics, setMetrics] = useState<YearlyMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredYear, setHoveredYear] = useState<YearlyMetric | null>(null);

    // Galaxy state
    const [galaxyCategory, setGalaxyCategory] = useState<GalaxyCategory>('source');
    const [galaxyNodes, setGalaxyNodes] = useState<GalaxyNode[]>([]);
    const [galaxyBreadcrumb, setGalaxyBreadcrumb] = useState<string[]>([]);
    const [galaxyLoading, setGalaxyLoading] = useState(false);

    const fetchGalaxy = async (cat: GalaxyCategory, drills: string[]) => {
        setGalaxyLoading(true);
        try {
            let url = `http://localhost:8000/authors/${id}/galaxy?category=${cat}`;
            if (drills.length >= 1) url += `&drill=${encodeURIComponent(drills[0])}`;
            if (drills.length >= 2) url += `&drill2=${encodeURIComponent(drills[1])}`;
            const res = await fetch(url);
            const data = await res.json();
            setGalaxyNodes(data);
        } catch (err) { console.error(err); }
        setGalaxyLoading(false);
    };

    useEffect(() => {
        if (id) {
            Promise.all([
                fetch(`http://localhost:8000/authors/${id}`).then(res => res.json()),
                fetch(`http://localhost:8000/authors/${id}/metrics`).then(res => res.json()),
            ])
                .then(([authorData, metricsData]) => {
                    setAuthor(authorData);
                    setMetrics(metricsData);
                    setLoading(false);
                })
                .catch((err) => console.error(err));
        }
    }, [id]);

    // Load galaxy when category or id changes
    useEffect(() => {
        if (id) {
            setGalaxyBreadcrumb([]);
            fetchGalaxy(galaxyCategory, []);
        }
    }, [id, galaxyCategory]);

    // Calculate total citations
    const totalCitations = metrics.reduce((acc, m) => acc + (m.citations || 0), 0);

    // Get recent years for sparkline (last 20 years)
    const recentMetrics = metrics.slice(-20);
    const maxCitations = Math.max(...recentMetrics.map(m => m.citations || 0), 1);

    if (loading) return <div className="container" style={{ paddingTop: '4rem' }}>Loading profile...</div>;
    if (!author) return <div className="container" style={{ paddingTop: '4rem' }}>Author not found</div>;

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>

            {/* Editorial Profile Header */}
            <div style={{ backgroundColor: '#f4f4f5', padding: '4rem 0', borderBottom: '1px solid #e4e4e7' }}>
                <div className="container">
                    <button
                        onClick={() => router.back()}
                        style={{ marginBottom: '2rem', background: 'transparent', border: 'none', color: '#52525b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, cursor: 'pointer' }}
                    >
                        <span>←</span> BACK
                    </button>

                    <div style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
                        {/* Profile Image (Placeholder) */}
                        <div style={{
                            width: '240px',
                            height: '240px',
                            backgroundColor: '#e4e4e7',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#a1a1aa'
                        }}>
                            {author.image_url ? (
                                <img
                                    src={author.image_url}
                                    alt={author.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                                    }}
                                />
                            ) : null}
                            <svg
                                width="80"
                                height="80"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                style={{ display: author.image_url ? 'none' : 'block' }}
                            >
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                            </svg>
                        </div>

                        {/* Bio Info */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <h1 style={{ fontSize: '3rem', fontFamily: 'var(--font-serif)', color: '#111', marginBottom: '0.5rem', lineHeight: 1.1 }}>
                                {author.name}
                            </h1>
                            <p style={{ fontSize: '1.25rem', color: '#52525b', fontFamily: 'var(--font-sans)', marginBottom: '0.5rem', fontWeight: 300 }}>
                                {author.name === 'Yusuf Leblebici' ? 'Rektör' : (author.dept || 'Faculty of Engineering and Natural Sciences')}
                            </p>

                            {author.areas_of_interest && (
                                <p style={{ fontSize: '1rem', color: '#3f3f46', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                    <strong>Areas of Interest:</strong> {author.areas_of_interest}
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '2rem', borderTop: '1px solid #d4d4d8', paddingTop: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <span className="uppercase-label" style={{ color: '#71717a', display: 'block', marginBottom: '0.25rem' }}>Email</span>
                                    <a href={`mailto:${author.email}`} style={{ color: '#002855', textDecoration: 'underline' }}>
                                        {author.email || 'N/A'}
                                    </a>
                                </div>
                                {author.phone && (
                                    <div>
                                        <span className="uppercase-label" style={{ color: '#71717a', display: 'block', marginBottom: '0.25rem' }}>Phone</span>
                                        <span style={{ color: '#111' }}>{author.phone}</span>
                                    </div>
                                )}
                                <div>
                                    <span className="uppercase-label" style={{ color: '#71717a', display: 'block', marginBottom: '0.25rem' }}>ORCID</span>
                                    <span style={{ fontFamily: 'monospace', color: '#111' }}>{author.orcid || 'N/A'}</span>
                                </div>
                                {/* Citations with interactive chart */}
                                <div style={{ minWidth: '200px' }}>
                                    <span className="uppercase-label" style={{ color: '#71717a', display: 'block', marginBottom: '0.25rem' }}>
                                        {hoveredYear ? `Citations in ${hoveredYear.year}` : 'Total Citations'}
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <span style={{ fontWeight: 700, fontSize: '1.5rem', color: '#002855', transition: 'all 0.15s' }}>
                                            {hoveredYear ? hoveredYear.citations.toLocaleString() : totalCitations.toLocaleString()}
                                        </span>
                                        {/* Interactive bar chart */}
                                        {recentMetrics.length > 0 && (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-end',
                                                    gap: '3px',
                                                    height: '60px',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#fff',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e4e4e7',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                                }}
                                                onMouseLeave={() => setHoveredYear(null)}
                                            >
                                                {recentMetrics.map((m) => (
                                                    <div
                                                        key={m.year}
                                                        onMouseEnter={() => setHoveredYear(m)}
                                                        style={{
                                                            width: '8px',
                                                            height: `${Math.max((m.citations / maxCitations) * 50, 3)}px`,
                                                            backgroundColor: hoveredYear?.year === m.year ? '#d6001c' : '#002855',
                                                            borderRadius: '2px',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s',
                                                            opacity: hoveredYear && hoveredYear.year !== m.year ? 0.4 : 1
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {recentMetrics.length > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#a1a1aa' }}>
                                                <span>{recentMetrics[0]?.year}</span>
                                                <span>{recentMetrics[recentMetrics.length - 1]?.year}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Top Publication */}
                            {author.top_publication && (
                                <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e4e4e7', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <span style={{ fontSize: '1.25rem' }}>🏆</span>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111', margin: 0 }}>Top Cited Paper</h3>
                                    </div>
                                    <p style={{ fontSize: '1.1rem', color: '#002855', fontWeight: 500, marginBottom: '0.5rem', lineHeight: 1.4 }}>
                                        {author.top_publication.title}
                                    </p>
                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#71717a' }}>
                                        {author.top_publication.year && <span><strong>Year:</strong> {author.top_publication.year}</span>}
                                        {author.top_publication.venue && <span><strong>Venue:</strong> {author.top_publication.venue}</span>}
                                        {author.top_publication.citations !== null && <span><strong style={{ color: '#d6001c' }}>{author.top_publication.citations}</strong> Citations</span>}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>

            {/* Layout Main Column */}
            <div className="container" style={{ marginTop: '3rem' }}>
                
                {/* ✨ Research Galaxy — Multi-Level Constellation ✨ */}
                {(() => {
                    // ... (galaxy part stays same inside)
                        const PALETTE = [
                            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                            'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
                            'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
                            'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
                            'linear-gradient(135deg, #f5576c 0%, #ff6a00 100%)',
                            'linear-gradient(135deg, #13547a 0%, #80d0c7 100%)',
                        ];
                        const SOLID_COLORS = [
                            '#667eea', '#f5576c', '#4facfe', '#43e97b', '#fa709a',
                            '#a18cd1', '#fccb90', '#8ec5fc', '#f5576c', '#80d0c7'
                        ];
                        const CATEGORY_META: Record<GalaxyCategory, { icon: string; label: string; levels: string[] }> = {
                            source: { icon: '🏛️', label: 'Source', levels: ['Sources', 'Subfields', 'Works'] },
                            subfield: { icon: '🔬', label: 'Subfield', levels: ['Subfields', 'Works'] },
                        };
                        const meta = CATEGORY_META[galaxyCategory];
                        const currentLevel = galaxyBreadcrumb.length;
                        const levelLabel = meta.levels[currentLevel] || 'Details';
                        const maxCount = Math.max(...galaxyNodes.map(n => n.count), 1);

                        const handleBubbleClick = (node: GalaxyNode) => {
                            if (!node.children_available) return;
                            const newBreadcrumb = [...galaxyBreadcrumb, node.name];
                            setGalaxyBreadcrumb(newBreadcrumb);
                            fetchGalaxy(galaxyCategory, newBreadcrumb);
                        };

                        const handleBreadcrumbClick = (level: number) => {
                            const newBreadcrumb = galaxyBreadcrumb.slice(0, level);
                            setGalaxyBreadcrumb(newBreadcrumb);
                            fetchGalaxy(galaxyCategory, newBreadcrumb);
                        };

                        return (
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-serif)', color: '#111', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '1.25rem' }}>🔬</span>
                                    Research Galaxy
                                </h2>

                                {/* Category Tabs */}
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                    {(['source', 'subfield'] as GalaxyCategory[]).map(cat => {
                                        const m = CATEGORY_META[cat];
                                        const isActive = galaxyCategory === cat;
                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => { setGalaxyCategory(cat); }}
                                                style={{
                                                    padding: '0.6rem 1.5rem',
                                                    borderRadius: '12px 12px 0 0',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontWeight: 700,
                                                    fontSize: '0.9rem',
                                                    color: isActive ? '#fff' : '#52525b',
                                                    background: isActive ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#f4f4f5',
                                                    transition: 'all 0.3s',
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                }}
                                            >
                                                <span>{m.icon}</span> {m.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Cosmic Panel */}
                                <div style={{
                                    background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
                                    borderRadius: '0 20px 20px 20px',
                                    padding: '2rem',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    minHeight: '320px',
                                }}>
                                    {/* Twinkling stars */}
                                    {[...Array(30)].map((_, i) => (
                                        <div key={`star-${i}`} style={{
                                            position: 'absolute',
                                            width: `${1 + (i % 3)}px`, height: `${1 + (i % 3)}px`,
                                            backgroundColor: 'rgba(255,255,255,0.4)',
                                            borderRadius: '50%',
                                            top: `${(i * 37) % 100}%`, left: `${(i * 53) % 100}%`,
                                            animation: `twinkle ${2 + (i % 3)}s ease-in-out infinite`,
                                            animationDelay: `${(i % 5) * 0.4}s`
                                        }} />
                                    ))}

                                    {/* Breadcrumb Navigation */}
                                    <div style={{ position: 'relative', zIndex: 2, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => handleBreadcrumbClick(0)}
                                            style={{ background: 'none', border: 'none', color: galaxyBreadcrumb.length === 0 ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                        >
                                            {meta.icon} {meta.levels[0]}
                                        </button>
                                        {galaxyBreadcrumb.map((crumb, i) => (
                                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ color: 'rgba(255,255,255,0.3)' }}>›</span>
                                                <button
                                                    onClick={() => handleBreadcrumbClick(i + 1)}
                                                    style={{
                                                        background: 'none', border: 'none',
                                                        color: i === galaxyBreadcrumb.length - 1 ? '#fff' : 'rgba(255,255,255,0.5)',
                                                        fontSize: '0.85rem', fontWeight: i === galaxyBreadcrumb.length - 1 ? 700 : 400,
                                                        cursor: 'pointer', padding: 0,
                                                        maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {crumb}
                                                </button>
                                            </span>
                                        ))}
                                    </div>

                                    {/* Level indicator */}
                                    <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', marginBottom: '1rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
                                            {levelLabel}
                                        </span>
                                    </div>

                                    {/* Bubble Cloud */}
                                    {galaxyLoading ? (
                                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', padding: '3rem', position: 'relative', zIndex: 2 }}>
                                            Loading...
                                        </div>
                                    ) : galaxyNodes.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '3rem', position: 'relative', zIndex: 2 }}>
                                            No data available for this level
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 2, padding: '0.5rem' }}>
                                            {galaxyNodes.map((node, idx) => {
                                                const ratio = node.count / maxCount;
                                                const size = Math.max(58, Math.round(ratio * 140));
                                                const colorIdx = idx % PALETTE.length;
                                                const yOff = idx % 3 === 0 ? -6 : idx % 3 === 1 ? 6 : 0;
                                                const isClickable = node.children_available;

                                                return (
                                                    <div
                                                        key={`${node.name}-${idx}`}
                                                        title={`${node.name}: ${node.count}`}
                                                        onClick={() => isClickable && handleBubbleClick(node)}
                                                        style={{
                                                            width: `${size}px`, height: `${size}px`,
                                                            borderRadius: '50%',
                                                            background: PALETTE[colorIdx],
                                                            display: 'flex', flexDirection: 'column',
                                                            alignItems: 'center', justifyContent: 'center',
                                                            color: '#fff',
                                                            cursor: isClickable ? 'pointer' : 'default',
                                                            position: 'relative',
                                                            transform: `translateY(${yOff}px)`,
                                                            animation: `bubblePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                                                            animationDelay: `${idx * 0.06}s`,
                                                            opacity: 0,
                                                            boxShadow: `0 0 ${Math.round(ratio * 20 + 8)}px ${SOLID_COLORS[colorIdx]}66`,
                                                            transition: 'transform 0.3s, box-shadow 0.3s',
                                                            overflow: 'hidden', padding: '6px',
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.transform = `translateY(${yOff}px) scale(1.15)`;
                                                            e.currentTarget.style.boxShadow = `0 0 ${Math.round(ratio * 30 + 14)}px ${SOLID_COLORS[colorIdx]}99`;
                                                            e.currentTarget.style.zIndex = '10';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.transform = `translateY(${yOff}px) scale(1)`;
                                                            e.currentTarget.style.boxShadow = `0 0 ${Math.round(ratio * 20 + 8)}px ${SOLID_COLORS[colorIdx]}66`;
                                                            e.currentTarget.style.zIndex = '1';
                                                        }}
                                                    >
                                                        <span style={{
                                                            fontSize: size > 90 ? '0.65rem' : '0.5rem',
                                                            fontWeight: 600, textAlign: 'center', lineHeight: 1.2,
                                                            textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: size > 100 ? 3 : 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            overflow: 'hidden', wordBreak: 'break-word',
                                                        }}>{node.name}</span>
                                                        <span style={{
                                                            fontSize: size > 90 ? '0.9rem' : '0.7rem',
                                                            fontWeight: 800, marginTop: '2px',
                                                            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                                        }}>{node.count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Keyframes */}
                                <style dangerouslySetInnerHTML={{
                                    __html: `
                                    @keyframes bubblePop {
                                        from { opacity: 0; transform: scale(0.3) translateY(20px); }
                                        to { opacity: 1; transform: scale(1) translateY(0); }
                                    }
                                    @keyframes twinkle {
                                        0%, 100% { opacity: 0.3; }
                                        50% { opacity: 1; }
                                    }
                                `}} />
                            </div>
                        );
                    })()}

                    {/* Co-authorship Network Graph */}
                    <div style={{ marginTop: '3rem' }}>
                        <CoAuthorshipGraph authorId={id} authorName={author.name} />
                    </div>

                    {/* Recent Publications Section (Full Width Below) */}
                    <RecentArticlesSection authorId={id} />

                    {/* Similar Experts Section */}
                    <SimilarExperts authorId={id} />
                </div>

            {/* Publications section removed - data is stored in backend for future search engine implementation */}
        </div>
    );
}

