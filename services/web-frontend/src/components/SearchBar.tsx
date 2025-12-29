'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBar() {
    const [query, setQuery] = useState('');
    const [isHovered, setIsHovered] = useState(false);
    const router = useRouter();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        }
    };

    return (
        <form
            onSubmit={handleSearch}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
                if (!query) setIsHovered(false);
            }}
            style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: isHovered || query ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                borderRadius: '20px',
                padding: '0.25rem',
                transition: 'all 0.3s ease'
            }}
        >
            <input
                type="text"
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.9rem',
                    width: isHovered || query ? '200px' : '0px',
                    padding: isHovered || query ? '0 0.5rem' : '0',
                    opacity: isHovered || query ? 1 : 0,
                    transition: 'all 0.3s ease'
                }}
            />
            <button type="submit" style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </button>
        </form>
    );
}
