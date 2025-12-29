'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface Author {
  id: string;
  name: string;
  dept: string | null;
  orcid: string | null;
  pub_count: number;
  image_url?: string | null;
}

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 12;

  useEffect(() => {
    setLoading(true);
    // Scroll to top of list when page changes, if reasonable
    // window.scrollTo({ top: 0, behavior: 'smooth' });

    fetch(`http://localhost:8000/authors?page=${page}&limit=${limit}`)
      .then((res) => res.json())
      .then((data) => {
        setAuthors(data.data);
        setTotalPages(data.meta.total_pages);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return (
    <main className={styles.main}>
      {/* Hero Section */}
      <div className={styles.bgWrapper}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroText}>
              Sabancı University faculty are available to provide expertise, analysis and commentary on a wide variety of news and research topics. Contact us for more information.
            </p>

            <div className={styles.searchSection}>
              <label className={styles.searchLabel}>Search</label>
              <form onSubmit={handleSearch} className={styles.searchContainer}>
                <input
                  className={styles.searchInput}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button type="submit" className={styles.searchButton}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>
              </form>
              <p className={styles.searchHelper}>Search for an expert by name or expertise.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Researchers Grid - Elegant Card Layout */}
      <div className="container" style={{ padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ display: 'inline-block' }}>
            <h2 style={{
              fontSize: '2.5rem',
              color: '#002855',
              marginBottom: '0.5rem',
              lineHeight: 1,
              letterSpacing: '0.05em',
              fontWeight: 800,
              textTransform: 'uppercase'
            }}>
              Faculty Experts
            </h2>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '3rem' }}>
          {loading ? (
            <p>Loading directory...</p>
          ) : (
            authors.map((author) => (
              <div
                key={author.id}
                className="su-card"
                onClick={() => router.push(`/authors/${author.id}`)}
              >
                {/* Image Section */}
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

                  {/* Placeholder for Photo (shown if no image or error) */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: author.image_url ? 'none' : 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    background: '#eaebed'
                  }}>
                    {/* Try to simulate a person image or just use an icon if no image */}
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                </div>

                {/* Content Section */}
                <div className="su-card-content">
                  <h3 className="su-card-title">
                    {author.name}
                  </h3>
                  <p className="su-card-desc">
                    {author.dept || 'Faculty Member'}
                    <br />
                    <span style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem', display: 'inline-block', color: '#002855', fontWeight: 600 }}>
                      {author.pub_count} Publications
                    </span>
                  </p>

                  <div className="su-arrow-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"></line>
                      <polyline points="5 12 12 5 19 12"></polyline>
                    </svg>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Controls */}
        {!loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', marginTop: '4rem' }}>
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              style={{
                padding: '0.75rem 1.5rem',
                background: page === 1 ? '#e4e4e7' : '#002855',
                color: page === 1 ? '#a1a1aa' : 'white',
                border: 'none',
                fontWeight: 600,
                cursor: page === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Previous
            </button>

            <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              style={{
                padding: '0.75rem 1.5rem',
                background: page === totalPages ? '#e4e4e7' : '#002855',
                color: page === totalPages ? '#a1a1aa' : 'white',
                border: 'none',
                fontWeight: 600,
                cursor: page === totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
