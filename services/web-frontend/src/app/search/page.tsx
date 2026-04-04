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
    pub_count?: number;
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
    const sdg = searchParams.get('sdg');
    const sdgName = searchParams.get('sdg_name');
    const router = useRouter();
    const [response, setResponse] = useState<SearchResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [departmentFilter, setDepartmentFilter] = useState('');

    useEffect(() => {
        if (sdg) {
            setLoading(true);
            fetch(`http://localhost:8000/stats/sdg/${sdg}/experts`)
                .then((res) => res.json())
                .then((data: PersonResult[]) => {
                    setResponse({
                        intent: 'PERSON',
                        person_results: data,
                        topic_results: []
                    });
                    setLoading(false);
                })
                .catch((err) => {
                    console.error(err);
                    setLoading(false);
                });
        } else if (q) {
            setLoading(true);
            fetch(`http://localhost:8000/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: q, 
                    limit: 10, 
                    debug: true,
                    filters: departmentFilter ? { department: departmentFilter } : null 
                })
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
    }, [q, sdg, departmentFilter]);

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

            <div style={{ borderBottom: '1px solid #e4e4e7', paddingBottom: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: 'var(--font-serif)', color: '#111' }}>
                        {sdg ? 'SDG Research Experts' : 'Expert Search Results'}
                    </h1>
                    <p style={{ color: '#52525b', marginTop: '0.5rem' }}>
                        {sdg ? (
                            <>Experts contributing to <span style={{ color: '#002855', fontWeight: 600 }}>"{sdgName || `SDG ${sdg}`}"</span></>
                        ) : (
                            <>Finding experts in <span style={{ color: '#002855', fontWeight: 600 }}>"{q}"</span></>
                        )}
                    </p>
                    {response?.intent && (
                        <div style={{ fontSize: '0.8rem', color: '#71717a', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ padding: '0.1rem 0.5rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                Detected Intent: {response.intent}
                            </span>
                        </div>
                    )}
                </div>

                {!sdg && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '220px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#52525b' }}>Filter by Department</label>
                        <select 
                            value={departmentFilter}
                            onChange={(e) => setDepartmentFilter(e.target.value)}
                            style={{
                                padding: '0.6rem',
                                borderRadius: '6px',
                                border: '1px solid #d4d4d8',
                                backgroundColor: 'white',
                                color: '#111',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                outline: 'none',
                                fontFamily: 'inherit'
                            }}
                        >
                            <option value="">All Departments</option>
                            <option value="FENS">Engineering and Natural Sciences (FENS)</option>
                            <option value="FASS">Arts and Social Sciences (FASS)</option>
                            <option value="SBS">Sabancı Business School (SBS)</option>
                        </select>
                    </div>
                )}
            </div>

            {loading ? (
                <p style={{ color: '#52525b', fontStyle: 'italic' }}>Searching for experts...</p>
            ) : (personResults.length === 0 && topicResults.length === 0) ? (
                <div style={{ padding: '3rem', background: '#f4f4f5', textAlign: 'center', color: '#52525b' }}>
                    No experts found for {sdg ? `"${sdgName || `SDG ${sdg}`}"` : `"${q}"`}.
                </div>
            ) : (
                <>
                    {/* PERSON RESULTS */}
                    {personResults.length > 0 && response && (
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
                                            <p className="su-card-desc" style={{ marginBottom: '0.25rem', fontWeight: 700, color: '#002855' }}>
                                                {expert.dept || 'Sabanci University'}
                                            </p>
                                            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
                                                Faculty Member
                                            </p>
                                            {(expert.score > 0 || (expert.pub_count !== undefined && expert.pub_count > 0)) && (
                                                <div style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>
                                                    {expert.pub_count} relevant works
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TOPIC RESULTS */}
                    {topicResults.length > 0 && response && (
                        <div>
                            {response.intent === 'MIXED' && <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#111' }}>Experts by Topic</h2>}
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
                                            <p className="su-card-desc" style={{ marginBottom: '0.25rem', fontWeight: 700, color: '#002855' }}>
                                                {expert.dept || 'Sabanci University'}
                                            </p>
                                            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
                                                Faculty Member
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
