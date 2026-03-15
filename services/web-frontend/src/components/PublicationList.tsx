'use client';

import React, { useState, useEffect } from 'react';

interface Publication {
    id: string;
    title: string;
    year: number | null;
    citations: number | null;
    venue: string | null;
    pdf_url?: string | null;
    publication_date?: string | null;
    is_open_access?: boolean;
}

interface PublicationResponse {
    data: Publication[];
    meta: {
        page: number;
        limit: number;
        total_items: number;
        total_pages: number;
    };
}

export default function PublicationList({ authorId }: { authorId: string }) {
    const [publications, setPublications] = useState<Publication[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Filters and pagination state
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [sortBy, setSortBy] = useState<'citations' | 'year'>('citations');
    const [searchQuery, setSearchQuery] = useState('');
    const [yearFrom, setYearFrom] = useState<string>('');
    const [yearTo, setYearTo] = useState<string>('');
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const fetchPublications = async (resetPage = false) => {
        if (!authorId) return;
        setLoading(true);
        
        const currentPage = resetPage ? 1 : page;
        if (resetPage) setPage(1);

        const shortId = authorId.replace('https://openalex.org/', '').split('/').pop() || authorId;
        
        // Build query string
        const params = new URLSearchParams({
            page: currentPage.toString(),
            limit: limit.toString(),
            sort_by: sortBy,
        });

        if (searchQuery.trim()) params.append('q', searchQuery.trim());
        if (yearFrom) params.append('year_from', yearFrom);
        if (yearTo) params.append('year_to', yearTo);

        try {
            const res = await fetch(`http://localhost:8000/authors/${shortId}/publications?${params.toString()}`);
            if (res.ok) {
                const data: PublicationResponse = await res.json();
                setPublications(data.data);
                setTotalPages(data.meta.total_pages);
                setTotalItems(data.meta.total_items);
            }
        } catch (err) {
            console.error("Failed to fetch publications", err);
        } finally {
            setLoading(false);
        }
    };

    // Trigger fetch when dependencies change
    useEffect(() => {
        // Debounce search query changes
        const timer = setTimeout(() => {
            fetchPublications();
        }, 300);
        return () => clearTimeout(timer);
    }, [page, sortBy, yearFrom, yearTo, searchQuery, authorId]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setPage(1);
    };

    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSortBy(e.target.value as 'citations' | 'year');
        setPage(1);
    };

    const handleTopPaperClick = () => {
        setSortBy('citations');
        setSearchQuery('');
        setYearFrom('');
        setYearTo('');
        setPage(1);
    };

    // Generate year options for dropdowns (last 50 years)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 50 }, (_, i) => currentYear - i);

    return (
        <section style={{
            marginTop: '3rem',
            padding: '2rem',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e4e4e7',
            boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #f4f4f5', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📚</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#002855', letterSpacing: '0.05em', margin: 0, fontFamily: 'var(--font-sans)' }}>
                        Publications ({totalItems})
                    </h3>
                </div>
                
                <button
                    onClick={handleTopPaperClick}
                    style={{
                        padding: '0.6rem 1.25rem',
                        backgroundColor: '#d6001c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b00015'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#d6001c'}
                >
                    <span>🏆</span> Find Top Paper
                </button>
            </div>

            {/* Filters Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem', backgroundColor: '#f9f9fb', padding: '1rem', borderRadius: '12px' }}>
                <div style={{ flex: '1 1 250px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#71717a', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Search Title</label>
                    <input 
                        type="text" 
                        placeholder="Search publications..." 
                        value={searchQuery}
                        onChange={handleSearchChange}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #d4d4d8', fontSize: '0.95rem' }}
                    />
                </div>
                
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#71717a', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Sort By</label>
                    <select 
                        value={sortBy} 
                        onChange={handleSortChange}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #d4d4d8', fontSize: '0.95rem', cursor: 'pointer', backgroundColor: 'white' }}
                    >
                        <option value="citations">Most Cited First</option>
                        <option value="year">Newest First</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#71717a', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Year Range</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <select 
                            value={yearFrom} 
                            onChange={(e) => { setYearFrom(e.target.value); setPage(1); }}
                            style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #d4d4d8', fontSize: '0.95rem', cursor: 'pointer', backgroundColor: 'white' }}
                        >
                            <option value="">Any</option>
                            {years.map(y => <option key={`from-${y}`} value={y}>{y}</option>)}
                        </select>
                        <span style={{ color: '#a1a1aa' }}>-</span>
                        <select 
                            value={yearTo} 
                            onChange={(e) => { setYearTo(e.target.value); setPage(1); }}
                            style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #d4d4d8', fontSize: '0.95rem', cursor: 'pointer', backgroundColor: 'white' }}
                        >
                            <option value="">Any</option>
                            {years.map(y => <option key={`to-${y}`} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#71717a' }}>Loading publications...</div>
            ) : publications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#71717a', backgroundColor: '#f9f9fb', borderRadius: '12px', border: '1px dashed #d4d4d8' }}>
                    No publications found matching your criteria.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {publications.map((pub, idx) => (
                        <div key={pub.id} style={{
                            padding: '1.25rem',
                            backgroundColor: (page === 1 && sortBy === 'citations' && idx === 0 && !searchQuery && !yearFrom && !yearTo) ? '#fef2f2' : '#ffffff',
                            border: (page === 1 && sortBy === 'citations' && idx === 0 && !searchQuery && !yearFrom && !yearTo) ? '1px solid #fca5a5' : '1px solid #e4e4e7',
                            borderRadius: '12px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ fontSize: '1.1rem', color: '#111', fontWeight: 600, lineHeight: 1.4, margin: '0 0 0.5rem 0', fontFamily: 'var(--font-serif)' }}>
                                        {pub.title}
                                        {pub.is_open_access && (
                                            <span title="Open Access" style={{ marginLeft: '10px', fontSize: '1rem' }}>🔓</span>
                                        )}
                                    </h4>
                                    
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', color: '#52525b', fontSize: '0.9rem' }}>
                                        {pub.year && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                📅 {pub.year}
                                            </span>
                                        )}
                                        {pub.venue && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#002855', fontWeight: 500 }}>
                                                🏢 {pub.venue}
                                            </span>
                                        )}
                                        {pub.pdf_url && (
                                            <a href={pub.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#d6001c', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                PDF ↗
                                            </a>
                                        )}
                                    </div>
                                </div>
                                
                                {pub.citations !== null && (
                                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '80px' }}>
                                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d6001c', lineHeight: 1 }}>{pub.citations}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Citations</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '2.5rem' }}>
                    <button 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #d4d4d8', backgroundColor: page === 1 ? '#f4f4f5' : 'white', color: page === 1 ? '#a1a1aa' : '#111', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                    >
                        Previous
                    </button>
                    <span style={{ fontSize: '0.9rem', color: '#52525b', fontWeight: 500 }}>
                        Page {page} of {totalPages}
                    </span>
                    <button 
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #d4d4d8', backgroundColor: page === totalPages ? '#f4f4f5' : 'white', color: page === totalPages ? '#a1a1aa' : '#111', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    );
}
