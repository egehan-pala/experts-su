import Image from 'next/image';
import Link from 'next/link';
import SearchBar from './SearchBar';

export default function Header() {
    return (
        <header>
            {/* Branding Bar - Sabanci Blue */}
            <div style={{ backgroundColor: '#002777', color: 'white', padding: '1rem 0' }}>
                <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

                    {/* Left: Logo and Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <Link href="/">
                            <div style={{ width: '90px' }}>
                                <Image
                                    src="/sabanci_logo_header.png"
                                    alt="Sabancı University"
                                    width={90}
                                    height={38}
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                    priority
                                />
                            </div>
                        </Link>

                        {/* Divider */}
                        <div style={{ height: '32px', borderLeft: '1px solid rgba(255,255,255,0.3)' }}></div>

                        {/* Title */}
                        <h1 style={{
                            fontSize: '1.1rem',
                            margin: 0,
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 500,
                            color: 'white',
                            letterSpacing: '-2px',
                            textTransform: 'uppercase',
                            lineHeight: 1
                        }}>
                            Faculty
                            <br />
                            Experts
                        </h1>
                    </div>

                    {/* Right: Tools (My SU, Search, EN) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                        <a href="https://mysu.sabanciuniv.edu/" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>
                            My SU
                        </a>

                        <SearchBar />

                        <div style={{ height: '20px', borderLeft: '1px solid rgba(255,255,255,0.3)' }}></div>

                        <span style={{ cursor: 'pointer' }}>EN</span>
                    </div>

                </div>
            </div>

            {/* Navigation Bar - White */}
            <div className="nav-bar">
                <div className="container">
                    <nav style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '2rem',
                        fontSize: '0.95rem',
                        fontWeight: 600
                    }}>
                        <a href="#" className="nav-link">Home</a>
                        <span style={{ color: '#ccc' }}>•</span>
                        <a href="https://www.sabanciuniv.edu/en/communication/communication/phone-and-addresses" target="_blank" rel="noopener noreferrer" className="nav-link">Contact Us</a>
                        <span style={{ color: '#ccc' }}>•</span>
                        <a href="https://www.sabanciuniv.edu/tr/akademik-personel" target="_blank" rel="noopener noreferrer" className="nav-link">Faculty & Personnel</a>
                        <span style={{ color: '#ccc' }}>•</span>
                        <a href="https://gazetesu.sabanciuniv.edu/en" target="_blank" rel="noopener noreferrer" className="nav-link">Newsletter</a>
                        <span style={{ color: '#ccc' }}>•</span>
                        <a href="https://www.sabanciuniv.edu/tr/acik-pozisyonlar" target="_blank" rel="noopener noreferrer" className="nav-link">Careers</a>
                    </nav>
                </div>
            </div>
        </header>
    );
}
