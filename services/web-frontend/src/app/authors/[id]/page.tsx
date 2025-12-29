'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Author {
    id: string;
    name: string;
    dept: string | null;
    orcid: string | null;
    image_url?: string | null;
    email?: string | null;
    phone?: string | null;
}

interface Publication {
    id: string;
    title: string;
    year: number;
    citations: number;
    venue: string | null;
    pdf_url: string | null;
}

export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [author, setAuthor] = useState<Author | null>(null);
    const [publications, setPublications] = useState<Publication[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            Promise.all([
                fetch(`http://localhost:8000/authors/${id}`).then(res => res.json()),
                fetch(`http://localhost:8000/authors/${id}/publications`).then(res => res.json())
            ])
                .then(([authorData, pubsData]) => {
                    setAuthor(authorData);
                    setPublications(pubsData);
                    setLoading(false);
                })
                .catch((err) => console.error(err));
        }
    }, [id]);

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
                                {author.dept || 'Faculty of Engineering and Natural Sciences'}
                            </p>

                            <div style={{ display: 'flex', gap: '2rem', borderTop: '1px solid #d4d4d8', paddingTop: '1.5rem', marginTop: '1rem' }}>
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
                                <div>
                                    <span className="uppercase-label" style={{ color: '#71717a', display: 'block', marginBottom: '0.25rem' }}>Citations</span>
                                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                        {publications.reduce((acc, p) => acc + (p.citations || 0), 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content - Publications */}
            <div className="container" style={{ padding: '4rem 1.5rem' }}>
                <h2 style={{ fontSize: '2rem', marginBottom: '2rem', fontFamily: 'var(--font-serif)', color: '#111', borderBottom: '2px solid #002855', paddingBottom: '0.5rem', display: 'inline-block' }}>
                    Selected Publications
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {publications.map((bib, index) => (
                        <div key={bib.id} style={{
                            padding: '1.5rem 0',
                            borderBottom: '1px solid #e4e4e7',
                            display: 'flex',
                            gap: '2rem'
                        }}>
                            <div style={{ minWidth: '60px', color: '#71717a', fontWeight: 600, fontSize: '1.1rem' }}>
                                {bib.year}
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem', color: '#111', fontFamily: 'var(--font-serif)' }}>
                                    {bib.title}
                                </h3>
                                <div style={{ fontSize: '0.95rem', color: '#52525b', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>
                                    {bib.venue && <span style={{ fontStyle: 'italic' }}>Published in {bib.venue}. </span>}
                                    <span style={{ color: '#002855', fontWeight: 500 }}>Cited by {bib.citations}</span>
                                    {bib.pdf_url && (
                                        <a
                                            href={bib.pdf_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()} // Prevent card click if nested
                                            style={{
                                                marginLeft: '1rem',
                                                color: '#d6001c',
                                                fontWeight: 600,
                                                textDecoration: 'none',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                fontSize: '0.85rem',
                                                border: '1px solid #d6001c',
                                                padding: '0.1rem 0.5rem',
                                                borderRadius: '4px'
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                            PDF
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {publications.length === 0 && <p style={{ color: '#71717a' }}>No publications found.</p>}
                </div>
            </div>
        </div>
    );
}
