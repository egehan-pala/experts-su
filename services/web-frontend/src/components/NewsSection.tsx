'use client';

import { useEffect, useState } from 'react';

interface NewsItem {
    title: string;
    url: string;
    source: string;
    published_at: string | null;
    thumbnail: string | null;
    summary: string | null;
}

const PAGE_SIZE = 8;

function formatRelativeDate(isoStr: string | null): string {
    if (!isoStr) return '';
    try {
        const date = new Date(isoStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
        return isoStr;
    }
}

export default function NewsSection({ authorId, authorName }: { authorId: string; authorName: string }) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const shortId = authorId.replace('https://openalex.org/', '').split('/').pop() || authorId;
        fetch(`http://localhost:8000/authors/${shortId}/news`)
            .then(res => res.json())
            .then(data => {
                setNews(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [authorId]);

    const totalPages = Math.max(1, Math.ceil(news.length / PAGE_SIZE));
    const pageItems = news.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (loading) return (
        <section style={sectionStyle}>
            <div style={containerStyle}>
                <SectionHeader />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ height: '110px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                </div>
            </div>
        </section>
    );

    if (error || news.length === 0) return (
        <section style={sectionStyle}>
            <div style={containerStyle}>
                <SectionHeader />
                <p style={{ color: '#64748b', fontSize: '1rem', marginTop: '1rem' }}>
                    {error ? 'Failed to load news.' : `No news found for ${authorName}.`}
                </p>
            </div>
        </section>
    );

    return (
        <section style={sectionStyle}>
            <style>{`
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
                .news-card:hover { background-color:rgba(255,255,255,0.06)!important; transform:translateY(-2px); box-shadow:0 8px 30px rgba(0,0,0,0.3); }
                .news-title:hover { color:#93c5fd!important; }
                .page-btn:hover:not(:disabled) { background-color:rgba(59,130,246,0.2)!important; border-color:#3b82f6!important; color:#93c5fd!important; }
                .page-btn:disabled { opacity:0.3; cursor:not-allowed; }
            `}</style>
            <div style={containerStyle}>
                <SectionHeader count={news.length} page={page} totalPages={totalPages} />

                {/* News list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {pageItems.map((item, idx) => (
                        <a
                            key={idx}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="news-card"
                            style={{
                                display: 'flex', gap: '1.25rem', padding: '1.25rem 1.5rem',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '12px', textDecoration: 'none',
                                transition: 'all 0.2s ease', cursor: 'pointer',
                            }}
                        >
                            {item.thumbnail && (
                                <img
                                    src={item.thumbnail} alt=""
                                    style={{ width: '100px', height: '80px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, backgroundColor: '#1e293b' }}
                                    onError={e => (e.currentTarget.style.display = 'none')}
                                />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#3b82f6', textTransform: 'uppercase' }}>
                                        {item.source}
                                    </span>
                                    {item.published_at && (
                                        <>
                                            <span style={{ color: '#475569', fontSize: '0.7rem' }}>•</span>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatRelativeDate(item.published_at)}</span>
                                        </>
                                    )}
                                </div>
                                <h3 className="news-title" style={{
                                    fontSize: '1rem', fontWeight: 600, color: '#e2e8f0',
                                    lineHeight: 1.4, margin: '0 0 0.4rem 0', transition: 'color 0.15s',
                                }}>
                                    {item.title}
                                </h3>

                            </div>
                            <div style={{ color: '#334155', alignSelf: 'center', flexShrink: 0 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </div>
                        </a>
                    ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '2.5rem' }}>
                        <button
                            className="page-btn"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            style={pageBtnStyle}
                        >
                            ← Previous
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                            <button
                                key={p}
                                className="page-btn"
                                onClick={() => setPage(p)}
                                style={{
                                    ...pageBtnStyle,
                                    backgroundColor: p === page ? '#3b82f6' : 'transparent',
                                    color: p === page ? '#fff' : '#94a3b8',
                                    borderColor: p === page ? '#3b82f6' : 'rgba(255,255,255,0.12)',
                                    fontWeight: p === page ? 700 : 400,
                                    minWidth: '2.5rem',
                                }}
                            >
                                {p}
                            </button>
                        ))}

                        <button
                            className="page-btn"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                            style={pageBtnStyle}
                        >
                            Next →
                        </button>
                    </div>
                )}

                <p style={{ fontSize: '0.7rem', color: '#334155', marginTop: '1.5rem', textAlign: 'right' }}>
                    Powered by Google News RSS
                </p>
            </div>
        </section>
    );
}

function SectionHeader({ count, page, totalPages }: { count?: number; page?: number; totalPages?: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#3b82f6' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
                </svg>
            </span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                News
            </h2>
            {count !== undefined && count > 0 && (
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>
                    {count} results
                    {page !== undefined && totalPages !== undefined && totalPages > 1 && (
                        <> · page {page} of {totalPages}</>
                    )}
                </span>
            )}
        </div>
    );
}

const pageBtnStyle: React.CSSProperties = {
    padding: '0.5rem 1rem', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', background: 'transparent', color: '#94a3b8',
    fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s ease',
    fontFamily: 'inherit',
};

const sectionStyle: React.CSSProperties = {
    marginTop: '0', padding: '4rem 0',
    backgroundColor: '#1E293B', color: '#f8fafc',
    width: '100vw', position: 'relative', left: '50%', right: '50%',
    marginLeft: '-50vw', marginRight: '-50vw',
    borderTop: '1px solid #334155', fontFamily: 'var(--font-sans)', overflow: 'hidden',
};

const containerStyle: React.CSSProperties = {
    maxWidth: '1200px', margin: '0 auto',
    padding: '0 5vw', boxSizing: 'border-box',
};
