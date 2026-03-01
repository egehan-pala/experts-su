'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import CoAuthorshipGraph from '@/components/CoAuthorshipGraph';

interface Author {
    id: string;
    name: string;
    dept: string | null;
    orcid: string | null;
    image_url?: string | null;
    email?: string | null;
    phone?: string | null;
}

interface YearlyMetric {
    year: number;
    pub_count: number;
    citations: number;
}

// Note: Publications data is stored in backend for future search engine implementation

export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [author, setAuthor] = useState<Author | null>(null);
    const [metrics, setMetrics] = useState<YearlyMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredYear, setHoveredYear] = useState<YearlyMetric | null>(null);

    useEffect(() => {
        if (id) {
            Promise.all([
                fetch(`http://localhost:8000/authors/${id}`).then(res => res.json()),
                fetch(`http://localhost:8000/authors/${id}/metrics`).then(res => res.json())
            ])
                .then(([authorData, metricsData]) => {
                    setAuthor(authorData);
                    setMetrics(metricsData);
                    setLoading(false);
                })
                .catch((err) => console.error(err));
        }
    }, [id]);

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
                            <p style={{ fontSize: '1.25rem', color: '#52525b', fontFamily: 'var(--font-sans)', marginBottom: '1.5rem', fontWeight: 300 }}>
                                {author.name === 'Yusuf Leblebici' ? 'Rektör' : (author.dept || 'Faculty of Engineering and Natural Sciences')}
                            </p>

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
                        </div>
                    </div>
                </div>
            </div>

            {/* Co-authorship Network Graph */}
            <div className="container" style={{ marginTop: '2rem' }}>
                <CoAuthorshipGraph authorId={id} authorName={author.name} />
            </div>

            {/* Publications section removed - data is stored in backend for future search engine implementation */}
        </div>
    );
}

