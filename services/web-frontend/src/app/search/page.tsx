'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Enhanced Author Interface to match main page
interface Author {
    id: string;
    name: string;
    dept: string | null;
    orcid: string | null;
    image_url?: string | null;
    email?: string | null;
    phone?: string | null;
}

export default function SearchPage() {
    const searchParams = useSearchParams();
    const q = searchParams.get('q');
    const router = useRouter();
    const [results, setResults] = useState<Author[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (q) {
            setLoading(true);
            fetch(`http://localhost:8000/authors/search?q=${encodeURIComponent(q)}`)
                .then((res) => res.json())
                .then((data) => {
                    setResults(data);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, [q]);

    return (
        <div className="container" style={{ padding: '2rem 1.5rem 4rem' }}>
            <button
                onClick={() => router.back()}
                style={{ marginBottom: '2rem', background: 'transparent', border: 'none', color: '#52525b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, cursor: 'pointer' }}
            >
                <span>←</span> BACK TO HOME
            </button>

            <div style={{ borderBottom: '1px solid #e4e4e7', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: 'var(--font-serif)', color: '#111' }}>
                    Search Results
                </h1>
                <p style={{ color: '#52525b', marginTop: '0.5rem' }}>
                    Showing results for <span style={{ color: '#002855', fontWeight: 600 }}>"{q}"</span>
                </p>
            </div>

            {loading ? (
                <p style={{ color: '#52525b', fontStyle: 'italic' }}>Searching our database...</p>
            ) : results.length === 0 ? (
                <div style={{ padding: '3rem', background: '#f4f4f5', textAlign: 'center', color: '#52525b' }}>
                    No researchers found matching "{q}".
                </div>
            ) : (
                // Updated Grid to fit 4 cards comfortably (minmax 260px)
                <div className="experts-grid">
                    {results.map((author) => (
                        <div
                            key={author.id}
                            className="su-card"
                            onClick={() => router.push(`/authors/${author.id}`)}
                        >
                            {/* Image Section - Full Width */}
                            <div className="su-card-image">
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

                                <div style={{
                                    width: '100%',
                                    height: '100%',
                                    display: author.image_url ? 'none' : 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#cbd5e1',
                                    background: '#f8fafc'
                                }}>
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                                </div>
                            </div>

                            <div className="su-card-content">
                                <h3 className="su-card-title">
                                    {author.name}
                                </h3>
                                <p className="su-card-desc" style={{ marginBottom: '1rem', fontWeight: 600, color: '#111' }}>
                                    {author.dept || 'Sabanci University'}
                                </p>

                                {/* Contact Info with Icons */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: '#555' }}>
                                    {author.phone && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                            </svg>
                                            <span>{author.phone}</span>
                                        </div>
                                    )}
                                    {author.email && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                                <polyline points="22,6 12,13 2,6"></polyline>
                                            </svg>
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                {author.email}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
