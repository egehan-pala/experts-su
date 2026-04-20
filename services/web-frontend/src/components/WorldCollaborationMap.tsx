'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { API_URL } from '@/lib/config';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';

const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

interface CountryData {
  code: string;
  count: number;
  names: string[];
}

interface GlobalCollabResponse {
  total_collaborations: number;
  total_countries: number;
  countries: CountryData[];
}

// Country centroids (lat, lng) for placing markers — comprehensive list
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  // North America
  US: [-95.7, 37.1], CA: [-106.3, 56.1], MX: [-102.5, 23.6],
  // South America
  BR: [-51.9, -14.2], AR: [-63.6, -38.4], CL: [-71.5, -35.7],
  CO: [-74.3, 4.6], PE: [-75.0, -9.2], VE: [-66.6, 6.4],
  EC: [-78.2, -1.8], UY: [-55.8, -32.5], PY: [-58.4, -23.4],
  // Europe
  GB: [-3.4, 54.2], DE: [10.5, 51.2], FR: [2.2, 46.2],
  IT: [12.6, 41.9], ES: [-3.7, 40.5], PT: [-8.2, 39.4],
  NL: [5.3, 52.1], BE: [4.5, 50.5], CH: [8.2, 46.8],
  AT: [14.6, 47.5], SE: [18.6, 60.1], NO: [8.5, 60.5],
  DK: [9.5, 56.3], FI: [25.7, 61.9], PL: [19.1, 51.9],
  CZ: [15.5, 49.8], IE: [-7.7, 53.4], GR: [21.8, 39.1],
  RO: [24.9, 45.9], HU: [19.5, 47.2], SK: [19.7, 48.7],
  HR: [15.2, 45.1], BG: [25.5, 42.7], RS: [21.0, 44.0],
  SI: [14.5, 46.2], LT: [23.9, 55.2], LV: [24.6, 56.9],
  EE: [25.0, 58.6], UA: [31.2, 48.4], BY: [27.9, 53.7],
  MD: [28.4, 47.4], BA: [17.7, 43.9], ME: [19.4, 42.7],
  AL: [20.2, 41.2], MK: [21.7, 41.5], CY: [33.4, 35.1],
  MT: [14.4, 35.9], LU: [6.1, 49.8], IS: [-19.0, 64.9],
  // Asia
  CN: [104.2, 35.9], JP: [138.3, 36.2], KR: [127.8, 35.9],
  IN: [78.9, 20.6], PK: [69.3, 30.4], BD: [90.4, 23.7],
  ID: [113.9, -0.8], TH: [101.0, 15.9], VN: [108.3, 14.1],
  MY: [101.9, 4.2], PH: [121.8, 12.9], SG: [103.8, 1.4],
  TW: [121.0, 23.7], HK: [114.1, 22.3], MO: [113.5, 22.2],
  KZ: [66.9, 48.0], UZ: [64.6, 41.4], AZ: [47.6, 40.1],
  GE: [43.4, 42.3], AM: [44.9, 40.1], IQ: [43.7, 33.2],
  SA: [45.1, 23.9], AE: [53.8, 23.4], QA: [51.2, 25.4],
  KW: [47.5, 29.3], BH: [50.5, 26.0], OM: [55.9, 21.5],
  JO: [36.2, 30.6], LB: [35.5, 33.9], IL: [34.9, 31.0],
  PS: [35.2, 31.9], IR: [53.7, 32.4], AF: [67.7, 33.9],
  LK: [80.8, 7.9], NP: [84.1, 28.4], MM: [96.0, 19.8],
  KH: [104.9, 12.6], LA: [102.5, 19.9], MN: [103.8, 46.9],
  // Africa
  ZA: [22.9, -30.6], EG: [30.8, 26.8], NG: [8.7, 9.1],
  KE: [37.9, -0.0], GH: [1.0, 7.9], ET: [40.5, 9.1],
  TZ: [34.9, -6.4], MA: [-7.1, 31.8], DZ: [1.7, 28.0],
  TN: [9.5, 33.9], CI: [-5.5, 7.5], CM: [12.4, 7.4],
  SN: [-14.5, 14.5], UG: [32.3, 1.4], MZ: [35.5, -18.7],
  ZW: [29.2, -19.0], ZM: [27.8, -13.1], BW: [24.7, -22.3],
  NA: [18.5, -22.6], RW: [29.9, -1.9], SD: [30.2, 12.9],
  LY: [17.2, 26.3], AO: [17.9, -11.2],
  // Middle East (additional)
  TR: [35.2, 39.9],
  // Oceania
  AU: [133.8, -25.3], NZ: [174.9, -40.9], FJ: [178.1, -17.7],
  PG: [143.2, -6.3],
  // Caribbean / Central America
  CU: [-77.8, 21.5], JM: [-77.3, 18.1], CR: [-83.8, 10.0],
  PA: [-80.8, 8.5], GT: [-90.2, 15.8], HN: [-86.2, 15.2],
  SV: [-88.9, 13.8], NI: [-85.2, 12.9], DO: [-70.2, 18.7],
  TT: [-61.2, 10.7], PR: [-66.6, 18.2],
  // Russia
  RU: [105.3, 61.5],
};

