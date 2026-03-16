'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import CoAuthorshipGraph from '@/components/CoAuthorshipGraph';
import FingerprintChart from '@/components/charts/FingerprintChart';
import CitationTimelineChart from '@/components/charts/CitationTimelineChart';
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
    venue_type?: string | null;
    type?: string | null;
    volume?: string | null;
    issue?: string | null;
    first_page?: string | null;
    last_page?: string | null;
    is_oa?: boolean | null;
    pdf_url?: string | null;
    landing_page_url?: string | null;
    publication_date?: string | null;
    authorships_json?: string | null;
    topics_json?: string | null;
}

function PublicationDonut({ percentage, color }: { percentage: number; color: string }) {
    const radius = 7.5;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage * circumference);

    return (
        <svg width="18" height="18" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
            <circle cx="10" cy="10" r={radius} fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <circle
                cx="10"
                cy="10"
                r={radius}
                fill="transparent"
                stroke={color}
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 10 10)"
            />
        </svg>
    );
}

const FIELD_COLORS: Record<string, string> = {
    'computer science': '#0070c0',
    'engineering': '#ed7d31',
    'medicine': '#7030a0',
    'biology': '#70ad47',
    'physics': '#c00000',
    'mathematics': '#00b0f0',
    'social sciences': '#70ad47',
    'business': '#00b0f0',
    'chemistry': '#ffc000',
    'materials science': '#ed7d31',
    'psychology': '#7030a0',
    'default': '#94a3b8'
};

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
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } catch { return dateStr; }
    };

    if (loading) return null;
    if (!recentPubs || recentPubs.length === 0) return null;

    return (
        <section style={{
            marginTop: '0',
            padding: '4rem 0',
            backgroundColor: '#1E293B',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' }}>
                    <span style={{ fontSize: '1.5rem', color: '#3b82f6' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="18" rx="2" ry="2" />
                            <line x1="7" y1="8" x2="17" y2="8" />
                            <line x1="7" y1="12" x2="17" y2="12" />
                            <line x1="7" y1="16" x2="12" y2="16" />
                        </svg>
                    </span>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', margin: 0, fontFamily: 'var(--font-serif)' }}>
                        Recent Publications
                    </h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                    {recentPubs.map(pub => {
                        let authors: any[] = [];
                        try {
                            authors = pub.authorships_json ? JSON.parse(pub.authorships_json) : [];
                        } catch (e) { console.error('Error parsing authors:', e); }

                        let topics: any[] = [];
                        try {
                            topics = pub.topics_json ? JSON.parse(pub.topics_json) : [];
                        } catch (e) { console.error('Error parsing topics:', e); }

                        const pubLink = pub.landing_page_url || pub.pdf_url || `https://openalex.org/${pub.id}`;

                        return (
                            <div key={pub.id} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.8rem',
                                paddingBottom: '2.5rem',
                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                <a
                                    href={pubLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontSize: '1.25rem',
                                        color: '#60a5fa',
                                        fontWeight: 600,
                                        lineHeight: 1.4,
                                        textDecoration: 'none',
                                        fontFamily: 'var(--font-serif)',
                                        transition: 'color 0.2s',
                                        maxWidth: '1000px'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#93c5fd'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#60a5fa'}
                                >
                                    {pub.title}
                                </a>

                                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                                    {authors.map((a, i) => {
                                        const shortTargetId = authorId.replace('https://openalex.org/', '').split('/').pop() || authorId;
                                        const authorFullId = a.author?.id || a.author_id || '';
                                        const isTarget = authorFullId.includes(shortTargetId);
                                        const displayName = a.author?.display_name || a.author_name || a.display_name || a.raw_name || 'Unknown Author';
                                        return (
                                            <span key={i}>
                                                <span style={{ color: isTarget ? '#60a5fa' : '#cbd5e1', fontWeight: isTarget ? 700 : 400 }}>
                                                    {displayName}
                                                </span>
                                                {i < authors.length - 1 ? ', ' : ''}
                                            </span>
                                        );
                                    })}
                                    <span style={{ color: '#94a3b8' }}>, {formatDate(pub.publication_date)}, </span>
                                    <span style={{ fontStyle: 'italic', color: '#cbd5e1' }}>In: {pub.venue || 'Unknown Venue'}. </span>
                                    {pub.volume && <span style={{ color: '#94a3b8' }}>{pub.volume}</span>}
                                    {pub.issue && <span style={{ color: '#94a3b8' }}>, {pub.issue}</span>}
                                    {(pub.first_page || pub.last_page) && (
                                        <span style={{ color: '#94a3b8' }}>, p. {pub.first_page}{pub.last_page ? `-${pub.last_page}` : ''}</span>
                                    )}
                                </div>

                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                    Research output: {pub.type?.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Publication'}
                                </div>

                                <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.2rem' }}>
                                    {pub.is_oa && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                            </svg>
                                            OPEN ACCESS
                                        </div>
                                    )}
                                    {pub.pdf_url && (
                                        <a href={pub.pdf_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textDecoration: 'none' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                            </svg>
                                            FILE
                                        </a>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    {topics.slice(0, 5).map((t, idx) => {
                                        const category = (t.field?.display_name || t.field_display_name || 'default').toLowerCase();
                                        const color = FIELD_COLORS[category] || FIELD_COLORS['default'];
                                        const topicName = t.display_name || t.name || 'Unknown Topic';
                                        return (
                                            <div key={idx} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '4px 10px',
                                                backgroundColor: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                color: '#f8fafc',
                                                fontWeight: 500
                                            }}>
                                                <PublicationDonut percentage={t.score || 0.5} color={color} />
                                                {topicName}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
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
    const [selectedYear, setSelectedYear] = useState<number | null>(null);

    // Galaxy state
    const [galaxyCategory, setGalaxyCategory] = useState<GalaxyCategory>('source');
    const [galaxyNodes, setGalaxyNodes] = useState<GalaxyNode[]>([]);
    const [galaxyBreadcrumb, setGalaxyBreadcrumb] = useState<string[]>([]);
    const [galaxyLoading, setGalaxyLoading] = useState(false);

    const fetchGalaxy = async (cat: GalaxyCategory, drills: string[]) => {
        setGalaxyLoading(true);
        try {
            const shortId = id.replace('https://openalex.org/', '').split('/').pop() || id;
            let url = `http://localhost:8000/authors/${shortId}/galaxy?category=${cat}`;
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
            const shortId = id.replace('https://openalex.org/', '').split('/').pop() || id;
            Promise.all([
                fetch(`http://localhost:8000/authors/${shortId}`).then(res => res.json()),
                fetch(`http://localhost:8000/authors/${shortId}/metrics`).then(res => res.json()),
            ])
                .then(([authorData, metricsData]) => {
                    setAuthor(authorData);
                    setMetrics(metricsData);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error('Error fetching author profile:', err);
                    setLoading(false);
                });
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
                                        <span style={{ fontSize: '1.25rem' }}></span>
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

            {/* Citation & Publication Timeline */}
            <CitationTimelineChart 
                authorId={id} 
                data={metrics} 
                selectedYear={selectedYear}
                onYearSelect={setSelectedYear}
            />

            {/* Discovery Fingerprint Section (Prepared for full-bleed expansion) */}
            <FingerprintChart authorId={id} />

            {/* Co-authorship Network Graph (Full-Bleed via component internal styles) */}
            <CoAuthorshipGraph authorId={id} authorName={author.name} />

            {/* Geographical Collaboration Map */}
            <CollaborationMap authorId={id} selectedYear={selectedYear} />

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

