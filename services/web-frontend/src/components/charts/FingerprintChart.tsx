'use client';

import { useState, useEffect } from 'react';

interface Concept {
    name: string;
    weight: number;
}

interface FingerprintField {
    field: string;
    concepts: Concept[];
}

interface CountryStat {
    code: string;
    count: number;
    names: string[];
}

interface CoAuthorStat {
    name: string;
    count: number;
}

interface ConceptDetail {
    concept: string;
    countries: CountryStat[];
    co_authors: CoAuthorStat[];
    top_paper: {
        id: string;
        title: string;
        year: number | null;
        citations: number | null;
        venue: string | null;
        pdf_url?: string | null;
    };
}

interface FingerprintChartProps {
    authorId: string;
}

const FIELD_COLORS = [
    '#0070c0', // Science/Tech - Blue
    '#ed7d31', // Engineering - Orange
    '#7030a0', // Medicine - Purple
    '#70ad47', // Social Sciences - Green
    '#c00000', // Arts/Humanities - Red
    '#00b0f0', // Business - Teal
];

function DonutRing({ percentage, color }: { percentage: number; color: string }) {
    const radius = 7.5;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage * circumference);

    return (
        <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r={radius} fill="transparent" stroke="#e6e6e6" strokeWidth="2.5" />
            <circle
                cx="10"
                cy="10"
                r={radius}
                fill="transparent"
                stroke={color}
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 10 10)"
                style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
            />
        </svg>
    );
}

