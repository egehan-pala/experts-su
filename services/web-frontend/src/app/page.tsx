'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import DepartmentNetworkGraph from '@/components/DepartmentNetworkGraph';
import CitationOverlapGraph from '@/components/CitationOverlapGraph';

interface Author {
  id: string;
  name: string;
  dept: string | null;
  orcid: string | null;
  pub_count: number;
  image_url?: string | null;
  email?: string | null;
  phone?: string | null;
}

const SDG_DATA = [
  { id: 1, title: 'No Poverty', color: '#E5243B', icon: 'no_poverty-5be0d31a7a366ac69131d7c02dbde399.svg' },
  { id: 2, title: 'Zero Hunger', color: '#DDA63A', icon: 'zero_hunger-d73a8234b0d705e88bce82410489d716.svg' },
  { id: 3, title: 'Good Health and Well-being', color: '#4C9F38', icon: 'good_health_and_well_being-9e564c34dfe97e37b42d22a76cae8ae4.svg' },
  { id: 4, title: 'Quality Education', color: '#C5192D', icon: 'quality_education-f9f31eaa05cb25157854fe0b835a34d9.svg' },
  { id: 5, title: 'Gender Equality', color: '#FF3A21', icon: 'gender_equality-448708a3baca11d4d32fbe32cbc70beb.svg' },
  { id: 6, title: 'Clean Water and Sanitation', color: '#26BDE2', icon: 'clean_water_and_sanitation-27f22282fefee8571cb435ced4f863bd.svg' },
  { id: 7, title: 'Affordable and Clean Energy', color: '#FCC30B', icon: 'affordable_and_clean_energy-b8e39c169139faf6df7199566119c3c0.svg' },
  { id: 8, title: 'Decent Work and Economic Growth', color: '#A21942', icon: 'decent_work_and_economic_growth-b8e44bcddd206deda6b1ad43452e7870.svg' },
  { id: 9, title: 'Industry, Innovation and Infrastructure', color: '#FD6925', icon: 'industry_innovation_and_infrastructure-38d336019fd4b8ef110b4e64f4c8d344.svg' },
  { id: 10, title: 'Reduced Inequalities', color: '#DD1367', icon: 'reduced_inequalities-db0b5faa1c40b697483c87318d2fca1b.svg' },
  { id: 11, title: 'Sustainable Cities and Communities', color: '#FD9D24', icon: 'sustainable_cities_and_communities-059d865e613fccfccd3ec235fcd1f9c8.svg' },
  { id: 12, title: 'Responsible Consumption and Production', color: '#BF8B2E', icon: 'responsible_consumption_and_production-833fe92c1833785b6f54ac5485004872.svg' },
  { id: 13, title: 'Climate Action', color: '#3F7E44', icon: 'climate_action-acabfe7bc0b54aaaf6bf5ae849215b49.svg' },
  { id: 14, title: 'Life Below Water', color: '#0A97D9', icon: 'life_below_water-ae59728e6d82f5a69de1f6480ff4491f.svg' },
  { id: 15, title: 'Life on Land', color: '#56C02B', icon: 'life_on_land-0dc2d409dd264065bef2ecd13874414e.svg' },
  { id: 16, title: 'Peace, Justice and Strong Institutions', color: '#00689D', icon: 'peace_justice_and_strong_institutions-2198e62de154090dcd2642736839fe19.svg' },
  { id: 17, title: 'Partnerships for the Goals', color: '#19486A', icon: 'partnerships-023a87e94df392bd98d172237327fee9.svg' },
];

