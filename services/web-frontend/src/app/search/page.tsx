'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Author {
    id: string;
    name: string;
    dept: string | null;
    orcid: string | null;
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2.5rem' }}>
                    {results.map((author) => (
                        <div
                            key={author.id}
                            className="su-card"
                            onClick={() => router.push(`/authors/${author.id}`)}
                            style={{ border: '1px solid #f4f4f5' }} // Slight border for search cards
                        >
                            {/* Image Section */}
                            <div className="su-card-image" style={{ aspectRatio: '4/3' }}>
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', background: '#f8fafc' }}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                                </div>
                            </div>

                            <div className="su-card-content" style={{ padding: '1.25rem' }}>
                                <h3 className="su-card-title" style={{ fontSize: '1.25rem' }}>
                                    {author.name}
                                </h3>
                                <p className="su-card-desc" style={{ marginBottom: '1rem' }}>
                                    {author.dept || 'Faculty Member'}
                                </p>

                                <div className="su-arrow-btn" style={{ width: '28px', height: '28px' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14"></path>
                                        <path d="M12 5l7 7-7 7"></path>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
