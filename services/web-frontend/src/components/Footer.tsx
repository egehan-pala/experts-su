import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
    return (
        <footer style={{ backgroundColor: '#002777', color: 'white', padding: '3rem 0', marginTop: 'auto' }}>
            <div className="container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '2rem' }}>

                    {/* Left Column: Logo & Contact Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '400px' }}>
                        {/* Logo */}
                        <div style={{ width: '140px' }}>
                            <Image
                                src="/sabanci_logo_header.png"
                                alt="Sabancı University"
                                width={140}
                                height={60}
                                style={{ width: '100%', height: 'auto', display: 'block' }}
                            />
                        </div>

                        {/* Address & Contact */}
                        <div style={{ fontSize: '0.9rem', lineHeight: '1.6', opacity: 0.9 }}>
                            <p>Orta Mahalle, 34956 Tuzla, İstanbul, Türkiye</p>
                            <p>Telefon: +90 216 483 90 00</p>
                            <p>Fax: +90 216 483 90 05</p>
                        </div>

                        {/* Copyright */}
                        <div style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.5rem' }}>
                            © Sabancı Üniversitesi 2023
                        </div>
                    </div>

                    {/* Right Column: Links & Social Icons */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', height: '100%', gap: '3rem' }}>

                        {/* Links */}
                        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem', fontWeight: 500 }}>
                            <a href="https://www.sabanciuniv.edu/tr/ihale-duyurulari" target="_blank" rel="noopener noreferrer" className="footer-link">İhale İlanları</a>
                            <a href="https://www.sabanciuniv.edu/tr/sabanci-universitesinde-kisisel-verilerin-islenmesine-iliskin-aydinlatma-ve-acik-riza-metni" target="_blank" rel="noopener noreferrer" className="footer-link">KVKK Aydınlatma Metni</a>
                            <a href="https://www.sabanciuniv.edu/tr/gizlilik-bildirimi" target="_blank" rel="noopener noreferrer" className="footer-link">Gizlilik Bildirimi</a>
                        </div>

                        {/* Social Icons */}
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            {/* Facebook */}
                            <a href="https://www.facebook.com/sabanciuniv.edu/" target="_blank" rel="noopener noreferrer" className="social-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                            </a>
                            {/* YouTube */}
                            <a href="https://www.youtube.com/user/sabanciuniversity" target="_blank" rel="noopener noreferrer" className="social-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33zM9.75 15.02l5.75-3.27-5.75-3.27z" /></svg>
                            </a>
                            {/* Twitter */}
                            <a href="https://twitter.com/sabanciu" target="_blank" rel="noopener noreferrer" className="social-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg>
                            </a>
                            {/* LinkedIn */}
                            <a href="https://www.linkedin.com/school/sabanci-university/" target="_blank" rel="noopener noreferrer" className="social-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                            </a>
                            {/* Instagram */}
                            <a href="https://www.instagram.com/sabanci_university/" target="_blank" rel="noopener noreferrer" className="social-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                            </a>
                            {/* TikTok (using note icon as placeholder if distinct icon unavailable quickly, but standard svg path exists) */}
                            <a href="https://www.tiktok.com/@sabanci_university" target="_blank" rel="noopener noreferrer" className="social-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.2033 0C12.8753 5.43254 17.618 9.53128 23.1818 9.53128V14.1568C22.618 14.1568 22.0727 14.1068 21.5455 14.0113V14.1568C21.5455 19.3409 17.3455 23.5409 12.1614 23.5409C6.97727 23.5409 2.77727 19.3409 2.77727 14.1568C2.77727 8.97273 6.97727 4.77273 12.1614 4.77273V9.53128C9.62727 9.53128 7.53636 11.6222 7.53636 14.1568C7.53636 16.6914 9.62727 18.7823 12.1614 18.7823C14.6955 18.7823 16.7864 16.6914 16.7864 14.1568V0H12.2033Z" /></svg>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

        </footer>
    );
}
