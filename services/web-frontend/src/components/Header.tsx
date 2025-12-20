import Image from 'next/image';
import Link from 'next/link';
import SearchBar from './SearchBar';

export default function Header() {
    const currentDate = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    return (
        <header>
            {/* Top Bar - Black/Dark Blue */}
            <div style={{ backgroundColor: '#002777', color: 'white', fontSize: '0.75rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <nav style={{ display: 'flex', gap: '1.5rem', fontWeight: 500 }}>
                        <a href="https://www.sabanciuniv.edu/en/communication/communication/phone-and-addresses" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.9, textDecoration: 'none', color: 'white' }}>Contact Us</a>
                        <a href="https://www.sabanciuniv.edu/tr/akademik-personel" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.9, textDecoration: 'none', color: 'white' }}>Faculty & Personnel</a>
                        <a href="https://gazetesu.sabanciuniv.edu/en" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.9, textDecoration: 'none', color: 'white' }}>Newsletter</a>
                        <a href="https://mysu.sabanciuniv.edu/" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.9, textDecoration: 'none', color: 'white' }}>mySU</a>
                        <a href="https://www.sabanciuniv.edu/tr/acik-pozisyonlar" target="_blank" rel="noopener noreferrer" style={{ opacity: 0.9, textDecoration: 'none', color: 'white' }}>Careers</a>
                    </nav>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {/* Facebook */}
                        <a href="https://www.facebook.com/sabanciuniv.edu/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" style={{ color: 'white' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                        </a>
                        {/* Instagram */}
                        <a href="https://www.instagram.com/sabanci_university/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: 'white' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                        </a>
                        {/* LinkedIn */}
                        <a href="https://www.linkedin.com/school/17992/?pathWildcard=17992" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style={{ color: 'white' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                        </a>
                        {/* X (Twitter) */}
                        <a href="https://twitter.com/sabanciu" target="_blank" rel="noopener noreferrer" aria-label="X" style={{ color: 'white' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        </a>
                        {/* YouTube */}
                        <a href="https://www.youtube.com/user/sabanciuniversity?feature=guide" target="_blank" rel="noopener noreferrer" aria-label="YouTube" style={{ color: 'white' }}>
                            <svg width="16" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33zM9.75 15.02l5.75-3.27-5.75-3.27z" /></svg>
                        </a>
                    </div>
                </div>
            </div>

            {/* Main Branding Bar - Sabanci Blue */}
            <div style={{ backgroundColor: '#002777', padding: '1.2rem 0', borderBottom: '1px solid #002777' }}>
                <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

                    {/* Logo and Title Group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <Link href="/">
                            <div style={{ width: '110px' }}>
                                <Image
                                    src="/sabanci_logo_header.png"
                                    alt="Sabancı University"
                                    width={110}
                                    height={48}
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                    priority
                                />
                            </div>
                        </Link>

                        {/* Divider */}
                        <div style={{ height: '40px', borderLeft: '1px solid rgba(255,255,255,0.2)' }}></div>

                        {/* Date & Title */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                                {currentDate}
                            </span>
                            <h1 style={{ fontSize: '1.75rem', margin: 0, fontFamily: 'inherit', fontWeight: 600, color: 'white', lineHeight: 1.1 }}>
                                Faculty Experts
                            </h1>
                        </div>
                    </div>

                    {/* Right Icons */}
                    <div style={{ display: 'flex', gap: '1rem', color: 'white' }}>
                        {/* Search Bar */}
                        <SearchBar />
                        {/* Menu Icon Placeholder */}
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </div>

                </div>
            </div>
        </header >
    );
}