export default function FingerprintChart({ authorId }: FingerprintChartProps) {
    const [data, setData] = useState<FingerprintField[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'weight' | 'alpha'>('weight');
    const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
    const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
    const [details, setDetails] = useState<ConceptDetail | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [showAllFields, setShowAllFields] = useState(false);
    const [expandedConceptsFields, setExpandedConceptsFields] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (authorId) {
            const shortId = authorId.replace('https://openalex.org/', '').split('/').pop() || authorId;
            fetch(`http://localhost:8000/authors/${shortId}/fingerprint`)
                .then(res => res.json())
                .then(json => {
                    setData(json || []);
                    setLoading(false);
                    if (json && json.length > 0) {
                        setExpandedFields(new Set(json.slice(0, 3).map((f: any) => f.field)));
                    }
                })
                .catch(err => {
                    console.error('Error fetching fingerprint:', err);
                    setLoading(false);
                });
        }
    }, [authorId]);

    const handleConceptClick = async (conceptName: string) => {
        if (selectedConcept === conceptName) {
            setSelectedConcept(null);
            setDetails(null);
            return;
        }

        setSelectedConcept(conceptName);
        setDetailsLoading(true);
        try {
            const shortId = authorId.replace('https://openalex.org/', '').split('/').pop() || authorId;
            const res = await fetch(`http://localhost:8000/authors/${shortId}/fingerprint/details?concept=${encodeURIComponent(conceptName)}`);
            const json = await res.json();
            setDetails(json);
        } catch (err) {
            console.error('Error fetching concept details:', err);
        }
        setDetailsLoading(false);
    };

    const toggleField = (field: string) => {
        const next = new Set(expandedFields);
        if (next.has(field)) next.delete(field);
        else next.add(field);
        setExpandedFields(next);
    };

    if (loading) return (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a' }}>
            <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Loading Discovery Fingerprint...</div>
        </div>
    );

    if (!data || data.length === 0) return null;

    return (
        <section style={{
            marginTop: '0',
            padding: '3rem 0',
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            width: '100vw',
            position: 'relative',
            left: '50%',
            right: '50%',
            marginLeft: '-50vw',
            marginRight: '-50vw',
            borderTop: '1px solid #334155',
            borderBottom: '1px solid #334155',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden'
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                padding: '0 5vw',
                boxSizing: 'border-box'
            }}>
                <div style={{ marginBottom: '3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <div style={{ color: '#3b82f6' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                                <path d="M12 12L2.69 7" />
                                <path d="M12 12l5.69-7" />
                                <path d="M12 12l2.69 9" />
                            </svg>
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', margin: 0, fontFamily: 'var(--font-serif)' }}>
                            Research Fingerprint
                        </h2>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '0 0 2rem 0', maxWidth: '600px' }}>
                        Explore thematic areas of research. Click a topic to see collaborations and top publications.
                    </p>

                    <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                        <button
                            onClick={() => setSortBy('weight')}
                            style={{
                                padding: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: sortBy === 'weight' ? 700 : 400,
                                border: 'none', borderBottom: sortBy === 'weight' ? '3px solid #3b82f6' : '3px solid transparent',
                                background: 'none', cursor: 'pointer', color: sortBy === 'weight' ? '#f8fafc' : '#94a3b8',
                                transition: 'all 0.2s', marginBottom: '-0.6rem'
                            }}
                        >
                            Weight
                        </button>
                        <button
                            onClick={() => setSortBy('alpha')}
                            style={{
                                padding: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: sortBy === 'alpha' ? 700 : 400,
                                border: 'none', borderBottom: sortBy === 'alpha' ? '3px solid #3b82f6' : '3px solid transparent',
                                background: 'none', cursor: 'pointer', color: sortBy === 'alpha' ? '#f8fafc' : '#94a3b8',
                                transition: 'all 0.2s', marginBottom: '-0.6rem'
                            }}
                        >
                            Alphabetically
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {data.slice(0, showAllFields ? data.length : 3).map((fieldGroup, idx) => {
                        const color = FIELD_COLORS[idx % FIELD_COLORS.length];
                        const isExpanded = expandedFields.has(fieldGroup.field);
                        const sortedConcepts = [...fieldGroup.concepts].sort((a, b) => {
                            if (sortBy === 'weight') return b.weight - a.weight;
                            return a.name.localeCompare(b.name);
                        });

                        return (
                            <div key={fieldGroup.field} style={{ borderBottom: '1px solid #334155', paddingBottom: isExpanded ? '1rem' : '0' }}>
                                <button
                                    onClick={() => toggleField(fieldGroup.field)}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '1rem 0', border: 'none', background: 'none', cursor: 'pointer',
                                        textAlign: 'left'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color }}></div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                                            {fieldGroup.field}
                                        </h3>
                                    </div>
                                    <div style={{
                                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.3s', color: '#64748b'
                                    }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div style={{ marginBottom: '1rem', animation: 'fadeIn 0.3s ease' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0.5rem 0' }}>
                                            {(expandedConceptsFields.has(fieldGroup.field) ? sortedConcepts : sortedConcepts.slice(0, 5)).map((concept) => {
                                                const isSelected = selectedConcept === concept.name;
                                                return (
                                                    <div
                                                        key={concept.name}
                                                        onClick={() => handleConceptClick(concept.name)}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px',
                                                            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                                                            borderRadius: '20px', border: isSelected ? `1px solid ${color}` : '1px solid #334155',
                                                            transition: 'all 0.15s', cursor: 'pointer',
                                                            boxShadow: isSelected ? `0 2px 8px ${color}22` : 'none'
                                                        }}
                                                    >
                                                        <DonutRing percentage={concept.weight} color={color} />
                                                        <span style={{ fontSize: '0.85rem', color: isSelected ? '#f8fafc' : '#94a3b8', fontWeight: isSelected ? 700 : 500 }}>
                                                            {concept.name}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {!expandedConceptsFields.has(fieldGroup.field) && sortedConcepts.length > 5 && (
                                            <button
                                                onClick={() => {
                                                    const next = new Set(expandedConceptsFields);
                                                    next.add(fieldGroup.field);
                                                    setExpandedConceptsFields(next);
                                                }}
                                                style={{
                                                    fontSize: '0.75rem', color: color, fontWeight: 700,
                                                    background: 'none', border: 'none', padding: '0.5rem 0',
                                                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em'
                                                }}
                                            >
                                                + Show {sortedConcepts.length - 5} more topics
                                            </button>
                                        )}

                                        {selectedConcept && sortedConcepts.some(c => c.name === selectedConcept) && (
                                            <div style={{
                                                width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                                marginTop: '1rem', borderRadius: '12px', border: '1px solid #334155',
                                                padding: '1.5rem', animation: 'slideIn 0.3s ease'
                                            }}>
                                                {detailsLoading ? (
                                                    <div style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', padding: '1rem' }}>Updating insights...</div>
                                                ) : details ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                                                            <div style={{ flex: '1 1 200px' }}>
                                                                <h4 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '1rem', letterSpacing: '0.08em' }}>
                                                                    TOP COLLABORATOR COUNTRIES
                                                                </h4>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                    {details.countries.length > 0 ? details.countries.map(c => (
                                                                        <div key={c.code} style={{
                                                                            backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid #334155', borderRadius: '8px',
                                                                            padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                                        }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: c.names.length > 0 ? '8px' : '0' }}>
                                                                                <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.9rem' }}>{c.code}</span>
                                                                            </div>
                                                                            {c.names.length > 0 && (
                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                                    {c.names.map(name => (
                                                                                        <span key={name} style={{
                                                                                            fontSize: '0.75rem', color: '#cbd5e1', backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                                                            padding: '2px 8px', borderRadius: '12px', border: '1px solid #334155'
                                                                                        }}>
                                                                                            {name}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )) : <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Local research only</span>}
                                                                </div>
                                                            </div>

                                                            <div style={{ flex: '1 1 200px' }}>
                                                                <h4 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '1rem', letterSpacing: '0.08em' }}>
                                                                    CO-WORKERS (TOP PAPER)
                                                                </h4>
                                                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                                    {details.co_authors.length > 0 ? details.co_authors.map(a => (
                                                                        <div key={a.name} style={{
                                                                            fontSize: '0.8rem', padding: '4px 10px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                                            border: '1px solid #334155', borderRadius: '6px', display: 'flex', gap: '6px', alignItems: 'center',
                                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                                        }}>
                                                                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{a.name}</span>
                                                                            <span style={{ color: color, fontSize: '0.75rem', fontWeight: 700 }}>{a.count}</span>
                                                                        </div>
                                                                    )) : <span style={{ fontSize: '0.85rem', color: '#64748b' }}>None identified</span>}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div style={{ borderTop: '1px solid #334155', paddingTop: '1.25rem' }}>
                                                            <h4 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '0.75rem', letterSpacing: '0.08em' }}>
                                                                TOP RECOGNIZED PAPER
                                                            </h4>
                                                            <a
                                                                href={details.top_paper.pdf_url || '#'}
                                                                target="_blank" rel="noopener noreferrer"
                                                                style={{
                                                                    fontSize: '1rem', color: '#f8fafc', fontWeight: 700,
                                                                    textDecoration: 'none', display: 'block', lineHeight: 1.4,
                                                                    transition: 'color 0.2s'
                                                                }}
                                                                onMouseEnter={(e) => e.currentTarget.style.color = color}
                                                                onMouseLeave={(e) => e.currentTarget.style.color = '#f8fafc'}
                                                            >
                                                                {details.top_paper.title} ↗
                                                            </a>
                                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.6rem', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{details.top_paper.venue}</span>
                                                                <span>•</span>
                                                                <span>{details.top_paper.year}</span>
                                                                <span>•</span>
                                                                <span style={{ color: color, fontWeight: 700 }}>{details.top_paper.citations} Citations</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>Detail insights temporarily unavailable.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {data.length > 3 && (
                        <button
                            onClick={() => setShowAllFields(!showAllFields)}
                            style={{
                                alignSelf: 'flex-start', margin: '2rem 0 0 0', padding: '0.75rem 1.5rem',
                                fontSize: '0.9rem', fontWeight: 700, color: '#3b82f6',
                                backgroundColor: 'transparent', border: '2px solid #3b82f6', borderRadius: '4px',
                                cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#3b82f6';
                                e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = '#3b82f6';
                            }}
                        >
                            {showAllFields ? 'Show less' : `Show ${data.length - 3} more fields`}
                            <div style={{ transform: showAllFields ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </section>
    );
}
