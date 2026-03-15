'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface MatchSnippet {
    publication_title?: string | null;
    snippet: string;
    year?: number | null;
    similarity: number;
}

interface PersonResult {
    id: string;
    name: string;
    dept: string | null;
    email: string | null;
    image_url?: string | null;
    score: number;
    match_type: string;
}

interface TopicResult {
    id: string;
    name: string;
    dept: string | null;
    image_url?: string | null;
    email: string | null;
    similarity: number;
    explanation: MatchSnippet[];
}

interface SearchResponse {
    intent: 'PERSON' | 'TOPIC' | 'MIXED';
    person_results: PersonResult[];
    topic_results: TopicResult[];
}

export default function SearchPage() {
    const searchParams = useSearchParams();
    const q = searchParams.get('q');
    const router = useRouter();
    const [response, setResponse] = useState<SearchResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (q) {
            setLoading(true);
            fetch(`http://localhost:8000/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, limit: 10, debug: true })
            })
                .then((res) => res.json())
                .then((data: SearchResponse) => {
                    setResponse(data);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, [q]);

    const personResults = response?.person_results ?? [];
    const topicResults = response?.topic_results ?? [];
    const hasResults = personResults.length > 0 || topicResults.length > 0;

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
                {response?.intent && (
                    <div style={{ fontSize: '0.8rem', color: '#71717a', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ padding: '0.1rem 0.5rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            Detected Intent: {response.intent}
                        </span>
                    </div>
                )}
            </div>

            {loading ? (
                <p style={{ color: '#52525b', fontStyle: 'italic' }}>Searching for experts...</p>
            ) : !hasResults ? (
                <div style={{ padding: '3rem', background: '#f4f4f5', textAlign: 'center', color: '#52525b' }}>
                    No experts found for "{q}".
                </div>
            ) : (
                <>
                    {/* PERSON RESULTS */}
                    {personResults.length > 0 && (
                        <div style={{ marginBottom: '3rem' }}>
                            {response.intent === 'MIXED' && <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#111' }}>People</h2>}
                            <div className="experts-grid">
                                {personResults.map((expert) => (
                                    <div
                                        key={expert.id}
                                        className="su-card"
                                        onClick={() => router.push(`/authors/${expert.id}`)}
                                    >
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
                                                width: '100%', height: '100%',
                                                display: expert.image_url ? 'none' : 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                color: '#cbd5e1', background: '#f8fafc'
                                            }}>
                                                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                                            </div>
                                        </div>
                                        <div className="su-card-content">
                                            <h3 className="su-card-title">{expert.name}</h3>
                                            <p className="su-card-desc" style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#111' }}>
                                                {expert.dept || 'Sabanci University'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TOPIC RESULTS */}
                    {topicResults.length > 0 && (
                        <div>
                            {response.intent === 'MIXED' && <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#111' }}>Experts by Research Field</h2>}
                            <div className="experts-grid">
                                {topicResults.map((expert) => (
                                    <div
                                        key={expert.id}
                                        className="su-card"
                                        onClick={() => router.push(`/authors/${expert.id}`)}
                                    >
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
                                                width: '100%', height: '100%',
                                                display: expert.image_url ? 'none' : 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                color: '#cbd5e1', background: '#f8fafc'
                                            }}>
                                                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                                            </div>
                                            <div style={{
                                                position: 'absolute', top: '0.5rem', right: '0.5rem',
                                                background: expert.similarity > 0.4 ? '#16a34a' : expert.similarity > 0.3 ? '#eab308' : '#94a3b8',
                                                color: 'white', padding: '0.25rem 0.5rem', borderRadius: '12px',
                                                fontSize: '0.7rem', fontWeight: 600
                                            }}>
                                                {Math.round(expert.similarity * 100)}% match
                                            </div>
                                        </div>
                                        <div className="su-card-content">
                                            <h3 className="su-card-title">{expert.name}</h3>
                                            <p className="su-card-desc" style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#111' }}>
                                                {expert.dept || 'Sabanci University'}
                                            </p>
                                            {expert.explanation && expert.explanation.length > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: '#52525b', marginTop: '0.5rem', borderTop: '1px solid #e4e4e7', paddingTop: '0.5rem' }}>
                                                    <span style={{ fontWeight: 600 }}>Matched on: </span>
                                                    "{expert.explanation[0].snippet.length > 80 ? expert.explanation[0].snippet.substring(0, 80) + '...' : expert.explanation[0].snippet}"
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
