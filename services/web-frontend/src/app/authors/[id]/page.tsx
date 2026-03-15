'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import CoAuthorshipGraph from '@/components/CoAuthorshipGraph';
import FingerprintChart from '@/components/charts/FingerprintChart';
import CollaborationMap from '@/components/CollaborationMap';

interface Author {
    id: string;
    name: string;
    dept: string | null;
    orcid: string | null;
    image_url?: string | null;
    email?: string | null;
    phone?: string | null;
    areas_of_interest?: string | null;
    pub_count?: number | null;
    cited_by_count?: number | null;
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
            const shortId = authorId.replace('https://openalex.org/', '').split('/').pop() || authorId;
            fetch(`http://localhost:8000/authors/${shortId}/recent-publications`)
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
            marginTop: '0',
            padding: '4rem 0 2rem 0',
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            width: '100vw',
            position: 'relative',
            left: '50%',
            right: '50%',
            marginLeft: '-50vw',
            marginRight: '-50vw',
            borderTop: '1px solid #334155',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden'
        }}>
            <div style={{ 
                maxWidth: '1200px', 
                margin: '0 auto', 
                padding: '0 5vw',
                boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📰</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, fontFamily: 'var(--font-sans)' }}>
                        Recent Publications
                    </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2rem' }}>
                    {recentPubs.map(pub => (
                        <div key={pub.id} style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '0.75rem', 
                            padding: '1.5rem', 
                            backgroundColor: 'rgba(255, 255, 255, 0.03)', 
                            borderRadius: '16px', 
                            border: '1px solid #334155', 
                            transition: 'all 0.3s ease',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', fontWeight: 500 }}>
                                {formatDate(pub.publication_date)}
                            </span>
                            <h4 style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 700, lineHeight: 1.4, margin: 0, fontFamily: 'var(--font-serif)', minHeight: '2.8em' }}>
                                {pub.title}
                            </h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 'auto' }}>
                                <span style={{ fontSize: '0.85rem', color: '#3b82f6', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
                                    {pub.venue || 'Unknown Venue'}
                                </span>
                            </div>
                            {pub.pdf_url && (
                                <a href={pub.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.75rem', transition: 'color 0.2s' }}>
                                    PDF AVAILABLE ↗
                                </a>
                            )}
                        </div>
                    ))}
                </div>
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
        <div style={{ minHeight: '100vh' }}>

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
                                {/* Citations Total */}
                                <div style={{ minWidth: '150px' }}>
                                    <span className="uppercase-label" style={{ color: '#71717a', display: 'block', marginBottom: '0.25rem' }}>
                                        Total Citations
                                    </span>
                                    <span style={{ fontWeight: 700, fontSize: '2.25rem', color: '#002855' }}>
                                        {(author.cited_by_count ?? totalCitations).toLocaleString()}
                                    </span>
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

            {/* Discovery Fingerprint Section (Prepared for full-bleed expansion) */}
            <FingerprintChart authorId={id} />

            {/* Co-authorship Network Graph (Full-Bleed via component internal styles) */}
            <CoAuthorshipGraph authorId={id} authorName={author.name} />

            {/* Geographical Collaboration Map */}
            <CollaborationMap authorId={id} />

            {/* Recent Publications Section (Full-Bleed Expansion) */}
            <RecentArticlesSection authorId={id} />

            {/* Smooth Footer Transition Gradient */}
            <div style={{
                height: '80px',
                width: '100vw',
                position: 'relative',
                left: '50%',
                right: '50%',
                marginLeft: '-50vw',
                marginRight: '-50vw',
                background: 'linear-gradient(to bottom, #1e293b, #002777)',
                marginTop: '-1px' // Overlap slightly to prevent tiny line gaps
            }} />
        </div>
    );
}