function SDGSection() {
  const router = useRouter();
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
        UN Sustainable Development Goals
      </h2>
      <div style={{ width: '100%', height: '1px', backgroundColor: '#e5e7eb', marginBottom: '1.5rem' }}></div>
      <p style={{ fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: '800px' }}>
        In September 2015, 193 countries agreed to adopt a set of global goals to end poverty, protect the planet and ensure prosperity for all. Click on a goal below to explore how our researchers and their work are contributing towards achieving it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {SDG_DATA.map((sdg) => (
          <div 
            key={sdg.id} 
            onClick={() => router.push(`/search?sdg=${sdg.id}&sdg_name=${encodeURIComponent(sdg.title)}`)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem', 
              padding: '0.6rem 0.8rem', 
              cursor: 'pointer', 
              transition: 'all 0.2s ease',
              borderRadius: '8px',
              border: '1px solid transparent'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.borderColor = sdg.color + '40'; // 40 is hex for 25% opacity
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            <div style={{
              width: '54px',
              height: '54px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              backgroundColor: sdg.color,
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <img src={`/sdgs/${sdg.icon}`} alt={`SDG ${sdg.id}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', margin: '0 0 0.05rem 0' }}>SDG {sdg.id}</h3>
              <p style={{ fontSize: '0.9rem', color: '#1f2937', margin: 0, fontWeight: 500, lineHeight: 1.2 }}>{sdg.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthorCard({ author, router, getDeptFullName }: { author: Author, router: any, getDeptFullName: any }) {
  return (
    <div
      className="su-card"
      onClick={() => router.push(`/authors/${author.id}`)}
    >
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

        <div style={{
          width: '100%',
          height: '100%',
          display: author.image_url ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          background: '#eaebed'
        }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
      </div>

      <div className="su-card-content">
        <h3 className="su-card-title">{author.name}</h3>
        <p style={{ fontWeight: 800, fontSize: '0.9rem', color: '#002855', marginBottom: '0.25rem' }}>
          {author.dept ? getDeptFullName(author.dept) : 'Faculty Member'}
        </p>
        <p style={{ fontWeight: 500, fontSize: '0.85rem', color: '#666', marginBottom: '1rem', lineHeight: 1.2 }}>
          {author.name === 'Yusuf Leblebici' ? 'Rektör' : author.id.includes('openalex') ? 'Faculty Member' : 'Faculty Member'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginBottom: '1.5rem' }}>
          {author.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: '#333' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.161 15.161 0 01-6.59-6.59l2.2-2.21c.28-.26.36-.65.25-1.01A11.36 11.36 0 018.59 3.99c0-.55-.45-1-1-1h-3.5c-.55 0-1 .45-1 1C3.09 13.01 11.99 21.91 21 21.91c.55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1zM20.01 15.38z" />
              </svg>
              <span>{author.phone}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: '#333' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {author.email || `${author.name.split(' ')[0].toLowerCase()}@sabanciuniv.edu`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deptFilter, setDeptFilter] = useState<string | null>('overview');
  const [overviewTab, setOverviewTab] = useState<'sdgs' | 'network' | 'citation-overlap'>('sdgs');
  const limit = 12;

  useEffect(() => {
    setLoading(true);
    // Skip API call for the overview tab
    if (deptFilter === 'overview') {
      setLoading(false);
      return;
    }
    let url = `http://localhost:8000/authors?page=${page}&limit=${limit}`;
    if (deptFilter) {
      url += `&dept=${encodeURIComponent(deptFilter)}`;
    }

    fetch(url)
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
  }, [page, deptFilter]);

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

  const departments = ['FENS', 'FASS', 'SBS'];

  // Helper to get full name
  const getDeptFullName = (d: string) => {
    if (d === 'FENS') return 'Faculty of Engineering and Natural Sciences';
    if (d === 'FASS') return 'Faculty of Art and Social Sciences';
    if (d === 'SBS') return 'Sabancı Business School';
    return d;
  };

  const FACULTY_INFO = [
    {
      id: 'overview',
      name: 'Overview',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      )
    },
    {
      id: null,
      name: 'All Experts',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      id: 'FENS',
      name: 'Faculty of Engineering and Natural Sciences',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 18h8" />
          <path d="M3 22h18" />
          <path d="M14 22a7 7 0 1 0 0-14h-1" />
          <path d="M9 14h2" />
          <path d="M9 12a2 2 0 1 1-4 0V7a2 2 0 1 1 4 0v5Z" />
          <path d="M12 7V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4" />
        </svg>
      )
    },
    {
      id: 'FASS',
      name: 'Faculty of Art and Social Sciences',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 11h.01" />
          <path d="M12 7h.01" />
          <path d="M12 15h.01" />
          <path d="M12 19h.01" />
          <path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M11 7h.01" />
          <path d="M13 7h.01" />
        </svg>
      )
    },
    {
      id: 'SBS',
      name: 'Sabancı Business School',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      )
    }
  ];

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
      <div className="container" style={{ padding: '0 1.5rem 4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '0' }}>
          <div style={{ display: 'inline-block', width: '100%' }}>

            <div style={{
              display: 'flex',
              justifyContent: 'center',
              width: '100vw',
              position: 'relative',
              left: '50%',
              right: '50%',
              marginLeft: '-50vw',
              marginRight: '-50vw',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              marginTop: '0',
              marginBottom: '3rem'
            }}>
              <div style={{
                display: 'flex',
                gap: '2.5rem',
                padding: '0 1.5rem',
                maxWidth: '1200px',
                width: '100%',
                overflowX: 'auto',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none'
              }}>
                {FACULTY_INFO.map(fac => {
                  const isActive = deptFilter === fac.id;
                  return (
                    <button
                      key={fac.name}
                      onClick={() => { setDeptFilter(fac.id); setPage(1); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '1rem 0.25rem',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderBottom: isActive ? '3px solid #002855' : '3px solid transparent',
                        color: isActive ? '#002855' : '#64748b',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-sans)',
                        position: 'relative',
                        bottom: '-1px'
                      }}
                    >
                      <span style={{ color: isActive ? '#002855' : '#94a3b8' }}>
                        {fac.icon}
                      </span>
                      {fac.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

          {loading ? (
          <p style={{ textAlign: 'center', padding: '3rem 0' }}>Loading directory...</p>
        ) : (
          <div>
            {deptFilter === 'overview' ? (
              <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Secondary navigation for Overview */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  width: '100vw',
                  position: 'relative',
                  left: '50%',
                  right: '50%',
                  marginLeft: '-50vw',
                  marginRight: '-50vw',
                  backgroundColor: 'transparent',
                  borderBottom: '1px solid #e2e8f0',
                  marginTop: '-3rem',
                  marginBottom: '3rem'
                }}>
                  <div style={{
                    display: 'flex',
                    gap: '2.5rem',
                    padding: '0 1.5rem',
                    maxWidth: '1200px',
                    width: '100%',
                    overflowX: 'auto',
                    msOverflowStyle: 'none',
                    scrollbarWidth: 'none'
                  }}>
                  {[
                    {
                      id: 'sdgs',
                      name: 'SDG Focus',
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                        </svg>
                      )
                    },
                    {
                      id: 'network',
                      name: 'School Collaboration Network',
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="6" cy="6" r="2" />
                          <circle cx="18" cy="6" r="2" />
                          <circle cx="12" cy="18" r="2" />
                          <line x1="6" y1="8" x2="12" y2="16" />
                          <line x1="18" y1="8" x2="12" y2="16" />
                          <line x1="8" y1="6" x2="16" y2="6" />
                        </svg>
                      )
                    },
                    {
                      id: 'citation-overlap',
                      name: 'Citation Overlap Network',
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                          <line x1="8" y1="7" x2="16" y2="7" />
                          <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                      )
                    }
                  ].map(tab => {
                    const isActive = overviewTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setOverviewTab(tab.id as 'sdgs' | 'network' | 'citation-overlap')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '1rem 0.25rem',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderBottom: isActive ? '3px solid #002855' : '3px solid transparent',
                          color: isActive ? '#002855' : '#64748b',
                          fontWeight: isActive ? 700 : 500,
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-sans)',
                          position: 'relative',
                          bottom: '-1px'
                        }}
                      >
                        <span style={{ color: isActive ? '#002855' : '#94a3b8' }}>
                          {tab.icon}
                        </span>
                        {tab.name}
                      </button>
                    );
                  })}
                  </div>
                </div>

                {overviewTab === 'sdgs' ? (
                  <SDGSection />
                ) : overviewTab === 'network' ? (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '1000px', backgroundColor: 'transparent' }}>
                      <DepartmentNetworkGraph />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '1000px', backgroundColor: 'transparent' }}>
                      <CitationOverlapGraph />
                    </div>
                  </div>
                )}
              </div>
            ) : !deptFilter ? (
              /* Grouped View for All */
              departments.map(dept => {
                const deptAuthors = authors.filter(a => a.dept === dept);
                if (deptAuthors.length === 0) return null;

                return (
                  <div key={dept} style={{ marginBottom: '4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #002855', paddingBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#002855', margin: 0 }}>
                        {getDeptFullName(dept)}
                      </h3>
                      <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: 600, background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                        {dept}
                      </span>
                    </div>

                    <div className="experts-grid">
                      {deptAuthors.map((author) => (
                        <AuthorCard key={author.id} author={author} router={router} getDeptFullName={getDeptFullName} />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              /* Single Grid View for Filtered Dept */
              <div className="experts-grid">
                {authors.map((author) => (
                  <AuthorCard key={author.id} author={author} router={router} getDeptFullName={getDeptFullName} />
                ))}
              </div>
            )}

            {deptFilter !== 'overview' && !deptFilter && authors.some(a => !a.dept || !departments.includes(a.dept)) && (
              <div style={{ marginBottom: '4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #64748b', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#64748b', margin: 0 }}>
                    Other Faculty
                  </h3>
                </div>
                <div className="experts-grid">
                  {authors.filter(a => !a.dept || !departments.includes(a.dept)).map((author) => (
                    <AuthorCard key={author.id} author={author} router={router} getDeptFullName={getDeptFullName} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && deptFilter !== 'overview' && (
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
