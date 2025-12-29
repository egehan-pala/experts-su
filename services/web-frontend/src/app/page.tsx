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
  const [topAuthors, setTopAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/stats/top-authors')
      .then((res) => res.json())
      .then((data) => {
        setTopAuthors(data);
        setLoading(false);
      })
      .catch((err) => console.error(err));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
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
        <h2 style={{
          fontSize: '2rem',
          marginBottom: '3rem',
          borderLeft: '4px solid #002855',
          paddingLeft: '1rem',
          color: '#111'
        }}>
          Featured Experts
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '3rem' }}>
          {loading ? (
            <p>Loading...</p>
          ) : (
            topAuthors.map((author) => (
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
                    {author.dept || 'Faculty of Engineering'}
                    <br />
                    <span style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem', display: 'inline-block', color: '#002855', fontWeight: 600 }}>
                      {author.pub_count} Publications
                    </span>
                  </p>

                  <div className="su-arrow-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"></path>
                      <path d="M12 5l7 7-7 7"></path>
                    </svg>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