// Istanbul coordinates for Sabancı University marker
const ISTANBUL: [number, number] = [29.0, 41.0];

export default function WorldCollaborationMap() {
  const [data, setData] = useState<CountryData[]>([]);
  const [totalCollabs, setTotalCollabs] = useState(0);
  const [totalCountries, setTotalCountries] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tooltipContent, setTooltipContent] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);

    fetch(`${API_URL}/network/global-collaborations`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((resData: GlobalCollabResponse) => {
        setData(resData.countries || []);
        setTotalCollabs(resData.total_collaborations || 0);
        setTotalCountries(resData.total_countries || 0);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch global collaborations:', err);
        setError(true);
        setLoading(false);
      });
  }, [retryCount]);

  const maxCount = useMemo(() => {
    if (!data.length) return 1;
    return Math.max(...data.map(d => d.count));
  }, [data]);

  // Compute marker radius using sqrt scale for better visual balance
  const getMarkerRadius = (count: number) => {
    const minR = 3;
    const maxR = 18;
    const ratio = Math.sqrt(count) / Math.sqrt(maxCount);
    return minR + ratio * (maxR - minR);
  };

  if (loading) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '2rem 1rem',
      }}>
        <h2 style={{
          fontSize: '1.35rem',
          fontWeight: 400,
          color: '#1f2937',
          marginBottom: '0.5rem',
          fontFamily: 'var(--font-sans)',
        }}>
          Collaborations and top research areas from the last five years
        </h2>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6rem 2rem',
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e2e8f0',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem',
            }} />
            <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
              Loading collaboration data from around the world...
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              This may take a moment on first load as we aggregate data for all faculty members.
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data.length) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '2rem 1rem',
      }}>
        <h2 style={{
          fontSize: '1.35rem',
          fontWeight: 400,
          color: '#1f2937',
          marginBottom: '0.5rem',
          fontFamily: 'var(--font-sans)',
        }}>
          Collaborations and top research areas from the last five years
        </h2>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          gap: '1rem',
        }}>
          <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
            {error
              ? 'Failed to load collaboration data. The server may still be processing.'
              : 'No collaboration data available yet.'}
          </p>
          <button
            onClick={() => setRetryCount(c => c + 1)}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 1rem',
    }}>
      {/* Header */}
      <h2 style={{
        fontSize: '1.35rem',
        fontWeight: 400,
        color: '#1f2937',
        marginBottom: '0.25rem',
        fontFamily: 'var(--font-sans)',
      }}>
        Collaborations and top research areas from the last five years
      </h2>
      <p style={{
        fontSize: '0.85rem',
        color: '#6b7280',
        marginBottom: '1.5rem',
      }}>
        Click dots to bring up details or hover to see country information.
        Showing collaborations across <strong>{totalCountries}</strong> countries.
      </p>

      {/* Summary Stats Row */}
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#eff6ff',
          borderRadius: '8px',
          border: '1px solid #bfdbfe',
        }}>
          <span style={{ fontSize: '1.1rem' }}>🌍</span>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Countries</div>
            <div style={{ fontSize: '1.1rem', color: '#1e40af', fontWeight: 700 }}>{totalCountries}</div>
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
          border: '1px solid #bbf7d0',
        }}>
          <span style={{ fontSize: '1.1rem' }}>🤝</span>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Faculty&ndash;Country Links</div>
            <div style={{ fontSize: '1.1rem', color: '#166534', fontWeight: 700 }}>{totalCollabs.toLocaleString()}</div>
          </div>
        </div>
        {data[0] && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            border: '1px solid #fde68a',
          }}>
            <span style={{ fontSize: '1.1rem' }}>🏆</span>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Top Partner</div>
              <div style={{ fontSize: '1.1rem', color: '#92400e', fontWeight: 700 }}>
                {data[0].names[0] || data[0].code} ({data[0].count})
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map Container */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <ComposableMap
          projectionConfig={{
            scale: 150,
            center: [15, 20],
          }}
          width={900}
          height={440}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <ZoomableGroup>
            {/* World geography — light gray land */}
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#d1d5db"
                    stroke="#ffffff"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { fill: '#c5c9cf', outline: 'none', cursor: 'default' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Blue collaboration dots */}
            {data.map((country) => {
              const coords = COUNTRY_CENTROIDS[country.code];
              if (!coords) return null;
              const r = getMarkerRadius(country.count);
              return (
                <Marker
                  key={country.code}
                  coordinates={coords}
                  onMouseEnter={(e: React.MouseEvent) => {
                    const name = country.names[0] || country.code;
                    setTooltipContent(`${name} — ${country.count} faculty collaborations`);
                    setTooltipPosition({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e: React.MouseEvent) => {
                    setTooltipPosition({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => setTooltipContent('')}
                  onClick={() => setSelectedCountry(
                    selectedCountry?.code === country.code ? null : country
                  )}
                >
                  <circle
                    r={r}
                    fill="rgba(59, 130, 246, 0.7)"
                    stroke="rgba(59, 130, 246, 0.9)"
                    strokeWidth={1}
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                    onMouseOver={(e) => {
                      (e.target as SVGCircleElement).setAttribute('fill', 'rgba(37, 99, 235, 0.85)');
                      (e.target as SVGCircleElement).setAttribute('r', String(r * 1.2));
                    }}
                    onMouseOut={(e) => {
                      (e.target as SVGCircleElement).setAttribute('fill', 'rgba(59, 130, 246, 0.7)');
                      (e.target as SVGCircleElement).setAttribute('r', String(r));
                    }}
                  />
                </Marker>
              );
            })}

            {/* Istanbul (Sabancı University) — Orange pin marker */}
            <Marker coordinates={ISTANBUL}>
              {/* Pin body */}
              <g transform="translate(-8, -20)">
                <path
                  d="M8 0C3.58 0 0 3.58 0 8c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"
                  fill="#f59e0b"
                  stroke="#d97706"
                  strokeWidth={0.8}
                />
              </g>
            </Marker>
          </ZoomableGroup>
        </ComposableMap>

        {/* Tooltip */}
        {tooltipContent && (
          <div
            style={{
              position: 'fixed',
              left: tooltipPosition.x + 12,
              top: tooltipPosition.y + 12,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              color: '#fff',
              padding: '0.5rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              pointerEvents: 'none',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.1)',
              maxWidth: '300px',
            }}
          >
            {tooltipContent}
          </div>
        )}

        {/* Selected Country Detail Card */}
        {selectedCountry && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              backgroundColor: 'rgba(255,255,255,0.97)',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              padding: '1rem 1.25rem',
              boxShadow: '0 8px 25px rgba(0,0,0,0.12)',
              zIndex: 20,
              minWidth: '200px',
              maxWidth: '280px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                {selectedCountry.names[0] || selectedCountry.code}
              </h4>
              <button
                onClick={() => setSelectedCountry(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>
              Country Code: <strong>{selectedCountry.code}</strong>
            </div>
            <div style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#2563eb',
              marginTop: '0.5rem',
            }}>
              {selectedCountry.count}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
              faculty members with collaborators here
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        marginTop: '1rem',
        padding: '0.75rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="rgba(59, 130, 246, 0.7)" stroke="rgba(59, 130, 246, 0.9)" strokeWidth="1" /></svg>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Collaboration partner (size ∝ faculty count)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="12" height="16" viewBox="0 0 16 21">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z" fill="#f59e0b" stroke="#d97706" strokeWidth="0.8" />
          </svg>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Sabancı University (Istanbul)</span>
        </div>
      </div>

      {/* Top Collaborating Countries Table */}
      <div style={{
        marginTop: '1.5rem',
        backgroundColor: '#f8fafc',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f1f5f9',
        }}>
          <h3 style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#334155',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
          }}>
            Top Collaborating Countries
          </h3>
        </div>
        <div style={{ padding: '0.5rem 0' }}>
          {data.slice(0, 12).map((country, idx) => {
            const barWidth = Math.max(4, (country.count / maxCount) * 100);
            return (
              <div
                key={country.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.4rem 1rem',
                  gap: '0.75rem',
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => setSelectedCountry(country)}
              >
                <span style={{
                  fontSize: '0.7rem',
                  color: '#94a3b8',
                  fontWeight: 600,
                  width: '1.5rem',
                  textAlign: 'right',
                }}>
                  {idx + 1}
                </span>
                <span style={{
                  fontSize: '0.8rem',
                  color: '#1e293b',
                  fontWeight: 600,
                  width: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {country.names[0] || country.code}
                </span>
                <div style={{ flex: 1, position: 'relative', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    borderRadius: '3px',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <span style={{
                  fontSize: '0.8rem',
                  color: '#3b82f6',
                  fontWeight: 700,
                  minWidth: '2rem',
                  textAlign: 'right',
                }}>
                  {country.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
