'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Expert search result with similarity score
interface ExpertResult {
    id: string;
    name: string;
    dept: string | null;
    image_url?: string | null;
    similarity: number;
}

export default function SearchPage() {
    const searchParams = useSearchParams();
    const q = searchParams.get('q');
    const router = useRouter();
    const [results, setResults] = useState<ExpertResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (q) {
            setLoading(true);
            // Use semantic search endpoint
            fetch(`http://localhost:8000/search/experts?q=${encodeURIComponent(q)}&limit=20`)
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
                    Expert Search Results
                </h1>
                <p style={{ color: '#52525b', marginTop: '0.5rem' }}>
                    Finding experts in <span style={{ color: '#002855', fontWeight: 600 }}>"{q}"</span>
                </p>
            </div>

            {loading ? (
                <p style={{ color: '#52525b', fontStyle: 'italic' }}>Searching for experts...</p>
            ) : results.length === 0 ? (
                <div style={{ padding: '3rem', background: '#f4f4f5', textAlign: 'center', color: '#52525b' }}>
                    No experts found for "{q}".
                </div>
            ) : (
                <div className="experts-grid">
                    {results.map((expert) => (
                        <div
                            key={expert.id}
                            className="su-card"
                            onClick={() => router.push(`/authors/${expert.id}`)}
                        >
                            {/* Image Section */}
                            <div className="su-card-image" style={{ position: 'relative' }}>
                                {expert.image_url ? (
                                    <img
                                        src={expert.image_url}
                                        alt={expert.name}
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
                                    display: expert.image_url ? 'none' : 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#cbd5e1',
                                    background: '#f8fafc'
                                }}>
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                                </div>

                                {/* Relevance Badge */}
                                <div style={{
                                    position: 'absolute',
                                    top: '0.5rem',
                                    right: '0.5rem',
                                    background: expert.similarity > 0.4 ? '#16a34a' : expert.similarity > 0.3 ? '#eab308' : '#94a3b8',
                                    color: 'white',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: 600
                                }}>
                                    {Math.round(expert.similarity * 100)}% match
                                </div>
                            </div>

                            <div className="su-card-content">
                                <h3 className="su-card-title">
                                    {expert.name}
                                </h3>
                                <p className="su-card-desc" style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#111' }}>
                                    {expert.dept || 'Sabanci University'}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
