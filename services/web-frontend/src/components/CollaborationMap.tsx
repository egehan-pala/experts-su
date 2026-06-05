'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { API_URL } from '@/lib/config';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';

const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

interface CountryStat {
  code: string;
  count: number;
  names: string[];
}

interface GeoCitationResponse {
  total_count: number;
  countries: CountryStat[];
}

interface Props {
  authorId: string;
  selectedYear: number | null;
}

const colorScale = scaleLinear<string>()
  .domain([1, 10]) // We will update domain dynamically
  .range(["#99b3ff", "#0445dd"]);

export default function CollaborationMap({ authorId, selectedYear }: Props) {
  const [data, setData] = useState<CountryStat[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [allTimeMaxCount, setAllTimeMaxCount] = useState<number>(1);
  const [tooltipContent, setTooltipContent] = useState("");
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [sinceYear, setSinceYear] = useState<string>("2022");
  const [debouncedSinceYear, setDebouncedSinceYear] = useState<string>("2022");

  // Debounce the year input
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only set debounced value if it's 4 digits or empty
      if (sinceYear === "" || sinceYear.length === 4) {
        setDebouncedSinceYear(sinceYear);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [sinceYear]);

  useEffect(() => {
    if (!authorId) return;
    const shortId = authorId.includes('/') ? authorId.split('/').pop()! : authorId;
    
    // Fetch ALL-TIME data ONCE to determine absolute max bounds for color scale
    fetch(`${API_URL}/authors/${shortId}/geo-citations`)
      .then(res => res.json())
      .then((resData: GeoCitationResponse) => {
         const allTimeMax = Math.max(1, ...(resData?.countries?.map(c => c.count) || [1]));
         setAllTimeMaxCount(allTimeMax);
      })
      .catch(err => console.error("Failed to fetch all-time geo-collaborations", err));
  }, [authorId]);

  useEffect(() => {
    if (!authorId) return;

    setLoading(true);
    const shortId = authorId.includes('/') ? authorId.split('/').pop()! : authorId;

    let url = `${API_URL}/authors/${shortId}/geo-citations`;
    if (selectedYear) {
      url += `?year=${selectedYear}`;
    } else if (debouncedSinceYear) {
      url += `?since=${debouncedSinceYear}`;
    }

    fetch(url)
      .then((res) => res.json())
      .then((resData: GeoCitationResponse) => {
        setData(resData?.countries || []);
        setTotalCount(resData?.total_count || 0);
        setLoading(false);
        setInitialLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch geo-collaborations", err);
        setLoading(false);
        setInitialLoading(false);
      });
  }, [authorId, debouncedSinceYear, selectedYear]);

  const maxCount = useMemo(() => {
    if (!data.length) return 1;
    return Math.max(...data.map(d => d.count));
  }, [data]);

  // Update domain based on ALL-TIME max count to keep colors consistent across year filters
  const dynamicColorScale = useMemo(() => {
    return scaleLinear<string>()
      .domain([1, Math.max(2, allTimeMaxCount)]) // ensure domain has spread
      .range(["#99b3ff", "#0445dd"]); // From light red to Sabancı Red
  }, [allTimeMaxCount]);


  if (initialLoading) {
    return (
      <section style={{
        padding: '4rem 0',
        backgroundColor: '#1e293b',
        color: '#f8fafc',
        width: '100vw',
        position: 'relative',
        left: '50%',
        right: '50%',
        marginLeft: '-50vw',
        marginRight: '-50vw',
        borderTop: '1px solid #334155',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 5vw', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}></span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                Global Citation Impact
              </h3>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
            Loading impact data...
          </div>
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) {
    return (
      <section style={{
        padding: '4rem 0',
        backgroundColor: '#1e293b',
        color: '#f8fafc',
        width: '100vw',
        position: 'relative',
        left: '50%',
        right: '50%',
        marginLeft: '-50vw',
        marginRight: '-50vw',
        borderTop: '1px solid #334155',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 5vw', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}></span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                Global Citation Impact
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label htmlFor="sinceYearEmpty" style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>SINCE</label>
              <input
                id="sinceYearEmpty"
                type="number"
                placeholder="Year"
                value={sinceYear}
                onChange={(e) => setSinceYear(e.target.value)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '0.4rem 0.6rem',
                  fontSize: '0.9rem',
                  width: '80px',
                  outline: 'none'
                }}
              />
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
              No citation impact data found {sinceYear ? `since ${sinceYear}` : 'for this author'}.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{
      padding: '4rem 0',
      backgroundColor: '#1e293b',
      color: '#f8fafc',
      width: '100vw',
      position: 'relative',
      left: '50%',
      right: '50%',
      marginLeft: '-50vw',
      marginRight: '-50vw',
      borderTop: '1px solid #334155',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 5vw', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}></span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Global Citation Impact
            </h3>
            <div style={{
              backgroundColor: 'rgba(39, 32, 240, 0.15)',
              color: '#ffffffff',
              padding: '0.2rem 0.6rem',
              borderRadius: '20px',
              fontSize: '0.75rem',
              fontWeight: 700,
              border: '1px solid rgba(79, 65, 208, 0.3)',
              marginLeft: '0.5rem',
              transition: 'all 0.3s'
            }}>
              {totalCount.toLocaleString()} {selectedYear ? `CITATIONS IN ${selectedYear}` : 'TOTAL CITATIONS'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                UPDATING...
              </div>
            )}
            {!selectedYear && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label htmlFor="sinceYearMain" style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>SINCE</label>
                <input
                  id="sinceYearMain"
                  type="number"
                  placeholder="Year"
                  value={sinceYear}
                  onChange={(e) => setSinceYear(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.4rem 0.6rem',
                    fontSize: '0.9rem',
                    width: '80px',
                    outline: 'none'
                  }}
                />
              </div>
            )}
            {selectedYear && (
              <div style={{
                color: '#3b82f6',
                fontSize: '0.85rem',
                fontWeight: 800,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                padding: '0.4rem 1rem',
                borderRadius: '6px',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>
                DISPLAYING: {selectedYear}
              </div>
            )}
          </div>
        </div>

        <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>

        <div style={{
          backgroundColor: 'rgba(250, 248, 248, 0.03)',
          borderRadius: '16px',
          border: '1px solid #334155',
          overflow: 'hidden',
          position: 'relative',
          padding: '1rem'
        }}>
          <ComposableMap
            projectionConfig={{
              scale: 140,
              center: [0, 20]
            }}
            width={800}
            height={400}
            style={{ width: "100%", height: "auto" }}
          >
            <ZoomableGroup>
              <Geographies geography={geoUrl}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    // ISO Alpha-2 to Alpha-3 and Numeric Mapping for common countries
                    const isoMapping: Record<string, { a3: string, n3: string }> = {
                      "US": { a3: "USA", n3: "840" },
                      "TR": { a3: "TUR", n3: "792" },
                      "CH": { a3: "CHE", n3: "756" },
                      "DE": { a3: "DEU", n3: "276" },
                      "FR": { a3: "FRA", n3: "250" },
                      "GB": { a3: "GBR", n3: "826" },
                      "CN": { a3: "CHN", n3: "156" },
                      "JP": { a3: "JPN", n3: "392" },
                      "IT": { a3: "ITA", n3: "380" },
                      "ES": { a3: "ESP", n3: "724" },
                      "CA": { a3: "CAN", n3: "124" },
                      "AU": { a3: "AUS", n3: "036" },
                      "BR": { a3: "BRA", n3: "076" },
                      "IN": { a3: "IND", n3: "356" },
                      "RU": { a3: "RUS", n3: "643" },
                      "KR": { a3: "KOR", n3: "410" },
                      "NL": { a3: "NLD", n3: "528" },
                      "SE": { a3: "SWE", n3: "752" },
                      "NO": { a3: "NOR", n3: "578" },
                      "FI": { a3: "FIN", n3: "246" },
                      "DK": { a3: "DNK", n3: "208" },
                      "BE": { a3: "BEL", n3: "056" },
                      "AT": { a3: "AUT", n3: "040" },
                      "GR": { a3: "GRC", n3: "300" },
                      "PT": { a3: "PRT", n3: "620" },
                      "SG": { a3: "SGP", n3: "702" },
                      "HK": { a3: "HKG", n3: "344" },
                      "IR": { a3: "IRN", n3: "364" },
                      "IL": { a3: "ISR", n3: "376" },
                      "RO": { a3: "ROU", n3: "642" },
                      "CZ": { a3: "CZE", n3: "203" },
                      "CY": { a3: "CYP", n3: "196" },
                      "LV": { a3: "LVA", n3: "428" }
                    };

                    const geoName = geo.properties.name?.toLowerCase();
                    const geoId = String(geo.id);
                    const geoA3 = (geo.properties?.iso_a3 || geo.properties?.ISO_A3 || "").toUpperCase();

                    // Find matching stats
                    const d = data.find((s) => {
                      const m = isoMapping[s.code];

                      // 1. Direct code match (A2, A3, or Numeric/ID)
                      if (s.code === geo.id || s.code === geo.properties?.iso_a2) return true;
                      if (m && (m.a3 === geoId || m.n3 === geoId || m.a3 === geoA3)) return true;

                      // 2. Name match (case insensitive inclusion)
                      if (geoName && s.names.some(n => {
                        const ln = n?.toLowerCase();
                        return ln === geoName || ln?.includes(`(${geoName})`) || ln === geo.properties?.formal_en?.toLowerCase();
                      })) return true;

                      return false;
                    });

                    // If we found data, shade it
                    const fill = d ? dynamicColorScale(d.count) : "#1e293b";

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#334155"
                        strokeWidth={0.5}
                        style={{
                          default: {
                            outline: "none",
                            transition: "fill 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                          },
                          hover: {
                            fill: d ? "#0023adff" : "#475569",
                            outline: "none",
                            cursor: d ? "pointer" : "default",
                            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                          },
                          pressed: { outline: "none" },
                        }}
                        onMouseEnter={(e) => {
                          if (d) {
                            const countryName = geo.properties.name || "Unknown Country";
                            setTooltipContent(`${countryName} - ${d.count} citations`);
                            setTooltipPosition({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onMouseMove={(e) => {
                          if (d) {
                            setTooltipPosition({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onMouseLeave={() => {
                          setTooltipContent("");
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* Tooltip Overlay */}
          {tooltipContent && (
            <div
              style={{
                position: 'fixed',
                left: tooltipPosition.x + 15,
                top: tooltipPosition.y + 15,
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                color: '#fff',
                padding: '0.6rem 0.9rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                pointerEvents: 'none',
                zIndex: 100,
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #334155'
              }}
            >
              {tooltipContent}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>1</span>
          <div style={{
            width: '200px',
            height: '8px',
            background: 'linear-gradient(to right, #99b3ff, #0445dd)',
            borderRadius: '4px',
            border: '1px solid #334155'
          }} />
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{allTimeMaxCount}+ Citations</span>
        </div>
      </div>
    </section>
  );
}
